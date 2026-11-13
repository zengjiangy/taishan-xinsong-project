/* ============================================================================
 * m2.js — 第 2 关：等价类划分（投篮分区游乐场）
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  var SAMPLE_BALLS = [
    { label: '✅ 正常代表 · 11课时 1人', input: { hours: 11, seats: 1, coupon: 0, type: 'new', hasCert: true } },
    { label: '🚧 下越界 · 0课时', input: { hours: 0, seats: 1, coupon: 0, type: 'new', hasCert: true } },
    { label: '🔴 非整数 · 3.5课时', input: { hours: 3.5, seats: 1, coupon: 0, type: 'new', hasCert: true } },
    { label: '⚠️ 2人团体边界（D1陷阱）', input: { hours: 11, seats: 2, coupon: 0, type: 'new', hasCert: true } },
    { label: '💸 减200元券减成负数（D3陷阱）', input: { hours: 1, seats: 1, coupon: 500, type: 'new', hasCert: true } },
    { label: '⚡ 3人+复训叠算（D4组合坑）', input: { hours: 11, seats: 3, coupon: 0, type: 'retrain', hasCert: true } }
  ];

  var DEFECT_PLAIN = {
    SEAT_BOUNDARY: 'D1 · 2人错打团体95折',
    ROUND_DOWN: 'D2 · 折后零头少算1元',
    COUPON_CAP: 'D3 · 优惠券倒贴变负数',
    RETRAIN_STACK: 'D4 · 团体与复训折上折'
  };

  function makeDefaults() {
    return {
      field: 'hours',
      level: 'standard',
      strategy: 'mid',
      includeInvalid: true,
      defects: ['SEAT_BOUNDARY', 'ROUND_DOWN', 'COUPON_CAP', 'RETRAIN_STACK'],
      customCases: [],
      lastBall: null,
      ballSeq: 0
    };
  }

  function buildParams() {
    return [
      {
        key: 'field', label: '先分哪个输入框的“组”', type: 'pills',
        options: [
          { v: 'hours', l: '⏱️ 培训课时 (1~120)' },
          { v: 'seats', l: '👥 报名人数 (1~20)' },
          { v: 'coupon', l: '🎟️ 优惠券 (0~500)' }
        ]
      },
      {
        key: 'strategy', label: '每组选谁当代表', type: 'pills',
        options: [
          { v: 'mid', l: '🎯 挑中间数' },
          { v: 'boundary', l: '🚧 顺手卡边' }
        ]
      },
      { type: 'action', action: 'combo-preset', label: '⚡ 一键试组合坑 (D4)', variant: 'primary' },
      { key: 'level', label: '分组粗细', type: 'select', advanced: true, options: [{ v: 'coarse', l: '粗分（只分有效/无效）' }, { v: 'standard', l: '标准分组（推荐）' }, { v: 'fine', l: '细分拆小块' }] },
      { key: 'includeInvalid', label: '包含非法/越界小组', type: 'checkbox', advanced: true, hint: '关掉就会漏测乱填的情况' },
      {
        key: 'defects', label: '系统里暗藏的 4 个 Bug', type: 'checks', advanced: true,
        options: Q.DEFECTS.map(function (d) { return { v: d.id, l: DEFECT_PLAIN[d.id] || d.short }; })
      }
    ];
  }

  function evalBall(input, defects) {
    var exp = Q.feeSpec(input);
    var probe = Q.defectProbe(input).filter(function (p) { return p.differs; }).map(function (p) { return p.id; });
    var active = probe.filter(function (id) { return defects.indexOf(id) >= 0; });
    var act = active.length ? Q.calcWithDefects(input, active) : exp;
    return {
      input: input, expected: exp, actual: act, pass: active.length === 0,
      hits: active, diff: active.length ? Q.compareFee(exp, act).join(' / ') : '账算得完全一致！'
    };
  }

  function compute(st) {
    var r = Q.ecExecute({
      field: st.field, level: st.level, strategy: st.strategy,
      includeInvalid: st.includeInvalid, defects: st.defects, customCases: st.customCases
    });
    var ballRes = st.lastBall ? evalBall(st.lastBall.input, st.defects) : null;
    return { r: r, ball: ballRes, ballLabel: st.lastBall ? st.lastBall.label : '' };
  }

  function viz(res, st) {
    var r = res.r;
    var cov = r.coverage;

    var kpis = Q.kpiStrip([
      { icon: '🧺', label: '输入框分组覆盖率', value: Q.pctText(cov.rate), sub: '测了 ' + cov.covered + ' / ' + cov.total + ' 组', tone: cov.rate >= 100 ? 'ok' : 'warn' },
      { icon: '🛡️', label: '乱填拦截测试', value: Q.pctText(cov.invalidRate), sub: cov.invalidCovered + ' / ' + cov.invalidTotal + ' 个非法桶', tone: st.includeInvalid ? 'ok' : 'bad' },
      { icon: '💥', label: '测出账算错了', value: r.failCount + ' / ' + r.cases.length, sub: '实际跑出差异的用例数', tone: r.failCount > 0 ? 'warn' : 'blue' },
      { icon: '🐛', label: '捕获暗藏 Bug', value: r.detectedCount + ' / ' + r.matrix.length, sub: '组合虫需加多字段用例', tone: r.detectedCount >= 4 ? 'ok' : 'blue' }
    ]);

    /* 互动投球小游乐场 */
    var quickBtns = SAMPLE_BALLS.map(function (b, idx) {
      return '<button type="button" class="btn sm" data-act="drop-sample" data-idx="' + idx + '">' + Q.esc(b.label) + '</button>';
    }).join('');
    var ballHtml = '';
    if (res.ball) {
      var b = res.ball;
      var actErr = (b.actual.errors || []).join('、') || b.actual.code || '参数非法';
      var actTxt = b.actual.ok ? ('收 ' + b.actual.payable + ' 元') : ('拒收(' + actErr + ')');
      var expTxt = b.expected.ok ? ('应收 ' + b.expected.payable + ' 元') : ('应拒收');
      ballHtml = '<div class="ball-drop-pill ' + (b.pass ? 'ok' : 'bad') + ' mt10">' +
        '<span>' + (b.pass ? '🟢 安全落桶：' : '💥 抓到 Bug！') + Q.esc(res.ballLabel) + '</span>' +
        '<span>· 理论' + Q.esc(expTxt) + '，被测系统 → ' + Q.esc(actTxt) + (b.pass ? '' : '（' + Q.esc(b.diff) + '）') + '</span>' +
      '</div>';
    } else {
      ballHtml = '<div class="tiny muted mt10">👆 点上面任意一颗“测试球”丢进系统，立刻看它算对了还是踩坑报错！</div>';
    }
    var ballStage = '<div class="ball-stage">' +
      '<div style="width:100%"><div class="card-t mb6">🎲 测试球即时试玩（每颗球代表一“同类人群”）</div>' +
      '<div class="btn-row">' + quickBtns + '</div>' + ballHtml + '</div>' +
    '</div>';

    /* 绿桶 & 红桶直观分布 */
    function renderBuckets(list, title, emptyMsg) {
      return '<div class="clsgroup"><div class="clsgroup-h">' + title + '</div><div class="clsrow">' +
        (list.length ? list.map(function (c) {
          var cnt = r.cases.filter(function (x) { return x.cls === c.id; }).length;
          return '<div class="cls ' + (cnt ? 'on' : '') + '">' +
            '<span class="cls-id">' + Q.esc(c.id) + '</span>' +
            '<span class="cls-nm">' + Q.esc(c.name) + '</span>' +
            '<span class="cls-ct">' + (cnt ? '✅ ' + cnt + ' 球' : '⬜ 漏了') + '</span></div>';
        }).join('') : '<div class="tiny muted">' + emptyMsg + '</div>') +
      '</div></div>';
    }
    var bucketsHtml = '<div class="card"><div class="card-h"><span class="card-t">🧺 同一栏里的等价分桶图</span><span class="card-sub">每只绿桶、红桶至少要放进 1 颗测试球</span></div>' +
      '<div class="card-b"><div class="clsmap">' +
        renderBuckets(r.classes.filter(function (c) { return c.validClass; }), '🟢 合法有效区（按规矩能过）', '无有效类') +
        renderBuckets(r.classes.filter(function (c) { return !c.validClass; }), '🔴 非法无效区（必须拦在门外）', '无无效类') +
      '</div></div></div>';

    /* 4只Bug卡片 */
    var dmHtml = '<div class="dmatrix">' + r.matrix.map(function (d) {
      return '<div class="dm ' + (d.detected ? 'dm-hit' : 'dm-miss') + (d.injected ? ' dm-inj' : '') + '">' +
        '<div class="dm-h"><span class="mono" style="font-weight:800">' + Q.esc(d.id) + '</span>' +
        Q.badge(d.detected ? 'pass' : 'mute', d.detected ? '🎉 抓住了 ' + d.caseCount + '次' : '还没抓到') + '</div>' +
        '<div class="dm-n">' + Q.esc(DEFECT_PLAIN[d.id] || d.short) + '</div>' +
        '<div class="dm-r">' + (d.id === 'RETRAIN_STACK' && !d.detected ? '💡 单改一个数捉不到它，点上方「⚡ 组合坑」!' : Q.esc(d.name)) + '</div>' +
      '</div>';
    }).join('') + '</div>';

    var d4 = r.matrix.find(function (m) { return m.id === 'RETRAIN_STACK'; });
    var coachBox = !st.includeInvalid
      ? Q.coach('bad', '警告：你把「非法无效区」关掉啦！', '只测正常数字（比如只测 1~120），一旦用户手抖输入 0 或小数，系统崩溃你也发现不了。赶紧在下面「高级调节」里勾选回去！')
      : (d4 && !d4.detected
        ? Q.coach('warn', '分桶已经 100% 亮绿灯，为啥还有 D4 组合 Bug 没抓到？', '因为每次只改一个框（其他框固定成默认值），永远碰不上“3人团体 + 复训老学员”同时发生的情况！点一下上面橙色按钮 <b>「⚡ 一键试组合坑 (D4)」</b> 立刻破案！')
        : Q.coach('ok', '全能捕捉手！单桶和组合陷阱都抓到了', '你已经掌握了等价类精髓：同类挑 1 个代表就能大幅减少用例数；而跨字段的叠加规则，再额外补一条组合用例就万无一失！'));

    /* 次级明细 + 自定义表单放进折叠抽屉 */
    var caseRows = r.cases.map(function (c) {
      return [
        { html: '<span class="mono">' + Q.esc(c.id) + '</span>' },
        c.cls === 'CUSTOM' ? { html: Q.badge('warn', '组合补充') } : c.clsName,
        c.input.hours + '课时 / ' + c.input.seats + '人 / 券' + c.input.coupon + ' / ' + c.input.type,
        c.expected.ok ? c.expected.payable + '元' : '拦截',
        c.actual.ok ? c.actual.payable + '元' : '拦截',
        { html: c.pass ? Q.badge('pass', '正常') : Q.badge('fail', '💥 爆Bug: ' + Q.esc(c.diff || '')) }
      ];
    });
    var custForm = '<div class="cust-grid mt12">' +
      '<label>课时<input id="c-h" type="number" value="11"></label>' +
      '<label>人数<input id="c-s" type="number" value="3"></label>' +
      '<label>券(元)<input id="c-c" type="number" value="0"></label>' +
      '<label>学员类型<select id="c-t"><option value="new">新生</option><option value="retrain" selected>复训</option><option value="corp">企业</option></select></label>' +
      '<label>持证<select id="c-cert"><option value="1" selected>是</option><option value="0">否</option></select></label>' +
      '<button type="button" class="btn primary sm" data-act="add-custom">+ 加一条用例</button>' +
    '</div>';
    var detailBody = Q.table(['编号', '所属桶', '填入参数', '应当结果', '实测结果', '判定'], caseRows) + custForm;

    return kpis + ballStage + bucketsHtml + dmHtml + coachBox +
      Q.drawer('📋 查看全部 ' + r.cases.length + ' 条测试用例明细 / 手写加一条', '含自定义组合输入框', detailBody, false);
  }

  function onAction(act, el, st, WB) {
    if (act === 'drop-sample') {
      var idx = Number(el.getAttribute('data-idx'));
      st.lastBall = SAMPLE_BALLS[idx] || SAMPLE_BALLS[0];
      st.ballSeq = (st.ballSeq || 0) + 1;
      return true;
    }
    if (act === 'combo-preset') {
      st.customCases = [{ id: 'EX1', input: { hours: 11, seats: 3, coupon: 0, type: 'retrain', hasCert: true } }];
      st.lastBall = SAMPLE_BALLS[5];
      WB.toast('已填入“3人+复训”组合用例，立刻揪出 D4！');
      return true;
    }
    if (act === 'add-custom') {
      var hRaw = String((document.getElementById('c-h') || {}).value || '').trim();
      var sRaw = String((document.getElementById('c-s') || {}).value || '').trim();
      var cRaw = String((document.getElementById('c-c') || {}).value || '').trim();
      if (!hRaw || !sRaw || !cRaw || isNaN(Number(hRaw)) || isNaN(Number(sRaw)) || isNaN(Number(cRaw))) {
        WB.toast('课时、人数或券额留空无效，请填入数字后再添加', 'warn');
        return false;
      }
      var t = (document.getElementById('c-t') || {}).value || 'new';
      var cert = ((document.getElementById('c-cert') || {}).value || '1') === '1';
      st.customCases = (st.customCases || []).concat([{
        id: 'U' + (st.customCases.length + 1),
        input: { hours: Number(hRaw), seats: Number(sRaw), coupon: Number(cRaw), type: t, hasCert: cert }
      }]);
      return true;
    }
  }

  function evidence(res) {
    var r = res.r;
    var ok = r.coverage.rate >= 100 && r.failCount > 0;
    return {
      status: ok ? 'pass' : 'warn',
      pass: ok,
      coverage: r.coverage.rate || 0,
      label: '等价类覆盖率',
      defects: r.matrix.filter(function (m) { return m.detected; }).map(function (m) { return m.id; }),
      summary: '分桶覆盖 ' + Q.pctText(r.coverage.rate) + '，抓获 ' + r.detectedCount + '/' + r.matrix.length + ' 只缺陷',
      metrics: { coverage: r.coverage.rate, failCount: r.failCount }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢等价类划分',
      '<b>物以类聚，同一批输入挑 1 个代表就够了！</b>记住两个铁律：合法的每类挑 1 个，<b>非法的也要专门挑</b>；遇到“满 3 人且是复训”这种多条件组合，要另补一条合体用例！');
  }

  window.WB.registerExp({
    id: 'm2', no: 2, group: '黑盒用例设计',
    title: '等价分区 · 投篮分类', chapter: '第 2 章 · 等价类划分',
    hook: '把几百万种输入分进几只代表桶，挑代表去抓错',
    goal: ['不用穷举，每类挑 1 个代表也能抓虫', '明白为什么只测单一输入框会漏掉组合 Bug'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

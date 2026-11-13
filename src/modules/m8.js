/* ============================================================================
 * m8.js — 实验八：质量保证、风险管理与发布质量门禁
 * 只消费 M1–M7 主动记录的证据；风险模型为教学简化模型，公式与单位全部公开。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;

  function params(st) {
    return {
      severityWeight: { fatal: st.wFatal, major: st.wMajor, minor: st.wMinor, trivial: st.wTrivial },
      weights: { density: st.wDensity, gap: st.wGap, evidence: st.wEvidence, regression: st.wRegression },
      kloc: Q.QA_DEFAULT_PARAMS.kloc,
      densityRef: Q.QA_DEFAULT_PARAMS.densityRef,
      minCoverage: st.minCoverage,
      minPassRate: st.minPassRate,
      riskThreshold: st.riskThreshold,
      budget: st.budget,
      strategy: st.strategy
    };
  }

  function compute(st) {
    var ev = Q.qaNormEvidence(WB.evidence);
    var p = params(st);
    var risk = Q.qaComputeRisk(ev, p);
    var g = Q.qaGate(ev, p, risk);

    // 最小修复预算搜索：固定其他参数，找让门禁通过的最小预算
    var minBudget = null;
    for (var b = 0; b <= 40; b++) {
      var pp = Object.assign({}, p, { budget: b });
      var rr = Q.qaComputeRisk(ev, pp);
      var gg = Q.qaGate(ev, pp, rr);
      if (gg.passed) { minBudget = { budget: b, risk: rr.risk, fixed: rr.plan.fixed.map(function (d) { return d.id; }) }; break; }
    }

    return { ev: ev, params: p, risk: risk, gate: g, minBudget: minBudget };
  }

  function viz(res, st) {
    var h = '';
    var r = res.risk, g = res.gate;
    var demoUsed = Object.keys(WB.evidence).some(function (k) { return WB.evidence[k].demo; });

    h += '<section class="card"><h3 class="card-h">实时反馈 · 发布风险' +
      (demoUsed ? '<span class="card-hint" style="color:var(--amber)">当前包含示例演示数据</span>' : '') +
      '</h3><div class="card-b">';
    if (r.evidencePresent === 0) {
      h += '<div class="callout warn"><b>尚未收集到前置实验证据。</b>先去 M1–M7 记录结论，或载入一组演示证据推演门禁模型。' +
        '<div class="btn-row mt6"><button class="btn sm" data-act="load-demo">载入示例演示证据</button></div></div>';
    }
    h += '<div class="metrics mb10">' +
      '<div class="metric hl"><div class="m-l">发布风险指数 R</div><div class="m-v">' + Q.num(r.risk, 1) + '<small>/100</small></div></div>' +
      '<div class="metric"><div class="m-l">未关闭加权缺陷</div><div class="m-v">' + Q.num(r.weightedOpen, 0) + '<small>点</small></div></div>' +
      '<div class="metric"><div class="m-l">加权覆盖率</div><div class="m-v">' + Q.num(r.coverage, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">证据完备度</div><div class="m-v">' + r.evidencePresent + '<small>/7</small></div></div>' +
      '<div class="metric"><div class="m-l">回归通过率</div><div class="m-v">' + (r.passRate == null ? '—' : Q.num(r.passRate, 1) + '<small>%</small>') + '</div></div>' +
      '</div>';

    // 风险构成
    h += '<div class="grid g2">' +
      '<div><div class="tiny muted mb6">风险构成（贡献值，合计 = R）</div>' +
      Q.hbars(r.parts.map(function (p) {
        return {
          label: p.label, value: p.contribution, text: Q.num(p.contribution, 1),
          color: p.key === 'density' ? '#d97706' : p.key === 'gap' ? '#0d9488' : p.key === 'evidence' ? '#7c3aed' : '#dc2626'
        };
      }), { max: 100 }) +
      '</div>' +
      '<details class="sec" open style="margin-top:0;margin-bottom:0"><summary><span>计算过程</span></summary><div class="sec-b"><div class="formula">' +
      '未关闭加权缺陷 = ' + Q.num(r.weightedOpen, 0) + ' 点\n' +
      '缺陷密度 D = ' + (r.density == null ? '—' : Q.num(r.density, 1)) + ' /KLOC\n' +
      '密度归一化 = min(1, D / ' + Q.QA_DEFAULT_PARAMS.densityRef + ') = ' + Q.num(r.densityNorm == null ? 0 : r.densityNorm, 3) + '\n' +
      '覆盖率缺口 = 1 − ' + Q.num(r.coverage, 1) + '% = ' + Q.num(r.gap, 3) + '\n' +
      '证据缺口 = 1 − ' + r.evidencePresent + '/7 = ' + Q.num(r.evidenceGap, 3) + '\n' +
      '回归失败率 = ' + Q.num(r.regFail, 3) + '\n' +
      'R = ' + Q.num(r.risk, 1) + '</div></div></details>' +
      '</div>';
    h += '</div></section>';

    // 证据来源 & 待修台账（收纳式卡片，首屏保留风险与门禁预测区）
    var evRows = Q.QA_REQUIRED.map(function (req) {
      var e = res.ev[req.id];
      return {
        cls: e ? '' : 'row-fail',
        cells: [
          { html: '<b>' + E(req.label) + '</b>' },
          { html: e ? Q.badge(e.status, e.status === 'pass' ? '达成' : e.status === 'warn' ? '待改进' : '未通过') : Q.badge('mute', '缺证据') },
          { html: e ? '<span class="num">' + (e.coverage == null ? '—' : Q.num(e.coverage, 1) + '%') + '</span>' : '—' },
          { html: e ? E(e.note || '—') : '<span class="muted">—</span>' },
          { html: e ? E(e.at || '—') + (e.demo ? ' <span class="chip" style="color:var(--amber)">演示</span>' : '') : '—' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h"><span>证据来源明细（M1–M7）</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">完备度 ' + r.evidencePresent + ' / 7 项</span><span class="sec-arrow">▾</span></span></summary>' +
      '<div class="sec-card-b flush">' + Q.table(['实验', '结论', '主指标', '说明', '记录时间'], evRows) + '</div></details>';

    // 待修台账
    var rows = r.plan.ordered.map(function (d) {
      var fixed = r.plan.fixed.some(function (x) { return x.id === d.id; });
      return {
        cls: fixed ? 'row-pass' : '',
        cells: [
          { html: '<span class="chip">' + E(d.id) + '</span>' },
          { html: E(d.title) },
          { html: '<span class="chip">' + E((Q.QA_SEVERITIES.filter(function (s) { return s.key === d.severity; })[0] || {}).label || d.severity) + '</span>' },
          { html: '<span class="num">' + d.hours + ' h</span>' },
          { html: fixed ? Q.badge('pass', '本次修复') : Q.badge('fail', '遗留') },
          { html: '<span class="tiny muted">' + E(d.foundBy.join('、')) + '</span>' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h"><span>待修缺陷台账与预算计划</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">共 ' + rows.length + ' 项 · 预算 ' + r.plan.budget + ' h（已排 ' + r.plan.hoursUsed + ' h）</span><span class="sec-arrow">▾</span></span></summary>' +
      '<div class="sec-card-b flush">' + (rows.length ? Q.table(['编号', '缺陷', '严重度', '工时', '本次处理', '检出实验'], rows)
        : '<div class="card-b">' + Q.empty('台账为空：暂未产生待修缺陷记录。') + '</div>') + '</div></details>';

    // 门禁
    h += '<section class="card"><h3 class="card-h">发布质量门禁<span class="card-hint">' +
      (st.reveal ? '已揭晓' : '先预测，再揭晓') + '</span></h3><div class="card-b">';
    if (!st.reveal) {
      h += '<div class="predict">' +
        '<p class="theory-note mb6"><b>先做个判断：</b>基于上面的风险指数、证据完备度和待修台账，' +
        '这版能放行吗？门禁不只看 R，它还有 5 项独立检查。</p>' +
        '<div class="btn-row">' +
        '<button class="btn ' + (st.prediction === 'allow' ? 'primary' : '') + '" data-act="predict" data-arg="allow">我预测：可发布</button>' +
        '<button class="btn ' + (st.prediction === 'block' ? 'primary' : '') + '" data-act="predict" data-arg="block">我预测：不可发布</button>' +
        '<button class="btn primary" data-act="reveal" ' + (st.prediction ? '' : 'disabled') + '>揭晓门禁结论</button>' +
        '</div>' +
        (st.prediction ? '' : '<p class="tiny muted mt6">请先选择一个预测，再揭晓。') +
        '</div>';
    } else {
      h += '<div class="callout ' + (g.passed ? '' : 'fail') + '"><b>门禁结论：' +
        (g.passed ? '通过，允许发布' : g.verdict === 'NO_EVIDENCE' ? '证据不足，不可发布' : '阻断，不可发布') + '</b>' +
        (st.prediction ? '　你的预测：' + (st.prediction === 'allow' ? '可发布' : '不可发布') +
          '，' + ((st.prediction === 'allow') === g.passed ? '<b>判断正确</b>' : '<b>判断不一致</b>') : '') +
        '</div>';
      h += '<div class="mt10">' + g.checks.map(function (c) {
        return '<div class="checkrow ' + (c.ok ? 'ok' : 'no') + '"><span>' + (c.ok ? '✓' : '✕') + '</span>' +
          '<span><b>' + E(c.label) + '</b> <span class="chip">' + E(c.source) + '</span><br>' +
          '<span class="tiny muted">' + E(c.detail) + '</span></span></div>';
      }).join('') + '</div>';
      h += '<div class="btn-row mt10"><button class="btn sm ghost" data-act="reset-reveal">重新预测</button></div>';
    }
    h += '</div></section>';

    return h;
  }

  function verify(res, st) {
    var g = res.gate, r = res.risk, minB = res.minBudget;
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(g.passed ? 'ok' : 'no',
      (g.passed ? '✓ ' : '✕ ') + (g.passed ? '本版允许发布' : '本版阻断发布'),
      [
        ['综合度量', '风险 R = ' + Q.num(r.risk, 1) + '（上限 ' + res.params.riskThreshold + '） · 证据 ' + r.evidencePresent + '/7 · 覆盖 ' + Q.num(r.coverage, 1) + '% · 回归 ' + (r.passRate == null ? '缺失' : Q.num(r.passRate, 1) + '%')],
        g.blocked.length ? ['阻断项', g.blocked.map(function (c) { return c.label; }).join('；')] : null
      ]);

    h += Q.concl(minB ? 'ok' : 'no',
      (minB ? '✓ ' : '✕ ') + (minB
        ? (g.passed && minB.budget <= res.params.budget
          ? '最小可行预算 ' + minB.budget + ' h（当前 ' + res.params.budget + ' h）'
          : '再投入 ' + Math.max(0, minB.budget - res.params.budget) + ' h（累计 ' + minB.budget + ' h）可放行')
        : '40 h 内无法通过门禁'),
      [
        ['修复测算', minB ? '预算 ' + minB.budget + ' h 时降至 R = ' + Q.num(minB.risk, 1) + '，可优先关闭 ' + minB.fixed.join('、')
          : '覆盖不足或证据缺失属于过程短板，单纯投入修复工时无法解决。']
      ]);

    h += Q.concl('insight', '◆ 核心认识：放行看过程，也看证据',
      [['启发', '五项门禁中只有两项直接看缺陷数量，其余看覆盖度、回归与证据齐备度——缺证据同样不能上线。']]);

    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm8', no: 8, navLabel: '质量门禁',
    title: '质量保证、风险管理与发布质量门禁',
    subtitle: '汇总前七个实验的测试证据，将缺陷、覆盖与风险量化为可解释的放行决策。',
    chapter: '第1章 1.1/1.3；第4章 4.3–4.6；第9章 9.3 测试过程管理',
    knowledge: '把质量要求、测试证据、缺陷风险与发布决策连起来；用可解释模型计算风险；理解门禁是策略组合。',
    minutes: 14,
    goals: [
      '分清 SQA 与测试的职责',
      '把缺陷、覆盖率、证据折算成风险',
      '设计一组可解释的门禁规则'
    ],
    blockers: [
      ['通过率就是发布依据', '它只反映已知用例'],
      ['没证据 = 没问题', '没测过和测过没问题，数据上都叫“没失败”'],
      ['分数说不清来源', '拆不到项的分数没法用来决策']
    ],
    theory: '<p>测试管产品对不对，SQA 管过程有没有保证、证据够不够。</p>' +
      '<div class="formula">R = 100 × (wD·Dn + wG·G + wE·E + wF·F)\n' +
      'Dn 缺陷密度 · G 覆盖率缺口 · E 证据缺口 · F 回归失败率</div>' +
      '<p class="mt6">权重与标定点都是教学设定，不是行业基准。</p>',
    prereq: '完成 M1–M7 中至少 4 个并记录证据。',
    scopeNote: '迭代末的发布评审。',
    notDo: '不做成本优化与缺陷预测。',

    params: [
      {
        key: 'strategy', type: 'select', label: '修复顺序策略',
        options: Q.QA_STRATEGIES.map(function (s) { return { v: s.key, l: s.label }; }),
        hint: '同样的预算，先修哪个决定了最终风险。'
      },
      { key: 'budget', type: 'range', label: '可用修复预算（小时）', min: 0, max: 40, step: 1, fmt: function (v) { return v + ' h'; } },
      { key: 'riskThreshold', type: 'range', label: '门禁：风险指数上限', min: 10, max: 90, step: 1, fmt: function (v) { return 'R ≤ ' + v; } },
      { key: 'minCoverage', type: 'range', label: '门禁：加权覆盖率下限', min: 0, max: 100, step: 1, fmt: function (v) { return v + '%'; } },
      { key: 'minPassRate', type: 'range', label: '门禁：回归通过率下限', min: 0, max: 100, step: 1, fmt: function (v) { return v + '%'; } },
      { key: 'wFatal', group: '权重（进阶）', type: 'range', label: '严重度权重：致命', min: 1, max: 20, step: 1 },
      { key: 'wMajor', group: '权重（进阶）', type: 'range', label: '严重度权重：严重', min: 1, max: 15, step: 1 },
      { key: 'wMinor', group: '权重（进阶）', type: 'range', label: '严重度权重：一般', min: 1, max: 10, step: 1 },
      { key: 'wTrivial', group: '权重（进阶）', type: 'range', label: '严重度权重：轻微', min: 1, max: 6, step: 1 },
      { key: 'wDensity', group: '权重（进阶）', type: 'range', label: '维度权重：缺陷密度', min: 0, max: 100, step: 5 },
      { key: 'wGap', group: '权重（进阶）', type: 'range', label: '维度权重：覆盖率缺口', min: 0, max: 100, step: 5 },
      { key: 'wEvidence', group: '权重（进阶）', type: 'range', label: '维度权重：证据缺口', min: 0, max: 100, step: 5 },
      { key: 'wRegression', group: '权重（进阶）', type: 'range', label: '维度权重：回归失败率', min: 0, max: 100, step: 5 }
    ],
    defaults: {
      strategy: 'risk', budget: 12, riskThreshold: 45, minCoverage: 80, minPassRate: 90,
      wFatal: 10, wMajor: 5, wMinor: 2, wTrivial: 1,
      wDensity: 40, wGap: 30, wEvidence: 20, wRegression: 10,
      prediction: '', reveal: false
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onParam: function (key, st) {
      // 任何会影响门禁结论的参数变化，都要求重新预测——否则“预测”会变成看过答案后的补写
      st.reveal = false;
      st.prediction = '';
    },

    onAction: function (name, arg, st) {
      if (name === 'predict') { st.prediction = arg; st.reveal = false; return true; }
      if (name === 'reveal') {
        if (!st.prediction) { WB.toast('请先选择一个预测', 'warn'); return false; }
        st.reveal = true;
        return true;
      }
      if (name === 'reset-reveal') { st.reveal = false; st.prediction = ''; return true; }
      return false;
    },

    evidence: function (res) {
      var g = res.gate;
      return {
        status: g.passed ? 'pass' : 'fail',
        coverage: res.risk.risk,
        label: '发布风险指数 R（越低越好）',
        defects: res.risk.plan.open.map(function (d) { return d.id; }),
        note: (g.passed ? '门禁通过' : '门禁阻断') + '：证据 ' + res.risk.evidencePresent + '/7，加权覆盖率 ' +
          Q.num(res.risk.coverage, 1) + '%，未关闭缺陷 ' + res.risk.plan.open.length + ' 个'
      };
    }
  });
})();

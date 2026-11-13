/* ============================================================================
 * m3.js — 第 3 关：边界值跳崖数轴（邻点捉虫动画）
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  function makeDefaults() {
    return {
      field: 'seats',
      strategy: 'off',
      base: 'typical',
      defects: ['SEAT_BOUNDARY', 'ROUND_DOWN', 'COUPON_CAP', 'RETRAIN_STACK'],
      animStep: -1
    };
  }

  function buildParams() {
    return [
      {
        key: 'field', label: '看哪一条数的边界线', type: 'pills',
        options: [
          { v: 'seats', l: '👥 报名人数 (2|3、5|6、10|11、20|21)' },
          { v: 'hours', l: '⏱️ 课时 (0|1、120|121)' },
          { v: 'coupon', l: '🎟️ 优惠券 (-1|0、500|501)' }
        ]
      },
      {
        key: 'strategy', label: '边界点怎么踩', type: 'pills',
        options: [
          { v: 'on', l: '仅踩线两边 (2点)' },
          { v: 'off', l: '线内+外移一步 (3值)' },
          { v: 'full', l: '3值 + 域端点' }
        ]
      },
      { type: 'action', action: 'animate-bv', label: '▶️ 动画挨个踩边界点', variant: 'fun' },
      { key: 'base', label: '其他框固定预设', type: 'select', advanced: true, options: [{ v: 'typical', l: '11 课时 / 持证' }, { v: 'small', l: '1 课时 / 持证' }, { v: 'large', l: '120 课时 / 无证' }] },
      {
        key: 'defects', label: '开启系统内藏的 Bug', type: 'checks', advanced: true,
        options: Q.DEFECTS.map(function (d) { return { v: d.id, l: d.id + ' ' + d.short }; })
      }
    ];
  }

  function compute(st) {
    return Q.bvExecute({ field: st.field, strategy: st.strategy, base: st.base, defects: st.defects });
  }

  function renderNumberLineSvg(r, animStep) {
    var W = 880, H = 186, padL = 62, padR = 54;
    var vals = r.cases.map(function (c) { return c.value; }).concat(r.domain);
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    var span = Math.max(1, maxV - minV);
    function xOf(v) { return padL + ((v - minV) / span) * (W - padL - padR); }

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="边界跳崖数轴图">');
    var x0 = xOf(r.domain[0]), x1 = xOf(r.domain[1]);
    /* 底层安全跑道 vs 两侧悬崖线 */
    svg.push('<line x1="' + padL + '" y1="96" x2="' + (W - padR) + '" y2="96" stroke="#fed7aa" stroke-width="8" stroke-linecap="round"/>');
    svg.push('<line x1="' + x0.toFixed(1) + '" y1="96" x2="' + x1.toFixed(1) + '" y2="96" stroke="#a7f3d0" stroke-width="10" stroke-linecap="round"/>');

    /* 围栏分隔线 */
    r.pairs.forEach(function (p, pi) {
      var bx = xOf((p.below + p.above) / 2);
      svg.push('<line x1="' + bx.toFixed(1) + '" y1="34" x2="' + bx.toFixed(1) + '" y2="128" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5 3"/>');
      svg.push('<rect x="' + (bx - 22).toFixed(1) + '" y="12" width="44" height="20" rx="10" fill="#fff8e6" stroke="#fcd34d"/>');
      svg.push('<text x="' + bx.toFixed(1) + '" y="26" text-anchor="middle" font-size="10.5" font-weight="800" fill="#b45309">' + p.below + '|' + p.above + '</text>');
      void pi;
    });

    /* 测试踩点圆球（交替错开数字避免挤在一起） */
    r.cases.forEach(function (c, i) {
      var cx = xOf(c.value);
      var isCur = i === animStep;
      var fill = c.pass ? '#10b981' : '#ef4444';
      var lblY = (i % 2 === 0) ? 148 : 168;
      if (isCur) {
        svg.push('<circle cx="' + cx.toFixed(1) + '" cy="96" r="15" fill="rgba(245,158,11,0.28)" stroke="#f59e0b" stroke-width="2.5"/>');
      }
      svg.push('<circle cx="' + cx.toFixed(1) + '" cy="96" r="' + (isCur ? 9 : 7) + '" fill="' + fill + '" stroke="#ffffff" stroke-width="2.2"/>');
      if (!c.pass) {
        svg.push('<text x="' + cx.toFixed(1) + '" y="66" text-anchor="middle" font-size="13">💥</text>');
      }
      svg.push('<text x="' + cx.toFixed(1) + '" y="' + lblY + '" text-anchor="middle" font-size="11" font-weight="' + (isCur ? '800' : '700') + '" fill="' + (isCur ? '#b45309' : (c.pass ? '#0f2744' : '#b91c1c')) + '">' + c.value + '</text>');
    });

    svg.push('</svg>');
    return svg.join('');
  }

  function viz(res, st) {
    var curIdx = (st.animStep >= 0 && st.animStep < res.cases.length) ? st.animStep : -1;
    var curCase = curIdx >= 0 ? res.cases[curIdx] : null;

    var kpis = Q.kpiStrip([
      { icon: '🚧', label: '边界围栏命中率', value: Q.pctText(res.hitRate), sub: '卡准 ' + res.boundaryHit + '/' + res.boundaryTotal + ' 道门槛线', tone: res.hitRate >= 100 ? 'ok' : 'warn' },
      { icon: '👟', label: '共踩了多少点', value: res.caseCount + ' 个', sub: '安全区间+临界越界', tone: 'blue' },
      { icon: '💥', label: '当场抓到差1错', value: res.failCount + ' 个', sub: '红点爆破说明算错钱或拦错了', tone: res.failCount ? 'warn' : 'ok' },
      { icon: '🐛', label: '累计破获 Bug', value: res.detectedCount + ' / 4', sub: '含 D1 边界 / D2 取整差1元', tone: res.detectedCount ? 'ok' : 'blue' }
    ]);

    var stepSpot = curCase
      ? '<div class="ball-drop-pill ' + (curCase.pass ? 'ok' : 'bad') + ' mt10">' +
          '<span>👟 第 ' + (curIdx + 1) + '/' + res.cases.length + ' 步踩在【' + curCase.value + '】→ ' +
          (curCase.pass ? '正常通过！' : '💥 抓到差1坑：' + Q.esc(curCase.diff || '输出不对')) + '</span>' +
        '</div>'
      : '<div class="tiny muted mt10">💡 绿条 = 合法安全区 · 黄虚线 = 折扣/范围门槛 · 点上方「▶️ 动画挨个踩边界点」看红球在哪里爆炸！</div>';

    var trackCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🚧 边界跳崖数轴（红球 💥 = 当场揪出的 Bug）</span></div>' +
      '<span class="badge ' + (res.failCount ? 'warn' : 'pass') + '">合法范围：' + res.domain[0] + ' ~ ' + res.domain[1] + '</span>' +
    '</div><div class="card-b"><div class="chart-box">' + renderNumberLineSvg(res, curIdx) + stepSpot + '</div></div></div>';

    var coachBox = st.field === 'seats'
      ? Q.coach(res.failCount ? 'ok' : 'info', '为什么「报名人数」2 和 3 之间最容易出事？',
        '规格写着「3人起才享95折」，如果程序员把 <code>seats &gt;= 3</code> 手抖写成 <code>seats &gt;= 2</code>，测 1 人对、测 4 人也对，<b>唯独踩在 2|3 这条门槛线上才会当场抓现行！</b>')
      : Q.coach('info', '所有临界点都踩一遍！',
        '无论输入多大范围，最容易把 <code>&gt;</code> 写成 <code>&gt;=</code> 的漏洞都趴在“正好等于边界值”以及“多1、少1”这两个位置上。');

    var rows = res.cases.map(function (c, i) {
      return [
        i + 1,
        { html: '<b>' + Q.esc(c.value) + '</b>' },
        c.expected.ok ? c.expected.payable + '元' : '拦截',
        c.actual.ok ? c.actual.payable + '元' : '拦截',
        { html: c.pass ? Q.badge('pass', '正常') : Q.badge('fail', '💥 ' + Q.esc(c.diff || '报错')) }
      ];
    });

    return kpis + trackCard + coachBox +
      Q.drawer('📋 展开全部 ' + res.cases.length + ' 个边界点实测流水表', '点击查看每个点详情', Q.table(['#', '测试值', '理论应收', '实际返回', '判定'], rows), false);
  }

  function onAction(act, el, st, WB, update) {
    if (act === 'animate-bv') {
      var res = compute(st);
      var total = res.cases.length;
      if (!total) return;
      if (WB.session.animTimer) clearInterval(WB.session.animTimer);
      st.animStep = 0;
      update(false);
      WB.session.animTimer = setInterval(function () {
        if (st.animStep + 1 >= total) {
          clearInterval(WB.session.animTimer);
          WB.session.animTimer = null;
          return;
        }
        st.animStep += 1;
        update(false);
      }, 460);
    }
  }

  function evidence(res) {
    return {
      status: res.hitRate >= 100 && res.failCount > 0 ? 'pass' : 'warn',
      pass: res.hitRate >= 100,
      coverage: res.hitRate || 0,
      label: '边界对命中率',
      defects: res.matrix.filter(function (m) { return m.detected; }).map(function (m) { return m.id; }),
      summary: '命中边界 ' + res.boundaryHit + '/' + res.boundaryTotal + ' 对，爆出 ' + res.failCount + ' 处差1 Bug',
      metrics: { hitRate: res.hitRate, failCount: res.failCount }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢边界值分析',
      '<b>Bug 最喜欢躲在门槛两边的“差 1”位置上！</b>记住口诀：<b>测边界（卡线）、测离点（多 1 和少 1）</b>—— 比如规定 1~120，必测 <code>0, 1, 2</code> 和 <code>119, 120, 121</code>！');
  }

  window.WB.registerExp({
    id: 'm3', no: 3, group: '黑盒用例设计',
    title: '边界跳崖 · 邻点捉虫', chapter: '第 2 章 · 边界值分析',
    hook: 'Bug 最爱躲在刚好卡线和加减 1 的门槛边上',
    goal: ['用动画看懂“上点 + 离点”如何抓出 >= 写错成 > 的 Bug', '体会人数多档折扣边界怎么逐一排查'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

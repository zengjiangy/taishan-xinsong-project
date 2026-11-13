/* ============================================================================
 * m6.js — 第 6 关：白盒电路点亮游乐场
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  var NODE_POS = {
    B01: { x: 75, y: 120 }, B02: { x: 75, y: 225 }, B03: { x: 185, y: 120 },
    B04: { x: 185, y: 45 }, B05: { x: 185, y: 195 }, B06: { x: 300, y: 120 },
    B07: { x: 425, y: 36 }, B08: { x: 425, y: 92 }, B09: { x: 425, y: 148 }, B10: { x: 425, y: 204 },
    B11: { x: 555, y: 74 }, B12: { x: 555, y: 166 }, B13: { x: 660, y: 120 },
    B14: { x: 750, y: 120 }, B15: { x: 750, y: 45 }, B16: { x: 855, y: 45 },
    B17: { x: 855, y: 195 }, B18: { x: 855, y: 120 }
  };

  function makeDefaults() {
    return {
      criterion: 'decision',
      selectedIds: ['U1', 'U2', 'U3', 'U4'],
      defects: ['SEAT_BOUNDARY', 'COUPON_CAP'],
      stepIdx: -1
    };
  }

  function buildParams() {
    return [
      {
        key: 'criterion', label: '通关点亮标准（由松到严）', type: 'pills', wide: true,
        options: [
          { v: 'statement', l: '1️⃣ 语句块全亮' },
          { v: 'decision', l: '2️⃣ 岔口真/假全亮' },
          { v: 'condition', l: '3️⃣ 小条件全亮' },
          { v: 'dc', l: '4️⃣ 判定+条件双满' }
        ]
      },
      { type: 'action', action: 'wb-minset', label: '⚡ 一键凑齐最少通关用例', variant: 'primary' },
      { type: 'action', action: 'wb-animate', label: '▶️ 逐条点亮电路演示', variant: 'fun' },
      { type: 'action', action: 'wb-default', label: '↺ 退回初始 4 条', variant: '' },
      {
        key: 'defects', label: '注入代码隐藏Bug（用来对比变异分支）', type: 'checks', advanced: true,
        options: Q.DEFECTS.map(function (d) { return { v: d.id, l: d.id + ' ' + d.short }; })
      }
    ];
  }

  function compute(st) {
    var selected = Q.WB_LIBRARY.filter(function (c) { return (st.selectedIds || []).indexOf(c.id) >= 0; });
    var runs = selected.map(function (c) {
      return Object.assign({ id: c.id, short: c.short, label: c.label }, Q.wbRunOne(c.input, st.defects));
    });
    var analysis = Q.wbAnalyze(runs);
    var status = Q.wbCriterionStatus(analysis, st.criterion);
    return { selected: selected, runs: runs, analysis: analysis, status: status };
  }

  function renderCfgSvg(res, stepRun) {
    var W = 930, H = 260;
    var hitB = res.analysis.hitBlocks || {};
    var stepMap = {};
    if (stepRun) stepRun.blocks.forEach(function (b) { stepMap[b] = true; });

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="计费函数控制流电路图">');
    /* 连线 */
    Object.keys(Q.WB_CFG.edges).forEach(function (from) {
      var a = NODE_POS[from];
      if (!a) return;
      Q.WB_CFG.edges[from].forEach(function (to) {
        var b = NODE_POS[to];
        if (!b) return;
        var lit = Boolean(hitB[from] && hitB[to]);
        var hot = Boolean(stepMap[from] && stepMap[to]);
        var stroke = hot ? '#f59e0b' : (lit ? '#0e9f8a' : '#cbd5e1');
        var cls = hot ? 'fsm-edge-active' : '';
        svg.push('<line class="' + cls + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + stroke + '" stroke-width="' + (hot ? 3.2 : (lit ? 2.2 : 1.3)) + '" ' + (hot ? 'stroke-dasharray="5 3"' : (!lit ? 'stroke-dasharray="4 3"' : '')) + '/>');
      });
    });

    /* 电路节点 B01..B18 */
    Object.keys(NODE_POS).forEach(function (bid) {
      var p = NODE_POS[bid];
      var lit = Boolean(hitB[bid]);
      var hot = Boolean(stepMap[bid]);
      var fill = hot ? '#fffbeb' : (lit ? '#ecfdf5' : '#f8fafc');
      var stroke = hot ? '#f59e0b' : (lit ? '#10b981' : '#94a3b8');
      var tcol = hot ? '#b45309' : (lit ? '#065f46' : '#64748b');
      svg.push('<rect x="' + (p.x - 27) + '" y="' + (p.y - 14) + '" width="54" height="28" rx="9" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (hot ? 2.6 : 1.8) + '"' + (!lit && !hot ? ' stroke-dasharray="3 2"' : '') + '/>');
      svg.push('<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" font-size="11" font-weight="800" font-family="monospace" fill="' + tcol + '">' + bid + '</text>');
    });
    svg.push('</svg>');
    return svg.join('');
  }

  function viz(res, st) {
    var a = res.analysis;
    var s = res.status;
    var curIdx = (st.stepIdx >= 0 && st.stepIdx < res.runs.length) ? st.stepIdx : -1;
    var stepRun = curIdx >= 0 ? res.runs[curIdx] : null;

    var kpis = Q.kpiStrip([
      { icon: s.passed ? '🎉' : '⚡', label: '当前通关准则结果', value: Q.pctText(s.rate), sub: s.value + '/' + s.total + (s.passed ? ' · 全绿达标！' : ' · 还差几个黑格子'), tone: s.passed ? 'ok' : 'warn' },
      { icon: '🟩', label: '代码块点亮', value: Q.pctText(a.blocks.rate), sub: a.blocks.covered + ' / ' + a.blocks.total + ' 块已执行', tone: a.blocks.rate >= 100 ? 'ok' : 'blue' },
      { icon: '🔀', label: '岔路口真假枝', value: Q.pctText(a.decisions.rate), sub: a.decisions.covered + ' / ' + a.decisions.total + ' 条枝', tone: a.decisions.rate >= 100 ? 'ok' : 'teal' },
      { icon: '🧩', label: '原子条件覆盖', value: Q.pctText(a.conditions.rate), sub: a.conditions.covered + ' / ' + a.conditions.total + ' 项', tone: 'blue' }
    ]);

    /* 点击挑选用例电池板 */
    var pills = Q.WB_LIBRARY.map(function (c) {
      var on = (st.selectedIds || []).indexOf(c.id) >= 0;
      return '<button type="button" class="pill-btn' + (on ? ' on' : '') + '" data-act="wb-toggle" data-id="' + c.id + '">' +
        (on ? '💡 ' : '🔌 ') + c.id + ' · ' + Q.esc(c.short) + '</button>';
    }).join('');
    var bankCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🔋 点亮电路测试库（点击任意按钮通电 / 断电，看看哪盏暗灯亮了！）</span></div>' +
      '<span class="badge mute">已插 ' + res.runs.length + ' / ' + Q.WB_LIBRARY.length + ' 颗电池</span></div>' +
      '<div class="card-b"><div class="qf-pills">' + pills + '</div></div></div>';

    var stepNotice = stepRun
      ? '<div class="ball-drop-pill ok mt10"><span>⚡ 正在演示：' + Q.esc(stepRun.id + ' ' + stepRun.label) + ' → 刚刚点亮 ' + stepRun.blocks.length + ' 个电路节点（金黄高亮）</span></div>'
      : '<div class="tiny muted mt10">💡 绿块 = 已跑到的代码 · 灰色虚线块 = 从没跑过的代码盲区（比如 B16 负值截断试着点亮 <b>U9 1/1 券500</b> 看看！）</div>';

    var cfgCard = '<div class="card"><div class="card-h"><span class="card-t">💡 代码内部控制流电路图（揭开黑盒看程序怎么走）</span></div>' +
      '<div class="card-b"><div class="cfg-box">' + renderCfgSvg(res, stepRun) + stepNotice + '</div></div></div>';

    var coachBox = s.passed
      ? Q.coach('ok', '电路全亮达标！你用 ' + res.runs.length + ' 条用例就攻克了目标',
        '这就是白盒测试的精妙所在：<b>把代码内部所有分支和岔路口亮出来</b>，不浪费重复测试，专挑暗掉的角落（比如 B02 非法入口、B16 负数保护）精准补用例！')
      : Q.coach('warn', '还有黑灯没亮！目前只点亮了 ' + s.value + ' / ' + s.total + ' 处',
        '试试顺手点开 <b>U9 (券500负数保护)</b>、<b>U11 (0课时拦截)</b> 等黑灯泡，或者直接点击上面「⚡ 一键自动凑齐最少通关用例」看机器帮你挑出最省力气的一组！');

    var srcHtml = '<div class="codeview">' + a.parsed.lines.slice(0, 60).map(function (l) {
      var hit = l.block && a.hitBlocks[l.block];
      return '<div class="code-line ' + (l.kind === 'instr' ? 'instr' : (hit ? 'hit' : 'miss')) + '">' +
        '<span class="cl-no">' + l.no + '</span><span class="cl-tx">' + Q.esc(l.text || ' ') + '</span></div>';
    }).join('') + '</div>';

    return kpis + bankCard + cfgCard + coachBox +
      Q.drawer('🔬 展开带探针的真实被测源码（绿行=执行过 · 红行=从未跑到）', a.parsed.lines.length + ' 行', srcHtml, false);
  }

  function onAction(act, el, st, WB, update) {
    if (act === 'wb-toggle') {
      var id = el.getAttribute('data-id');
      var cur = (st.selectedIds || []).slice();
      var i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1); else cur.push(id);
      st.selectedIds = cur;
      st.stepIdx = -1;
      return true;
    }
    if (act === 'wb-default') {
      st.selectedIds = ['U1', 'U2', 'U3', 'U4'];
      st.stepIdx = -1;
      return true;
    }
    if (act === 'wb-minset') {
      var minRes = Q.wbGreedyMinSet(Q.WB_POOL, st.criterion, st.defects);
      var matchedIds = [];
      minRes.cases.forEach(function (inp) {
        var found = Q.WB_LIBRARY.find(function (lib) { return JSON.stringify(lib.input) === JSON.stringify(inp); });
        if (found) matchedIds.push(found.id);
      });
      st.selectedIds = matchedIds.length ? matchedIds : ['U1', 'U2', 'U5', 'U7', 'U9', 'U11'];
      st.stepIdx = -1;
      WB.toast('已为您自动挑出最少达标组合（仅需 ' + st.selectedIds.length + ' 条用例）！');
      return true;
    }
    if (act === 'wb-animate') {
      var total = (st.selectedIds || []).length;
      if (!total) { WB.toast('先在电池板里点亮至少 1 条用例哦', 'warn'); return; }
      if (WB.session.animTimer) clearInterval(WB.session.animTimer);
      st.stepIdx = 0;
      update(false);
      WB.session.animTimer = setInterval(function () {
        if (st.stepIdx + 1 >= total) {
          clearInterval(WB.session.animTimer);
          WB.session.animTimer = null;
          return;
        }
        st.stepIdx += 1;
        update(false);
      }, 550);
    }
  }

  function evidence(res) {
    var dRate = res.analysis.decisions.rate || 0;
    return {
      status: res.status.passed ? 'pass' : 'warn',
      pass: res.status.passed,
      coverage: dRate,
      label: '判定覆盖率',
      defects: res.runs.some(function (r) { return r.id === 'U9'; }) ? ['COUPON_CAP'] : [],
      summary: res.status.value + '/' + res.status.total + ' 达成准则，语句 ' + Q.pctText(res.analysis.blocks.rate) + ' / 判定 ' + Q.pctText(dRate),
      metrics: { blocks: res.analysis.blocks.rate, decisions: dRate }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢白盒与覆盖准则',
      '<b>把代码打开像查电路一样一行行点亮！</b>严苛程度排队：<b>块(语句)覆盖 &lt; 岔口(判定)覆盖 &lt; 原子条件覆盖 &lt; 判定-条件双满</b>。写最少测试用例点亮所有拐角就是高手！');
  }

  window.WB.registerExp({
    id: 'm6', no: 6, group: '状态、结构与流水线',
    title: '白盒电路 · 迷宫全亮', chapter: '第 4 章 · 白盒与覆盖分析',
    hook: '看清代码内部分支电路，选最少测试用例把它全点亮',
    goal: ['用亮灯图看清哪些代码从没被测过', '体会贪心最小集合怎样用最少的用例达标'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

/* ============================================================================
 * m4.js — 第 4 关：决策表开关灯箱
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  function makeDefaults() {
    return {
      preset: 'complete',
      strategy: 'first',
      scope: 'full',
      rules: Q.dtPresetRules('complete')
    };
  }

  function buildParams() {
    return [
      {
        key: 'preset', label: '先看一套现成规则剧本', type: 'pills', wide: true,
        options: [
          { v: 'complete', l: '✅ 完美无漏(7条)' },
          { v: 'missing', l: '🕳️ 忘写R7(有盲区)' },
          { v: 'conflict', l: '💥 两条规则打架' },
          { v: 'wrong', l: '❌ 动作写错(放水)' }
        ]
      },
      {
        key: 'strategy', label: '规则打架怎么收场', type: 'pills',
        options: [
          { v: 'first', l: '按第一条算' },
          { v: 'strict', l: '从严兜底' },
          { v: 'block', l: '打架立刻拦停' }
        ]
      },
      { key: 'scope', label: '显示组合格数', type: 'select', advanced: true, options: [{ v: 'full', l: '全部 16 种排列组合' }, { v: 'reachable', l: '合并不可达后 9 种' }] }
    ];
  }

  function onParam(k, v, st) {
    if (k === 'preset') st.rules = Q.dtPresetRules(v);
  }

  function compute(st) {
    return Q.dtEvaluate(st.rules, { strategy: st.strategy, scope: st.scope });
  }

  function viz(res, st) {
    var kpis = Q.kpiStrip([
      { icon: '💡', label: '灯格覆盖率', value: Q.pctText(res.coverage), sub: res.covered + ' / ' + res.total + ' 种组合已被管住', tone: res.uncovered.length ? 'warn' : 'ok' },
      { icon: '🎯', label: '与规格一致率', value: Q.pctText(res.accuracy), sub: '错判 ' + res.wrong.length + ' 格', tone: res.wrong.length ? 'bad' : 'ok' },
      { icon: '💥', label: '规则打架格', value: res.conflicts.length + ' 格', sub: '同一组合同时命中≥2条冲突规则', tone: res.conflicts.length ? 'warn' : 'ok' },
      { icon: '🕳️', label: '漏写盲区', value: res.uncovered.length + ' 格', sub: '没有任何规则命中的空档', tone: res.uncovered.length ? 'bad' : 'ok' }
    ]);

    /* 16 格彩色结果灯箱 */
    var byKey = {};
    res.rows.forEach(function (r) { byKey[r.key] = r; });
    var colBits = ['00', '01', '11', '10'];
    var colLbl = ['C3=N C4=N', 'C3=N C4=Y', 'C3=Y C4=Y', 'C3=Y C4=N'];
    var rowBits = ['00', '01', '11', '10'];
    var rowLbl = ['C1=N C2=N', 'C1=N C2=Y', 'C1=Y C2=Y', 'C1=Y C2=N'];

    var gridHtml = '<div class="matrix">' +
      '<div class="mx-corner">开关组合</div>' +
      colLbl.map(function (l) { return '<div class="mx-h">' + l + '</div>'; }).join('');
    rowBits.forEach(function (rb, ri) {
      gridHtml += '<div class="mx-rh">' + rowLbl[ri] + '</div>';
      colBits.forEach(function (cb) {
        var key = rb + cb;
        var row = byKey[key];
        if (!row) {
          gridHtml += '<div class="mx-c mx-na"><span class="mx-g">—</span><span class="mx-a">不参与</span></div>';
          return;
        }
        var cls = 'mx-c ';
        var glyph = '✅';
        if (row.status === 'uncovered') { cls += 'mx-uncovered'; glyph = '🕳️'; }
        else if (row.status === 'conflict' || row.status === 'blocked') { cls += 'mx-conflict'; glyph = '💥'; }
        else if (!row.correct) { cls += 'mx-wrong'; glyph = '🚨'; }
        else { cls += 'mx-ok'; }

        var actName = row.resolved ? Q.APP_ACTIONS[row.resolved].label : '无输出';
        gridHtml += '<div class="' + cls + '" title="匹配规则：' + Q.esc(row.matched.join(', ') || '无') + '">' +
          '<span class="mx-g">' + glyph + '</span>' +
          '<span class="mx-a">' + Q.esc(actName) + '</span>' +
          '<span class="mx-k">' + (row.matched.join('+') || '空') + '</span>' +
        '</div>';
      });
    });
    gridHtml += '</div>';

    var matrixCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🚦 16 种条件组合结果灯箱</span> <span class="card-sub">绿灯=算对 · 红灯=算错 · 黄爆=打架 · 灰洞=漏规则</span></div></div>' +
      '<div class="card-b">' + gridHtml + '</div></div>';

    /* 可手点的开关规则表 */
    var condHeaders = Q.DT_COND_LABELS.map(function (c) { return c.key + ' ' + c.label; });
    var ruleRows = st.rules.map(function (r, ri) {
      var cells = r.c.map(function (val, ci) {
        var cv = val === 'Y' ? 'cv-y' : (val === 'N' ? 'cv-n' : 'cv-d');
        return { html: '<button type="button" class="cellbtn ' + cv + '" data-act="cycle-cell" data-r="' + ri + '" data-c="' + ci + '">' + Q.esc(val) + '</button>' };
      });
      return [{ html: '<b>' + Q.esc(r.id) + '</b>' }].concat(cells).concat([
        { html: '<button type="button" class="actbtn a-' + r.action + '" data-act="cycle-act" data-r="' + ri + '">' + Q.esc(Q.APP_ACTIONS[r.action].label) + '</button>' },
        { html: '<span class="tiny muted">' + Q.esc(r.note || '可点按钮改条件') + '</span>' }
      ]);
    });
    var ruleCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🎛️ 规则开关面板（点击任意 Y / N / — 或结论都能实时改！）</span></div>' +
      '</div><div class="card-b flush">' + Q.table(['规则'].concat(condHeaders).concat(['动作结论', '说明']), ruleRows) + '</div></div>';

    var coachBox = res.accuracy === 100 && !res.conflicts.length && !res.uncovered.length
      ? Q.coach('ok', '满分灯箱！16 盏灯全绿通关', '4 个条件共 2⁴=16 种组合没有一处遗漏、没有一处打架，而且全部分毫不差！现实中遇到多条件审批，画决策表最不容易写漏 <code>else</code>！')
      : (res.uncovered.length
        ? Q.coach('bad', '抓到了！发现 ' + res.uncovered.length + ' 个灰色空洞盲区', '删掉 R7 后，遇到特定组合没有任何规则兜底，系统会直接发懵返回“空”！点回「✅ 完美无漏」或者把规则里条件调通即可修复。')
        : (res.conflicts.length
          ? Q.coach('warn', '报警！规则打架了（黄色 💥）', '同一套条件同时命中了两条给不同结论的规则！用「按第一条算」可能误放水，调成「打架立刻拦停」就能在上线前把它揪出来！')
          : Q.coach('bad', '抓到了动作写错的红灯（🚨）！', '规则是覆盖到了，但结果把本该「条件通过」写成了直接「通过」——决策表能把每一个格子的预期和实际掰开对照！')));

    var diagRows = res.ruleDiag.map(function (d) {
      return [
        d.id,
        d.match + ' 格',
        { html: d.status === 'active' ? Q.badge('pass', '生效') : Q.badge('warn', d.status === 'shadowed' ? '被前面规则遮住' : '无效规则') },
        d.note || '正常起作用'
      ];
    });
    return kpis + matrixCard + ruleCard + coachBox +
      Q.drawer('🔍 每条规则体检表（看有没有多余或被遮蔽的规则）', res.ruleDiag.length + ' 条规则', Q.table(['规则', '管了多少格', '体检状态', '备注'], diagRows), false);
  }

  function onAction(act, el, st) {
    if (act === 'cycle-cell') {
      var ri = Number(el.getAttribute('data-r'));
      var ci = Number(el.getAttribute('data-c'));
      var order = ['Y', 'N', '-'];
      var cur = st.rules[ri].c[ci];
      st.rules[ri].c[ci] = order[(order.indexOf(cur) + 1) % order.length];
      return true;
    }
    if (act === 'cycle-act') {
      var rIdx = Number(el.getAttribute('data-r'));
      var aOrder = ['PASS', 'COND_A', 'COND_B', 'REJECT'];
      var curA = st.rules[rIdx].action;
      st.rules[rIdx].action = aOrder[(aOrder.indexOf(curA) + 1) % aOrder.length];
      return true;
    }
  }

  function evidence(res) {
    var ok = res.accuracy === 100 && res.conflicts.length === 0 && res.uncovered.length === 0;
    return {
      status: ok ? 'pass' : 'warn',
      pass: ok,
      coverage: res.accuracy || 0,
      label: '与规格一致率',
      defects: [],
      summary: '覆盖 ' + res.covered + '/' + res.total + ' 格，一致率 ' + Q.pctText(res.accuracy),
      metrics: { accuracy: res.accuracy, conflicts: res.conflicts.length }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢决策表',
      '<b>把多个“如果……而且……”的组合全部摊开在桌面上！</b>4 个是/否条件就有 2⁴ = 16 格，用表格一眼看穿：<b>有没有漏写某个分支（空洞）？有没有两条规则打架（冲突）？</b>');
  }

  window.WB.registerExp({
    id: 'm4', no: 4, group: '黑盒用例设计',
    title: '决策开关 · 规则灯箱', chapter: '第 2 章 · 决策表测试',
    hook: '多条件组合怕写漏或打架？点亮 16 格灯箱一眼看穿',
    goal: ['体验漏规则造成的盲区与规则冲突打架', '学会点击开关微调规则并核对全部组合'],
    defaults: makeDefaults(), params: buildParams, onParam: onParam,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

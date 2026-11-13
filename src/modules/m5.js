/* ============================================================================
 * m5.js — 第 5 关：状态迁移小火车游乐场
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  function makeDefaults() {
    return {
      events: ['submit', 'startReview', 'approve', 'book', 'attend', 'complete'],
      seatsLeft: 1,
      allowPromote: false,
      allowRevise: true,
      allowReopen: false
    };
  }

  function buildParams() {
    return [
      {
        key: 'seatsLeft', label: '当前剩余名额（决定预约去哪站）', type: 'pills',
        options: [
          { v: '1', l: '🎟️ 名额够 (余 1 名)' },
          { v: '0', l: '🈵 满员了 (余 0 名)' }
        ]
      },
      { type: 'action', action: 'fsm-auto', label: '⚡ 一键跑满推荐路线', variant: 'primary' },
      { type: 'action', action: 'fsm-bad-demo', label: '🧪 故意乱点测拦截', variant: 'fun' },
      { type: 'action', action: 'fsm-clear', label: '🧹 回到草稿起点', variant: '' },
      { key: 'allowPromote', label: '允许「候补转正」', type: 'checkbox', advanced: true, hint: '开启后候补可转已预约' },
      { key: 'allowRevise', label: '允许「驳回修改重提」', type: 'checkbox', advanced: true, hint: '已驳回可退回草稿' },
      { key: 'allowReopen', label: '允许「取消后重开」', type: 'checkbox', advanced: true, hint: '已取消可重回草稿' }
    ];
  }

  function compute(st) {
    return Q.fsmRun({
      events: st.events,
      seatsLeft: Number(st.seatsLeft),
      toggles: { allowPromote: st.allowPromote, allowRevise: st.allowRevise, allowReopen: st.allowReopen }
    });
  }

  function renderFsmSvg(res) {
    var W = 910, H = 300, bw = 88, bh = 36;
    var activeIds = {};
    res.active.forEach(function (t) { activeIds[t.id] = true; });
    var hitTids = {};
    res.trace.forEach(function (t) { if (t.ok && t.tid) hitTids[t.tid] = true; });
    var visStates = {};
    res.coveredStates.forEach(function (id) { visStates[id] = true; });

    var bySt = {};
    Q.FSM_STATES.forEach(function (s) { bySt[s.id] = s; });

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="报名系统状态流转地铁图">');
    svg.push('<defs>' +
      '<marker id="fsmArwOn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1 L9 5 L0 9 z" fill="#0e9f8a"/></marker>' +
      '<marker id="fsmArwOff" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 1 L9 5 L0 9 z" fill="#cbd5e1"/></marker>' +
    '</defs>');

    /* 边：已解锁路线绿色流动，未解锁虚线灰，禁用淡灰 */
    Q.FSM_TRANSITIONS.forEach(function (t) {
      var a = bySt[t.from], b = bySt[t.to];
      if (!a || !b) return;
      var enabled = Boolean(activeIds[t.id]);
      var hit = Boolean(hitTids[t.id]);
      var x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
      var dy = y2 - y1, dx = x2 - x1;
      var sx = x1 + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? bw / 2 : -bw / 2) : 0);
      var sy = y1 + (Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? bh / 2 : -bh / 2) : (dy > 20 ? 10 : 0));
      var ex = x2 - (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? bw / 2 + 4 : -(bw / 2 + 4)) : 0);
      var ey = y2 - (Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? bh / 2 + 4 : -(bh / 2 + 4)) : (dy > 20 ? 10 : 0));
      var mx = (sx + ex) / 2, my = (sy + ey) / 2 + (t.id === 'T12' || t.id === 'T13' ? 36 : (dy === 0 ? -16 : 0));
      var path = 'M ' + sx + ' ' + sy + ' Q ' + mx + ' ' + my + ' ' + ex + ' ' + ey;
      var stroke = !enabled ? '#e2e8f0' : (hit ? '#0e9f8a' : '#94a3b8');
      var cls = hit ? 'fsm-edge-active' : '';
      var dash = hit ? '6 4' : (enabled ? 'none' : '4 4');
      svg.push('<path class="' + cls + '" d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="' + (hit ? 2.8 : 1.7) + '" stroke-dasharray="' + dash + '" marker-end="url(#' + (hit ? 'fsmArwOn' : 'fsmArwOff') + ')"/>');
    });

    /* 站点节点 */
    Q.FSM_STATES.forEach(function (s) {
      var x = s.x - bw / 2, y = s.y - bh / 2;
      var isCur = res.final === s.id;
      var isVis = Boolean(visStates[s.id]);
      var fill = isCur ? '#0284c7' : (isVis ? '#ecfdf5' : '#ffffff');
      var stroke = isCur ? '#0369a1' : (isVis ? '#10b981' : '#cbd5e1');
      var textFill = isCur ? '#ffffff' : (isVis ? '#065f46' : '#475569');
      if (isCur) {
        svg.push('<rect x="' + (x - 5) + '" y="' + (y - 5) + '" width="' + (bw + 10) + '" height="' + (bh + 10) + '" rx="16" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="5 3"/>');
      }
      svg.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="12" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>');
      svg.push('<text x="' + s.x + '" y="' + (s.y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="800" fill="' + textFill + '">' +
        (isCur ? '🚂 ' : '') + s.label + '</text>');
    });
    svg.push('</svg>');
    return svg.join('');
  }

  function viz(res, st) {
    var cov = res.coverage;
    var lastStep = res.trace[res.trace.length - 1];
    var legalEventsFromCur = {};
    res.active.forEach(function (t) { if (t.from === res.final) legalEventsFromCur[t.event] = true; });

    var kpis = Q.kpiStrip([
      { icon: '🚂', label: '火车停靠车站', value: Q.fsmStateLabel(res.final), sub: '点击下面操作按钮继续开动', tone: 'blue' },
      { icon: '🚉', label: '车站覆盖', value: cov.state.covered + ' / ' + cov.state.total, sub: Q.pctText(cov.state.rate) + ' 的车站去过', tone: cov.state.rate >= 100 ? 'ok' : 'teal' },
      { icon: '🔀', label: '路线解锁率', value: Q.pctText(cov.transition.rate), sub: '跑过 ' + cov.transition.covered + '/' + cov.transition.total + ' 条路', tone: cov.transition.rate >= 80 ? 'ok' : 'warn' },
      { icon: '🚧', label: '拦下乱点违规', value: res.invalid.length + ' 次', sub: '点错状态按钮必须拦住！', tone: res.invalid.length ? 'ok' : 'blue' }
    ]);

    var mapCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🚂 状态流转小火车线路图</span> <span class="card-sub">蓝框 = 当前站 · 绿线 = 走过的路 · 虚线 = 还没试过</span></div>' +
      '<span class="badge pass">余名额：' + res.seatsLeft + '</span></div>' +
      '<div class="card-b"><div class="chart-box">' + renderFsmSvg(res) + '</div></div></div>';

    /* 手点遥控面板 */
    var evtButtons = Q.FSM_EVENTS.map(function (ev) {
      var isLegal = Boolean(legalEventsFromCur[ev.id]);
      return '<button type="button" class="btn sm ' + (isLegal ? 'primary' : '') + '" data-act="fsm-push" data-ev="' + ev.id + '">' +
        (isLegal ? '▶ ' : '🚫 ') + Q.esc(ev.label) +
      '</button>';
    }).join('');

    var seqHtml = res.trace.length
      ? res.trace.map(function (t) {
        return '<span class="seqchip ' + (t.ok ? 'ok' : 'bad') + '">' +
          t.index + '. ' + Q.esc(t.eventLabel) + (t.ok ? ' → ' + Q.fsmStateLabel(t.to) : ' (被拦)') +
        '</span>';
      }).join('')
      : '<span class="tiny muted">还在「草稿」起点站，点下面按钮开动小火车！</span>';

    var consoleCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🎮 站点遥控台（蓝色▶ = 当前可走；🚫 = 可故意乱点测试门卫是否拦得住）</span></div>' +
      '<button type="button" class="btn sm" data-act="fsm-pop">↩ 退一步</button></div>' +
      '<div class="card-b">' +
        '<div class="btn-row">' + evtButtons + '</div>' +
        '<div class="seqbox mt10">' + seqHtml + '</div>' +
      '</div></div>';

    var coachBox = lastStep && !lastStep.ok
      ? Q.coach('bad', '🚧 门卫立功！违规操作「' + lastStep.eventLabel + '」被直接拦在站外',
        Q.esc(lastStep.reason || '当前车站不允许直接做这个动作') + '。这就是状态测试的核心任务之一：<b>不仅要测顺风流程，还要专门在错误状态下乱点，确认系统不会发疯！</b>')
      : (cov.transition.rate >= 80
        ? Q.coach('ok', '跑图高手！已解锁 ' + cov.transition.covered + '/' + cov.transition.total + ' 条轨道',
          '主流线路和分支基本跑通了。记得再点一次「🧪 故意乱点测拦截」，收集一次非法跳转拦截记录！')
        : Q.coach('info', '接着换条岔路跑跑看！',
          '目前跑过的路线偏主干。试着把名额切换成 <code>满员 0</code> 跑进候补站，或者驳回/取消，或者点橙色「⚡ 一键跑满推荐路线」！'));

    var logRows = res.trace.map(function (t) {
      return [
        t.index,
        t.eventLabel,
        Q.fsmStateLabel(t.from),
        { html: t.ok ? Q.badge('pass', '→ ' + Q.fsmStateLabel(t.to)) : Q.badge('fail', '被拦: ' + Q.esc(t.reason || '')) }
      ];
    });
    return kpis + mapCard + consoleCard + coachBox +
      Q.drawer('📜 展开行车步数流水日志 & 漏跑路线清单', res.trace.length + ' 步', Q.table(['步', '按键', '出发站', '结果'], logRows), false);
  }

  function onAction(act, el, st, WB) {
    if (act === 'fsm-push') {
      st.events = (st.events || []).concat([el.getAttribute('data-ev')]);
      return true;
    }
    if (act === 'fsm-pop') {
      st.events = (st.events || []).slice(0, -1);
      return true;
    }
    if (act === 'fsm-clear') {
      st.events = [];
      return true;
    }
    if (act === 'fsm-bad-demo') {
      st.events = (st.events || []).concat(['attend']);
      WB.toast('故意点「签到参训」测试门卫拦截！');
      return true;
    }
    if (act === 'fsm-auto') {
      var seq;
      if (Number(st.seatsLeft) === 0) {
        seq = st.allowRevise
          ? ['submit', 'startReview', 'reject', 'revise', 'submit', 'startReview', 'approve', 'book']
          : ['submit', 'startReview', 'approve', 'book'];
        if (st.allowPromote) seq.push('promote', 'attend', 'certify');
        else seq.push('giveUp');
      } else {
        seq = st.allowRevise
          ? ['submit', 'startReview', 'reject', 'revise', 'submit', 'startReview', 'approve', 'book', 'attend', 'certify']
          : Q.fsmSuggest({ allowPromote: st.allowPromote, allowRevise: st.allowRevise, allowReopen: st.allowReopen }, Number(st.seatsLeft)).events;
      }
      st.events = seq;
      WB.toast('已载入最小高覆盖推荐路线（' + seq.length + ' 步）！');
      return true;
    }
  }

  function evidence(res) {
    var rate = res.coverage.transition.rate || 0;
    var ok = rate >= 60;
    return {
      status: ok ? 'pass' : 'warn',
      pass: ok,
      coverage: rate,
      label: '迁移覆盖率',
      defects: [],
      summary: '到达 ' + res.coverage.state.covered + '/' + res.coverage.state.total + ' 个状态，解锁路线 ' + Q.pctText(rate),
      metrics: { stateRate: res.coverage.state.rate, transRate: rate, invalidCount: res.invalid.length }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢状态迁移测试',
      '<b>把软件想象成一列按固定轨道行驶的地铁！</b>测试时不仅要把每站每条合法轨道全坐一遍，更要<b>专门在不合时宜的站按错按钮（如草稿直接结业）</b>，确保门卫牢牢锁门！');
  }

  window.WB.registerExp({
    id: 'm5', no: 5, group: '状态、结构与流水线',
    title: '状态闯关 · 小火车路线', chapter: '第 2 章 · 状态迁移测试',
    hook: '合法轨道要跑全，错误状态下点按钮也必须拦住',
    goal: ['用动画地铁图走完正常、候补、驳回/取消各条路', '尝试故意乱点操作，看状态机怎样当场拦下来'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

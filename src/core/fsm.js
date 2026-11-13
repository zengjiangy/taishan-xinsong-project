/* ============================================================================
 * fsm.js — 状态迁移测试（M5）
 * 状态、事件、守卫条件、迁移动作都真实参与执行；覆盖率分母由当前模型（开关后）决定。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spec.js'));
  } else {
    root.QT = root.QT || {};
    Object.assign(root.QT, factory(root.QT));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';

  var TERMINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

  var PRESETS = [
    {
      key: 'happy', label: '主流程（报名→通过→预约→参训→结业）',
      events: ['submit', 'startReview', 'approve', 'book', 'attend', 'complete'], seatsLeft: 3
    },
    {
      key: 'reject', label: '驳回后修改重提（需要开启"驳回可重提"）',
      events: ['submit', 'startReview', 'reject', 'revise', 'submit', 'startReview', 'approve', 'book', 'attend', 'complete'], seatsLeft: 2
    },
    {
      key: 'waitlist', label: '满员转候补（名额设为 0）',
      events: ['submit', 'startReview', 'approve', 'book', 'giveUp'], seatsLeft: 0
    },
    {
      key: 'promote', label: '候补转正（名额 1，先满员再释放）',
      events: ['submit', 'startReview', 'approve', 'book', 'promote', 'attend', 'complete'], seatsLeft: 0
    },
    {
      key: 'invalid', label: '无效操作演示（未提交就预约、已取消再签到）',
      events: ['book', 'submit', 'cancel', 'attend'], seatsLeft: 2
    },
    { key: 'empty', label: '空序列（边界：不执行任何事件）', events: [], seatsLeft: 2 }
  ];

  var CRITERIA = [
    { key: 'state', label: '状态覆盖（visited / 全部状态）' },
    { key: 'transition', label: '迁移覆盖（covered / 全部有效迁移）' },
    { key: 'pair', label: '迁移对覆盖 1-switch（相邻两跳 / 全部可接续迁移对）' },
    { key: 'path', label: '终态路径（仅统计，不设分母：模型含回边，路径不可穷举）' }
  ];

  function guardOk(t, ctx) {
    if (!t.guard) return true;
    if (t.guard === 'seatsLeft > 0') return ctx.seatsLeft > 0;
    if (t.guard === 'seatsLeft = 0') return ctx.seatsLeft === 0;
    return true;
  }

  function applyEffects(t, ctx) {
    if (t.to === 'BOOKED') ctx.seatsLeft = Math.max(0, ctx.seatsLeft - 1);
    if (t.id === 'T09' || t.id === 'T10') ctx.seatsLeft = Math.min(ctx.maxSeats, ctx.seatsLeft + 1);
  }

  function runSequence(opts) {
    var toggles = opts.toggles || {};
    var active = S.activeTransitions(toggles);
    var startState = opts.start || 'DRAFT';
    var seatsLeft = typeof opts.seatsLeft === 'number' ? opts.seatsLeft : 3;
    var maxSeats = Math.max(seatsLeft, 1);
    var ctx = { seatsLeft: seatsLeft, maxSeats: maxSeats };
    var state = startState;
    var trace = [];
    var visited = {};
    visited[state] = true;

    (opts.events || []).forEach(function (ev, i) {
      var label = (S.FSM_EVENTS.filter(function (e) { return e.id === ev; })[0] || {}).label || ev;
      var candidates = active.filter(function (t) { return t.from === state && t.event === ev; });
      var chosen = null;
      for (var k = 0; k < candidates.length; k++) {
        if (guardOk(candidates[k], ctx)) { chosen = candidates[k]; break; }
      }
      if (!chosen) {
        var guardRejected = candidates.length > 0;
        trace.push({
          index: i + 1, event: ev, eventLabel: label, from: state, to: state,
          ok: false, tid: guardRejected ? candidates[0].id : null,
          reason: guardRejected ? '守卫条件不满足：' + candidates[0].guard : '状态 ' + stateLabel(state) + ' 不接受事件「' + label + '」',
          guardRejected: guardRejected
        });
        return;
      }
      var from = state;
      state = chosen.to;
      visited[state] = true;
      trace.push({
        index: i + 1, event: ev, eventLabel: label, from: from, to: state,
        ok: true, tid: chosen.id, label: chosen.label, reason: null
      });
      applyEffects(chosen, ctx);
    });

    var valid = trace.filter(function (t) { return t.ok; });
    var transitionIds = {};
    valid.forEach(function (t) { transitionIds[t.tid] = true; });

    // 状态集合
    var activeStates = {};
    active.forEach(function (t) { activeStates[t.from] = true; activeStates[t.to] = true; });
    activeStates[startState] = true;
    var allStateIds = Object.keys(activeStates);
    var reachedStates = allStateIds.filter(function (id) { return visited[id]; });
    var unreachedStates = allStateIds.filter(function (id) { return !visited[id]; });

    // 迁移对（1-switch）：t1.to === t2.from，且两条迁移都在当前模型中
    var pairs = [];
    active.forEach(function (a) {
      active.forEach(function (b) {
        if (a.to === b.from) pairs.push(a.id + '>' + b.id);
      });
    });
    var coveredPairs = [];
    for (var i = 1; i < valid.length; i++) {
      var key = valid[i - 1].tid + '>' + valid[i].tid;
      if (pairs.indexOf(key) >= 0 && coveredPairs.indexOf(key) < 0) coveredPairs.push(key);
    }

    var reachedTerminal = TERMINAL.filter(function (t) { return visited[t]; });
    var invalidCount = trace.filter(function (t) { return !t.ok; }).length;

    return {
      trace: trace, final: state, seatsLeft: ctx.seatsLeft,
      active: active, allStates: allStateIds.length,
      coveredStates: reachedStates,
      coverage: {
        state: { covered: reachedStates.length, total: allStateIds.length, rate: S.pct(reachedStates.length, allStateIds.length, 1), missed: unreachedStates.map(stateLabel) },
        transition: {
          covered: Object.keys(transitionIds).length, total: active.length,
          rate: S.pct(Object.keys(transitionIds).length, active.length, 1),
          missed: active.filter(function (t) { return !transitionIds[t.id]; }).map(function (t) { return t.id + ' ' + t.label; })
        },
        pair: {
          covered: coveredPairs.length, total: pairs.length,
          rate: S.pct(coveredPairs.length, pairs.length, 1),
          missed: pairs.filter(function (p) { return coveredPairs.indexOf(p) < 0; }).map(function (p) {
            var ids = p.split('>'); var a = active.filter(function (t) { return t.id === ids[0]; })[0];
            var b = active.filter(function (t) { return t.id === ids[1]; })[0];
            return a.label + ' → ' + b.label;
          })
        },
        path: { terminalReached: reachedTerminal.map(stateLabel), terminalTotal: TERMINAL.length }
      },
      invalid: trace.filter(function (t) { return !t.ok; }),
      eventCount: (opts.events || []).length
    };
  }

  function stateLabel(id) {
    var s = S.FSM_STATES.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : id;
  }

  /* 最小迁移覆盖序列：从 DRAFT 出发，逐步贪心覆盖未覆盖迁移（教学用自动补全建议） */
  function suggestSequence(toggles, seatsLeft) {
    var active = S.activeTransitions(toggles);
    var covered = {};
    var state = 'DRAFT';
    var seq = [];
    var guard = 0;
    while (guard++ < 40) {
      var outs = active.filter(function (t) { return t.from === state && !covered[t.id]; });
      if (!outs.length) break;
      // 优先选择能到达"更靠近终态"的迁移；简单起见按 X 坐标排序
      outs.sort(function (a, b) {
        var sa = S.FSM_STATES.filter(function (s) { return s.id === a.to; })[0];
        var sb = S.FSM_STATES.filter(function (s) { return s.id === b.to; })[0];
        return (sa ? sa.x : 0) - (sb ? sb.x : 0);
      });
      var t = outs[0];
      if (t.guard === 'seatsLeft = 0' && seatsLeft !== 0) {
        if (outs.length > 1) { t = outs[1]; } else break;
      }
      covered[t.id] = true;
      seq.push(t.event);
      state = t.to;
    }
    return { events: seq, coveredTransitions: Object.keys(covered).length, total: active.length, restState: state };
  }

  return {
    FSM_PRESETS: PRESETS,
    FSM_CRITERIA: CRITERIA,
    FSM_TERMINAL: TERMINAL,
    fsmRun: runSequence,
    fsmStateLabel: stateLabel,
    fsmSuggest: suggestSequence
  };
});

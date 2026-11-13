/* ============================================================================
 * decision.js — 决策表测试（M4）
 * 规则引擎：条件项 Y / N / -（don't care），逐条匹配 4 个条件的 16 种组合。
 * 判定标准来自 spec.js 的 appSpecAction（需求文字直接推导），与规则表实现相互独立。
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

  var KEYS = ['C1', 'C2', 'C3', 'C4'];
  var COND_LABELS = [
    { key: 'C1', label: '年龄 16–60', hint: '含 16 与 60' },
    { key: 'C2', label: '学历≥大专', hint: '大专 / 本科及以上' },
    { key: 'C3', label: '工作年限≥2 年', hint: '整数年限' },
    { key: 'C4', label: '有单位推荐函', hint: '盖章件' }
  ];
  var SEVERITY = { PASS: 1, COND_A: 2, COND_B: 2, REJECT: 3 };

  function presetRules(key) {
    var base = S.APP_RULES.map(function (r) { return { id: r.id, c: r.c.slice(), action: r.action, note: r.note }; });
    if (key === 'missing') {
      return base.filter(function (r) { return r.id !== 'R7'; });
    }
    if (key === 'conflict') {
      return base.concat([{ id: 'R2b', c: ['Y', 'Y', 'Y', 'Y'], action: 'COND_A', note: '后加入的规则，与 R2 重叠' }]);
    }
    if (key === 'redundant') {
      return base.concat([{ id: 'R1b', c: ['N', 'Y', '-', '-'], action: 'REJECT', note: '被 R1 完全遮蔽' }]);
    }
    if (key === 'wrong') {
      return base.map(function (r) {
        return r.id === 'R3' ? Object.assign({}, r, { action: 'PASS', note: '动作写错（应为条件通过）' }) : r;
      });
    }
    return base;
  }

  var PRESETS = [
    { key: 'complete', label: '完整规则表（7 条，应 100% 与规格一致）' },
    { key: 'missing', label: '遗漏版（删除 R7，制造未覆盖组合）' },
    { key: 'conflict', label: '冲突版（追加 R2b，与 R2 重叠）' },
    { key: 'redundant', label: '冗余版（追加 R1b，被 R1 遮蔽）' },
    { key: 'wrong', label: '动作错写版（R3 动作为"通过"）' }
  ];

  var STRATEGIES = [
    { key: 'first', label: '首条命中优先（大多数规则引擎的默认行为）' },
    { key: 'strict', label: '取最严格动作（拒绝 > 条件通过 > 通过）' },
    { key: 'block', label: '冲突即阻断（命中多条时不出结论，交人工确认）' }
  ];

  function comboKey(c) {
    return KEYS.map(function (k) { return c[k] ? '1' : '0'; }).join('');
  }
  function comboLabel(c) {
    return KEYS.map(function (k) { return c[k] ? 'Y' : 'N'; }).join('');
  }

  /* 组合空间：full = 16；reachable = C1 为假折叠为 1 个代表 + C1 为真的 8 种 */
  function combos(scope) {
    var all = S.allCombos();
    if (scope !== 'reachable') return all;
    return all.filter(function (c) {
      if (c.C1) return true;
      return !c.C2 && !c.C3 && !c.C4;
    });
  }

  function evaluate(rules, opts) {
    opts = opts || {};
    var strategy = opts.strategy || 'first';
    var scope = opts.scope || 'full';
    var space = combos(scope);

    var rows = space.map(function (c) {
      var matched = rules.filter(function (r) { return S.ruleMatches(r, c); });
      var actions = matched.map(function (r) { return r.action; });
      var uniq = actions.filter(function (a, i, arr) { return arr.indexOf(a) === i; });
      var resolved = null, status = 'ok', note = '';

      if (matched.length === 0) {
        status = 'uncovered';
        note = '没有任何规则命中该组合 → 规则遗漏';
      } else if (uniq.length > 1) {
        if (strategy === 'block') {
          status = 'blocked'; resolved = null;
          note = '命中 ' + matched.length + ' 条规则且动作不一致 → 规则冲突';
        } else if (strategy === 'strict') {
          resolved = uniq.slice().sort(function (a, b) { return SEVERITY[b] - SEVERITY[a]; })[0];
          status = 'conflict'; note = '冲突，按"最严格动作"消解为 ' + resolved;
        } else {
          resolved = actions[0];
          status = 'conflict'; note = '冲突，按"首条命中"消解为 ' + resolved;
        }
      } else {
        resolved = actions[0];
        if (uniq.length === 1 && matched.length > 1) note = '多条规则动作一致（重复覆盖）';
      }

      var spec = S.appSpecAction(c);
      var correct = resolved === spec;
      if (status === 'ok' && !correct) status = 'wrong';
      if (status === 'uncovered' || status === 'blocked') correct = false;

      return {
        c: c, key: comboKey(c), label: comboLabel(c), matched: matched.map(function (r) { return r.id; }),
        resolved: resolved, spec: spec, correct: correct, status: status, note: note
      };
    });

    var conflicts = rows.filter(function (r) { return r.status === 'conflict' || r.status === 'blocked'; });
    var uncovered = rows.filter(function (r) { return r.status === 'uncovered'; });
    var wrong = rows.filter(function (r) { return !r.correct; });

    // 规则级诊断：每条规则实际展开的组合数、是否被前序规则遮蔽
    var firstHitCount = {};
    var matchCount = {};
    rows.forEach(function (row) {
      row.matched.forEach(function (id) { matchCount[id] = (matchCount[id] || 0) + 1; });
      if (row.matched.length && (row.status !== 'blocked')) {
        firstHitCount[row.matched[0]] = (firstHitCount[row.matched[0]] || 0) + 1;
      }
    });
    var ruleDiag = rules.map(function (r, idx) {
      var match = 0;
      space.forEach(function (c) { if (S.ruleMatches(r, c)) match++; });
      var shadowed = true;
      space.forEach(function (c) {
        if (!S.ruleMatches(r, c)) return;
        var earlier = rules.slice(0, idx).some(function (x) { return S.ruleMatches(x, c); });
        if (!earlier) shadowed = false;
      });
      return {
        id: r.id, match: match,
        status: match === 0 ? 'unreachable' : (shadowed ? 'shadowed' : 'active'),
        note: match === 0 ? '该规则在组合空间中无匹配组合（条件自相矛盾）'
          : shadowed ? '所有可匹配组合都被前序规则先命中，本条永不触发' : ''
      };
    });

    return {
      rows: rows, scope: scope, strategy: strategy,
      total: rows.length,
      covered: rows.filter(function (r) { return r.matched.length > 0; }).length,
      uncovered: uncovered, conflicts: conflicts, wrong: wrong,
      coverage: S.pct(rows.filter(function (r) { return r.matched.length > 0; }).length, rows.length, 1),
      accuracy: S.pct(rows.filter(function (r) { return r.correct; }).length, rows.length, 1),
      ruleDiag: ruleDiag,
      actionDist: ['PASS', 'COND_A', 'COND_B', 'REJECT'].map(function (a) {
        return { action: a, label: S.APP_ACTIONS[a].label, count: rows.filter(function (r) { return r.resolved === a; }).length };
      })
    };
  }

  /* 单点判定：给一组具体输入，走与 evaluate 一致的消解策略 */
  function evalInput(rules, input, strategy) {
    var c = S.appConditions(input);
    var matched = rules.filter(function (r) { return S.ruleMatches(r, c); });
    var actions = matched.map(function (r) { return r.action; });
    var uniq = actions.filter(function (a, i, arr) { return arr.indexOf(a) === i; });
    var resolved = null, status = 'ok';
    if (!matched.length) { status = 'uncovered'; }
    else if (uniq.length > 1) {
      status = 'conflict';
      if (strategy === 'block') resolved = null;
      else if (strategy === 'strict') resolved = uniq.slice().sort(function (a, b) { return SEVERITY[b] - SEVERITY[a]; })[0];
      else resolved = actions[0];
    } else resolved = actions[0];
    var spec = S.appSpecAction(c);
    return {
      c: c, matched: matched.map(function (r) { return r.id; }),
      resolved: resolved, spec: spec, correct: resolved === spec && status !== 'blocked' && status !== 'uncovered',
      status: status
    };
  }

  return {
    DT_KEYS: KEYS,
    DT_COND_LABELS: COND_LABELS,
    DT_PRESETS: PRESETS,
    DT_STRATEGIES: STRATEGIES,
    dtPresetRules: presetRules,
    dtEvaluate: evaluate,
    dtEvalInput: evalInput,
    dtComboKey: comboKey,
    dtComboLabel: comboLabel
  };
});

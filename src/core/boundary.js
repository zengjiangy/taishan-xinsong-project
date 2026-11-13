/* ============================================================================
 * boundary.js — 边界值分析（M3）
 * 与 M2 的区别：M2 统计「等价类覆盖率」，M3 统计「边界对命中率」与邻点检出能力。
 * 边界点全部由 spec.js 的档位配置与有效域推导，不在本文件里另写一套业务数字。
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

  var C = S.CONFIG;

  /* 边界对：below = 较低区间的最后一个有效/边界值，above = 较高区间的第一个值 */
  function pairsOf(field) {
    if (field === 'hours') {
      return [
        { id: 'HB1', below: 0, above: 1, kind: 'domain', label: '有效域下界 1' },
        { id: 'HB2', below: 120, above: 121, kind: 'domain', label: '有效域上界 120' }
      ];
    }
    if (field === 'seats') {
      var out = [{ id: 'SB0', below: 0, above: 1, kind: 'domain', label: '有效域下界 1' }];
      for (var i = 0; i < C.seatTiers.length - 1; i++) {
        out.push({
          id: 'SB' + (i + 1),
          below: C.seatTiers[i].max,
          above: C.seatTiers[i].max + 1,
          kind: 'tier',
          label: '折扣档位 ' + C.seatTiers[i].max + '|' + (C.seatTiers[i].max + 1) +
            '（' + Math.round(C.seatTiers[i].rate * 100) + ' 折 → ' + Math.round(C.seatTiers[i + 1].rate * 100) + ' 折）'
        });
      }
      out.push({ id: 'SBX', below: 20, above: 21, kind: 'domain', label: '有效域上界 20' });
      return out;
    }
    return [
      { id: 'CB1', below: -1, above: 0, kind: 'domain', label: '有效域下界 0' },
      { id: 'CB2', below: 500, above: 501, kind: 'domain', label: '有效域上界 500' }
    ];
  }

  var STRATEGIES = {
    on: {
      key: 'on', label: '仅边界点（2 个/边界）',
      desc: '对每个边界只取两侧紧邻点（below、above）。用例最少，但无法观察“再外一步”的行为。'
    },
    off: {
      key: 'off', label: '边界点 + 外侧邻点（3 值思路，4 个/边界）',
      desc: '每个边界取 below−1、below、above、above+1，用于观察取值偏移一步时的行为变化。'
    },
    full: {
      key: 'full', label: '3 值 + 取值域端点',
      desc: '在上一项基础上再加入字段有效域的两个端点，覆盖“极端但合法”的取值。'
    }
  };

  var BASE_PRESETS = {
    typical: { key: 'typical', label: '典型：11 课时 / 持证', input: { hours: 11, seats: 1, coupon: 0, type: 'new', hasCert: true } },
    small: { key: 'small', label: '小额：1 课时 / 持证', input: { hours: 1, seats: 1, coupon: 0, type: 'new', hasCert: true } },
    large: { key: 'large', label: '大额：120 课时 / 无证', input: { hours: 120, seats: 1, coupon: 0, type: 'new', hasCert: false } }
  };

  function pointsFor(pairs, strategy, field) {
    var pts = [];
    pairs.forEach(function (p) {
      if (strategy === 'on') {
        pts.push({ v: p.below, pair: p.id, role: 'below' });
        pts.push({ v: p.above, pair: p.id, role: 'above' });
      } else {
        pts.push({ v: p.below - 1, pair: p.id, role: 'out-below' });
        pts.push({ v: p.below, pair: p.id, role: 'below' });
        pts.push({ v: p.above, pair: p.id, role: 'above' });
        pts.push({ v: p.above + 1, pair: p.id, role: 'out-above' });
      }
    });
    if (strategy === 'full') {
      var dom = field === 'hours' ? [C.hours.min, C.hours.max]
        : field === 'seats' ? [C.seats.min, C.seats.max] : [C.coupon.min, C.coupon.max];
      pts.push({ v: dom[0], pair: 'DOM', role: 'domain-min' });
      pts.push({ v: dom[1], pair: 'DOM', role: 'domain-max' });
    }
    // 去重：同一数值只保留一次，但记录它命中的全部边界对
    var map = {};
    pts.forEach(function (p) {
      var k = String(p.v);
      if (!map[k]) map[k] = { v: p.v, pairs: [], roles: [] };
      if (map[k].pairs.indexOf(p.pair) < 0) map[k].pairs.push(p.pair);
      if (map[k].roles.indexOf(p.role) < 0) map[k].roles.push(p.role);
    });
    return Object.values(map).sort(function (a, b) { return a.v - b.v; });
  }

  function execute(opts) {
    var field = opts.field;
    var strategy = opts.strategy;
    var base = (BASE_PRESETS[opts.base] || BASE_PRESETS.typical).input;
    var injected = (opts.defects || []).filter(function (d) { return d && d !== 'none'; });
    var pairs = pairsOf(field);
    var pts = pointsFor(pairs, strategy, field);
    var kill = {};
    S.DEFECTS.forEach(function (d) { kill[d.id] = 0; });

    var cases = pts.map(function (p, i) {
      var input = Object.assign({}, base);
      input[field] = p.v;
      var exp = S.feeSpec(input);
      var probe = S.defectProbe(input);
      var hits = probe.filter(function (x) { return x.differs; }).map(function (x) { return x.id; });
      hits.forEach(function (id) { kill[id] = (kill[id] || 0) + 1; });
      var activeHits = hits.filter(function (id) { return injected.indexOf(id) >= 0; });
      var act = activeHits.length ? S.calcWithDefects(input, activeHits) : exp;
      var pass = activeHits.length === 0;
      return {
        id: 'BV' + String(i + 1).padStart(2, '0'),
        value: p.v, pairIds: p.pairs, roles: p.roles, input: input,
        expected: exp, actual: act, pass: pass, hits: hits,
        diff: pass ? null : S.compareFee(exp, act).join('、'),
        isBoundary: p.pairs.filter(function (x) { return x !== 'DOM'; }).length > 0
      };
    });

    // 边界对命中：该对的两侧值都出现在用例集中
    var values = pts.map(function (p) { return p.v; });
    var pairStatus = pairs.map(function (p) {
      var hasBelow = values.indexOf(p.below) >= 0;
      var hasAbove = values.indexOf(p.above) >= 0;
      return {
        id: p.id, label: p.label, kind: p.kind, below: p.below, above: p.above,
        hasBelow: hasBelow, hasAbove: hasAbove, hit: hasBelow && hasAbove
      };
    });

    var matrix = S.DEFECTS.map(function (d) {
      return {
        id: d.id, short: d.short, name: d.name, caseCount: kill[d.id] || 0,
        detected: (kill[d.id] || 0) > 0, injected: injected.indexOf(d.id) >= 0
      };
    });

    var domain = field === 'hours' ? [C.hours.min, C.hours.max]
      : field === 'seats' ? [C.seats.min, C.seats.max] : [C.coupon.min, C.coupon.max];

    return {
      field: field, strategy: strategy, baseKey: opts.base,
      base: base, pairs: pairs, pairStatus: pairStatus, points: pts, cases: cases,
      domain: domain, injected: injected, matrix: matrix,
      detectedCount: matrix.filter(function (m) { return m.detected; }).length,
      boundaryHit: pairStatus.filter(function (p) { return p.hit; }).length,
      boundaryTotal: pairs.length,
      hitRate: S.pct(pairStatus.filter(function (p) { return p.hit; }).length, pairs.length, 1),
      caseCount: cases.length,
      failCount: cases.filter(function (c) { return !c.pass; }).length,
      empty: cases.length === 0
    };
  }

  return {
    BV_PAIRS: pairsOf,
    BV_STRATEGIES: STRATEGIES,
    BV_BASE_PRESETS: BASE_PRESETS,
    bvPoints: pointsFor,
    bvExecute: execute
  };
});

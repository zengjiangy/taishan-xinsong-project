/* ============================================================================
 * equivalence.js — 等价类划分（M2）
 * 依赖：spec.js（业务规格、参考判定函数 feeSpec、被测实现 calcFeeVersion）
 * 说明：本模块只做“划分 → 取样 → 执行 → 统计”，判定标准为 feeSpec 的输出，
 *       不使用被测实现的结果反填预期值。
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

  /* 基准输入：其余字段固定，只变化被测字段，以隔离单字段等价类的作用 */
  var BASE_INPUT = { hours: 11, seats: 1, coupon: 0, type: 'new', hasCert: true };

  var FIELDS = {
    hours: {
      key: 'hours', label: '培训课时数', unit: '课时', kind: 'int',
      note: '整数；有效域 1–120；非整数属于独立的无效类（类型错误，而非越界）',
      levels: {
        coarse: [
          { id: 'H-V', name: '有效 1–120', lo: 1, hi: 120, valid: true },
          { id: 'H-I', name: '无效：越界或非整数', kind: 'invalidAll', valid: false }
        ],
        standard: [
          { id: 'H1', name: '有效·小 1–30', lo: 1, hi: 30, valid: true },
          { id: 'H2', name: '有效·中 31–90', lo: 31, hi: 90, valid: true },
          { id: 'H3', name: '有效·大 91–120', lo: 91, hi: 120, valid: true },
          { id: 'H4', name: '无效·下越界 ≤0', hi: 0, valid: false },
          { id: 'H5', name: '无效·上越界 ≥121', lo: 121, valid: false },
          { id: 'H6', name: '无效·非整数', kind: 'nonint', valid: false }
        ],
        fine: [
          { id: 'H1', name: '有效 1–15', lo: 1, hi: 15, valid: true },
          { id: 'H2', name: '有效 16–30', lo: 16, hi: 30, valid: true },
          { id: 'H3', name: '有效 31–60', lo: 31, hi: 60, valid: true },
          { id: 'H4', name: '有效 61–90', lo: 61, hi: 90, valid: true },
          { id: 'H5', name: '有效 91–120', lo: 91, hi: 120, valid: true },
          { id: 'H6', name: '无效·下越界 ≤0', hi: 0, valid: false },
          { id: 'H7', name: '无效·上越界 121–240', lo: 121, hi: 240, valid: false },
          { id: 'H8', name: '无效·极端越界 >240', lo: 241, valid: false },
          { id: 'H9', name: '无效·非整数', kind: 'nonint', valid: false }
        ]
      }
    },
    seats: {
      key: 'seats', label: '报名人数', unit: '人', kind: 'int',
      note: '整数；有效域 1–20；与团体折扣档位同形，但本实验只关心“类”，不关心边界',
      levels: {
        coarse: [
          { id: 'S-V', name: '有效 1–20', lo: 1, hi: 20, valid: true },
          { id: 'S-I', name: '无效：越界或非整数', kind: 'invalidAll', valid: false }
        ],
        standard: [
          { id: 'S1', name: '有效 1–2', lo: 1, hi: 2, valid: true },
          { id: 'S2', name: '有效 3–5', lo: 3, hi: 5, valid: true },
          { id: 'S3', name: '有效 6–10', lo: 6, hi: 10, valid: true },
          { id: 'S4', name: '有效 11–20', lo: 11, hi: 20, valid: true },
          { id: 'S5', name: '无效·下越界 0', hi: 0, valid: false },
          { id: 'S6', name: '无效·上越界 ≥21', lo: 21, valid: false },
          { id: 'S7', name: '无效·非整数', kind: 'nonint', valid: false }
        ],
        fine: [
          { id: 'S1', name: '有效 1', lo: 1, hi: 1, valid: true },
          { id: 'S2', name: '有效 2', lo: 2, hi: 2, valid: true },
          { id: 'S3', name: '有效 3–5', lo: 3, hi: 5, valid: true },
          { id: 'S4', name: '有效 6–10', lo: 6, hi: 10, valid: true },
          { id: 'S5', name: '有效 11–20', lo: 11, hi: 20, valid: true },
          { id: 'S6', name: '无效·下越界 0', hi: 0, valid: false },
          { id: 'S7', name: '无效·上越界 ≥21', lo: 21, valid: false },
          { id: 'S8', name: '无效·非整数', kind: 'nonint', valid: false }
        ]
      }
    },
    coupon: {
      key: 'coupon', label: '优惠券面额', unit: '元', kind: 'int',
      note: '整数；有效域 0–500；0 表示未使用优惠券，是一个独立的有效类',
      levels: {
        coarse: [
          { id: 'C-V', name: '有效 0–500', lo: 0, hi: 500, valid: true },
          { id: 'C-I', name: '无效：越界或非整数', kind: 'invalidAll', valid: false }
        ],
        standard: [
          { id: 'C1', name: '有效·未使用 0', lo: 0, hi: 0, valid: true },
          { id: 'C2', name: '有效·小额 1–200', lo: 1, hi: 200, valid: true },
          { id: 'C3', name: '有效·大额 201–500', lo: 201, hi: 500, valid: true },
          { id: 'C4', name: '无效·负数 <0', hi: -1, valid: false },
          { id: 'C5', name: '无效·超额 ≥501', lo: 501, valid: false },
          { id: 'C6', name: '无效·非整数', kind: 'nonint', valid: false }
        ],
        fine: [
          { id: 'C1', name: '有效 0', lo: 0, hi: 0, valid: true },
          { id: 'C2', name: '有效 1–100', lo: 1, hi: 100, valid: true },
          { id: 'C3', name: '有效 101–300', lo: 101, hi: 300, valid: true },
          { id: 'C4', name: '有效 301–500', lo: 301, hi: 500, valid: true },
          { id: 'C5', name: '无效·负数', hi: -1, valid: false },
          { id: 'C6', name: '无效·501–1000', lo: 501, hi: 1000, valid: false },
          { id: 'C7', name: '无效·极端 >1000', lo: 1001, valid: false },
          { id: 'C8', name: '无效·非整数', kind: 'nonint', valid: false }
        ]
      }
    }
  };

  var STRATEGIES = {
    mid: { key: 'mid', label: '类中点（每类 1 个）', perClass: 1, desc: '在类取值范围内取一个典型值，代表“这一类”。' },
    edges: { key: 'edges', label: '类内两端（每类最多 2 个）', perClass: 2, desc: '在类内取最小与最大代表值，检验同一类内部行为是否一致。' },
    seeded: { key: 'seeded', label: '固定种子随机（每类 2 个，种子 20261112）', perClass: 2, desc: '用固定种子在类内随机取样，结果可完全复现。' }
  };

  function classValues(cls, strategy, seed) {
    var out = [];
    if (cls.kind === 'nonint') {
      // 非整数类：取一个带小数、且落在有效域内的值，确保失败原因只可能是“类型”
      out.push(cls.field === 'coupon' ? 12.5 : 10.5);
      if (strategy === 'edges' || strategy === 'seeded') out.push(cls.field === 'coupon' ? 0.5 : 3.5);
      return out;
    }
    if (cls.kind === 'invalidAll') {
      out.push(-1);
      if (strategy !== 'mid') out.push(99999);
      return out;
    }
    var lo = cls.lo, hi = cls.hi;
    var loB = lo == null ? (hi == null ? 0 : hi - 1) : lo;
    var hiB = hi == null ? loB + 1 : hi;
    if (lo == null) { loB = hiB - 1; }          // 负向越界：hi 为最大非法值
    if (hi == null) { hiB = loB + 1; }          // 正向越界：lo 为最小非法值

    if (strategy === 'mid') {
      out.push(Math.round((loB + hiB) / 2));
    } else if (strategy === 'edges') {
      out.push(loB);
      if (hiB !== loB) out.push(hiB);
    } else {
      var rnd = S.mulberry32((seed || 20261112) + loB * 131 + hiB * 17);
      var span = Math.max(0, hiB - loB);
      for (var i = 0; i < 2; i++) out.push(loB + Math.floor(rnd() * (span + 1)));
    }
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function buildClasses(field, level) {
    return FIELDS[field].levels[level].map(function (c) {
      var cc = JSON.parse(JSON.stringify(c));
      cc.field = field;
      cc.validClass = c.valid;
      return cc;
    });
  }

  /* 生成用例集 */
  function generateCases(opts) {
    var field = opts.field, level = opts.level, strategy = opts.strategy;
    var includeInvalid = opts.includeInvalid !== false;
    var classes = buildClasses(field, level);
    var cases = [];
    var seq = 0;
    classes.forEach(function (cls) {
      if (!includeInvalid && !cls.validClass) return;
      classValues(cls, strategy, opts.seed).forEach(function (v) {
        seq++;
        var input = Object.assign({}, BASE_INPUT);
        input[field] = v;
        cases.push({
          id: 'EC' + String(seq).padStart(2, '0'),
          cls: cls.id, clsName: cls.name, clsValid: cls.validClass,
          field: field, value: v, input: input
        });
      });
    });
    // 学生自定义用例（组合场景），排在自动用例之后
    (opts.customCases || []).forEach(function (cc, i) {
      seq++;
      cases.push({
        id: 'CU' + String(i + 1).padStart(2, '0'),
        cls: 'CUSTOM', clsName: '自定义组合用例', clsValid: true,
        field: 'custom', value: null, input: Object.assign({}, cc.input),
        custom: true
      });
    });
    return { cases: cases, classes: classes };
  }

  /* 执行：预期值来自 feeSpec；实际值来自被测版本（注入缺陷集合） */
  function execute(opts) {
    var gen = generateCases(opts);
    var injected = (opts.defects || []).filter(function (d) { return d && d !== 'none'; });
    var allClasses = gen.classes;
    var usedClassIds = {};
    var kill = {};
    S.DEFECTS.forEach(function (d) { kill[d.id] = 0; });

    var cases = gen.cases.map(function (c) {
      if (c.cls !== 'CUSTOM') usedClassIds[c.cls] = true;
      var exp = S.feeSpec(c.input);
      var probe = S.defectProbe(c.input);
      var hits = probe.filter(function (p) { return p.differs; }).map(function (p) { return p.id; });
      hits.forEach(function (id) { kill[id] = (kill[id] || 0) + 1; });

      var activeHits = hits.filter(function (id) { return injected.indexOf(id) >= 0; });
      var act, pass;
      if (activeHits.length) {
        act = S.calcWithDefects(c.input, activeHits);
        pass = false;
      } else {
        act = exp;
        pass = true;
      }
      return Object.assign({}, c, {
        expected: exp, actual: act, pass: pass, hits: hits, activeHits: activeHits,
        diff: pass ? null : S.compareFee(exp, act).join('、')
      });
    });

    var coveredClasses = allClasses.filter(function (c) { return usedClassIds[c.id]; });
    var invalidClasses = allClasses.filter(function (c) { return !c.validClass; });
    var coveredInvalid = invalidClasses.filter(function (c) { return usedClassIds[c.id]; });

    var matrix = S.DEFECTS.map(function (d) {
      return {
        id: d.id, short: d.short, name: d.name,
        caseCount: kill[d.id] || 0,
        detected: (kill[d.id] || 0) > 0,
        injected: injected.indexOf(d.id) >= 0
      };
    });

    var cum = [], found = 0;
    cases.forEach(function (c) {
      if (!c.pass) found++;
      cum.push(found);
    });

    return {
      cases: cases,
      classes: allClasses,
      injected: injected,
      coverage: {
        total: allClasses.length,
        covered: coveredClasses.length,
        rate: S.pct(coveredClasses.length, allClasses.length, 1),
        invalidTotal: invalidClasses.length,
        invalidCovered: coveredInvalid.length,
        invalidRate: S.pct(coveredInvalid.length, invalidClasses.length, 1),
        missed: allClasses.filter(function (c) { return !usedClassIds[c.id]; }).map(function (c) { return c.name; })
      },
      matrix: matrix,
      detectedCount: matrix.filter(function (m) { return m.detected; }).length,
      failCount: cases.filter(function (c) { return !c.pass; }).length,
      cum: cum,
      warn: cases.length === 0 ? '用例集为空：等价类覆盖率的分母仍为类数，但没有任何用例覆盖它们。' : null
    };
  }

  return {
    EC_BASE_INPUT: BASE_INPUT,
    EC_FIELDS: FIELDS,
    EC_STRATEGIES: STRATEGIES,
    ecGenerateCases: generateCases,
    ecExecute: execute
  };
});

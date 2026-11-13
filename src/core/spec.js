/* ============================================================================
 * spec.js — 「青蓝人才服务平台」业务规格 v1.2（单一事实来源）
 * ----------------------------------------------------------------------------
 * 说明：
 *  1. 本文件是全部 8 个实验共用的业务规则与计算实现，避免不同实验互相矛盾。
 *  2. 业务场景为**本项目原创教学案例**（虚构平台），不代表任何真实企业系统或政策。
 *  3. 本文件无 DOM 依赖；浏览器挂载到 window.QT，Node 端可直接 require（tests/ 复用同一实现）。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QT = root.QT || {};
    Object.assign(root.QT, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 常量配置 */
  var CONFIG = {
    version: 'spec-v1.2',
    scenario: '青蓝人才服务平台 · 职业技能培训报名与认定预约',
    unitPrice: 120,          // 元/课时（无证书）
    certUnitPrice: 90,       // 元/课时（持同工种有效证书）
    hours: { min: 1, max: 120 },
    seats: { min: 1, max: 20 },
    coupon: { min: 0, max: 500 },
    // 团体折扣档位：上限（含）→ 折扣率。顺序即判定顺序。
    seatTiers: [
      { max: 2, rate: 1.00, label: '1–2 人 无折扣' },
      { max: 5, rate: 0.95, label: '3–5 人 95 折' },
      { max: 10, rate: 0.90, label: '6–10 人 90 折' },
      { max: 20, rate: 0.85, label: '11–20 人 85 折' }
    ],
    retrainRate: 0.70,       // 复训学员 7 折（与团体折扣不叠加，取更优）
    types: ['new', 'retrain', 'corp'],
    typeLabels: { new: '新学员', retrain: '复训学员', corp: '企业团体' },
    eduLabels: { junior: '初中及以下', senior: '高中/中专', college: '大专', bachelor: '本科及以上' },
    ageRange: { min: 16, max: 60 },
    yearsForCollege: 2,
    // 教学简化模型参数（M8 使用，公式见 docs/实施计划.md 与模块内说明）
    qualityModel: {
      severityWeight: { fatal: 10, major: 5, minor: 2, trivial: 1 },
      kloc: 0.8,             // 被评估迭代的“千行当量”，教学假设值
      weights: { density: 0.40, gap: 0.30, evidence: 0.20, regression: 0.10 },
      releaseThreshold: 45
    }
  };

  /* ------------------------------------------------------------ 基础工具函数 */
  function isInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
  }
  function roundMoney(v) {
    // 金额四舍五入到整元；使用 +1e-9 抵消二进制浮点误差（如 0.1+0.2）
    return Math.round(v + 1e-9);
  }
  function fmtMoney(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (Math.round(v * 100) / 100).toFixed(2);
  }
  function pct(num, den, digits) {
    if (!den) return null;            // 分母为零时返回 null，调用方须显式处理
    var d = digits == null ? 1 : digits;
    return Math.round((num / den) * 100 * Math.pow(10, d)) / Math.pow(10, d);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 固定种子伪随机（教学合成数据用；同一种子必然产生同一序列）
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------ 输入校验（规格 §3.1） */
  function validateFeeInput(input) {
    var errors = [];
    if (!input || typeof input !== 'object') return { ok: false, errors: ['输入为空'] };
    var h = input.hours, s = input.seats, c = input.coupon;
    if (!isInt(h)) errors.push('课时数必须是整数');
    else if (h < CONFIG.hours.min || h > CONFIG.hours.max) errors.push('课时数须在 1–120 之间');
    if (!isInt(s)) errors.push('报名人数必须是整数');
    else if (s < CONFIG.seats.min || s > CONFIG.seats.max) errors.push('报名人数须在 1–20 之间');
    if (!isInt(c)) errors.push('优惠券面额必须是整数');
    else if (c < CONFIG.coupon.min || c > CONFIG.coupon.max) errors.push('优惠券面额须在 0–500 之间');
    if (CONFIG.types.indexOf(input.type) < 0) errors.push('学员类型非法');
    if (typeof input.hasCert !== 'boolean') errors.push('持证标记必须是布尔值');
    return { ok: errors.length === 0, errors: errors };
  }

  /* ------------------------------------------------------------------------
   * 参考判定函数（Oracle）——按规格表逐步推导，独立于被测实现编写
   * 用途：判定 SUT 输出是否正确。**不得**由 SUT 结果反填预期值。
   * ---------------------------------------------------------------------- */
  function feeSpec(input) {
    var v = validateFeeInput(input);
    if (!v.ok) return { ok: false, code: 'E_INPUT', errors: v.errors };

    var unit = input.hasCert ? CONFIG.certUnitPrice : CONFIG.unitPrice;
    var base = input.hours * unit;

    var group = CONFIG.seatTiers[CONFIG.seatTiers.length - 1].rate;
    for (var i = 0; i < CONFIG.seatTiers.length; i++) {
      if (input.seats <= CONFIG.seatTiers[i].max) { group = CONFIG.seatTiers[i].rate; break; }
    }
    var retrain = (input.type === 'retrain') ? CONFIG.retrainRate : 1.00;
    var rate = Math.min(group, retrain);              // 不叠加，取更优
    var discount = roundMoney(base * (1 - rate));
    var due = base - discount - input.coupon;
    var capped = due < 0;
    return {
      ok: true,
      unit: unit, base: base,
      groupRate: group, retrainRate: retrain, rate: rate,
      discount: discount, coupon: input.coupon,
      payable: capped ? 0 : due,
      capped: capped
    };
  }

  /* ------------------------------------------------------------------------
   * 被测实现（SUT）_calcFee —— 带覆盖率插桩
   * 插桩约定：T.b(块) 记录语句块命中；T.c(条件) 记录原子条件真假；T.d(判定) 记录判定结果。
   * 插桩调用不改变任何业务输出（tests/spec.test.js T-SPEC-06 校验）。
   * 每个原子条件都先求值到独立布尔变量，因此本实现**不存在短路求值**导致的未执行条件。
   * 该约束已在 M6 中向学生声明，条件覆盖率分母不含“短路未求值”歧义。
   * ---------------------------------------------------------------------- */
  var NULL_TRACE = {
    b: function () {}, c: function () {}, d: function () {}, note: function () {}
  };

  function _calcFee(input, T, opts) {
    T = T || NULL_TRACE;
    var MUT = (opts && opts.defect) || {};
    T.b('B01');
    var hours = input.hours;
    var seats = input.seats;
    var coupon = input.coupon;
    var type = input.type;
    var hasCert = input.hasCert === true;

    var okHours = isInt(hours) && hours >= CONFIG.hours.min && hours <= CONFIG.hours.max;
    T.c('C1', okHours);
    var okSeats = isInt(seats) && seats >= CONFIG.seats.min && seats <= CONFIG.seats.max;
    T.c('C2', okSeats);
    var okCoupon = isInt(coupon) && coupon >= CONFIG.coupon.min && coupon <= CONFIG.coupon.max;
    T.c('C3', okCoupon);
    var okType = CONFIG.types.indexOf(type) >= 0 && typeof input.hasCert === 'boolean';
    T.c('C4', okType);
    var valid = okHours && okSeats && okCoupon && okType;
    T.d('D1', valid);
    if (!valid) {
      T.b('B02');
      return { ok: false, code: 'E_INPUT', errors: validateFeeInput(input).errors };
    }

    T.b('B03');
    var unit;
    T.c('C5', hasCert);
    T.d('D2', hasCert);
    if (hasCert) {
      T.b('B04');
      unit = CONFIG.certUnitPrice;
    } else {
      T.b('B05');
      unit = CONFIG.unitPrice;
    }

    T.b('B06');
    var base = hours * unit;

    var ge3 = seats >= 3;
    var le5 = seats <= 5;
    T.c('C6', ge3);
    T.c('C7', le5);
    var ge6 = seats >= 6;
    var le10 = seats <= 10;
    T.c('C8', ge6);
    T.c('C9', le10);
    var ge11 = seats >= 11;
    T.c('C10', ge11);
    var tier2 = ge3 && le5;
    var tier3 = ge6 && le10;
    if (MUT.SEAT_BOUNDARY) tier2 = seats >= 2 && le5;

    var groupRate;
    T.d('D3', tier2);
    if (tier2) {
      T.b('B07');
      groupRate = 0.95;
    } else {
      T.d('D4', tier3);
      if (tier3) {
        T.b('B08');
        groupRate = 0.90;
      } else {
        T.d('D5', ge11);
        if (ge11) {
          T.b('B09');
          groupRate = 0.85;
        } else {
          T.b('B10');
          groupRate = 1.00;
        }
      }
    }

    var isRetrain = type === 'retrain';
    T.c('C11', isRetrain);
    T.d('D6', isRetrain);
    var retrainRate;
    if (isRetrain) {
      T.b('B11');
      retrainRate = CONFIG.retrainRate;
    } else {
      T.b('B12');
      retrainRate = 1.00;
    }

    T.b('B13');
    var rate = Math.min(groupRate, retrainRate);
    if (MUT.RETRAIN_STACK) rate = groupRate * retrainRate;

    T.b('B14');
    var discount = roundMoney(base * (1 - rate));
    if (MUT.ROUND_DOWN) discount = Math.floor(base * (1 - rate) + 1e-9);

    T.b('B15');
    var due = base - discount - coupon;
    var clamp = due < 0;
    var capped;
    T.c('C12', clamp);
    if (MUT.COUPON_CAP) clamp = false;
    T.d('D7', clamp);
    if (clamp) {
      T.b('B16');
      due = 0;
      capped = true;
    } else {
      T.b('B17');
      capped = false;
    }

    T.b('B18');
    return {
      ok: true, unit: unit, base: base,
      groupRate: groupRate, retrainRate: retrainRate, rate: rate,
      discount: discount, coupon: coupon, payable: due, capped: capped
    };
  }

  function calcFee(input) { return _calcFee(input, NULL_TRACE, null); }

  /* 用给定缺陷集合执行（缺陷为真实的代码变异，会改变输出） */
  function calcWithDefects(input, ids) {
    var mut = {};
    (ids || []).forEach(function (i) { if (i && i !== 'none') mut[i] = true; });
    return _calcFee(input, NULL_TRACE, { defect: mut });
  }

  /* 比较两次费用计算的业务输出，返回不一致字段名数组 */
  function compareFee(a, b) {
    if (!a || !b) return ['<空结果>'];
    if (!!a.ok !== !!b.ok) return ['可计算性'];
    if (!a.ok) return [];
    var out = [];
    if (a.rate !== b.rate) out.push('折扣率');
    if (a.discount !== b.discount) out.push('折扣额');
    if (a.payable !== b.payable) out.push('应付金额');
    if (!!a.capped !== !!b.capped) out.push('截断标记');
    return out;
  }

  /* 单个输入对全部 4 个缺陷的检出能力（与是否注入无关） */
  function defectProbe(input) {
    var base = feeSpec(input);
    return DEFECTS.map(function (d) {
      var diff = compareFee(base, calcWithDefects(input, [d.id]));
      return { id: d.id, short: d.short, name: d.name, differs: diff.length > 0, fields: diff };
    });
  }

  /* 缺陷登记表（供各实验选择注入） */
  var DEFECTS = [
    {
      id: 'SEAT_BOUNDARY', name: '团体折扣下界判定错误', short: 'D1',
      where: '_calcFee / D3',
      desc: '第 2 档判定下界写成 seats >= 2，2 人报名被错误计入 3–5 人档（95 折）。',
      detectableBy: ['M2 等价类（2 人代表值）', 'M3 边界值（2|3 边界）', 'M6 判定覆盖', 'M7 回归']
    },
    {
      id: 'ROUND_DOWN', name: '金额取整方式错误', short: 'D2',
      where: '_calcFee / B14',
      desc: '折扣金额使用向下取整而非四舍五入，在折扣额含小数时少减 1 元（应付多 1 元）。',
      detectableBy: ['M3 边界值（非整除组合）', 'M7 回归']
    },
    {
      id: 'COUPON_CAP', name: '优惠券负值未截断', short: 'D3',
      where: '_calcFee / D7',
      desc: '缺少 payable < 0 时归零的处理，应付金额可返回负数（券“找零”）。',
      detectableBy: ['M2 等价类（无效/极值类）', 'M6 语句覆盖（B16 不可达）', 'M7 回归']
    },
    {
      id: 'RETRAIN_STACK', name: '折扣被叠加', short: 'D4',
      where: '_calcFee / B13',
      desc: '团体折扣与复训折扣相乘，违反「不叠加，取更优」规格。',
      detectableBy: ['M2 等价类（复训+团体的组合类）', 'M6 判定覆盖', 'M7 回归']
    }
  ];
  var DEFECT_MAP = {};
  DEFECTS.forEach(function (d) { DEFECT_MAP[d.id] = d; });

  var VERSIONS = {
    'v1.0': { label: 'v1.0 初版', defects: [], note: '首次提测版本，规格实现无已知缺陷' },
    'v1.1': { label: 'v1.1 重构', defects: [], note: '仅重构可读性，行为应与 v1.0 完全一致' },
    'v1.2-rc1': { label: 'v1.2-rc1 候选', defects: ['SEAT_BOUNDARY', 'COUPON_CAP'], note: '加入团体折扣与券后截断逻辑后出现 2 处回归缺陷' }
  };
  function versionDefectSet(v) {
    var m = {};
    (VERSIONS[v] ? VERSIONS[v].defects : []).forEach(function (id) { m[id] = true; });
    return m;
  }
  function calcFeeVersion(input, version, T) {
    return _calcFee(input, T || NULL_TRACE, { defect: versionDefectSet(version) });
  }

  /* ------------------------------------------------ 报名资格判定（决策表用） */
  var APP_ACTIONS = {
    PASS: { key: 'PASS', label: '通过', tone: 'pass', code: 'A1' },
    COND_A: { key: 'COND_A', label: '条件通过：补工作证明', tone: 'warn', code: 'A2' },
    COND_B: { key: 'COND_B', label: '条件通过：补学历材料', tone: 'warn', code: 'A3' },
    REJECT: { key: 'REJECT', label: '拒绝', tone: 'fail', code: 'A4' }
  };

  function appConditions(input) {
    var age = input.age, edu = input.edu, years = input.years, rec = input.recommend === true;
    return {
      C1: isInt(age) && age >= CONFIG.ageRange.min && age <= CONFIG.ageRange.max,
      C2: edu === 'college' || edu === 'bachelor',
      C3: isInt(years) && years >= CONFIG.yearsForCollege,
      C4: rec
    };
  }

  /* 参考规格（v1.2）：由需求文字直接推导，独立于规则表 */
  function appSpecAction(c) {
    if (!c.C1) return 'REJECT';
    if (c.C2 && c.C3) return 'PASS';
    if (c.C2 && !c.C3 && c.C4) return 'COND_A';
    if (!c.C2 && c.C3 && c.C4) return 'COND_B';
    return 'REJECT';
  }

  /* 标准规则表（7 条，含 2 处 don't care） */
  var APP_RULES = [
    { id: 'R1', c: ['N', '-', '-', '-'], action: 'REJECT', note: '年龄不符一律拒绝' },
    { id: 'R2', c: ['Y', 'Y', 'Y', '-'], action: 'PASS', note: '学历与年限均达标' },
    { id: 'R3', c: ['Y', 'Y', 'N', 'Y'], action: 'COND_A', note: '年限不足但有推荐函' },
    { id: 'R4', c: ['Y', 'N', 'Y', 'Y'], action: 'COND_B', note: '学历不足但有推荐函' },
    { id: 'R5', c: ['Y', 'Y', 'N', 'N'], action: 'REJECT', note: '年限不足且无推荐函' },
    { id: 'R6', c: ['Y', 'N', 'Y', 'N'], action: 'REJECT', note: '学历不足且无推荐函' },
    { id: 'R7', c: ['Y', 'N', 'N', '-'], action: 'REJECT', note: '学历与年限均不足' }
  ];

  function appLabel(v) { return v === 'Y' ? '是' : (v === 'N' ? '否' : '—'); }

  /* 单个组合是否命中规则 */
  function ruleMatches(rule, combo) {
    var keys = ['C1', 'C2', 'C3', 'C4'];
    for (var i = 0; i < 4; i++) {
      var e = rule.c[i];
      if (e === '-') continue;
      if ((e === 'Y') !== !!combo[keys[i]]) return false;
    }
    return true;
  }

  /* 16 个条件组合（C1 为假时其余组合在业务上不可达，但仍计入组合空间以暴露规则遗漏） */
  function allCombos() {
    var out = [];
    for (var m = 0; m < 16; m++) {
      var c = {
        C1: !!(m & 8), C2: !!(m & 4), C3: !!(m & 2), C4: !!(m & 1)
      };
      out.push(c);
    }
    return out;
  }

  /* ------------------------------------------------------------------ 状态机 */
  var FSM_STATES = [
    { id: 'DRAFT', label: '草稿', kind: 'start', x: 66, y: 92 },
    { id: 'SUBMITTED', label: '已提交', kind: 'normal', x: 192, y: 92 },
    { id: 'REVIEWING', label: '审核中', kind: 'normal', x: 318, y: 92 },
    { id: 'APPROVED', label: '已通过', kind: 'normal', x: 444, y: 92 },
    { id: 'BOOKED', label: '已预约', kind: 'normal', x: 590, y: 92 },
    { id: 'ATTENDED', label: '已参训', kind: 'normal', x: 716, y: 92 },
    { id: 'COMPLETED', label: '已结业', kind: 'end', x: 842, y: 92 },
    { id: 'REJECTED', label: '已驳回', kind: 'normal', x: 318, y: 240 },
    { id: 'WAITLIST', label: '候补', kind: 'normal', x: 444, y: 240 },
    { id: 'CANCELLED', label: '已取消', kind: 'end', x: 590, y: 240 },
    { id: 'NO_SHOW', label: '爽约', kind: 'end', x: 716, y: 240 }
  ];

  var FSM_TRANSITIONS = [
    { id: 'T01', from: 'DRAFT', to: 'SUBMITTED', event: 'submit', label: '提交', guard: null },
    { id: 'T02', from: 'SUBMITTED', to: 'REVIEWING', event: 'startReview', label: '开始审核', guard: null },
    { id: 'T03', from: 'REVIEWING', to: 'APPROVED', event: 'approve', label: '通过', guard: null },
    { id: 'T04', from: 'REVIEWING', to: 'REJECTED', event: 'reject', label: '驳回', guard: null },
    { id: 'T05', from: 'APPROVED', to: 'BOOKED', event: 'book', label: '预约', guard: 'seatsLeft > 0' },
    { id: 'T06', from: 'APPROVED', to: 'WAITLIST', event: 'book', label: '预约(满员)', guard: 'seatsLeft = 0' },
    { id: 'T07', from: 'WAITLIST', to: 'BOOKED', event: 'promote', label: '候补转正', guard: 'seatsLeft > 0', toggle: 'allowPromote' },
    { id: 'T08', from: 'BOOKED', to: 'ATTENDED', event: 'attend', label: '签到', guard: null },
    { id: 'T09', from: 'BOOKED', to: 'CANCELLED', event: 'cancel', label: '取消', guard: null },
    { id: 'T10', from: 'BOOKED', to: 'NO_SHOW', event: 'noShow', label: '爽约', guard: null },
    { id: 'T11', from: 'ATTENDED', to: 'COMPLETED', event: 'complete', label: '结业', guard: null },
    { id: 'T12', from: 'REJECTED', to: 'DRAFT', event: 'revise', label: '修改重提', guard: null, toggle: 'allowRevise' },
    { id: 'T13', from: 'CANCELLED', to: 'DRAFT', event: 'reopen', label: '重新开启', guard: null, toggle: 'allowReopen' },
    { id: 'T14', from: 'WAITLIST', to: 'CANCELLED', event: 'giveUp', label: '放弃', guard: null }
  ];

  var FSM_EVENTS = [
    { id: 'submit', label: '提交报名' }, { id: 'startReview', label: '开始审核' },
    { id: 'approve', label: '审核通过' }, { id: 'reject', label: '审核驳回' },
    { id: 'book', label: '预约场次' }, { id: 'promote', label: '候补转正' },
    { id: 'attend', label: '签到参训' }, { id: 'cancel', label: '取消预约' },
    { id: 'noShow', label: '标记爽约' }, { id: 'complete', label: '结业认定' },
    { id: 'revise', label: '修改重提' }, { id: 'reopen', label: '重新开启' },
    { id: 'giveUp', label: '放弃候补' }
  ];

  function activeTransitions(toggles) {
    return FSM_TRANSITIONS.filter(function (t) {
      return !t.toggle || !!(toggles && toggles[t.toggle]);
    });
  }

  /* ------------------------------------------------------------- 输出封装 */
  return {
    CONFIG: CONFIG,
    isInt: isInt, roundMoney: roundMoney, fmtMoney: fmtMoney, pct: pct, clone: clone,
    mulberry32: mulberry32,
    validateFeeInput: validateFeeInput,
    feeSpec: feeSpec,
    calcFee: calcFee,
    calcWithDefects: calcWithDefects,
    compareFee: compareFee,
    defectProbe: defectProbe,
    _calcFee: _calcFee,
    NULL_TRACE: NULL_TRACE,
    calcFeeVersion: calcFeeVersion,
    DEFECTS: DEFECTS, DEFECT_MAP: DEFECT_MAP, VERSIONS: VERSIONS, versionDefectSet: versionDefectSet,
    APP_ACTIONS: APP_ACTIONS, appConditions: appConditions, appSpecAction: appSpecAction,
    APP_RULES: APP_RULES, ruleMatches: ruleMatches, allCombos: allCombos, appLabel: appLabel,
    FSM_STATES: FSM_STATES, FSM_TRANSITIONS: FSM_TRANSITIONS, FSM_EVENTS: FSM_EVENTS,
    activeTransitions: activeTransitions
  };
});

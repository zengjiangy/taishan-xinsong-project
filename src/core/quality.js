/* ============================================================================
 * quality.js — 质量保证、风险管理与发布质量门禁（M8）
 * 本模块消费 M1–M7 产生的真实证据；风险模型为**教学简化模型**，公式与单位全部公开。
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

  var REQUIRED = [
    { id: 'm1', label: 'M1 静态审查', metric: '缺陷检出率', unit: '%' },
    { id: 'm2', label: 'M2 等价类', metric: '等价类覆盖率', unit: '%' },
    { id: 'm3', label: 'M3 边界值', metric: '边界对命中率', unit: '%' },
    { id: 'm4', label: 'M4 决策表', metric: '与规格一致率', unit: '%' },
    { id: 'm5', label: 'M5 状态迁移', metric: '迁移覆盖率', unit: '%' },
    { id: 'm6', label: 'M6 白盒覆盖', metric: '判定覆盖率', unit: '%' },
    { id: 'm7', label: 'M7 回归流水线', metric: '回归通过率', unit: '%' }
  ];

  var SEVERITIES = [
    { key: 'fatal', label: '致命', hours: 8 },
    { key: 'major', label: '严重', hours: 4 },
    { key: 'minor', label: '一般', hours: 2 },
    { key: 'trivial', label: '轻微', hours: 1 }
  ];

  /* 内置缺陷台账（教学合成数据）：被各实验检出后进入待修列表 */
  var LEDGER = {
    SEAT_BOUNDARY: { severity: 'major', title: '团体折扣下界判定错误（2 人被计入 95 折）', from: 'M2/M3/M7' },
    ROUND_DOWN: { severity: 'minor', title: '折扣金额向下取整，少减 1 元', from: 'M3/M7' },
    COUPON_CAP: { severity: 'fatal', title: '优惠券负值未截断，应付金额可为负', from: 'M2/M6/M7' },
    RETRAIN_STACK: { severity: 'major', title: '团体折扣与复训折扣被叠加', from: 'M2/M6/M7' },
    STATIC_D1: { severity: 'major', title: '静态审查：入参未校验，undefined 被静默判为候补', from: 'M1' },
    STATIC_D2: { severity: 'minor', title: '静态审查：名额与候补上限硬编码未配置化', from: 'M1' },
    STATIC_D3: { severity: 'trivial', title: '静态审查：日志打印手机号与身份证号', from: 'M1' },
    STATIC_D4: { severity: 'major', title: '静态审查：候补入队逻辑重复且条件不一致', from: 'M1' },
    STATIC_D5: { severity: 'major', title: '静态审查：空 catch 吞掉取消失败', from: 'M1' },
    STATIC_D6: { severity: 'major', title: '静态审查：名额回补与审计写入缺少原子性', from: 'M1' },
    STATIC_D7: { severity: 'minor', title: '静态审查：先解构后校验，校验顺序错误', from: 'M1' }
  };

  var DEFAULT_PARAMS = {
    severityWeight: { fatal: 10, major: 5, minor: 2, trivial: 1 },
    weights: { density: 0.40, gap: 0.30, evidence: 0.20, regression: 0.10 },
    kloc: 0.8,
    densityRef: 40,
    minCoverage: 80,
    minPassRate: 90,
    riskThreshold: 45,
    budget: 12,
    strategy: 'risk'
  };

  var STRATEGIES = [
    { key: 'risk', label: '按风险优先（严重度权重高者先修）' },
    { key: 'cheap', label: '按成本优先（工时少者先修，快速降风险）' },
    { key: 'order', label: '按发现顺序（先发现先修）' }
  ];

  function normEvidence(ev) {
    var out = {};
    REQUIRED.forEach(function (r) {
      var e = ev && ev[r.id];
      if (e && typeof e === 'object' && e.status) out[r.id] = e;
    });
    return out;
  }

  /* 从证据中汇总待修缺陷（去重） */
  function collectBacklog(ev) {
    var map = {};
    Object.keys(ev).forEach(function (k) {
      var list = ev[k].defects || [];
      list.forEach(function (d) {
        var id = typeof d === 'string' ? d : d.id;
        if (!id) return;
        var meta = LEDGER[id] || { severity: (d && d.severity) || 'minor', title: (d && d.title) || id, from: k.toUpperCase() };
        if (!map[id]) {
          map[id] = { id: id, severity: meta.severity, title: meta.title, from: [meta.from], foundBy: [k] };
        } else {
          if (map[id].foundBy.indexOf(k) < 0) map[id].foundBy.push(k);
        }
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function hoursOf(sev) {
    return (SEVERITIES.filter(function (s) { return s.key === sev; })[0] || {}).hours || 2;
  }

  function orderBacklog(backlog, params) {
    var arr = backlog.map(function (d, i) {
      return Object.assign({ _i: i }, d, { hours: hoursOf(d.severity) });
    });
    if (params.strategy === 'risk') {
      arr.sort(function (a, b) {
        var wa = params.severityWeight[a.severity] || 1, wb = params.severityWeight[b.severity] || 1;
        return (wb - wa) || (a._i - b._i);
      });
    } else if (params.strategy === 'cheap') {
      arr.sort(function (a, b) {
        var ha = (SEVERITIES.filter(function (s) { return s.key === a.severity; })[0] || {}).hours || 2;
        var hb = (SEVERITIES.filter(function (s) { return s.key === b.severity; })[0] || {}).hours || 2;
        return (ha - hb) || (a._i - b._i);
      });
    }
    return arr;
  }

  function planFixes(backlog, params) {
    var ordered = orderBacklog(backlog, params);
    var budget = params.budget;
    var used = 0;
    var fixed = [], open = [];
    ordered.forEach(function (d) {
      var h = d.hours;
      if (used + h <= budget) { used += h; fixed.push(Object.assign({}, d)); }
      else open.push(Object.assign({}, d));
    });
    return { ordered: ordered, fixed: fixed, open: open, hoursUsed: used, budget: budget };
  }

  function computeRisk(ev, params) {
    var plan = planFixes(collectBacklog(ev), params);
    var weightOf = function (sev) { return params.severityWeight[sev] || 1; };
    var weightedOpen = plan.open.reduce(function (a, d) { return a + weightOf(d.severity); }, 0);
    var weightedAll = plan.ordered.reduce(function (a, d) { return a + weightOf(d.severity); }, 0);
    var density = params.kloc > 0 ? weightedOpen / params.kloc : null;
    var densityNorm = density === null ? null : Math.min(1, density / params.densityRef);

    var covs = [];
    REQUIRED.forEach(function (r) {
      // M1 的“缺陷检出率”与 M7 的“回归通过率”不是覆盖率指标，不并入覆盖均值：
      // M1 通过缺陷台账进入密度项，M7 单独进入回归失败率项。
      if (r.id === 'm1' || r.id === 'm7') return;
      var e = ev[r.id];
      if (e && typeof e.coverage === 'number') covs.push(e.coverage);
    });
    var coverage = covs.length ? covs.reduce(function (a, b) { return a + b; }, 0) / covs.length : 0;
    var gap = 1 - coverage / 100;

    var present = REQUIRED.filter(function (r) { return !!ev[r.id]; }).length;
    var evidGap = 1 - present / REQUIRED.length;

    var rg = ev.m7;
    var passRate = rg && typeof rg.coverage === 'number' ? rg.coverage : null;
    var regFail = passRate === null ? 1 : (1 - passRate / 100);

    var w = params.weights;
    var wsum = w.density + w.gap + w.evidence + w.regression;
    if (wsum <= 0) wsum = 1;
    var nd = densityNorm === null ? 0 : densityNorm;
    var R = 100 * (
      (w.density / wsum) * nd +
      (w.gap / wsum) * gap +
      (w.evidence / wsum) * evidGap +
      (w.regression / wsum) * regFail
    );

    return {
      plan: plan,
      weightedOpen: weightedOpen, weightedAll: weightedAll,
      density: density, densityNorm: densityNorm,
      coverage: Math.round(coverage * 10) / 10, gap: gap, covCount: covs.length,
      evidencePresent: present, evidenceGap: evidGap,
      passRate: passRate, regFail: regFail,
      risk: Math.round(R * 10) / 10,
      parts: [
        { key: 'density', label: '未关闭缺陷密度', value: nd, weight: w.density / wsum, contribution: R ? (w.density / wsum) * nd * 100 : 0 },
        { key: 'gap', label: '覆盖率缺口', value: gap, weight: w.gap / wsum, contribution: (w.gap / wsum) * gap * 100 },
        { key: 'evidence', label: '证据缺口', value: evidGap, weight: w.evidence / wsum, contribution: (w.evidence / wsum) * evidGap * 100 },
        { key: 'regression', label: '回归失败率', value: regFail, weight: w.regression / wsum, contribution: (w.regression / wsum) * regFail * 100 }
      ]
    };
  }

  function gate(ev, params, risk) {
    var fatalOpen = risk.plan.open.filter(function (d) { return d.severity === 'fatal'; });
    var checks = [
      {
        key: 'fatal', label: '无未关闭的致命缺陷', source: 'M8 待修台账 + 修复预算',
        ok: fatalOpen.length === 0,
        detail: fatalOpen.length ? '仍有 ' + fatalOpen.length + ' 个致命缺陷未修：' + fatalOpen.map(function (d) { return d.title; }).join('；') : '无未关闭致命缺陷'
      },
      {
        key: 'passRate', label: '回归通过率 ≥ ' + params.minPassRate + '%', source: 'M7 回归流水线',
        ok: risk.passRate !== null && risk.passRate >= params.minPassRate,
        detail: risk.passRate === null ? '缺少 M7 证据：无法判定（按不通过处理）' : risk.passRate + '%'
      },
      {
        key: 'coverage', label: '加权覆盖率 ≥ ' + params.minCoverage + '%', source: 'M2/M3/M4/M5/M6 主指标均值',
        ok: risk.coverage >= params.minCoverage,
        detail: risk.coverage + '%（由 ' + risk.covCount + ' 项已记录的主指标取算术平均）'
      },
      {
        key: 'evidence', label: '必需证据 7/7 齐备', source: 'M1–M7 结论',
        ok: risk.evidencePresent === 7,
        detail: risk.evidencePresent + '/7' + (risk.evidencePresent === REQUIRED.length ? '，无缺失' :
          '，缺 ' + REQUIRED.filter(function (r) { return !ev[r.id]; }).map(function (r) { return r.label; }).join('、'))
      },
      {
        key: 'risk', label: '发布风险指数 ≤ ' + params.riskThreshold, source: 'M8 风险模型',
        ok: risk.risk <= params.riskThreshold,
        detail: 'R = ' + risk.risk
      }
    ];
    var blocked = checks.filter(function (c) { return !c.ok; });
    var noEvidence = blocked.some(function (c) { return c.key === 'evidence'; });
    return {
      checks: checks, blocked: blocked, passed: blocked.length === 0,
      verdict: blocked.length === 0 ? 'ALLOW' : (noEvidence ? 'NO_EVIDENCE' : 'BLOCK')
    };
  }

  /* 教学合成演示证据：仅用于在未完成前置实验时探索模型，界面必须显著标注 */
  function demoEvidence() {
    return {
      m1: { status: 'warn', coverage: 71.4, label: '缺陷检出率', defects: ['STATIC_D1', 'STATIC_D3'], at: '演示数据' },
      m2: { status: 'warn', coverage: 85.7, label: '等价类覆盖率', defects: ['SEAT_BOUNDARY', 'RETRAIN_STACK'], at: '演示数据' },
      m3: { status: 'pass', coverage: 100, label: '边界对命中率', defects: ['SEAT_BOUNDARY', 'ROUND_DOWN'], at: '演示数据' },
      m4: { status: 'pass', coverage: 100, label: '与规格一致率', defects: [], at: '演示数据' },
      m5: { status: 'warn', coverage: 71.4, label: '迁移覆盖率', defects: [], at: '演示数据' },
      m6: { status: 'pass', coverage: 100, label: '判定覆盖率', defects: ['COUPON_CAP'], at: '演示数据' },
      m7: { status: 'fail', coverage: 93.3, label: '回归通过率', defects: ['SEAT_BOUNDARY', 'COUPON_CAP'], at: '演示数据' }
    };
  }

  return {
    QA_REQUIRED: REQUIRED,
    QA_SEVERITIES: SEVERITIES,
    QA_LEDGER: LEDGER,
    QA_DEFAULT_PARAMS: DEFAULT_PARAMS,
    QA_STRATEGIES: STRATEGIES,
    qaNormEvidence: normEvidence,
    qaCollectBacklog: collectBacklog,
    qaPlanFixes: planFixes,
    qaComputeRisk: computeRisk,
    qaGate: gate,
    qaDemoEvidence: demoEvidence
  };
});

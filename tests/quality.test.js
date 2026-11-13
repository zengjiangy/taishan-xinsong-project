/**
 * tests/quality.test.js — 静态审查 / 风险模型 / 门禁
 * 运行：node --test tests/quality.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const SR = require('../src/core/staticreview.js');
const Q = require('../src/core/quality.js');

/* ------------------------------------------------------------- 静态审查 */
test('SR-01 三个版本的基线全部可定位（无未解析行号）', () => {
  Object.keys(SR.SR_BASELINE).forEach((v) => {
    SR.SR_BASELINE[v].forEach((d) => {
      assert.ok(d.lines.length > 0, v + ' 的 ' + d.id + ' 没有解析出任何行');
      assert.strictEqual(d.unresolved, 0, v + ' 的 ' + d.id + ' 存在未解析的行');
      d.lines.forEach((n) => assert.ok(n >= 1 && n <= SR.SR_CODE[v].length, v + ' 行号越界 ' + n));
    });
  });
});

test('SR-02 三个版本的基线缺陷数：v1.0 五处、v1.1 三处、v1.2 三处', () => {
  assert.strictEqual(SR.SR_BASELINE['v1.0'].length, 5);
  assert.strictEqual(SR.SR_BASELINE['v1.1'].length, 3);
  assert.strictEqual(SR.SR_BASELINE['v1.2'].length, 3);
});

test('SR-03 规则扫描只覆盖部分基线缺陷，且会产生误报', () => {
  const scan = SR.srRuleScan('v1.0', null);
  assert.ok(scan.count > 0);
  const rev = SR.srReview('v1.0', scan.marks, { scope: 'all' });
  assert.ok(rev.detected.length > 0);
  assert.ok(rev.detected.length < 5, '规则不应检出全部基线缺陷（否则无从体现工具的局限）');
  assert.ok(rev.falsePositives.length > 0, '规则扫描应产生误报，用于教学');
});

test('SR-04 人工标满全部基线行 → 检出率 100%、误报率 0', () => {
  const marks = {};
  SR.SR_BASELINE['v1.0'].forEach((d) => { marks[d.lines[0]] = d.type; });
  const rev = SR.srReview('v1.0', marks, { scope: 'all' });
  assert.strictEqual(rev.metrics.detectionRate, 100);
  assert.strictEqual(rev.metrics.typeAccuracy, 100);
  assert.strictEqual(rev.metrics.falsePositiveRate, 0);
  assert.strictEqual(rev.gateOk, true);
});

test('SR-05 范围缩小会改变分母：核心段只包含 2 处缺陷', () => {
  const all = SR.srReview('v1.0', {}, { scope: 'all' });
  const core = SR.srReview('v1.0', {}, { scope: 'core' });
  assert.strictEqual(all.totalInScope, 5);
  assert.strictEqual(core.totalInScope, 2, 'v1.0 核心段应含 D1 与 D4');
  assert.strictEqual(core.outOfScope, 3);
  // 同一个标注集在两种范围下的检出率不同
  const marks = {}; marks[7] = 'validation';
  const r1 = SR.srReview('v1.0', marks, { scope: 'all' });
  const r2 = SR.srReview('v1.0', marks, { scope: 'core' });
  assert.strictEqual(r1.metrics.detectionRate, 20);
  assert.strictEqual(r2.metrics.detectionRate, 50);
});

test('SR-06 空标注：检出率 0、误报率 null（分母为 0），不显示误导性 100%', () => {
  const rev = SR.srReview('v1.0', {}, { scope: 'all' });
  assert.strictEqual(rev.metrics.detectionRate, 0);
  assert.strictEqual(rev.metrics.falsePositiveRate, null);
  assert.strictEqual(rev.metrics.typeAccuracy, null);
  assert.strictEqual(rev.empty, true);
  assert.strictEqual(rev.gateOk, false);
});

test('SR-07 严重度门槛影响“是否通过评审”，不影响检出率', () => {
  const marks = {};
  marks[7] = 'validation';            // D1 major
  const strict = SR.srReview('v1.0', marks, { scope: 'all', severityThreshold: 'minor' });
  const loose = SR.srReview('v1.0', marks, { scope: 'all', severityThreshold: 'fatal' });
  assert.strictEqual(strict.metrics.detectionRate, loose.metrics.detectionRate);
  assert.strictEqual(strict.gateOk, false, '仍残留 major/minor 缺陷，门槛 minor 时不通过');
  assert.strictEqual(loose.gateOk, true, '门槛 fatal 时，无致命缺陷即可通过');
});

test('SR-08 类型标错会被计入误报但不影响检出', () => {
  const marks = {}; marks[7] = 'naming';   // 位置对，类型错
  const rev = SR.srReview('v1.0', marks, { scope: 'all' });
  assert.strictEqual(rev.detected.length, 1);
  assert.strictEqual(rev.metrics.typeAccuracy, 0);
  assert.strictEqual(rev.falsePositives.length, 0, '位置命中基线行，不算误报');
});

/* --------------------------------------------------------------- 风险模型 */
const DEMO = Q.qaDemoEvidence();

test('QT-01 演示证据的 7 项证据齐备，且每项都有主指标', () => {
  const ev = Q.qaNormEvidence(DEMO);
  assert.strictEqual(Object.keys(ev).length, 7);
  Q.QA_REQUIRED.forEach((r) => {
    assert.ok(typeof ev[r.id].coverage === 'number', r.id + ' 缺少覆盖指标');
  });
});

test('QT-02 缺陷台账去重并按来源合并', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const backlog = Q.qaCollectBacklog(ev);
  const ids = backlog.map((d) => d.id);
  assert.strictEqual(new Set(ids).size, ids.length, '台账不应有重复缺陷');
  const sb = backlog.find((d) => d.id === 'SEAT_BOUNDARY');
  assert.ok(sb.foundBy.length >= 2, '同一缺陷应由多个实验检出');
});

test('QT-03 预算越大，未关闭加权缺陷越少，风险指数单调不增', () => {
  const ev = Q.qaNormEvidence(DEMO);
  let last = Infinity;
  for (let b = 0; b <= 30; b += 3) {
    const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { budget: b });
    const r = Q.qaComputeRisk(ev, p);
    assert.ok(r.risk <= last + 1e-9, '预算 ' + b + ' 时风险反弹：' + r.risk + ' > ' + last);
    last = r.risk;
  }
});

test('QT-04 无证据时风险接近上限，且门禁判为证据不足', () => {
  const p = Q.QA_DEFAULT_PARAMS;
  const r = Q.qaComputeRisk({}, p);
  const g = Q.qaGate({}, p, r);
  assert.strictEqual(r.evidencePresent, 0);
  assert.strictEqual(r.evidenceGap, 1);
  assert.strictEqual(g.passed, false);
  assert.strictEqual(g.verdict, 'NO_EVIDENCE');
  assert.ok(r.risk >= 50, '完全无证据时风险应明显偏高，实际 ' + r.risk);
});

test('QT-05 修复策略影响最小预算：不同顺序达到同一门槛的成本不同', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const results = Q.QA_STRATEGIES.map((s) => {
    let found = null;
    for (let b = 0; b <= 40; b++) {
      const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { budget: b, strategy: s.key });
      const r = Q.qaComputeRisk(ev, p);
      if (Q.qaGate(ev, p, r).passed) { found = b; break; }
    }
    return { key: s.key, budget: found };
  });
  const defined = results.filter((r) => r.budget !== null);
  assert.ok(defined.length > 0, '至少一种策略能在 40 小时内达成');
  // 风险优先不劣于按发现顺序
  const risk = results.find((r) => r.key === 'risk');
  const order = results.find((r) => r.key === 'order');
  if (risk.budget !== null && order.budget !== null) {
    assert.ok(risk.budget <= order.budget, '风险优先的预算不应高于按发现顺序');
  }
});

test('QT-06 权重归一化：四个维度权重之和影响分配但不产生 >100 的风险', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { weights: { density: 7, gap: 1, evidence: 1, regression: 1 } });
  const r = Q.qaComputeRisk(ev, p);
  assert.ok(r.risk >= 0 && r.risk <= 100);
  const sum = r.parts.reduce((a, x) => a + x.contribution, 0);
  assert.ok(Math.abs(sum - r.risk) < 0.6, '各维度贡献之和应等于风险指数（误差 < 0.6）');
  assert.ok(Math.abs(r.parts.reduce((a, x) => a + x.weight, 0) - 1) < 1e-6);
});

test('QT-07 KLOC 为 0 时密度项不参与，不产生 NaN / Infinity', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { kloc: 0 });
  const r = Q.qaComputeRisk(ev, p);
  assert.strictEqual(r.density, null);
  assert.strictEqual(r.densityNorm, null);
  assert.ok(Number.isFinite(r.risk));
});

test('QT-08 门禁 5 项检查齐全，任一不满足即阻断', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { budget: 40, riskThreshold: 90, minCoverage: 0, minPassRate: 0 });
  const r = Q.qaComputeRisk(ev, p);
  const g = Q.qaGate(ev, p, r);
  assert.strictEqual(g.checks.length, 5);
  assert.deepStrictEqual(g.checks.map((c) => c.key), ['fatal', 'passRate', 'coverage', 'evidence', 'risk']);
  // 人为把门槛拉到不可能满足
  const p2 = Object.assign({}, p, { riskThreshold: 0 });
  const g2 = Q.qaGate(ev, p2, Q.qaComputeRisk(ev, p2));
  assert.strictEqual(g2.passed, false);
  assert.ok(g2.blocked.some((c) => c.key === 'risk'));
});

test('QT-09 致命缺陷未修完时门禁必然阻断（一票否决）', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { budget: 0, riskThreshold: 100, minCoverage: 0, minPassRate: 0 });
  const r = Q.qaComputeRisk(ev, p);
  const g = Q.qaGate(ev, p, r);
  const fatal = g.checks.find((c) => c.key === 'fatal');
  assert.strictEqual(fatal.ok, false, '预算 0 时致命缺陷必然未修');
  assert.strictEqual(g.passed, false);
});

test('QT-10 台账每行都带工时，修复计划可核对', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Object.assign({}, Q.QA_DEFAULT_PARAMS, { budget: 12 });
  const r = Q.qaComputeRisk(ev, p);
  r.plan.ordered.forEach((d) => {
    assert.ok(typeof d.hours === 'number' && d.hours > 0, d.id + ' 缺少工时');
  });
  const expected = r.plan.fixed.reduce((a, d) => a + d.hours, 0);
  assert.strictEqual(r.plan.hoursUsed, expected, '已用工时应等于已修缺陷工时之和');
  assert.ok(r.plan.hoursUsed <= 12);
});

test('QT-11 覆盖率由几项主指标平均而来，数量可核对', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const r = Q.qaComputeRisk(ev, Q.QA_DEFAULT_PARAMS);
  assert.strictEqual(r.covCount, 5, 'M2/M3/M4/M5/M6 共 5 项主指标（M7 单独进回归项）');
  const avg = ['m2', 'm3', 'm4', 'm5', 'm6'].map((k) => ev[k].coverage).reduce((a, b) => a + b, 0) / 5;
  assert.ok(Math.abs(r.coverage - avg) < 0.15, '覆盖率应等于 5 项主指标的算术平均');
});

test('QT-12 证据来源可追溯：每个检查项都标注了来源', () => {
  const ev = Q.qaNormEvidence(DEMO);
  const p = Q.QA_DEFAULT_PARAMS;
  const g = Q.qaGate(ev, p, Q.qaComputeRisk(ev, p));
  g.checks.forEach((c) => {
    assert.ok(c.source && c.source.length > 0, c.key + ' 缺少证据来源标注');
  });
});

/**
 * tests/design.test.js — 测试设计技术（等价类 / 边界值 / 决策表）
 * 运行：node --test tests/design.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const EC = require('../src/core/equivalence.js');
const BV = require('../src/core/boundary.js');
const DT = require('../src/core/decision.js');

/* ------------------------------------------------------------- 等价类 */
test('EC-01 标准粒度下三个字段的类数正确（分母可核对）', () => {
  const count = (f, lv) => EC.ecGenerateCases({ field: f, level: lv, strategy: 'mid', includeInvalid: true }).classes.length;
  assert.strictEqual(count('hours', 'standard'), 6);   // 3 有效 + 3 无效
  assert.strictEqual(count('seats', 'standard'), 7);   // 4 有效 + 3 无效
  assert.strictEqual(count('coupon', 'standard'), 6);  // 3 有效 + 3 无效
  assert.strictEqual(count('seats', 'coarse'), 2);
  assert.strictEqual(count('seats', 'fine'), 8);
});

test('EC-02 每类一个用例时，类覆盖率只由取样策略与粒度决定', () => {
  const r = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: true, defects: [] });
  assert.strictEqual(r.cases.length, 7);
  assert.strictEqual(r.coverage.rate, 100);
  assert.strictEqual(r.coverage.invalidCovered, 3);
});

test('EC-03 关闭无效类后，无效类覆盖率必然为 0，且总覆盖率下降', () => {
  const on = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: true, defects: [] });
  const off = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: false, defects: [] });
  assert.strictEqual(off.coverage.invalidCovered, 0);
  assert.ok(off.coverage.rate < on.coverage.rate);
  assert.strictEqual(off.coverage.missed.length, 3);
});

test('EC-04 类内两端取样比类中点产生更多用例，但不改变类覆盖率', () => {
  const mid = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: true, defects: [] });
  const edges = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'edges', includeInvalid: true, defects: [] });
  assert.ok(edges.cases.length > mid.cases.length, '两端取样应产生更多用例');
  assert.strictEqual(edges.coverage.rate, mid.coverage.rate);
  assert.strictEqual(mid.coverage.rate, 100);
});

test('EC-05 单字段用例能检出 D1/D2，但检不出 D4（组合缺陷）', () => {
  const r = EC.ecExecute({ field: 'seats', level: 'fine', strategy: 'edges', includeInvalid: true, defects: [] });
  const m = {};
  r.matrix.forEach((x) => { m[x.id] = x.detected; });
  assert.strictEqual(m.SEAT_BOUNDARY, true);
  assert.strictEqual(m.RETRAIN_STACK, false, 'D4 需要 type=retrain 与 seats≥3 同时成立');
});

test('EC-06 自定义组合用例可以补上单字段检不出的缺陷', () => {
  const base = { field: 'seats', level: 'coarse', strategy: 'mid', includeInvalid: true, defects: [] };
  const before = EC.ecExecute(base);
  const after = EC.ecExecute(Object.assign({}, base, {
    customCases: [{ input: { hours: 11, seats: 3, coupon: 0, type: 'retrain', hasCert: true } }]
  }));
  const det = (r, id) => r.matrix.filter((x) => x.id === id)[0].detected;
  assert.strictEqual(det(before, 'RETRAIN_STACK'), false);
  assert.strictEqual(det(after, 'RETRAIN_STACK'), true);
});

test('EC-07 注入缺陷后，命中该缺陷的用例判定为不一致', () => {
  const r = EC.ecExecute({ field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: true, defects: ['SEAT_BOUNDARY'] });
  const fail = r.cases.filter((c) => !c.pass);
  assert.ok(fail.length > 0);
  fail.forEach((c) => assert.ok(c.activeHits.includes('SEAT_BOUNDARY')));
});

/* ------------------------------------------------------------- 边界值 */
test('BV-01 边界对由规格档位推导，人数有 5 对、课时与券各 2 对', () => {
  assert.strictEqual(BV.BV_PAIRS('seats').length, 5);
  assert.strictEqual(BV.BV_PAIRS('hours').length, 2);
  assert.strictEqual(BV.BV_PAIRS('coupon').length, 2);
  const ids = BV.BV_PAIRS('seats').map((p) => p.id);
  assert.deepStrictEqual(ids, ['SB0', 'SB1', 'SB2', 'SB3', 'SBX']);
  const sb1 = BV.BV_PAIRS('seats').find((p) => p.id === 'SB1');
  assert.strictEqual(sb1.below, 2);
  assert.strictEqual(sb1.above, 3);
});

test('BV-02 三种策略的取值点数与边界命中率', () => {
  const on = BV.bvExecute({ field: 'seats', strategy: 'on', base: 'typical', defects: [] });
  const off = BV.bvExecute({ field: 'seats', strategy: 'off', base: 'typical', defects: [] });
  const full = BV.bvExecute({ field: 'seats', strategy: 'full', base: 'typical', defects: [] });
  assert.strictEqual(on.boundaryHit, 5);
  assert.strictEqual(on.hitRate, 100);
  assert.strictEqual(off.hitRate, 100);
  assert.ok(off.caseCount > on.caseCount);
  assert.ok(full.caseCount >= off.caseCount);
  // 每个边界对的两侧都必须在取值集中
  on.pairStatus.forEach((p) => assert.ok(p.hasBelow && p.hasAbove, p.id));
});

test('BV-03 基准输入影响检出能力：小额基准才能触发券后负值', () => {
  const typ = BV.bvExecute({ field: 'coupon', strategy: 'full', base: 'typical', defects: [] });
  const small = BV.bvExecute({ field: 'coupon', strategy: 'full', base: 'small', defects: [] });
  const hit = (r, id) => r.matrix.filter((x) => x.id === id)[0].detected;
  assert.strictEqual(hit(typ, 'COUPON_CAP'), false, '典型基准下应付不会为负');
  assert.strictEqual(hit(small, 'COUPON_CAP'), true, '1 课时 + 500 元券会产生负值');
});

test('BV-04 边界值检出 off-by-one（D1）与取整（D2）', () => {
  const r = BV.bvExecute({ field: 'seats', strategy: 'off', base: 'typical', defects: [] });
  const m = {};
  r.matrix.forEach((x) => { m[x.id] = x.detected; });
  assert.strictEqual(m.SEAT_BOUNDARY, true);
  assert.strictEqual(m.ROUND_DOWN, true);
});

test('BV-05 边界值同样检不出组合缺陷 D4', () => {
  const r = BV.bvExecute({ field: 'seats', strategy: 'full', base: 'typical', defects: [] });
  assert.strictEqual(r.matrix.filter((x) => x.id === 'RETRAIN_STACK')[0].detected, false);
});

/* ------------------------------------------------------------- 决策表 */
test('DT-01 完整规则表覆盖全部 16 组合且与规格 100% 一致', () => {
  const r = DT.dtEvaluate(DT.dtPresetRules('complete'), { strategy: 'first', scope: 'full' });
  assert.strictEqual(r.total, 16);
  assert.strictEqual(r.coverage, 100);
  assert.strictEqual(r.accuracy, 100);
  assert.strictEqual(r.uncovered.length, 0);
  assert.strictEqual(r.conflicts.length, 0);
  assert.ok(r.ruleDiag.every((d) => d.status === 'active'), '完整规则表不应有遮蔽或不可达规则');
});

test('DT-02 遗漏版产生 2 个未覆盖组合（C2=N,C3=N 的两种 C4）', () => {
  const r = DT.dtEvaluate(DT.dtPresetRules('missing'), { strategy: 'first', scope: 'full' });
  assert.strictEqual(r.uncovered.length, 2);
  assert.ok(r.accuracy < 100);
  r.uncovered.forEach((u) => {
    assert.strictEqual(u.c.C2, false);
    assert.strictEqual(u.c.C3, false);
  });
});

test('DT-03 冲突版在 YYYY 组合上产生 1 处冲突，且策略影响消解结果', () => {
  const rules = DT.dtPresetRules('conflict');
  const first = DT.dtEvaluate(rules, { strategy: 'first', scope: 'full' });
  const strict = DT.dtEvaluate(rules, { strategy: 'strict', scope: 'full' });
  const block = DT.dtEvaluate(rules, { strategy: 'block', scope: 'full' });
  assert.strictEqual(first.conflicts.length, 1);
  assert.strictEqual(strict.conflicts.length, 1);
  const c1 = first.conflicts[0];
  assert.strictEqual(c1.label, 'YYYY');
  assert.deepStrictEqual(c1.matched.sort(), ['R2', 'R2b']);
  assert.strictEqual(c1.resolved, 'PASS', '首条命中应取 R2 的 PASS');
  assert.strictEqual(strict.conflicts[0].resolved, 'COND_A', '最严格动作应取 COND_A');
  assert.strictEqual(block.conflicts[0].resolved, null, '阻断策略不出结论');
});

test('DT-04 冗余版的新规则被前序规则完全遮蔽', () => {
  const r = DT.dtEvaluate(DT.dtPresetRules('redundant'), { strategy: 'first', scope: 'full' });
  const r1b = r.ruleDiag.find((d) => d.id === 'R1b');
  assert.ok(r1b);
  assert.strictEqual(r1b.status, 'shadowed');
  assert.strictEqual(r1b.match, 4, 'R1b 的 C1=N、C2=Y 展开后覆盖 4 个组合');
});

test('DT-05 动作错写版：覆盖完整但一致率下降', () => {
  const r = DT.dtEvaluate(DT.dtPresetRules('wrong'), { strategy: 'first', scope: 'full' });
  assert.strictEqual(r.coverage, 100, '组合仍被覆盖');
  assert.ok(r.accuracy < 100, '一致率应下降');
  assert.ok(r.wrong.some((w) => w.label === 'YYNY'));
});

test('DT-06 可达折叠口径把分母从 16 变为 9', () => {
  const full = DT.dtEvaluate(DT.dtPresetRules('complete'), { strategy: 'first', scope: 'full' });
  const reach = DT.dtEvaluate(DT.dtPresetRules('complete'), { strategy: 'first', scope: 'reachable' });
  assert.strictEqual(full.total, 16);
  assert.strictEqual(reach.total, 9);
  assert.strictEqual(reach.accuracy, 100);
});

test('DT-07 单点判定与组合判定口径一致', () => {
  const rules = DT.dtPresetRules('complete');
  const cases = [
    { age: 30, edu: 'bachelor', years: 1, recommend: true, want: 'COND_A' },
    { age: 30, edu: 'bachelor', years: 3, recommend: false, want: 'PASS' },
    { age: 15, edu: 'bachelor', years: 3, recommend: true, want: 'REJECT' },
    { age: 30, edu: 'senior', years: 2, recommend: true, want: 'COND_B' }
  ];
  cases.forEach((c) => {
    const r = DT.dtEvalInput(rules, c, 'first');
    assert.strictEqual(r.resolved, c.want, JSON.stringify(c));
    assert.strictEqual(r.correct, true);
  });
});

test('DT-08 空规则表：全部组合未覆盖，不抛异常', () => {
  const r = DT.dtEvaluate([], { strategy: 'first', scope: 'full' });
  assert.strictEqual(r.uncovered.length, 16);
  assert.strictEqual(r.accuracy, 0);
  assert.strictEqual(r.coverage, 0);
});

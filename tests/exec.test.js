/**
 * tests/exec.test.js — 状态迁移 / 白盒覆盖 / 回归流水线
 * 运行：node --test tests/exec.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/core/spec.js');
const F = require('../src/core/fsm.js');
const W = require('../src/core/whitebox.js');
const R = require('../src/core/regression.js');

const ALL_ON = { allowRevise: true, allowReopen: true, allowPromote: true };
const ALL_OFF = {};

/* ------------------------------------------------------------- 状态迁移 */
test('FSM-01 主流程到达结业，无无效操作', () => {
  const r = F.fsmRun({
    events: ['submit', 'startReview', 'approve', 'book', 'attend', 'complete'],
    toggles: ALL_ON, seatsLeft: 3
  });
  assert.strictEqual(r.final, 'COMPLETED');
  assert.strictEqual(r.invalid.length, 0);
  assert.strictEqual(r.coverage.state.covered, 7, '初始状态也计入已访问状态');
  assert.strictEqual(r.coverage.transition.covered, 6);
});

test('FSM-02 名额为 0 时 book 走候补，名额>0 时走预约', () => {
  const full = F.fsmRun({ events: ['submit', 'startReview', 'approve', 'book'], toggles: ALL_ON, seatsLeft: 0 });
  const free = F.fsmRun({ events: ['submit', 'startReview', 'approve', 'book'], toggles: ALL_ON, seatsLeft: 2 });
  assert.strictEqual(full.final, 'WAITLIST');
  assert.strictEqual(free.final, 'BOOKED');
  assert.strictEqual(full.seatsLeft, 0);
  assert.strictEqual(free.seatsLeft, 1);
});

test('FSM-03 非法事件被记录为无效操作，不改变状态', () => {
  const r = F.fsmRun({ events: ['book', 'attend'], toggles: ALL_ON, seatsLeft: 2 });
  assert.strictEqual(r.final, 'DRAFT');
  assert.strictEqual(r.invalid.length, 2);
  assert.ok(r.invalid[0].reason.includes('草稿'));
});

test('FSM-04 守卫不满足的迁移记为无效，且区分“守卫拒绝”与“状态不接受”', () => {
  const r = F.fsmRun({ events: ['submit', 'startReview', 'approve', 'book', 'promote'], toggles: ALL_ON, seatsLeft: 0 });
  assert.strictEqual(r.final, 'WAITLIST');
  const last = r.invalid[r.invalid.length - 1];
  assert.strictEqual(last.event, 'promote');
  assert.strictEqual(last.guardRejected, true, '应标记为守卫拒绝而非状态不接受');
});

test('FSM-05 关闭开关后分母变小，覆盖率随之变化（同一序列）', () => {
  const seq = ['submit', 'startReview', 'approve', 'book', 'attend', 'complete'];
  const on = F.fsmRun({ events: seq, toggles: ALL_ON, seatsLeft: 3 });
  const off = F.fsmRun({ events: seq, toggles: ALL_OFF, seatsLeft: 3 });
  assert.strictEqual(on.coverage.transition.total, 14);
  assert.strictEqual(off.coverage.transition.total, 11);
  assert.ok(off.coverage.transition.rate > on.coverage.transition.rate, '分母变小后比率应上升');
  assert.strictEqual(on.coverage.transition.covered, off.coverage.transition.covered, '分子不变');
});

test('FSM-06 空序列：覆盖率为 0，分母仍为模型规模', () => {
  const r = F.fsmRun({ events: [], toggles: ALL_ON, seatsLeft: 3 });
  assert.strictEqual(r.coverage.transition.covered, 0);
  assert.strictEqual(r.coverage.transition.rate, 0);
  assert.strictEqual(r.coverage.transition.total, 14);
  assert.strictEqual(r.coverage.pair.total > 0, true);
});

test('FSM-07 迁移对分母 = 所有可接续迁移对的个数', () => {
  const r = F.fsmRun({ events: [], toggles: ALL_ON, seatsLeft: 3 });
  let expect = 0;
  S.activeTransitions(ALL_ON).forEach((a) => {
    S.activeTransitions(ALL_ON).forEach((b) => { if (a.to === b.from) expect++; });
  });
  assert.strictEqual(r.coverage.pair.total, expect);
});

test('FSM-08 取消后名额被释放', () => {
  const r = F.fsmRun({ events: ['submit', 'startReview', 'approve', 'book', 'cancel'], toggles: ALL_ON, seatsLeft: 1 });
  assert.strictEqual(r.final, 'CANCELLED');
  assert.strictEqual(r.seatsLeft, 1);
});

/* --------------------------------------------------------------- 白盒 */
test('WB-01 代码解析得到 18 个块、7 个判定、12 个条件', () => {
  const p = W.wbParseCode(S._calcFee.toString());
  assert.strictEqual(p.blocks.length, 18);
  assert.deepStrictEqual(p.blocks, ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10',
    'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18']);
  assert.strictEqual(p.decisions.length, 7);
  assert.strictEqual(p.conditions.length, 12);
});

test('WB-02 控制流图与解析出的块集合一一对应（无孤儿节点/悬空边）', () => {
  const p = W.wbParseCode(S._calcFee.toString());
  const declared = Object.keys(W.WB_CFG.edges).sort();
  assert.deepStrictEqual(declared.slice().sort(), p.blocks.slice().sort(), 'CFG 节点必须与代码块完全一致');
  Object.keys(W.WB_CFG.edges).forEach((from) => {
    W.WB_CFG.edges[from].forEach((to) => {
      assert.ok(p.blocks.includes(to), from + ' → ' + to + ' 指向不存在的块');
    });
  });
  assert.strictEqual(W.WB_CFG.entry, 'B01');
});

test('WB-03 路径枚举总数与手工推导一致（1 + 2×4×2×2 = 33）', () => {
  assert.strictEqual(W.WB_TOTAL_PATHS, 33);
  const paths = W.wbEnumeratePaths(500);
  assert.strictEqual(paths.length, 33);
  const uniq = new Set(paths.map((p) => p.join('>')));
  assert.strictEqual(uniq.size, 33, '路径不应重复');
  paths.forEach((p) => {
    assert.strictEqual(p[0], 'B01');
    assert.ok(['B02', 'B18'].includes(p[p.length - 1]), '路径必须终止于出口块');
  });
});

test('WB-04 全部用例池可达 100% 块/判定/条件/DC 覆盖，但路径覆盖不可达 100%', () => {
  const runs = W.WB_POOL.map((i) => W.wbRunOne(i, null));
  const a = W.wbAnalyze(runs);
  assert.strictEqual(a.blocks.rate, 100);
  assert.strictEqual(a.decisions.rate, 100);
  assert.strictEqual(a.conditions.rate, 100);
  assert.strictEqual(a.dc.rate, 100);
  assert.ok(a.paths.rate < 100, '路径覆盖不应轻易达到 100%');
});

test('WB-05 注入 COUPON_CAP 后 B16 不可达，语句覆盖上限降为 17/18', () => {
  const runs = W.WB_POOL.map((i) => W.wbRunOne(i, 'COUPON_CAP'));
  const a = W.wbAnalyze(runs);
  assert.strictEqual(a.blocks.covered, 17);
  assert.ok(a.blocks.missed.join('').includes('B16'));
});

test('WB-06 贪心最小集对四类准则都能达标，且比全量用例少', () => {
  ['statement', 'decision', 'condition', 'dc'].forEach((crit) => {
    const g = W.wbGreedyMinSet(W.WB_POOL, crit, null);
    const a = W.wbAnalyze(g.cases.map((i) => W.wbRunOne(i, null)));
    const st = W.wbCriterionStatus(a, crit);
    assert.strictEqual(st.passed, true, crit + ' 未达标：' + st.value + '/' + st.total);
    assert.ok(g.cases.length < W.WB_POOL.length, crit + ' 的最小集应小于全量池');
  });
});

test('WB-07 单条用例的覆盖不可能全绿；空用例集分母不变、分子为 0', () => {
  const one = W.wbAnalyze([W.wbRunOne(W.WB_POOL[1], null)]);
  assert.ok(one.blocks.rate < 100);
  const empty = W.wbAnalyze([]);
  assert.strictEqual(empty.blocks.covered, 0);
  assert.strictEqual(empty.blocks.total, 18);
  assert.strictEqual(empty.paths.total, 33);
});

test('WB-08 高覆盖不等于无缺陷：18/18 块覆盖下仍有检不出的缺陷', () => {
  const runs = W.WB_POOL.map((i) => W.wbRunOne(i, null));
  const a = W.wbAnalyze(runs);
  assert.strictEqual(a.blocks.rate, 100);
  const hit = {};
  W.WB_POOL.forEach((i) => S.defectProbe(i).forEach((p) => { if (p.differs) hit[p.id] = true; }));
  assert.ok(Object.keys(hit).length < 4, '全部 4 个缺陷都能检出，反例不成立');
});

/* --------------------------------------------------------------- 回归 */
test('RG-01 v1.0 与 v1.1 全绿，v1.2-rc1 恰好 2 条失败', () => {
  const v10 = R.rgRun({ version: 'v1.0', scope: 'all', minPassRate: 100, maxFailures: 0 });
  const v11 = R.rgRun({ version: 'v1.1', scope: 'all', minPassRate: 100, maxFailures: 0 });
  const v12 = R.rgRun({ version: 'v1.2-rc1', scope: 'all', minPassRate: 100, maxFailures: 0 });
  assert.strictEqual(v10.failed, 0);
  assert.strictEqual(v11.failed, 0, '纯重构不应破坏行为');
  assert.strictEqual(v12.failed, 2);
  assert.deepStrictEqual(v12.results.filter((x) => !x.pass).map((x) => x.id).sort(), ['F02', 'F12']);
});

test('RG-02 用例中的预期值是字面量，且与参考判定函数一致（防规格漂移）', () => {
  const fees = R.RG_SUITE.filter((c) => c.kind === 'fee');
  assert.ok(fees.length >= 10);
  fees.forEach((c) => {
    const o = S.feeSpec(c.input);
    Object.keys(c.expect).forEach((k) => {
      assert.strictEqual(o[k], c.expect[k], c.id + ' 的字段 ' + k + ' 与规格不一致');
    });
  });
});

test('RG-03 用例 id 唯一、模块合法、冒烟子集非空', () => {
  const ids = R.RG_SUITE.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const mods = R.RG_MODULES.map((m) => m.key);
  R.RG_SUITE.forEach((c) => assert.ok(mods.includes(c.module), c.id));
  assert.ok(R.RG_SUITE.filter((c) => c.smoke).length >= 5);
});

test('RG-04 范围选择改变分母；空范围时通过率判为不通过', () => {
  const all = R.rgRun({ version: 'v1.0', scope: 'all', minPassRate: 100, maxFailures: 0 });
  const smoke = R.rgRun({ version: 'v1.0', scope: 'smoke', minPassRate: 100, maxFailures: 0 });
  assert.ok(smoke.results.length < all.results.length);
  const none = R.rgRun({ version: 'v1.0', scope: 'all', modules: [], minPassRate: 100, maxFailures: 0 });
  assert.strictEqual(none.results.length, 0);
  assert.strictEqual(none.passRate, null);
  assert.strictEqual(none.gatePassed, false, '空用例集不得判为通过');
});

test('RG-05 门禁由四条独立判据组成，任一不满足即阻断', () => {
  const base = { version: 'v1.2-rc1', scope: 'all', minPassRate: 90, maxFailures: 2 };
  const strictSmoke = R.rgRun(Object.assign({}, base, { requireSmoke: true }));
  const noSmoke = R.rgRun(Object.assign({}, base, { requireSmoke: false }));
  assert.strictEqual(strictSmoke.gatePassed, false, '冒烟用例失败应一票否决');
  assert.strictEqual(noSmoke.gatePassed, true, '关闭一票否决后应通过');
  const badRate = R.rgRun(Object.assign({}, base, { minPassRate: 95, requireSmoke: false }));
  assert.strictEqual(badRate.gatePassed, false, '通过率不达标应阻断');
});

test('RG-06 受影响模块的范围过滤：只跑 fee 时仍有 16 条', () => {
  const r = R.rgRun({ version: 'v1.2-rc1', scope: 'affected', minPassRate: 100, maxFailures: 0 });
  const feeCount = R.RG_SUITE.filter((c) => c.module === 'fee').length;
  assert.strictEqual(r.results.length, feeCount);
  assert.strictEqual(r.affected.join(','), 'fee');
});

test('RG-07 流水线阶段结论来自真实结果', () => {
  const r = R.rgRun({ version: 'v1.2-rc1', scope: 'all', minPassRate: 100, maxFailures: 0 });
  const stages = R.rgPipeline({}, r, { status: 'pass' });
  assert.strictEqual(stages.length, 6);
  const gate = stages.find((s) => s.key === 'gate');
  assert.strictEqual(gate.ok, false);
  const artifact = stages.find((s) => s.key === 'artifact');
  assert.strictEqual(artifact.skipped, true, '门禁未通过不应产生产物');
  const statStage = stages.find((s) => s.key === 'static');
  assert.strictEqual(statStage.skipped, false);
});

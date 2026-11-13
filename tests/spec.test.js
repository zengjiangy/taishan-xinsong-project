/**
 * tests/spec.test.js — 业务规格与被测实现的对照测试
 * 运行：node --test tests/
 * 说明：直接 require 作品实际使用的 src/core/spec.js，不是复制的实现。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/core/spec.js');

const base = (o) => Object.assign({ hours: 10, seats: 1, coupon: 0, type: 'new', hasCert: false }, o);

test('SPEC-01 规格实现与参考判定函数在网格上完全一致（无缺陷时）', () => {
  let n = 0;
  for (let h = 1; h <= 120; h += 3) {
    for (let s = 1; s <= 20; s++) {
      for (const t of ['new', 'retrain', 'corp']) {
        for (const cert of [false, true]) {
          const i = { hours: h, seats: s, coupon: 0, type: t, hasCert: cert };
          const a = S.feeSpec(i), b = S.calcFee(i);
          assert.strictEqual(b.payable, a.payable, JSON.stringify(i));
          assert.strictEqual(b.discount, a.discount, JSON.stringify(i));
          assert.strictEqual(b.rate, a.rate, JSON.stringify(i));
          n++;
        }
      }
    }
  }
  assert.ok(n >= 4000, '网格规模应足够大，实际 ' + n);
});

test('SPEC-02 手工核对的小样例：档位与复训不叠加', () => {
  // 10 课时 1 人 无证：1200 元，无折扣
  assert.strictEqual(S.feeSpec(base()).payable, 1200);
  // 10 课时 3 人：95 折，折扣 60，应付 1140
  assert.strictEqual(S.feeSpec(base({ seats: 3 })).payable, 1140);
  // 复训 + 3 人：取更优 7 折，折扣 360，应付 840（不叠加）
  assert.strictEqual(S.feeSpec(base({ seats: 3, type: 'retrain' })).payable, 840);
  // 持证单价 90：900 元
  assert.strictEqual(S.feeSpec(base({ hasCert: true })).payable, 900);
});

test('SPEC-03 四舍五入与负值截断', () => {
  // 11 课时 持证 3 人：base 990，990×5% = 49.5 → 50，应付 940
  const r1 = S.feeSpec(base({ hours: 11, seats: 3, hasCert: true }));
  assert.strictEqual(r1.discount, 50);
  assert.strictEqual(r1.payable, 940);
  // 1 课时 持证 券 500：base 90，应付为负 → 截断为 0
  const r2 = S.feeSpec(base({ hours: 1, coupon: 500, hasCert: true }));
  assert.strictEqual(r2.payable, 0);
  assert.strictEqual(r2.capped, true);
});

test('SPEC-04 边界值：2 人无折扣、3 人 95 折、20 人 85 折、21 人非法', () => {
  assert.strictEqual(S.feeSpec(base({ seats: 2 })).groupRate, 1);
  assert.strictEqual(S.feeSpec(base({ seats: 3 })).groupRate, 0.95);
  assert.strictEqual(S.feeSpec(base({ seats: 5 })).groupRate, 0.95);
  assert.strictEqual(S.feeSpec(base({ seats: 6 })).groupRate, 0.90);
  assert.strictEqual(S.feeSpec(base({ seats: 10 })).groupRate, 0.90);
  assert.strictEqual(S.feeSpec(base({ seats: 11 })).groupRate, 0.85);
  assert.strictEqual(S.feeSpec(base({ seats: 20 })).groupRate, 0.85);
  assert.strictEqual(S.feeSpec(base({ seats: 21 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ seats: 0 })).ok, false);
});

test('SPEC-05 非法输入：非整数、越界、枚举外、非布尔', () => {
  assert.strictEqual(S.feeSpec(base({ hours: 10.5 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ hours: 0 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ hours: 121 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ coupon: 501 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ coupon: -1 })).ok, false);
  assert.strictEqual(S.feeSpec(base({ type: 'vip' })).ok, false);
  assert.strictEqual(S.feeSpec(base({ hasCert: 'yes' })).ok, false);
  assert.strictEqual(S.feeSpec(null).ok, false);
});

test('SPEC-06 四个注入缺陷都真实改变输出，且可被检出', () => {
  const grid = [];
  for (let h = 1; h <= 120; h += 7) {
    for (let s = 1; s <= 20; s++) {
      for (const t of ['new', 'retrain', 'corp']) {
        for (const c of [0, 120, 500]) grid.push({ hours: h, seats: s, coupon: c, type: t, hasCert: s % 2 === 0 });
      }
    }
  }
  S.DEFECTS.forEach((d) => {
    const killed = grid.filter((i) => S.compareFee(S.feeSpec(i), S.calcWithDefects(i, [d.id])).length > 0).length;
    assert.ok(killed > 0, d.id + ' 在任何输入上都没有改变输出，注入无效');
  });
});

test('SPEC-07 插桩不改变业务输出（覆盖率采集点无副作用）', () => {
  const tracer = { b() {}, c() {}, d() {}, note() {} };
  const inputs = [base(), base({ seats: 7 }), base({ hasCert: true, coupon: 300 }), base({ hours: 0 })];
  inputs.forEach((i) => {
    assert.deepStrictEqual(S._calcFee(i, tracer, null), S.calcFee(i));
  });
});

test('SPEC-08 compareFee 能区分并定位差异字段', () => {
  const a = S.feeSpec(base({ seats: 3 }));
  const b = S.calcWithDefects(base({ seats: 2 }), ['SEAT_BOUNDARY']);
  const c = S.feeSpec(base({ seats: 2 }));
  assert.deepStrictEqual(S.compareFee(c, b), ['折扣率', '折扣额', '应付金额']);
  assert.deepStrictEqual(S.compareFee(a, a), []);
  assert.deepStrictEqual(S.compareFee(S.feeSpec(base({ hours: -1 })), S.feeSpec(base({ hours: -1 }))), []);
});

test('SPEC-09 资格判定：参考规格覆盖 16 种组合且无矛盾', () => {
  const combos = S.allCombos();
  assert.strictEqual(combos.length, 16);
  const acts = combos.map((c) => S.appSpecAction(c));
  assert.ok(acts.every((a) => ['PASS', 'COND_A', 'COND_B', 'REJECT'].includes(a)));
  // 年龄不符一律拒绝
  combos.filter((c) => !c.C1).forEach((c) => assert.strictEqual(S.appSpecAction(c), 'REJECT'));
  // 学历+年限达标即通过，与推荐函无关
  combos.filter((c) => c.C1 && c.C2 && c.C3).forEach((c) => assert.strictEqual(S.appSpecAction(c), 'PASS'));
});

test('SPEC-10 状态机：开关改变有效迁移集合，分母随之变化', () => {
  const all = S.activeTransitions({ allowRevise: true, allowReopen: true, allowPromote: true });
  const none = S.activeTransitions({});
  assert.strictEqual(all.length, 14);
  assert.strictEqual(none.length, 11);
  assert.ok(!none.some((t) => t.toggle), '关闭开关后不应存在可选迁移');
});

test('SPEC-11 固定种子随机可复现', () => {
  const a = S.mulberry32(20261112);
  const b = S.mulberry32(20261112);
  for (let i = 0; i < 8; i++) assert.strictEqual(a(), b());
});

test('SPEC-12 pct 在分母为 0 时返回 null，不返回 0 或 100', () => {
  assert.strictEqual(S.pct(0, 0), null);
  assert.strictEqual(S.pct(1, 4, 1), 25);
  assert.strictEqual(S.pct(1, 3, 1), 33.3);
});

/* ============================================================================
 * regression.js — 自动化回归测试与持续集成（M7）
 * 用例的预期值由规格独立推导并以字面量写死在 SUITE 中；
 * tests/regression.test.js 另行校验这些字面量与 feeSpec 的一致性（防止规格漂移），
 * 但运行时不读取 feeSpec 的结果作为“正确答案”。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spec.js'), require('./fsm.js'));
  } else {
    root.QT = root.QT || {};
    Object.assign(root.QT, factory(root.QT, root.QT));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S, F) {
  'use strict';

  var now = (typeof performance !== 'undefined' && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  var MODULES = [
    { key: 'fee', label: '费用计算', touch: 'src/fee.js' },
    { key: 'app', label: '资格审核', touch: 'src/app.js' },
    { key: 'fsm', label: '预约状态机', touch: 'src/booking.js' },
    { key: 'form', label: '表单校验', touch: 'src/form.js' }
  ];

  /* 用例：expect 为断言字段；smoke 表示冒烟子集 */
  var SUITE = [
    // ---- 费用计算（受 v1.2-rc1 变更影响） ----
    { id: 'F01', module: 'fee', smoke: true, name: '1 课时 1 人 无证：不打折',
      kind: 'fee', input: { hours: 1, seats: 1, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 0, payable: 120 } },
    { id: 'F02', module: 'fee', smoke: true, name: '2 人：边界上仍无团体折扣',
      kind: 'fee', input: { hours: 10, seats: 2, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 0, payable: 1200 } },
    { id: 'F03', module: 'fee', smoke: true, name: '3 人：95 折',
      kind: 'fee', input: { hours: 10, seats: 3, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 60, payable: 1140 } },
    { id: 'F04', module: 'fee', smoke: false, name: '5 人：95 折上界',
      kind: 'fee', input: { hours: 10, seats: 5, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 60, payable: 1140 } },
    { id: 'F05', module: 'fee', smoke: false, name: '6 人：90 折',
      kind: 'fee', input: { hours: 10, seats: 6, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 120, payable: 1080 } },
    { id: 'F06', module: 'fee', smoke: false, name: '10 人：90 折上界',
      kind: 'fee', input: { hours: 10, seats: 10, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 120, payable: 1080 } },
    { id: 'F07', module: 'fee', smoke: false, name: '11 人：85 折',
      kind: 'fee', input: { hours: 10, seats: 11, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 180, payable: 1020 } },
    { id: 'F08', module: 'fee', smoke: false, name: '20 人：85 折上界',
      kind: 'fee', input: { hours: 10, seats: 20, coupon: 0, type: 'new', hasCert: false }, expect: { ok: true, discount: 180, payable: 1020 } },
    { id: 'F09', module: 'fee', smoke: true, name: '复训 7 折',
      kind: 'fee', input: { hours: 10, seats: 1, coupon: 0, type: 'retrain', hasCert: false }, expect: { ok: true, discount: 360, payable: 840 } },
    { id: 'F10', module: 'fee', smoke: false, name: '复训 + 团体：不叠加，取 7 折',
      kind: 'fee', input: { hours: 10, seats: 3, coupon: 0, type: 'retrain', hasCert: false }, expect: { ok: true, discount: 360, payable: 840 } },
    { id: 'F11', module: 'fee', smoke: false, name: '持证单价 90 元',
      kind: 'fee', input: { hours: 10, seats: 1, coupon: 0, type: 'new', hasCert: true }, expect: { ok: true, discount: 0, payable: 900 } },
    { id: 'F12', module: 'fee', smoke: true, name: '券大于应付：截断为 0',
      kind: 'fee', input: { hours: 1, seats: 1, coupon: 500, type: 'new', hasCert: true }, expect: { ok: true, discount: 0, payable: 0, capped: true } },
    { id: 'F13', module: 'fee', smoke: false, name: '120 课时 20 人企业团体',
      kind: 'fee', input: { hours: 120, seats: 20, coupon: 0, type: 'corp', hasCert: false }, expect: { ok: true, discount: 2160, payable: 12240 } },
    { id: 'F14', module: 'fee', smoke: false, name: '折扣额 49.5 元：四舍五入为 50',
      kind: 'fee', input: { hours: 11, seats: 3, coupon: 0, type: 'new', hasCert: true }, expect: { ok: true, discount: 50, payable: 940 } },
    { id: 'F15', module: 'fee', smoke: false, name: '折扣额 99 元：整数不受取整影响',
      kind: 'fee', input: { hours: 11, seats: 6, coupon: 0, type: 'new', hasCert: true }, expect: { ok: true, discount: 99, payable: 891 } },
    { id: 'F16', module: 'fee', smoke: false, name: '折扣额 148.5 元：四舍五入为 149',
      kind: 'fee', input: { hours: 11, seats: 11, coupon: 0, type: 'new', hasCert: true }, expect: { ok: true, discount: 149, payable: 841 } },
    // ---- 资格审核（不受本次变更影响） ----
    { id: 'A01', module: 'app', smoke: true, name: '大专 2 年：通过',
      kind: 'app', input: { age: 25, edu: 'college', years: 2, recommend: false }, expect: { action: 'PASS' } },
    { id: 'A02', module: 'app', smoke: false, name: '15 岁：拒绝',
      kind: 'app', input: { age: 15, edu: 'bachelor', years: 5, recommend: true }, expect: { action: 'REJECT' } },
    { id: 'A03', module: 'app', smoke: false, name: '61 岁：拒绝',
      kind: 'app', input: { age: 61, edu: 'bachelor', years: 5, recommend: true }, expect: { action: 'REJECT' } },
    { id: 'A04', module: 'app', smoke: false, name: '高中 2 年 + 推荐函：补学历材料',
      kind: 'app', input: { age: 30, edu: 'senior', years: 2, recommend: true }, expect: { action: 'COND_B' } },
    { id: 'A05', module: 'app', smoke: false, name: '本科 1 年 + 推荐函：补工作证明',
      kind: 'app', input: { age: 30, edu: 'bachelor', years: 1, recommend: true }, expect: { action: 'COND_A' } },
    { id: 'A06', module: 'app', smoke: false, name: '本科 1 年 无推荐函：拒绝',
      kind: 'app', input: { age: 30, edu: 'bachelor', years: 1, recommend: false }, expect: { action: 'REJECT' } },
    { id: 'A07', module: 'app', smoke: false, name: '60 岁边界：仍可报',
      kind: 'app', input: { age: 60, edu: 'bachelor', years: 10, recommend: false }, expect: { action: 'PASS' } },
    { id: 'A08', module: 'app', smoke: false, name: '16 岁边界：可报（学历年限达标）',
      kind: 'app', input: { age: 16, edu: 'college', years: 2, recommend: false }, expect: { action: 'PASS' } },
    // ---- 预约状态机 ----
    { id: 'S01', module: 'fsm', smoke: true, name: '主流程至结业',
      kind: 'fsm', events: ['submit', 'startReview', 'approve', 'book', 'attend', 'complete'], seatsLeft: 3, expect: { final: 'COMPLETED', invalid: 0 } },
    { id: 'S02', module: 'fsm', smoke: false, name: '名额为 0 时预约转候补',
      kind: 'fsm', events: ['submit', 'startReview', 'approve', 'book'], seatsLeft: 0, expect: { final: 'WAITLIST', invalid: 0 } },
    { id: 'S03', module: 'fsm', smoke: false, name: '草稿态直接预约：无效操作被拒绝',
      kind: 'fsm', events: ['book'], seatsLeft: 2, expect: { final: 'DRAFT', invalid: 1 } },
    { id: 'S04', module: 'fsm', smoke: false, name: '预约后取消',
      kind: 'fsm', events: ['submit', 'startReview', 'approve', 'book', 'cancel'], seatsLeft: 2, expect: { final: 'CANCELLED', invalid: 0 } },
    // ---- 表单校验 ----
    { id: 'V01', module: 'form', smoke: true, name: '课时 10.5：非整数被拒',
      kind: 'form', input: { hours: 10.5, seats: 1, coupon: 0, type: 'new', hasCert: false }, expect: { ok: false } },
    { id: 'V02', module: 'form', smoke: false, name: '学员类型 vip：非法枚举被拒',
      kind: 'form', input: { hours: 10, seats: 1, coupon: 0, type: 'vip', hasCert: false }, expect: { ok: false } }
  ];

  var TOGGLES_NONE = { allowRevise: false, allowReopen: false, allowPromote: false };

  function executeCase(c, version) {
    var t0 = now();
    var actual = {}, pass = true, diffs = [];
    if (c.kind === 'fee') {
      var r = S.calcFeeVersion(c.input, version);
      actual = { ok: !!r.ok, discount: r.discount, payable: r.payable, capped: r.capped };
      Object.keys(c.expect).forEach(function (k) {
        if (actual[k] !== c.expect[k]) {
          pass = false;
          diffs.push(k + '：预期 ' + c.expect[k] + '，实际 ' + actual[k]);
        }
      });
    } else if (c.kind === 'app') {
      var cs = S.appConditions(c.input);
      var act = S.appSpecAction(cs);
      actual = { action: act };
      if (act !== c.expect.action) { pass = false; diffs.push('动作：预期 ' + c.expect.action + '，实际 ' + act); }
    } else if (c.kind === 'fsm') {
      var run = F.fsmRun({ events: c.events, toggles: TOGGLES_NONE, seatsLeft: c.seatsLeft });
      actual = { final: run.final, invalid: run.invalid.length };
      if (actual.final !== c.expect.final) { pass = false; diffs.push('终态：预期 ' + c.expect.final + '，实际 ' + actual.final); }
      if (actual.invalid !== c.expect.invalid) { pass = false; diffs.push('无效操作数：预期 ' + c.expect.invalid + '，实际 ' + actual.invalid); }
    } else if (c.kind === 'form') {
      var v = S.validateFeeInput(c.input);
      actual = { ok: v.ok };
      if (v.ok !== c.expect.ok) { pass = false; diffs.push('校验结果：预期 ' + c.expect.ok + '，实际 ' + v.ok); }
    }
    var elapsed = now() - t0;
    return {
      id: c.id, name: c.name, module: c.module, smoke: !!c.smoke, kind: c.kind,
      expected: c.expect, actual: actual, pass: pass, diffs: diffs, ms: elapsed
    };
  }

  /* 执行：范围 all / smoke / affected */
  function run(opts) {
    var version = opts.version || 'v1.0';
    var scope = opts.scope || 'all';
    var selectedModules = opts.modules || ['fee', 'app', 'fsm', 'form'];
    var affected = (S.VERSIONS[version] && version === 'v1.2-rc1') ? ['fee'] : [];
    var retries = opts.retries || 0;

    var pool = SUITE.filter(function (c) { return selectedModules.indexOf(c.module) >= 0; });
    if (scope === 'smoke') pool = pool.filter(function (c) { return c.smoke; });
    if (scope === 'affected') pool = pool.filter(function (c) { return affected.indexOf(c.module) >= 0; });

    var results = pool.map(function (c) {
      var r = executeCase(c, version);
      var attempts = 1;
      while (!r.pass && attempts <= retries) {
        var again = executeCase(c, version);
        again.attempts = attempts + 1;
        r = again;
        attempts++;
      }
      r.attempts = r.attempts || 1;
      return r;
    });

    var passed = results.filter(function (r) { return r.pass; }).length;
    var failed = results.length - passed;
    var smokeResults = results.filter(function (r) { return r.smoke; });
    var smokeFailed = smokeResults.filter(function (r) { return !r.pass; }).length;
    var affectedResults = results.filter(function (r) { return affected.indexOf(r.module) >= 0; });

    var gate = {
      minPassRate: opts.minPassRate == null ? 100 : opts.minPassRate,
      maxFailures: opts.maxFailures == null ? 0 : opts.maxFailures,
      requireSmoke: opts.requireSmoke !== false,
      requireAffected: opts.requireAffected !== false
    };
    var checks = [];
    var passRate = S.pct(passed, results.length, 1);
    checks.push({
      key: 'passRate', label: '回归通过率 ≥ ' + gate.minPassRate + '%',
      ok: results.length > 0 && (passRate !== null && passRate >= gate.minPassRate),
      detail: results.length === 0 ? '空用例集：分母为 0，判定为不通过'
        : passRate + '%（' + passed + '/' + results.length + '）'
    });
    checks.push({
      key: 'maxFail', label: '失败用例数 ≤ ' + gate.maxFailures,
      ok: failed <= gate.maxFailures, detail: failed + ' 条失败'
    });
    checks.push({
      key: 'smoke', label: '冒烟用例全部通过',
      ok: !gate.requireSmoke || (smokeResults.length > 0 && smokeFailed === 0),
      detail: !gate.requireSmoke ? '已关闭该项检查' :
        (smokeResults.length === 0 ? '本次范围未包含冒烟用例' : smokeFailed + ' 条冒烟失败')
    });
    checks.push({
      key: 'affected', label: '受影响模块已被回归覆盖',
      ok: !gate.requireAffected || affected.length === 0 || affectedResults.length > 0,
      detail: affected.length === 0 ? '本版本无受影响模块标记' :
        (affectedResults.length ? '已执行 ' + affectedResults.length + ' 条（' + affected.join('/') + '）' : '受影响模块 ' + affected.join('/') + ' 未被任何用例覆盖')
    });

    return {
      version: version, scope: scope, modules: selectedModules, affected: affected,
      results: results, passed: passed, failed: failed,
      passRate: passRate,
      totalMs: results.reduce(function (a, r) { return a + r.ms; }, 0),
      checks: checks,
      gatePassed: checks.every(function (c) { return c.ok; }),
      empty: results.length === 0
    };
  }

  /* 流水线阶段：每阶段结论均来自真实数据 */
  function pipeline(opts, runResult, m1Evidence) {
    var stages = [];
    stages.push({
      key: 'checkout', name: '检出代码', ok: true,
      detail: '版本 ' + runResult.version + '（' + (S.VERSIONS[runResult.version] || {}).note + '）'
    });
    stages.push({
      key: 'static', name: '静态检查',
      ok: m1Evidence ? m1Evidence.status !== 'fail' : true,
      skipped: !m1Evidence,
      detail: m1Evidence ? ('引用 M1 结论：' + (m1Evidence.status === 'pass' ? '通过' : m1Evidence.status === 'warn' ? '有告警' : '未通过'))
        : '本实验未引用 M1 证据 → 该阶段视为未执行（不计入门禁）'
    });
    var smoke = runResult.results.filter(function (r) { return r.smoke; });
    var smokeOk = smoke.length === 0 ? null : smoke.every(function (r) { return r.pass; });
    stages.push({
      key: 'smoke', name: '冒烟测试', ok: smokeOk === null ? true : smokeOk, skipped: smokeOk === null,
      detail: smoke.length === 0 ? '本次范围未包含冒烟用例' : (smoke.filter(function (r) { return r.pass; }).length + '/' + smoke.length + ' 通过')
    });
    stages.push({
      key: 'regression', name: '全量回归', ok: runResult.failed === 0,
      detail: runResult.passed + '/' + runResult.results.length + ' 通过，失败 ' + runResult.failed
    });
    stages.push({
      key: 'gate', name: '质量门禁', ok: runResult.gatePassed,
      detail: runResult.checks.filter(function (c) { return !c.ok; }).length === 0 ? '全部检查通过'
        : runResult.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label; }).join('；') + ' 未满足'
    });
    stages.push({
      key: 'artifact', name: '产物归档', ok: runResult.gatePassed, skipped: !runResult.gatePassed,
      detail: runResult.gatePassed ? '允许合入并归档测试报告' : '门禁未通过：不产生可发布产物'
    });
    return stages;
  }

  return {
    RG_MODULES: MODULES,
    RG_SUITE: SUITE,
    rgRun: run,
    rgExecuteCase: executeCase,
    rgPipeline: pipeline
  };
});

/* ============================================================================
 * m7.js — 实验七：自动化回归测试与持续集成
 * 用例为真实断言函数，在浏览器内批量执行；耗时是实测毫秒，不是编造数字。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;

  function plan(st) {
    var affected = st.version === 'v1.2-rc1' ? ['fee'] : [];
    var pool = Q.RG_SUITE.filter(function (c) { return (st.modules || []).indexOf(c.module) >= 0; });
    if (st.scope === 'smoke') pool = pool.filter(function (c) { return c.smoke; });
    if (st.scope === 'affected') pool = pool.filter(function (c) { return affected.indexOf(c.module) >= 0; });
    return {
      count: pool.length,
      modules: st.modules, scope: st.scope, affected: affected,
      smokeCount: pool.filter(function (c) { return c.smoke; }).length
    };
  }

  function doRun(st) {
    return Q.rgRun({
      version: st.version, scope: st.scope, modules: st.modules,
      minPassRate: st.minPassRate, maxFailures: st.maxFailures, retries: st.retries,
      requireSmoke: st.requireSmoke !== false, requireAffected: st.requireAffected !== false
    });
  }

  function compute(st) {
    var p = plan(st);
    var result = st.lastRun || null;
    var stale = !!st.stale;
    var m1 = WB.evidence && WB.evidence.m1 ? WB.evidence.m1 : null;
    var stages = result ? Q.rgPipeline({}, result, m1) : null;
    return { plan: p, result: result, stale: stale, stages: stages };
  }

  function viz(res, st) {
    var p = res.plan, r = res.result;
    var h = '';

    h += '<section class="card"><h3 class="card-h">执行配置预览<span class="card-hint">参数一变，旧结果立即失效</span></h3><div class="card-b">';
    h += '<div class="metrics mb10">' +
      '<div class="metric"><div class="m-l">将执行用例</div><div class="m-v">' + p.count + '</div></div>' +
      '<div class="metric"><div class="m-l">其中冒烟</div><div class="m-v">' + p.smokeCount + '</div></div>' +
      '<div class="metric"><div class="m-l">受影响模块</div><div class="m-v" style="font-size:13px">' + (p.affected.length ? p.affected.join('/') : '无') + '</div></div>' +
      '<div class="metric"><div class="m-l">门禁阈值</div><div class="m-v" style="font-size:13px">≥' + st.minPassRate + '%</div></div>' +
      '</div>';
    h += '<div class="btn-row">' +
      '<button class="btn primary" data-act="run-pipeline">执行流水线（浏览器内真实运行）</button>' +
      (r ? '<span class="tiny muted">上次执行：' + E(st.lastRunAt || '—') + '</span>' : '<span class="tiny muted">尚未执行</span>') +
      '</div>';
    if (res.stale && r) {
      h += '<div class="callout warn mt6"><b>配置已变更，下方结果来自上一次执行，已失效。</b>' +
        '请重新执行后再下结论。</div>';
    }
    h += '</div></section>';

    if (!r) {
      return h + '<section class="card"><div class="card-b">' + Q.empty('点击“执行流水线”，会在你的浏览器里真实运行 ' + p.count + ' 条断言用例。') + '</div></section>';
    }

    h += '<section class="card"><h3 class="card-h">流水线阶段<span class="card-hint">每阶段结论来自真实数据</span></h3><div class="card-b">' +
      '<div class="pipe">' + res.stages.map(function (s, i) {
        var cls = s.skipped ? 'skip' : (s.ok ? 'ok' : 'bad');
        var glyph = s.skipped ? '–' : (s.ok ? '✓' : '✕');
        return '<div class="pipe-step ' + cls + '"><div class="ps-n">阶段 ' + (i + 1) + '</div>' +
          '<div class="ps-s">' + glyph + ' ' + E(s.name) + '</div>' +
          '<div class="ps-d">' + E(s.detail) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="chart-cap">“静态检查”阶段引用 M1 的证据；未做过 M1 时标为“未执行”，不视为通过。</div>' +
      '</div></section>';

    h += '<section class="card"><h3 class="card-h">回归结果<span class="card-hint">' + r.passed + ' / ' + r.results.length +
      ' 通过，耗时 ' + Q.num(r.totalMs, 2) + ' ms</span></h3><div class="card-b">';
    h += '<div class="metrics mb10">' +
      '<div class="metric hl"><div class="m-l">通过率</div><div class="m-v">' + (r.passRate == null ? '—' : Q.num(r.passRate, 1) + '<small>%</small>') + '</div></div>' +
      '<div class="metric"><div class="m-l">通过</div><div class="m-v">' + r.passed + '</div></div>' +
      '<div class="metric"><div class="m-l">失败</div><div class="m-v">' + r.failed + '</div></div>' +
      '<div class="metric"><div class="m-l">门禁</div><div class="m-v" style="font-size:14px">' + (r.gatePassed ? '通过' : '阻断') + '</div></div>' +
      '<div class="metric"><div class="m-l">实测总耗时</div><div class="m-v" style="font-size:14px">' + Q.num(r.totalMs, 2) + '<small>ms</small></div></div>' +
      '</div>';

    var rows = r.results.map(function (x) {
      return {
        cls: x.pass ? 'row-pass' : 'row-fail',
        cells: [
          { html: '<b>' + E(x.id) + '</b>' + (x.smoke ? ' <span class="chip">冒烟</span>' : '') },
          { v: x.name },
          { html: '<span class="chip">' + E(x.module) + '</span>' },
          { html: x.pass ? Q.badge('pass', '通过') : Q.badge('fail', '失败') },
          { html: '<span class="mono tiny">' + E(JSON.stringify(x.actual)) + '</span>' },
          { html: '<span class="mono tiny">' + E(JSON.stringify(x.expected)) + '</span>' },
          { html: '<span class="num">' + Q.num(x.ms, 3) + '</span>' }
        ]
      };
    });

    var fails = r.results.filter(function (x) { return !x.pass; });
    if (fails.length) {
      h += '<div class="callout fail mt6"><b>失败用例详情（' + fails.length + ' 条）：</b></div>' +
        fails.map(function (x) {
          return '<div class="listitem mt6"><span class="chip">' + E(x.id) + '</span> <b>' + E(x.name) + '</b>' +
            '<div class="tiny">' + x.diffs.map(function (d) { return E(d); }).join('<br>') + '</div></div>';
        }).join('');
    }
    h += '</div></section>';

    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>查看全部回归执行明细</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">' + r.results.length + ' 条用例 · 失败 ' + r.failed + ' 条</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b flush"><div class="tbl-scroll">' +
      Q.table(['用例', '名称', '模块', '结果', '实际', '预期', '耗时(ms)'], rows) +
      '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var r = res.result;
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';
    if (!r) {
      return h + '<p class="tiny muted">先执行流水线，这里才会给出可验证的结论。</p></div></section>';
    }

    h += '<div class="concl ' + (r.gatePassed ? 'ok' : 'no') + '">' +
      '<div class="cc-h">' + (r.gatePassed ? '✓' : '✕') + ' 门禁结论：' + (r.gatePassed ? '通过，允许合入' : '阻断，不允许合入') + '</div>' +
      '<div class="cc-b"><p><b>逐项校验：</b></p>' +
      r.checks.map(function (c) {
        return '<div class="checkrow ' + (c.ok ? 'ok' : 'no') + '"><span>' + (c.ok ? '✓' : '✕') + '</span>' +
          '<span><b>' + E(c.label) + '</b><br><span class="tiny muted">' + E(c.detail) + '</span></span></div>';
      }).join('') +
      '</div></div>';

    var affected = r.affected;
    var affectedCovered = r.results.filter(function (x) { return affected.indexOf(x.module) >= 0; });
    h += '<div class="concl ' + (affected.length && affectedCovered.length === 0 ? 'no' : 'ok') + '">' +
      '<div class="cc-h">' + (affected.length && affectedCovered.length === 0 ? '✕' : '✓') +
      ' 回归范围覆盖' + (affected.length ? '（受影响模块：' + E(affected.join('/')) + '）' : '（无受影响标记）') + '</div>' +
      '<div class="cc-b"><p>本次共执行 ' + r.results.length + ' 条（覆盖模块：' +
      E(Object.keys(r.results.reduce(function (a, x) { a[x.module] = 1; return a; }, {})).join('、')) + '）。</p>' +
      (affected.length && affectedCovered.length === 0
        ? '<p><b>风险提示：</b>受影响模块完全未纳入回归，此时“全绿”不具备护航意义。</p>'
        : '<p>受影响模块已纳入执行，' + (r.gatePassed ? '且全部校验通过。' : '当前仍存在失败断言。') + '</p>') +
      '</div></div>';

    h += '<div class="concl insight"><div class="cc-h">◆ 为什么“冒烟失败”能一票否决？</div><div class="cc-b">' +
      '<p>当前通过率 ' + (r.passRate == null ? '—' : Q.num(r.passRate, 1) + '%') + '、失败 ' + r.failed +
      ' 条。CI 门禁由四项独立判据串联（通过率、失败上限、冒烟核心、影响范围），确保高通过率不会掩盖核心链路崩溃。</p>' +
      '</div></div>';

    // 版本对比
    h += '<div class="btn-row mt10"><button class="btn sm" data-act="compare">与 v1.0 基线对比（同范围、同阈值）</button></div>';
    if (st.compareResult) {
      var c = st.compareResult;
      h += '<div class="mt10">' + Q.table(['对比项', 'v1.0 基线', '当前 ' + c.ver], [
        ['执行用例', String(c.base.total), String(c.cur.total)],
        ['通过', String(c.base.passed), String(c.cur.passed)],
        ['失败', String(c.base.failed), String(c.cur.failed)],
        ['通过率', (c.base.passRate == null ? '—' : Q.num(c.base.passRate, 1) + '%'),
          (c.cur.passRate == null ? '—' : Q.num(c.cur.passRate, 1) + '%')],
        ['门禁', c.base.gate ? '通过' : '阻断', c.cur.gate ? '通过' : '阻断']
      ]) + '</div>';
      if (c.newFails.length) {
        h += '<div class="callout warn mt6"><b>新增失败（回归）：</b>' + E(c.newFails.join('、')) +
          '　在 v1.0 基线均通过，确认由本次变更引入。</div>';
      } else {
        h += '<div class="callout mt6">两版本失败集合一致，未发现新增回归。</div>';
      }
    }

    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm7', no: 7, navLabel: '回归与 CI',
    title: '自动化回归测试与持续集成',
    subtitle: '把用例固化为可重复的自动断言与流水线门禁，实时验证改动是否引入回归。',
    chapter: '第11章 11.1–11.4 自动化测试与持续集成',
    knowledge: '区分回归测试与自动化测试；用真实断言执行结果判断回归范围；理解质量门禁是策略而非结果。',
    minutes: 15,
    goals: [
      '说清回归的触发条件与范围',
      '读懂失败用例的预期与实际',
      '解释阈值如何改变门禁结论'
    ],
    blockers: [
      ['跑通一次 = 回归通过', '没有基线就没有回归'],
      ['失败就改用例', '把断言改宽是最常见的自欺'],
      ['门禁 = 测试结果', '门禁是策略，阈值是人定的']
    ],
    theory: '<p>回归要回答的不是“系统对不对”，而是“这次改动有没有弄坏原来对的”。套件越大越安全，也越慢。</p>' +
      '<div class="formula">回归通过率 = 通过 ÷ 执行（空集判不通过）\n' +
      '门禁 = 通过率 ∧ 失败数 ∧ 冒烟 ∧ 影响范围</div>',
    prereq: '断言与“预期 vs 实际”的读法。',
    scopeNote: '提交前 / 合并前的自动化回归。',
    notDo: '不接真实 CI，不做并行调度。',

    params: [
      {
        key: 'version', type: 'select', label: '被测版本',
        options: [
          { v: 'v1.0', l: 'v1.0 初版（期望全绿）' },
          { v: 'v1.1', l: 'v1.1 重构（行为应完全一致）' },
          { v: 'v1.2-rc1', l: 'v1.2-rc1 候选（含 2 处回归缺陷）' }
        ],
        hint: '纯重构版本，出现失败才是真回归。'
      },
      {
        key: 'scope', type: 'select', label: '执行范围',
        options: [
          { v: 'all', l: '全量回归（所选模块全部用例）' },
          { v: 'smoke', l: '仅冒烟子集' },
          { v: 'affected', l: '仅受影响模块' }
        ],
        hint: '范围越小越快，也越容易漏跨模块回归。'
      },
      {
        key: 'modules', type: 'checks', label: '纳入回归的模块',
        options: Q.RG_MODULES.map(function (m) { return { v: m.key, l: m.label, s: m.touch }; })
      },
      { key: 'minPassRate', group: '门禁策略', type: 'range', label: '门禁：通过率下限', min: 50, max: 100, step: 1, fmt: function (v) { return v + '%'; } },
      { key: 'maxFailures', group: '门禁策略', type: 'number', label: '门禁：允许失败用例数', min: 0, max: 10, step: 1 },
      { key: 'requireSmoke', group: '门禁策略', type: 'check', label: '冒烟用例失败即一票否决', sub: '关闭后失败只计入通过率与失败数', value: true },
      { key: 'requireAffected', group: '门禁策略', type: 'check', label: '受影响模块必须被覆盖', sub: '关闭后“没测”不再算阻断', value: true },
      {
        key: 'retries', type: 'select', label: '失败重试次数', group: '门禁策略',
        options: [{ v: 0, l: '不重试' }, { v: 1, l: '重试 1 次' }, { v: 2, l: '重试 2 次' }],
        hint: '重试会同时掩盖不稳定用例和真实缺陷。'
      }
    ],
    defaults: {
      version: 'v1.2-rc1', scope: 'all',
      modules: ['fee', 'app', 'fsm', 'form'],
      minPassRate: 100, maxFailures: 0, retries: 0,
      requireSmoke: true, requireAffected: true,
      lastRun: null, lastRunAt: null, stale: false, compareResult: null
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onParam: function (key, st) {
      if (key === 'modules') {
        // 多选改变时也要标记失效
      }
      st.stale = true;
      st.compareResult = null;
    },

    onAction: function (name, arg, st) {
      if (name === 'run-pipeline') {
        var r = doRun(st);
        st.lastRun = r;
        st.lastRunAt = new Date().toLocaleString('zh-CN', { hour12: false });
        st.stale = false;
        WB.toast('执行完成：' + r.passed + '/' + r.results.length + ' 通过，' + Q.num(r.totalMs, 2) + ' ms', r.gatePassed ? '' : 'warn');
        return true;
      }
      if (name === 'compare') {
        var base = Q.rgRun({
          version: 'v1.0', scope: st.scope, modules: st.modules,
          minPassRate: st.minPassRate, maxFailures: st.maxFailures, retries: st.retries,
          requireSmoke: st.requireSmoke !== false, requireAffected: st.requireAffected !== false
        });
        var cur = st.lastRun || doRun(st);
        var baseFails = base.results.filter(function (x) { return !x.pass; }).map(function (x) { return x.id; });
        var curFails = cur.results.filter(function (x) { return !x.pass; }).map(function (x) { return x.id; });
        st.compareResult = {
          ver: st.version,
          base: { total: base.results.length, passed: base.passed, failed: base.failed, passRate: base.passRate, gate: base.gatePassed },
          cur: { total: cur.results.length, passed: cur.passed, failed: cur.failed, passRate: cur.passRate, gate: cur.gatePassed },
          newFails: curFails.filter(function (id) { return baseFails.indexOf(id) < 0; })
        };
        return true;
      }
      return false;
    },

    evidence: function (res, st) {
      var r = res.result;
      if (!r) {
        return { disabled: true, status: 'fail', coverage: null, label: '回归通过率', defects: [], note: '尚未执行流水线。' };
      }
      var fails = r.results.filter(function (x) { return !x.pass; });
      return {
        status: r.gatePassed ? 'pass' : (r.passRate >= 90 ? 'warn' : 'fail'),
        coverage: r.passRate,
        label: '回归通过率',
        defects: fails.map(function (x) { return x.id; }),
        note: r.version + '：' + r.passed + '/' + r.results.length + ' 通过，门禁' + (r.gatePassed ? '通过' : '阻断') +
          '（阈值 ≥' + st.minPassRate + '%，容忍 ' + st.maxFailures + ' 条失败）'
      };
    }
  });
})();

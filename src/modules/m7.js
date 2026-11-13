/* ============================================================================
 * m7.js — 第 7 关：自动化质检流水线（CI/CD 传送带）
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  function makeDefaults() {
    return {
      version: 'v1.2-rc1',
      scope: 'all',
      modules: ['fee', 'app', 'fsm', 'form'],
      minPassRate: 100,
      maxFailures: 0,
      retries: 0,
      requireSmoke: true,
      requireAffected: true,
      pulseTick: 0
    };
  }

  function buildParams() {
    return [
      {
        key: 'version', label: '送进流水线的代码版本', type: 'pills', wide: true,
        options: [
          { v: 'v1.0', l: '🟢 v1.0 稳定健康版' },
          { v: 'v1.1', l: '🟡 v1.1 小缺陷版' },
          { v: 'v1.2-rc1', l: '🚨 v1.2-rc1 冒烟炸雷版' }
        ]
      },
      {
        key: 'scope', label: '跑多少测试（时间 vs 深度）', type: 'pills',
        options: [
          { v: 'all', l: '全套 15 关质检' },
          { v: 'smoke', l: '⚡ 仅冒烟快测' },
          { v: 'affected', l: '🎯 只测改过处' }
        ]
      },
      { type: 'action', action: 'run-pipe', label: '▶️ 重新发动传送带质检', variant: 'primary' },
      {
        key: 'modules', label: '参与测试的业务模块', type: 'checks', advanced: true,
        options: Q.RG_MODULES.map(function (m) { return { v: m.key, l: m.label }; })
      },
      { key: 'requireSmoke', label: '冒烟一票否决（只要核心挂立刻停）', type: 'checkbox', advanced: true },
      { key: 'requireAffected', label: '必测本次改过的模块', type: 'checkbox', advanced: true },
      { key: 'minPassRate', label: '最低通过率红线 (%)', type: 'range', min: 70, max: 100, step: 5, unit: '%', advanced: true },
      { key: 'maxFailures', label: '最多容忍几条失败', type: 'range', min: 0, max: 5, step: 1, unit: ' 条', advanced: true }
    ];
  }

  function compute(st, WB) {
    var r = Q.rgRun({
      version: st.version, scope: st.scope, modules: st.modules,
      minPassRate: st.minPassRate, maxFailures: st.maxFailures,
      retries: st.retries, requireSmoke: st.requireSmoke, requireAffected: st.requireAffected
    });
    var pipe = Q.rgPipeline(st, r, WB && WB.evidence ? WB.evidence.m1 : null);
    return { r: r, pipe: pipe };
  }

  function viz(res, st) {
    var r = res.r;
    var kpis = Q.kpiStrip([
      { icon: r.gatePassed ? '🟢' : '🔴', label: '流水线最终落闸', value: r.gatePassed ? '绿灯放行' : '红灯拦下', sub: r.gatePassed ? '全部门槛亮绿通过' : '不修好禁止上线！', tone: r.gatePassed ? 'ok' : 'bad' },
      { icon: '📊', label: '回归测试通过率', value: Q.pctText(r.passRate), sub: r.passed + ' / ' + r.results.length + ' 条跑过', tone: r.failed === 0 && !r.empty ? 'ok' : 'warn' },
      { icon: '💥', label: '踩雷失败用例', value: r.failed + ' 条', sub: r.empty ? '警告：没有选任何测试' : '点击下面看具体哪条炸了', tone: r.failed ? 'bad' : 'ok' },
      { icon: '🎯', label: '改动波及模块', value: r.affected.length ? r.affected.join(', ') : '全部稳定', sub: '改哪测哪防漏网', tone: 'blue' }
    ]);

    var pipeIcons = { checkout: '📥', static: '🔍', regression: '🧪', gate: '🚦' };
    var pipeCard = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🏭 自动化质检传送带（第 ' + (st.pulseTick + 1) + ' 次运行）</span></div>' +
      '<span class="badge ' + (r.gatePassed ? 'pass' : 'fail') + '">' + (r.gatePassed ? '✅ 全线顺畅' : '🚧 流水线阻断') + '</span></div>' +
      '<div class="card-b"><div class="pipe">' +
      res.pipe.map(function (p, i) {
        var cls = p.skipped ? 'skip' : (p.ok ? 'ok' : 'bad');
        return '<div class="pipe-step ' + cls + '">' +
          '<div class="ps-n">第 ' + (i + 1) + ' 站 · ' + (pipeIcons[p.key] || '⚙️') + ' ' + Q.esc(p.name) + '</div>' +
          '<div class="ps-s">' + (p.skipped ? '⏭️ 跳过' : (p.ok ? '🟢 通过' : '🔴 红灯拦截')) + '</div>' +
          '<div class="ps-d">' + Q.esc(p.detail) + '</div>' +
        '</div>';
      }).join('') +
      '</div><div class="conveyor-belt"></div></div></div>';

    var checksHtml = '<div class="card"><div class="card-h"><span class="card-t">🚧 4 道红绿灯检验卡</span></div>' +
      '<div class="card-b">' + r.checks.map(function (c) {
        return '<div class="checkrow ' + (c.ok ? 'ok' : 'no') + '">' +
          '<span>' + (c.ok ? '✅' : '🚨') + '</span>' +
          '<div><b>' + Q.esc(c.label) + '</b> <span class="muted">· ' + Q.esc(c.detail) + '</span></div>' +
        '</div>';
      }).join('') + '</div></div>';

    var coachBox = r.empty
      ? Q.coach('bad', '警告：流水线啥也没测就想过关？门都没有！', '当用例数为 0 时，分母为 0 不能假装 100% 通过！请确保勾选了模块和合适的测试范围。')
      : (!r.gatePassed
        ? Q.coach('bad', '红灯警报！就算通过率有 ' + Q.pctText(r.passRate) + ' 也不能发布！',
          '别被“超过90%通过”骗了！核心<b>冒烟测试（Smoke）一旦挂掉</b>或改动的计费模块报错，老功能都算炸了，流水线必须一票否决直接亮红灯栏杆！试试切换到 <b>v1.0 稳定健康版</b> 对比绿灯通行。')
        : Q.coach('ok', '全线绿灯通过！放心进入下一关质量发布决策',
          '所有模块（包含核心冒烟与受改动影响的区域）100% 全绿，自动化流水线成功充当了你的全天候“上线门神”！'));

    var resRows = r.results.map(function (x) {
      return [
        { html: '<span class="mono">' + Q.esc(x.id) + '</span>' },
        x.name,
        { html: x.smoke ? Q.badge('warn', '核心冒烟') : Q.badge('mute', x.module) },
        { html: x.pass ? Q.badge('pass', '✅ 通过') : Q.badge('fail', '💥 失败') },
        x.pass ? '正常符合预期' : { html: '<span style="color:#b91c1c">' + Q.esc((x.diffs || []).join('；')) + '</span>' }
      ];
    });

    return kpis + pipeCard + checksHtml + coachBox +
      Q.drawer('📋 查看 ' + r.results.length + ' 条自动测试明细清单', r.failed + ' 条失败', Q.table(['编号', '用例说明', '标签', '结果', '抓到的异常'], resRows), false);
  }

  function onAction(act, el, st, WB) {
    if (act === 'run-pipe') {
      st.pulseTick = (st.pulseTick || 0) + 1;
      WB.toast('流水线传送带已重新质检一轮！');
      return true;
    }
  }

  function evidence(res) {
    var r = res.r;
    return {
      status: r.gatePassed ? 'pass' : 'fail',
      pass: r.gatePassed,
      coverage: r.passRate || 0,
      label: '回归通过率',
      defects: r.failed > 0 ? ['SEAT_BOUNDARY'] : [],
      summary: r.version + ' 通过 ' + r.passed + '/' + r.results.length + '（' + (r.gatePassed ? '绿灯放行' : '红灯拦停') + '）',
      metrics: { passRate: r.passRate, failed: r.failed }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢自动化回归流水线',
      '<b>每次改完代码就让机器人把老功能快速全重测一遍！</b>记住两招省时防漏诀窍：<b>冒烟快测</b>一挂立刻叫停（一票否决），再重点跑<b>受本次改动波及的模块</b>！');
  }

  window.WB.registerExp({
    id: 'm7', no: 7, group: '状态、结构与流水线',
    title: '质检流水线 · CI 传送带', chapter: '第 8 章 · 自动化与回归测试',
    hook: '提交代码自动过四关：哪怕93%通过，核心冒烟挂了也要拦',
    goal: ['理解“回归通过率高不代表能发布”的一票否决逻辑', '对比空用例集、稳定版与带雷版的流水线红绿灯切换'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

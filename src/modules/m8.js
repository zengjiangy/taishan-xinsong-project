/* ============================================================================
 * m8.js — 第 8 关：发布门禁火箭发射台
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  function makeDefaults() {
    return {
      useDemo: false,
      budget: 12,
      strategy: 'risk',
      kloc: 0.8,
      minCoverage: 80,
      minPassRate: 90,
      riskThreshold: 45,
      guess: null,
      revealed: false
    };
  }

  function buildParams(st) {
    return [
      { key: 'budget', label: '发版前只剩多少修复工时', type: 'range', min: 0, max: 40, step: 2, unit: ' 工时', wide: true },
      {
        key: 'strategy', label: '修 Bug 排队策略', type: 'pills',
        options: [
          { v: 'risk', l: '🔥 先修最致命的' },
          { v: 'cheap', l: '⚡ 先修最快的' },
          { v: 'order', l: '📋 按发现顺序' }
        ]
      },
      { type: 'action', action: 'toggle-demo', label: st.useDemo ? '🔄 切回我自己闯关的档案' : '🎁 没跑完前7关？一键载入演示包', variant: 'fun' },
      { key: 'riskThreshold', label: '可忍受的最高风险分红线', type: 'range', min: 15, max: 80, step: 5, unit: ' 分', advanced: true },
      { key: 'minCoverage', label: '要求前几关最低平均覆盖 (%)', type: 'range', min: 50, max: 100, step: 5, unit: '%', advanced: true },
      { key: 'minPassRate', label: '要求流水线最低通过率 (%)', type: 'range', min: 70, max: 100, step: 5, unit: '%', advanced: true }
    ];
  }

  function compute(st, WB) {
    var ev = st.useDemo ? Q.qaDemoEvidence() : Q.qaNormEvidence(WB && WB.evidence);
    var params = {
      severityWeight: Q.QA_DEFAULT_PARAMS.severityWeight,
      weights: Q.QA_DEFAULT_PARAMS.weights,
      kloc: st.kloc, densityRef: Q.QA_DEFAULT_PARAMS.densityRef,
      minCoverage: st.minCoverage, minPassRate: st.minPassRate,
      riskThreshold: st.riskThreshold, budget: st.budget, strategy: st.strategy
    };
    var risk = Q.qaComputeRisk(ev, params);
    var gate = Q.qaGate(ev, params, risk);
    return { ev: ev, params: params, risk: risk, gate: gate };
  }

  function viz(res, st) {
    var risk = res.risk;
    var gate = res.gate;
    var rColor = risk.risk <= st.riskThreshold ? '#10b981' : (risk.risk <= st.riskThreshold + 20 ? '#f59e0b' : '#ef4444');
    var vMap = {
      ALLOW: { icon: '🚀', txt: '允许发射！五灯全绿', tone: 'ok' },
      BLOCK: { icon: '🛑', txt: '红灯拦停！风险未过关', tone: 'bad' },
      NO_EVIDENCE: { icon: '📭', txt: '材料没齐不能拍板', tone: 'warn' }
    };
    var vm = vMap[gate.verdict] || vMap.BLOCK;

    var kpis = Q.kpiStrip([
      { icon: '🌡️', label: '上线风险体温 R', value: risk.risk + ' 分', sub: '绿线 ≤ ' + st.riskThreshold + ' 分才算退烧', tone: risk.risk <= st.riskThreshold ? 'ok' : 'bad' },
      { icon: '📦', label: '前 7 关证据档案', value: risk.evidencePresent + ' / 7 份', sub: risk.evidencePresent < 7 ? '缺证据可点「🎁 演示包」' : '7 份数据全收集齐！', tone: risk.evidencePresent === 7 ? 'ok' : 'warn' },
      { icon: '🛠️', label: '还剩几个 Bug 没修', value: risk.plan.open.length + ' 个', sub: '已用 ' + risk.plan.hoursUsed + '/' + st.budget + ' 工时修掉 ' + risk.plan.fixed.length + ' 个', tone: risk.plan.open.length === 0 ? 'ok' : 'blue' },
      { icon: vm.icon, label: '总控台最终裁决', value: (!st.revealed && !st.guess) ? '🤔 你先猜一个!' : vm.txt, sub: (!st.revealed && !st.guess) ? '在下面点一个预测再揭晓' : '由五盏门禁红绿灯共同决定', tone: (!st.revealed && !st.guess) ? 'blue' : vm.tone }
    ]);

    /* 风险温度计 + 先猜后看火箭台 */
    var guessHtml = '<div class="card"><div class="card-h">' +
      '<div><span class="card-t">🚀 发布风险温度计 & 发射台总控</span> <span class="card-sub">拖动上方「修复工时」滑块，看风险分数实时往下掉！</span></div></div>' +
      '<div class="card-b">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:6px">' +
          '<span>安全绿区 (0)</span><span style="color:' + rColor + '">当前体温：' + risk.risk + ' 分（红线 ' + st.riskThreshold + '）</span><span>爆表危险 (100)</span>' +
        '</div>' +
        '<div class="thermo-bar"><div class="thermo-fill" style="width:' + Math.min(100, risk.risk) + '%;background:' + rColor + '"></div></div>' +
        '<div class="btn-row mt12" style="justify-content:space-between">' +
          '<div class="btn-row">' +
            '<span class="tiny" style="font-weight:700">🎯 你先猜今天这版能发吗？</span>' +
            '<button type="button" class="btn sm ' + (st.guess === 'ALLOW' ? 'primary' : '') + '" data-act="guess" data-v="ALLOW">🚀 我猜能发布</button>' +
            '<button type="button" class="btn sm ' + (st.guess === 'BLOCK' ? 'fun' : '') + '" data-act="guess" data-v="BLOCK">🛑 我猜得拦下</button>' +
            (st.revealed ? '<span class="badge ' + (st.guess === (gate.verdict === 'ALLOW' ? 'ALLOW' : 'BLOCK') ? 'pass' : 'warn') + '">' +
              (st.guess === (gate.verdict === 'ALLOW' ? 'ALLOW' : 'BLOCK') ? '🎉 你猜准了！' : '💡 猜错啦，看看哪盏灯在闪红灯！') + '</span>' : '') +
          '</div>' +
          '<span class="tiny muted">' + (st.useDemo ? '当前使用：🎁 教学演示包' : '当前读取：📦 你自己的实训档案') + '</span>' +
        '</div>' +
      '</div></div>';

    /* 五盏红绿灯检查表 */
    var gatesCard = '<div class="card"><div class="card-h"><span class="card-t">🚦 五盏发射门禁红绿灯（必须 5 盏全绿才放行）</span></div>' +
      '<div class="card-b">' + gate.checks.map(function (c) {
        return '<div class="checkrow ' + (c.ok ? 'ok' : 'no') + '">' +
          '<span>' + (c.ok ? '🟢' : '🔴') + '</span>' +
          '<div><b>' + Q.esc(c.label) + '</b> <span class="muted">· ' + Q.esc(c.detail) + '</span></div>' +
        '</div>';
      }).join('') + '</div></div>';

    var coachBox = gate.verdict === 'ALLOW'
      ? Q.coach('ok', '🎉 五盏绿灯齐亮！火箭可以安全点火发射！', '前期静态审查+黑盒+白盒+回归流水线证据完整，而且在工时预算内清掉了致命缺陷，风险分数低于安全红线，高质量交付达成！')
      : (gate.verdict === 'NO_EVIDENCE'
        ? Q.coach('warn', '还缺少部分前 7 关证据哦（目前只有 ' + risk.evidencePresent + '/7 份）', '没有真实测试结果不能闭着眼放行！你可以点上面橙色按钮 <b>「🎁 一键载入演示包」</b> 先模拟体验五灯决策，也可以回前几关点击「记为过关档案」。')
        : Q.coach('bad', '🛑 红灯拦停！还有 ' + gate.blocked.length + ' 项硬门槛没达标',
          '别让有致命隐患的版本流向用户！试试把上方「修复工时」往右拖多加点预算，或者切换「🔥 先修最致命的」策略优先清理致命 Bug！'));

    var fixRows = risk.plan.ordered.map(function (d) {
      var fixed = risk.plan.fixed.some(function (f) { return f.id === d.id; });
      return [
        { html: Q.badge(fixed ? 'pass' : 'fail', fixed ? '✅ 本轮已修' : '⏳ 遗留未修') },
        d.title,
        d.severity,
        d.hours + ' 工时'
      ];
    });
    var detailBody = fixRows.length
      ? Q.table(['排期结果', '待修缺陷', '严重度', '所需工时'], fixRows)
      : Q.empty('当前证据中没有收集到待修缺陷，载入演示包试试吧', '🛠️');

    return kpis + guessHtml + gatesCard + coachBox +
      Q.drawer('🛠️ 查看工时修复排期清单（哪些修掉了 / 哪些还留着）', risk.plan.ordered.length + ' 项缺陷', detailBody, false);
  }

  function onAction(act, el, st, WB) {
    if (act === 'toggle-demo') {
      st.useDemo = !st.useDemo;
      WB.toast(st.useDemo ? '已载入完整 7 关演示档案包！' : '已切换回你自己的实训档案');
      return 'sync-ctrl';
    }
    if (act === 'guess') {
      st.guess = el.getAttribute('data-v');
      st.revealed = true;
      return true;
    }
  }

  function evidence(res) {
    var ok = res.gate.verdict === 'ALLOW';
    return {
      status: ok ? 'pass' : 'warn',
      pass: ok,
      coverage: res.risk.coverage || 0,
      label: '发布门禁',
      defects: res.risk.plan.open.map(function (d) { return d.id; }),
      summary: '风险 R=' + res.risk.risk + '（' + (ok ? '允许发射' : '红灯拦停') + '），遗留 ' + res.risk.plan.open.length + ' 个问题',
      metrics: { risk: res.risk.risk, verdict: res.gate.verdict }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢发布门禁与质量管理',
      '<b>发布前不凭感觉拍脑袋，而是看“证据全不全 + 有无致命 Bug + 覆盖够不够 + 风险降没降”！</b>预算有限时优先修高风险致命问题，哪怕只修几个，也能把风险大幅压下来。');
  }

  window.WB.registerExp({
    id: 'm8', no: 8, group: '质量评价与发布门禁',
    title: '发布门禁 · 火箭发射台', chapter: '第 1 & 9 章 · 质量与风险管理',
    hook: '攒齐前 7 关证据与工时修复战果，由五盏红绿灯决定能否上线',
    goal: ['直观体会“工时预算怎么拉低风险分数”', '明白五盏红绿灯只要亮一红就不能强行发版'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

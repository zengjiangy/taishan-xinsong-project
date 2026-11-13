/* ============================================================================
 * m1.js — 第 1 关：静态代码抓茬游乐场
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;

  var TYPE_LABEL = {};
  Q.SR_DEFECT_TYPES.forEach(function (t) { TYPE_LABEL[t.key] = t.label; });
  var SEV_LABEL = { trivial: '轻微', minor: '一般', major: '严重', fatal: '致命' };
  var SEV_BADGE = { trivial: 'mute', minor: 'warn', major: 'fail', fatal: 'fail' };

  function makeDefaults() {
    return {
      version: 'v1.0',
      scope: 'all',
      severityThreshold: 'trivial',
      activeType: 'validation',
      marks: {},
      rules: Q.SR_RULES.map(function (r) { return r.id; }),
      revealed: false,
      scanning: false
    };
  }

  function buildParams(st) {
    return [
      {
        key: 'version', label: '选一份代码剧本', type: 'pills',
        options: [
          { v: 'v1.0', l: '📄 初版 v1.0（虫子多）' },
          { v: 'v1.1', l: '🔧 修复版 v1.1' }
        ]
      },
      {
        key: 'activeType', label: '点代码行贴的标签', type: 'select',
        options: Q.SR_DEFECT_TYPES.map(function (t) { return { v: t.key, l: t.label }; })
      },
      { type: 'action', action: 'rule-scan', label: '🔍 一键自动扫雷', variant: 'primary' },
      { type: 'action', action: 'reveal-all', label: st.revealed ? '🙈 收起答案' : '💡 揭晓全部真Bug', variant: 'fun' },
      { type: 'action', action: 'clear-marks', label: '🧹 清空标记', variant: '' },
      { key: 'scope', label: '只看哪一段', type: 'select', advanced: true, options: Q.SR_SCOPES.map(function (s) { return { v: s.key, l: s.label }; }) },
      {
        key: 'severityThreshold', label: '门禁拦截严格度', type: 'select', advanced: true,
        options: [
          { v: 'trivial', l: '轻微以上全算（0容忍）' },
          { v: 'minor', l: '一般以上' },
          { v: 'major', l: '只拦严重/致命' },
          { v: 'fatal', l: '只拦致命' }
        ]
      },
      {
        key: 'rules', label: '自动扫雷工具规则开关', type: 'checks', advanced: true,
        options: Q.SR_RULES.map(function (r) { return { v: r.id, l: r.id + ' ' + r.title, sub: r.note }; })
      }
    ];
  }

  function compute(st) {
    var review = Q.srReview(st.version, st.marks, { scope: st.scope, severityThreshold: st.severityThreshold });
    var lines = Q.SR_CODE[st.version] || [];
    var scan = Q.srRuleScan(st.version, st.rules);
    return { review: review, lines: lines, scan: scan, threshold: st.severityThreshold, revealed: st.revealed };
  }

  function viz(res, st) {
    var r = res.review;
    var base = Q.SR_BASELINE[st.version] || [];
    var baseByLine = {};
    base.forEach(function (d) { d.lines.forEach(function (ln) { baseByLine[ln] = d; }); });

    var kpis = Q.kpiStrip([
      { icon: '🐛', label: '已揪出真 Bug', value: r.detected.length + ' / ' + r.totalInScope, sub: '点击下面可疑代码行捉虫', tone: r.detected.length >= r.totalInScope ? 'ok' : 'blue' },
      { icon: '🎯', label: '抓虫命中率', value: Q.pctText(r.metrics.detectionRate), sub: '自动工具+人工复查配合', tone: 'teal' },
      { icon: '😅', label: '误伤好代码', value: r.falsePositives.length + ' 处', sub: '乱标会被工具提示', tone: r.falsePositives.length ? 'warn' : 'ok' },
      { icon: '🚦', label: '静态放行判定', value: r.gateOk ? '已过关' : '未过关', sub: r.gateOk ? '门禁内漏洞已清空' : '还漏 ' + r.remaining.length + ' 只必抓虫', tone: r.gateOk ? 'ok' : 'bad' }
    ]);

    var codeRows = res.lines.map(function (tx, idx) {
      var ln = idx + 1;
      var inSc = Q.srInScope(st.scope, ln);
      var mk = st.marks[ln];
      var realD = baseByLine[ln];
      var missedShown = st.revealed && realD && !mk && inSc;
      var cls = 'code-line' + (inSc ? ' clk' : ' dimline') + (mk ? ' mark' : '') + (missedShown ? ' missed' : '');
      var tag = '';
      if (mk && realD) tag = '<span class="bug-wiggle">🐛</span><span class="cl-tag">✅ 抓到了 · ' + Q.esc(TYPE_LABEL[mk] || mk) + '</span>';
      else if (mk) tag = '<span class="cl-badge">' + Q.esc(TYPE_LABEL[mk] || mk) + '（好代码误报）</span>';
      else if (missedShown) tag = '<span class="cl-tag-miss">🚨 漏网真虫 · ' + Q.esc(realD.title) + '</span>';

      return '<div class="' + cls + '" data-act="toggle-mark" data-line="' + ln + '">' +
        '<span class="cl-no">' + ln + '</span>' +
        '<span class="cl-tx">' + Q.esc(tx || ' ') + '</span>' + tag +
      '</div>';
    }).join('');

    var codeCard = '<div class="card code-scan-wrap">' +
      (st.scanning ? '<div class="scan-beam"></div>' : '') +
      '<div class="card-h">' +
        '<div><span class="card-t">📄 被审查代码：bookingService.js (' + Q.esc(st.version) + ')</span> ' +
        '<span class="card-sub">直接点击代码行就能标出 Bug / 再点一次取消</span></div>' +
        '<span class="badge mute">当前标签：' + Q.esc(TYPE_LABEL[st.activeType] || st.activeType) + '</span>' +
      '</div>' +
      '<div class="codeview">' + codeRows + '</div>' +
    '</div>';

    var coachBox = '';
    if (r.empty) {
      coachBox = Q.coach('info', '先点一下「🔍 一键自动扫雷」试试看！',
        '不用一行行干瞪眼！点按钮让机器扫描器先跑一遍，它会亮出<b>表面明显不对劲的地方</b>；但它抓不到“业务写反、吞掉报错”这类藏得深的逻辑虫，需要你接着点代码行补齐。');
    } else if (r.gateOk) {
      coachBox = Q.coach('ok', '漂亮！这轮静态评审全部抓齐了',
        '你一共标了 <b>' + r.markedCount + '</b> 处，命中全部 <b>' + r.totalInScope + '</b> 个关键隐患（误报 ' + r.falsePositives.length + ' 处）。记住：静态审查不用运行程序，就能省掉大量返工！');
    } else {
      coachBox = Q.coach('warn', '机器扫完了，但还有 ' + r.remaining.length + ' 只深层逻辑 Bug 藏在代码里！',
        '工具只会按字面规则找（比如 <code>console.log</code>、硬编码数字），像 <code>catch (e) {}</code> 吞报错、<code>order.data</code> 没判空这种语义问题机器看不懂。点「💡 揭晓全部真Bug」或自己点可疑行揪出来！');
    }

    var detailRows = [];
    r.detected.forEach(function (d) {
      detailRows.push([
        { html: Q.badge('pass', '✅ 已抓获') },
        '第 ' + d.line + ' 行',
        d.title,
        { html: Q.badge(SEV_BADGE[d.severity], SEV_LABEL[d.severity]) },
        d.typeOk ? '标签全对' : '位置对'
      ]);
    });
    (st.revealed ? r.missed : []).forEach(function (d) {
      detailRows.push([
        { html: Q.badge('fail', '🚨 漏网') },
        '第 ' + d.lines.join('/') + ' 行',
        d.title,
        { html: Q.badge(SEV_BADGE[d.severity], SEV_LABEL[d.severity]) },
        d.desc
      ]);
    });
    r.falsePositives.forEach(function (fp) {
      detailRows.push([
        { html: Q.badge('warn', '😅 误报') },
        '第 ' + fp.line + ' 行',
        '本行无缺陷',
        '—',
        '自动规则太敏感触发了假警报'
      ]);
    });
    var detailHtml = detailRows.length
      ? Q.table(['状态', '位置', '问题名称', '等级', '大白话说明'], detailRows)
      : Q.empty('还没有任何标记，点击代码行或点「一键自动扫雷」试试吧', '🔍');

    return kpis + codeCard + coachBox +
      Q.drawer('📋 抓虫结果明细单（含误报与漏网说明）', detailRows.length + ' 条记录', detailHtml, false);
  }

  function onAction(act, el, st, WB, update) {
    if (act === 'toggle-mark') {
      var ln = Number(el.getAttribute('data-line'));
      if (!Q.srInScope(st.scope, ln)) { WB.toast('该行不在当前筛选范围内', 'warn'); return; }
      if (st.marks[ln]) delete st.marks[ln];
      else st.marks[ln] = st.activeType || 'validation';
      return true;
    }
    if (act === 'rule-scan') {
      var scan = Q.srRuleScan(st.version, st.rules);
      Object.keys(scan.marks).forEach(function (k) {
        var ln = Number(k);
        if (Q.srInScope(st.scope, ln) && !st.marks[ln]) st.marks[ln] = scan.marks[ln];
      });
      st.scanning = true;
      update(false);
      setTimeout(function () {
        st.scanning = false;
        if (window.location.hash.indexOf('exp/m1') >= 0) update(false);
      }, 1150);
      WB.toast('自动扫雷已标出 ' + scan.count + ' 处疑似点！');
      return;
    }
    if (act === 'reveal-all') {
      st.revealed = !st.revealed;
      return 'sync-ctrl';
    }
    if (act === 'clear-marks') {
      st.marks = {};
      st.revealed = false;
      return 'sync-ctrl';
    }
  }

  function evidence(res) {
    var r = res.review;
    var mapId = { D1: 'STATIC_D1', D2: 'STATIC_D2', D3: 'STATIC_D3', D4: 'STATIC_D4', D5: 'STATIC_D5', D6: 'STATIC_D6', D7: 'STATIC_D7' };
    var foundIds = r.detected.map(function (d) { return mapId[d.id]; }).filter(Boolean);
    return {
      status: r.gateOk ? 'pass' : (r.detected.length ? 'warn' : 'fail'),
      pass: r.gateOk,
      coverage: r.metrics.detectionRate == null ? 0 : r.metrics.detectionRate,
      label: '缺陷检出率',
      defects: foundIds,
      summary: '抓到 ' + r.detected.length + '/' + r.totalInScope + ' 只虫（命中率 ' + Q.pctText(r.metrics.detectionRate) + '）',
      metrics: { detectionRate: r.metrics.detectionRate, marked: r.markedCount }
    };
  }

  function theory() {
    return Q.coach('info', '一句话记牢静态找茬',
      '<b>代码都不用跑</b>，靠人眼走查 + 自动扫雷工具，就能提前把低级拼写错、敏感信息泄露、明显空指针干掉。记住：<b>工具只能帮抓表面规范，逻辑对不对还得靠人或测试用例验证！</b>');
  }

  window.WB.registerExp({
    id: 'm1', no: 1, group: '静态审查与基础',
    title: '静态找茬 · 代码扫雷', chapter: '第 6 章 · 静态测试与代码审查',
    hook: '不运行代码，也能靠扫描+肉眼把隐藏 Bug 揪出来',
    goal: ['体会“自动扫雷工具能抓多少、漏多少”', '分清表面报错和深层业务逻辑漏洞'],
    defaults: makeDefaults(), params: buildParams,
    compute: compute, viz: viz, onAction: onAction, evidence: evidence, theory: theory
  });
})();

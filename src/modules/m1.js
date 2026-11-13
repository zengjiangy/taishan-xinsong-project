/* ============================================================================
 * m1.js — 实验一：静态测试与代码审查
 * 交互：在代码行上逐行标注缺陷类型，提交后与人工基线比对，得到检出率/类型正确率/误报率。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;

  var SEV_LABEL = { trivial: '轻微', minor: '一般', major: '严重', fatal: '致命' };
  var TYPE_LABEL = {};
  Q.SR_DEFECT_TYPES.forEach(function (t) { TYPE_LABEL[t.key] = t.label; });

  function compute(st) {
    var lines = Q.SR_CODE[st.version] || [];
    var rev = Q.srReview(st.version, st.marks || {}, { scope: st.scope, severityThreshold: st.sevThreshold });
    var scan = Q.srRuleScan(st.version, st.rules || []);
    var scanRev = Q.srReview(st.version, scan.marks, { scope: st.scope, severityThreshold: st.sevThreshold });
    return { lines: lines, rev: rev, scan: scan, scanRev: scanRev };
  }

  /* ---------------------------------------------------------- 代码视图 */
  function codeView(res, st) {
    var marks = st.marks || {};
    var out = ['<div class="codeview">'];
    res.lines.forEach(function (text, i) {
      var no = i + 1;
      var inScope = Q.srInScope(st.scope, no);
      var type = marks[no];
      var missedLine = false;
      if (st.reveal) missedLine = res.rev.missed.some(function (d) { return d.lines.indexOf(no) >= 0; });
      var cls = 'code-line clk';
      if (!inScope) cls += ' dimline';
      if (type) cls += ' mark';
      if (missedLine && !type) cls += ' missed';
      out.push('<div class="' + cls + '" data-act="toggle-line" data-arg="' + no + '" role="button" tabindex="0"' +
        ' aria-label="第 ' + no + ' 行' + (type ? '，已标注为' + TYPE_LABEL[type] : '，未标注') + '">' +
        '<span class="cl-no">' + no + '</span>' +
        '<span class="cl-tx">' + E(text || ' ') + '</span>' +
        (type ? '<span class="cl-tag">' + E(TYPE_LABEL[type] || type) + '</span>' : '') +
        (missedLine && !type ? '<span class="cl-tag cl-tag-miss">漏检</span>' : '') +
        '</div>');
    });
    out.push('</div>');
    return out.join('');
  }

  function rateText(v) { return v == null ? '—' : Q.num(v, 1) + '%'; }

  function viz(res, st) {
    var rev = res.rev, m = rev.metrics;
    var h = '';

    h += '<section class="card"><h3 class="card-h">实时反馈 · 审查结果比对<span class="card-hint">范围内基线缺陷 ' +
      rev.totalInScope + ' 处</span></h3><div class="card-b">';

    h += '<div class="metrics mb10">' +
      '<div class="metric hl"><div class="m-l">缺陷检出率</div><div class="m-v">' + (m.detectionRate == null ? '—' : Q.num(m.detectionRate, 1) + '<small>%</small>') + '</div></div>' +
      '<div class="metric"><div class="m-l">类型正确率</div><div class="m-v">' + (m.typeAccuracy == null ? '—' : Q.num(m.typeAccuracy, 1) + '<small>%</small>') + '</div></div>' +
      '<div class="metric"><div class="m-l">相对基线误报率</div><div class="m-v">' + (m.falsePositiveRate == null ? '—' : Q.num(m.falsePositiveRate, 1) + '<small>%</small>') + '</div></div>' +
      '<div class="metric"><div class="m-l">已标注行数</div><div class="m-v">' + rev.markedCount + '</div></div>' +
      '<div class="metric"><div class="m-l">范围外缺陷</div><div class="m-v">' + rev.outOfScope + '</div></div>' +
      '</div>';

    h += '<div class="callout"><b>怎么标注：</b>在左下“标注笔”里选好缺陷类型，点击代码行打标；再点一次取消。' +
      '也可以先用规则扫描标一遍，但规则会漏也会错——要自己判断。</div>';

    h += '<div class="btn-row mb6">' +
      '<button class="btn primary sm" data-act="scan-rules">运行规则扫描（' + (st.rules || []).length + ' 条规则）</button>' +
      '<button class="btn sm" data-act="clear-marks">清空我的标注</button>' +
      '<span class="tiny muted">当前标注笔：' + E(TYPE_LABEL[st.pen]) + '</span>' +
      '</div>';

    h += codeView(res, st);
    h += '<div class="cv-legend">' +
      '<span><i class="cv-swatch" style="background:#fdeceb;border-color:#b42318"></i>你的标注</span>' +
      (st.reveal ? '<span><i class="cv-swatch" style="background:#fff;border-color:#b42318;border-style:dashed"></i>基线有、你漏掉的行</span>' : '') +
      '<span><i class="cv-swatch" style="background:#f2f4f5;border-color:#e0e5e9"></i>当前审查范围外</span>' +
      '</div>';
    if (st.reveal) {
      h += '<p class="tiny muted mt6">提示：参考基线代表常见资深评审观点，若真实隐患尚未被基线收录，统计时可能先计入相对误报——可借此辨析评审视角差异。</p>';
    }
    h += '</div></section>';

    // 分类矩阵 & 规则 vs 人工对比收纳
    var byType = {};
    Q.SR_DEFECT_TYPES.forEach(function (t) { byType[t.key] = { found: 0, miss: 0, label: t.label }; });
    rev.detected.forEach(function (d) { if (byType[d.expectedType]) byType[d.expectedType].found++; });
    rev.missed.forEach(function (d) { if (byType[d.type]) byType[d.type].miss++; });
    var rows = Q.SR_DEFECT_TYPES.map(function (t) {
      var b = byType[t.key];
      if (!b.found && !b.miss) return null;
      return {
        cells: [
          { v: b.label },
          { html: '<span class="mono">' + b.found + '</span>' },
          { html: '<span class="mono">' + b.miss + '</span>' },
          { html: Q.meter(Q.pct(b.found, b.found + b.miss, 1), { label: b.label }) }
        ]
      };
    }).filter(Boolean);

    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>漏检与误报清单</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">漏检 ' + rev.missed.length + ' 处 · 误报 ' + rev.falsePositives.length + ' 处</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b">';
    if (!rev.missed.length && !rev.falsePositives.length) {
      h += '<p class="tiny muted">当前没有漏检，也没有相对基线的误报。</p>';
    }
    if (rev.missed.length) {
      h += '<div class="mb6"><b class="tiny">漏检 ' + rev.missed.length + ' 处：</b></div>' +
        rev.missed.map(function (d) {
          return '<div class="listitem"><span class="chip">' + E(d.id) + '</span> <b>' + E(d.title) + '</b>' +
            ' <span class="tiny muted">（' + SEV_LABEL[d.severity] + '，第 ' + d.lines.join('、') + ' 行）</span>' +
            '<div class="tiny muted">' + E(d.desc) + '</div></div>';
        }).join('');
    }
    if (rev.falsePositives.length) {
      h += '<div class="mb6 mt10"><b class="tiny">相对基线的误报 ' + rev.falsePositives.length + ' 处：</b></div>' +
        rev.falsePositives.map(function (f) {
          return '<div class="listitem"><span class="chip">第 ' + f.line + ' 行</span> ' +
            '<span class="tiny">标为「' + E(TYPE_LABEL[f.type] || f.type) + '」</span>' +
            '<div class="tiny muted mono">' + E((f.text || '').trim()) + '</div></div>';
        }).join('');
    }
    h += '</div></details>';

    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>缺陷类型分布与规则对比</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">规则扫描 vs 人工标注</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b"><div class="grid g2">' +
      (rows.length ? '<div><div class="tiny muted mb6">按缺陷类型拆解</div>' + Q.table(['缺陷类型', '已检出', '漏检', '检出率'], rows) + '</div>' : '') +
      '<div><div class="tiny muted mb6">规则扫描 vs 人工标注</div>' +
      Q.table(['指标', '规则扫描', '人工标注'], [
        ['检出率', rateText(res.scanRev.metrics.detectionRate), rateText(m.detectionRate)],
        ['类型正确率', rateText(res.scanRev.metrics.typeAccuracy), rateText(m.typeAccuracy)],
        ['相对基线误报率', rateText(res.scanRev.metrics.falsePositiveRate), rateText(m.falsePositiveRate)],
        ['标注行数', String(res.scanRev.markedCount), String(rev.markedCount)]
      ]) +
      '<div class="chart-cap">规则擅长抓格式与固定模式（空 catch、敏感日志、硬编码）；语义重复与事务缺失需人工阅读。</div></div>' +
      '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var rev = res.rev, m = rev.metrics;
    var any = rev.markedCount > 0;
    var okA = m.detectionRate != null && m.detectionRate >= 80;
    var okB = m.falsePositiveRate != null && m.falsePositiveRate <= 25;
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(!any ? 'no' : (okA ? 'ok' : 'no'),
      (!any ? '· ' : (okA ? '✓ ' : '✕ ')) + '检出基线缺陷 ' + rev.detected.length + ' / ' + rev.totalInScope + ' 处',
      [
        ['命中点', any ? (rev.detected.map(function (d) { return d.id + '（第 ' + d.line + ' 行）'; }).join('、') || '暂无标注命中基线') : '请先点击代码行号添加标注。'],
        rev.missed.length ? ['仍漏检', rev.missed.map(function (d) { return d.title; }).join('；')] : null,
        rev.outOfScope ? ['口径说明', '另有 ' + rev.outOfScope + ' 处超出当前审查范围，不计入分母。'] : null
      ]);

    h += Q.concl(!any ? 'no' : (okB ? 'ok' : 'no'),
      (!any ? '· ' : (okB ? '✓ ' : '✕ ')) + '误报率 ' + rateText(m.falsePositiveRate),
      [
        ['统计', '共标 ' + rev.markedCount + ' 行，其中 ' + rev.falsePositives.length + ' 行未在参考基线中。'],
        okB ? null : ['提示', '盲目全标虽能提高检出，但高误报会淹没真正的风险。']
      ]);

    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm1', no: 1, navLabel: '静态审查',
    title: '静态测试与代码审查',
    subtitle: '不运行程序，在提交前通过编码规则与人工走查提前拦截缺陷。',
    chapter: '第7章 7.1–7.5 静态测试技术',
    knowledge: '识别静态测试对象与手段；执行代码审查并区分缺陷类型与严重度；理解工具规则的检出上限与误报代价。',
    minutes: 14,
    goals: [
      '分清静态测试与动态测试',
      '逐行标注缺陷并归类',
      '用三个指标评价一次评审'
    ],
    blockers: [
      ['跑个工具就算静态测试', '规则只认得能写成模式的问题'],
      ['标得越多越好', '误报一多，评审报告就没人看了'],
      ['风格问题当缺陷', '命名是规范问题，漏校验才是缺陷']
    ],
    theory: '<p>不运行程序，直接读代码。它找的是“看得见的问题”：入参没校验、异常被吞、逻辑重复。</p>' +
      '<div class="formula">检出率 = 检出缺陷 ÷ 范围内缺陷\n' +
      '类型正确率 = 类型标对 ÷ 已检出\n' +
      '误报率 = 基线未收录的标注行 ÷ 你的标注行</div>' +
      '<p class="mt6">三个分母不同，别混着读。</p>',
    prereq: '能读懂 JavaScript 函数。',
    scopeNote: '评审会的个体审查环节。',
    notDo: '不做控制流与调用链分析。',

    params: [
      {
        key: 'version', type: 'select', label: '审查对象版本',
        options: [
          { v: 'v1.0', l: 'v1.0 首版（缺陷最多）' },
          { v: 'v1.1', l: 'v1.1 修复部分评审意见' },
          { v: 'v1.2', l: 'v1.2 候选版（缺陷最少）' }
        ],
        hint: '切换版本会清空标注，因为行号与内容都变了。'
      },
      {
        key: 'scope', type: 'select', label: '审查范围',
        options: Q.SR_SCOPES.map(function (s) { return { v: s.key, l: s.label }; }),
        hint: '范围直接改变检出率的<b>分母</b>，是最直观的“指标口径”演示。'
      },
      {
        key: 'pen', type: 'select', label: '标注笔（点行时使用的类型）',
        options: Q.SR_DEFECT_TYPES.map(function (t) { return { v: t.key, l: t.label }; })
      },
      {
        key: 'rules', type: 'checks', label: '启用的检查规则', group: '规则与门槛',
        options: Q.SR_RULES.map(function (r) {
          return { v: r.id, l: r.id + ' ' + r.name };
        })
      },
      {
        key: 'sevThreshold', type: 'select', label: '评审通过门槛', group: '规则与门槛',
        options: [
          { v: 'major', l: '不允许残留“严重”及以上缺陷' },
          { v: 'minor', l: '不允许残留“一般”及以上缺陷' },
          { v: 'trivial', l: '任何残留缺陷都不通过' }
        ],
        hint: '门槛只影响“是否通过评审”，不改变检出率。'
      },
      { key: 'reveal', type: 'check', label: '对照基线（显示漏检位置）', sub: '相当于看教师参考答案' }
    ],
    defaults: {
      version: 'v1.0', scope: 'all', pen: 'exception', sevThreshold: 'major', reveal: false,
      rules: Q.SR_RULES.map(function (r) { return r.id; }),
      marks: {}
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onParam: function (key, st) {
      if (key === 'version') st.marks = {};
    },

    onAction: function (name, arg, st) {
      if (name === 'toggle-line') {
        var no = Number(arg);
        st.marks = st.marks || {};
        if (st.marks[no]) delete st.marks[no];
        else st.marks[no] = st.pen;
        return true;
      }
      if (name === 'scan-rules') {
        var scan = Q.srRuleScan(st.version, st.rules || []);
        st.marks = Object.assign({}, st.marks || {}, scan.marks);
        WB.toast('规则扫描命中 ' + scan.count + ' 处，已合并到标注（可能含误报）');
        return true;
      }
      if (name === 'clear-marks') { st.marks = {}; return true; }
      return false;
    },

    evidence: function (res) {
      var m = res.rev.metrics;
      var rate = m.detectionRate;
      var status = rate != null && rate >= 80 && (m.falsePositiveRate == null || m.falsePositiveRate <= 25)
        ? 'pass' : (rate != null && rate >= 50 ? 'warn' : 'fail');
      return {
        status: status,
        coverage: rate,
        label: '缺陷检出率（相对基线）',
        defects: res.rev.detected.map(function (d) { return d.id; }),
        note: '版本 ' + res.rev.version + '，范围 ' + res.rev.scope + '，检出 ' + res.rev.detected.length + '/' +
          res.rev.totalInScope + '，误报率 ' + rateText(m.falsePositiveRate)
      };
    }
  });
})();

/* ============================================================================
 * m6.js — 实验六：白盒测试与覆盖分析
 * 代码视图由被测函数源码实时解析；覆盖率来自插桩轨迹；CFG 为显式声明的视图布局。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;

  /* CFG 视图布局（只影响画在哪，不影响结构；结构来自 QT.WB_CFG） */
  var POS = {
    B01: [400, 22], B02: [110, 74], B03: [400, 74],
    B04: [292, 126], B05: [508, 126], B06: [400, 178],
    B07: [130, 232], B08: [310, 232], B09: [490, 232], B10: [670, 232],
    B11: [270, 290], B12: [530, 290],
    B13: [400, 344], B14: [400, 394], B15: [400, 444],
    B16: [292, 498], B17: [508, 498], B18: [400, 552]
  };
  var NW = 54, NH = 22;

  function inputsOf(st) {
    var list = [];
    (st.cases || []).forEach(function (id) {
      var u = Q.WB_LIBRARY.filter(function (x) { return x.id === id; })[0];
      if (u) list.push({ id: id, label: u.label, input: u.input });
    });
    (st.custom || []).forEach(function (c, i) {
      list.push({ id: 'C' + (i + 1), label: '自定义用例 ' + (i + 1), input: c, custom: true });
    });
    return list;
  }

  function compute(st) {
    var list = inputsOf(st);
    var autoInfo = null;
    if (st.autoBudget && st.autoBudget > 0) {
      var g = Q.wbGreedyMinSet(Q.WB_POOL, st.criterion, st.defect === 'none' ? null : st.defect);
      var pick = g.cases.slice(0, st.autoBudget);
      var seen = {};
      list.forEach(function (x) { seen[JSON.stringify(x.input)] = true; });
      pick.forEach(function (inp, i) {
        var k = JSON.stringify(inp);
        if (seen[k]) return;
        seen[k] = true;
        list.push({ id: 'A' + (i + 1), label: '自动补齐用例 ' + (i + 1), input: inp, auto: true });
      });
      autoInfo = { budget: st.autoBudget, added: list.filter(function (x) { return x.auto; }).length, need: g.cases.length };
    }
    var runs = list.map(function (c) { return Q.wbRunOne(c.input, st.defect === 'none' ? null : st.defect); });
    var a = Q.wbAnalyze(runs);
    var status = Q.wbCriterionStatus(a, st.criterion);

    // 用当前用例集探测 4 个缺陷的可检出性（与注入无关）
    var hitDefects = {};
    list.forEach(function (c) {
      Q.defectProbe(c.input).forEach(function (p) { if (p.differs) hitDefects[p.id] = true; });
    });

    return {
      cases: list, runs: runs, a: a, status: status, autoInfo: autoInfo,
      hitDefects: Object.keys(hitDefects),
      defectCount: Object.keys(hitDefects).length
    };
  }

  /* ------------------------------------------------------------- 代码视图 */
  function codeView(a) {
    var out = ['<div class="codeview">'];
    a.parsed.lines.forEach(function (l) {
      var cls = 'code-line';
      if (l.kind === 'instr') cls += ' instr';
      if (l.kind === 'mut') cls += ' mut';
      if (l.kind === 'code' && l.block) cls += a.hitBlocks[l.block] ? ' hit' : ' miss';
      out.push('<div class="' + cls + '">' +
        '<span class="cl-no">' + l.no + '</span>' +
        '<span class="cl-tx">' + E(l.text || ' ') + '</span>' +
        (l.target ? '<span class="cl-badge">' + E(l.target) + ' ' + E(Q.WB_BLOCK_DESC[l.target] || '') + '</span>' : '') +
        (l.dec ? '<span class="cl-badge">判定 ' + E(l.dec) + '</span>' : '') +
        (l.cond ? '<span class="cl-badge">条件 ' + E(l.cond) + '</span>' : '') +
        '</div>');
    });
    out.push('</div>');
    return out.join('');
  }

  /* ----------------------------------------------------------------- CFG */
  function cfgSvg(a) {
    var W = 780, H = 590;
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="控制流图">'];
    out.push('<defs><marker id="cfg-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs>');
    var edges = Q.WB_CFG.edges;
    Object.keys(edges).forEach(function (from) {
      var p1 = POS[from];
      if (!p1) return;
      edges[from].forEach(function (to) {
        var p2 = POS[to];
        if (!p2) return;
        var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        var tt = Math.min((NW / 2) / (Math.abs(dx) || 1e-6), (NH / 2) / (Math.abs(dy) || 1e-6));
        var ax = p1[0] + dx * tt, ay = p1[1] + dy * tt;
        var bx = p2[0] - dx * tt, by = p2[1] - dy * tt;
        var hot = a.hitBlocks[from] && a.hitBlocks[to];
        out.push('<path d="M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' L ' + bx.toFixed(1) + ' ' + by.toFixed(1) +
          '" stroke="' + (hot ? '#0d9488' : '#cbd5e1') + '" stroke-width="' + (hot ? 1.8 : 1.1) + '" fill="none" marker-end="url(#cfg-arw)"/>');
      });
    });
    Object.keys(POS).forEach(function (id) {
      var p = POS[id];
      var hit = !!a.hitBlocks[id];
      out.push('<g><rect x="' + (p[0] - NW / 2) + '" y="' + (p[1] - NH / 2) + '" width="' + NW + '" height="' + NH +
        '" rx="8" fill="' + (hit ? '#ecfeff' : '#fef2f2') + '" stroke="' + (hit ? '#0d9488' : '#fca5a5') + '" stroke-width="1.35"/>' +
        '<text x="' + p[0] + '" y="' + (p[1] + 3.5) + '" font-size="9.5" font-weight="600" text-anchor="middle" font-family="monospace" fill="' +
        (hit ? '#0f766e' : '#b91c1c') + '">' + id + '</text></g>');
    });
    out.push('</svg>');
    return '<div class="chart-box cfg-box">' + out.join('') + '</div>' +
      '<div class="chart-cap">青色 = 已执行基本块，珊瑚红 = 未执行基本块。共 18 块 / ' + Q.WB_TOTAL_PATHS + ' 条路径。</div>';
  }

  function viz(res, st) {
    var a = res.a;
    var h = '';
    h += '<section class="card"><h3 class="card-h">实时反馈 · 覆盖仪表<span class="card-hint">' +
      res.cases.length + ' 条用例，' + a.paths.covered + ' 条不同路径</span></h3><div class="card-b">';
    h += '<div class="metrics mb10">' +
      '<div class="metric"><div class="m-l">语句块覆盖</div><div class="m-v">' + Q.num(a.blocks.rate, 1) + '<small>%</small></div>' +
      '<div class="tiny muted">' + a.blocks.covered + '/' + a.blocks.total + ' 块</div></div>' +
      '<div class="metric' + (st.criterion === 'decision' ? ' hl' : '') + '"><div class="m-l">判定覆盖</div><div class="m-v">' + Q.num(a.decisions.rate, 1) + '<small>%</small></div>' +
      '<div class="tiny muted">' + a.decisions.covered + '/' + a.decisions.total + '（7 判定 × 2）</div></div>' +
      '<div class="metric' + (st.criterion === 'condition' ? ' hl' : '') + '"><div class="m-l">条件覆盖</div><div class="m-v">' + Q.num(a.conditions.rate, 1) + '<small>%</small></div>' +
      '<div class="tiny muted">' + a.conditions.covered + '/' + a.conditions.total + '（12 条件 × 2）</div></div>' +
      '<div class="metric' + (st.criterion === 'dc' ? ' hl' : '') + '"><div class="m-l">判定-条件覆盖</div><div class="m-v">' + Q.num(a.dc.rate, 1) + '<small>%</small></div>' +
      '<div class="tiny muted">' + a.dc.covered + '/' + a.dc.total + '</div></div>' +
      '<div class="metric' + (st.criterion === 'path' ? ' hl' : '') + '"><div class="m-l">路径覆盖</div><div class="m-v">' + Q.num(a.paths.rate, 1) + '<small>%</small></div>' +
      '<div class="tiny muted">' + a.paths.covered + '/' + a.paths.total + ' 条</div></div>' +
      '</div>';
    h += '<p class="tiny muted mt6">当前准则：<b>' + E((Q.WB_CRITERIA.filter(function (c) { return c.key === st.criterion; })[0] || {}).label || '') +
      '</b>（' + res.status.value + ' / ' + res.status.total + '）。分母口径见左侧理论要点。</p>';
    if (res.autoInfo) {
      h += '<div class="callout"><b>自动补齐：</b>预算 ' + res.autoInfo.budget + ' 条，新增 ' + res.autoInfo.added +
        ' 条（贪心集合覆盖，达到该准则理论上至少需要 ' + res.autoInfo.need + ' 条）。贪心不是最优解。</div>';
    }
    h += '</div></section>';

    h += '<details class="sec-card" open><summary class="sec-card-h"><span>控制流图</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">18 块 · ' + Q.WB_TOTAL_PATHS + ' 条路径</span><span class="sec-arrow">▾</span></span></summary>' +
      '<div class="sec-card-b">' + cfgSvg(a) + '</div></details>';

    h += '<details class="sec-card"><summary class="sec-card-h"><span>插桩代码视图（_calcFee 源码轨迹）</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">点击展开查看逐行命中高亮</span><span class="sec-arrow">▾</span></span></summary>' +
      '<div class="sec-card-b">' +
      codeView(a) +
      '<div class="cv-legend">' +
      '<span><i class="cv-swatch" style="background:#eefaf6;border-color:#14b8a6"></i>已执行块</span>' +
      '<span><i class="cv-swatch" style="background:#fdf7f6;border-color:#e3b3ad"></i>未执行块</span>' +
      '<span><i class="cv-swatch" style="background:#fbf6ea;border-color:#d9a441"></i>缺陷变异开关</span>' +
      '<span><i class="cv-swatch" style="background:#fff;border-color:#e0e5e9"></i>覆盖率采集探针</span>' +
      '</div>' +
      '</div></details>';

    // 判定真值表 + 条件真值表并排收纳
    var drow = a.decisions.items.map(function (d) {
      return {
        cells: [
          { html: '<b>' + E(d.id) + '</b>' },
          { v: d.desc },
          { html: d.t ? Q.badge('pass', '真') : Q.badge('mute', '未') },
          { html: d.f ? Q.badge('pass', '假') : Q.badge('mute', '未') },
          { html: d.ok ? Q.badge('pass', '达标') : Q.badge('fail', '缺口') }
        ]
      };
    });
    var crow = a.conditions.items.map(function (c) {
      return {
        cells: [
          { html: '<b>' + E(c.id) + '</b>' },
          { v: c.desc },
          { html: c.t ? '✓' : '·' },
          { html: c.f ? '✓' : '·' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h"><span>判定与原子条件真值表</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">判定 ' + a.decisions.covered + '/' + a.decisions.total + ' · 条件 ' + a.conditions.covered + '/' + a.conditions.total + '</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b"><div class="grid g2">' +
      '<div><div class="tiny muted mb6">判定真值表（7 个判定）</div><div class="tbl-scroll" style="max-height:300px">' + Q.table(['判定', '含义', 'T', 'F', '状态'], drow) + '</div></div>' +
      '<div><div class="tiny muted mb6">条件真值表（12 个原子条件）</div><div class="tbl-scroll" style="max-height:300px">' + Q.table(['条件', '含义', 'T', 'F'], crow) + '</div></div>' +
      '</div></div></details>';

    // 执行路径与用例明细收纳
    var rows = res.cases.map(function (c, i) {
      var run = res.runs[i];
      var out = run.out;
      return {
        cells: [
          { html: '<b>' + E(c.id) + '</b>' + (c.auto ? ' <span class="chip">自动</span>' : '') },
          { v: c.label },
          { html: '<span class="mono tiny">' + c.input.hours + '/' + c.input.seats + '/' + c.input.coupon + '/' + c.input.type.charAt(0) + (c.input.hasCert ? '/证' : '') + '</span>' },
          { html: '<span class="mono">' + (out.ok ? Q.fmtMoney(out.payable) : 'E_INPUT') + '</span>' },
          { html: '<span class="num">' + run.blocks.length + '</span>' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h"><span>执行路径轨迹与用例明细</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">已走通 ' + a.paths.covered + ' 条路径 · 共 ' + res.cases.length + ' 条用例</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b">' +
      '<div class="tiny muted mb6">已走通路径轨迹</div>' +
      (a.paths.executed.length ? a.paths.executed.map(function (p, i) {
        return '<div class="pathrow"><span class="chip">路径 ' + (i + 1) + '</span> <span class="mono tiny">' + E(p.split('>').join(' → ')) + '</span></div>';
      }).join('') : Q.empty('尚未执行任何路径')) +
      '<div class="tiny muted mt10 mb6">当前执行用例清单</div>' +
      '<div class="tbl-scroll" style="max-height:280px">' +
      Q.table(['用例', '说明', '输入（课时/人数/券/类型）', '应付', '命中块数'], rows) + '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var a = res.a;
    var stt = res.status;
    var critLabel = (Q.WB_CRITERIA.filter(function (c) { return c.key === st.criterion; })[0] || {}).label || '';
    var missedDefects = Q.DEFECTS.filter(function (d) { return res.hitDefects.indexOf(d.id) < 0; });
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(stt.passed ? 'ok' : 'no',
      (stt.passed ? '✓ ' : '✕ ') + critLabel + ' ' + stt.value + ' / ' + stt.total,
      [
        ['结构覆盖', res.cases.length + ' 条用例 · 路径 ' + a.paths.covered + ' 条 · 块 ' + a.blocks.covered + '/' + a.blocks.total + ' · 判定 ' + a.decisions.covered + '/' + a.decisions.total],
        stt.passed ? null : ['未达标项', missText(a, st.criterion)]
      ]);

    h += Q.concl(res.defectCount === 4 ? 'ok' : 'no',
      (res.defectCount === 4 ? '✓ ' : '✕ ') + '可检出 ' + res.defectCount + ' / 4 个故障',
      [
        ['已捕获', res.defectCount ? res.hitDefects.map(function (id) { return Q.DEFECT_MAP[id].short; }).join('、') : '当前用例集未捕获任何预设故障'],
        missedDefects.length ? ['漏出项', missedDefects.map(function (d) { return d.short; }).join('、')] : null
      ]);

    if (a.blocks.rate === 100 && res.defectCount < 4) {
      h += Q.concl('insight', '◆ 关键启发：100% 块覆盖仍有漏网缺陷',
        [['发现', '所有语句均已执行，但仍有 ' + (4 - res.defectCount) + ' 处故障逃逸——“行跑过”不等于“逻辑算对”。']]);
    }

    h += '</div></section>';
    return h;
  }

  function missText(a, criterion) {
    if (criterion === 'statement') return '未执行块：' + (a.blocks.missed.join('、') || '无');
    if (criterion === 'decision') return '未达标判定：' + (a.decisions.missed.join('、') || '无');
    if (criterion === 'condition') return '未达标条件：' + (a.conditions.missed.join('、') || '无');
    if (criterion === 'dc') return '判定与条件的真假分支未同时满足，见上方真值表';
    return '可枚举 ' + a.paths.total + ' 条路径，可观察路径增长成本';
  }

  WB.registerExp({
    id: 'm6', no: 6, navLabel: '白盒覆盖',
    title: '白盒测试与覆盖分析',
    subtitle: '深入代码控制流与插桩轨迹，理解五大覆盖准则的差异及其证明力上限。',
    chapter: '第8章 8.4 白盒测试技术',
    knowledge: '区分语句/判定/条件/判定-条件/路径覆盖的定义与分母；用插桩轨迹度量覆盖；理解高覆盖不等于无缺陷。',
    minutes: 16,
    goals: [
      '说清五种准则各自的分母',
      '用最少用例达成指定覆盖',
      '给出“覆盖满但仍有缺陷”的反例'
    ],
    blockers: [
      ['语句覆盖高就是好', '只走真的那一支也能到 100%'],
      ['判定覆盖 = 条件覆盖', '一个看整个 if，一个看每个原子条件'],
      ['路径覆盖能做到 100%', '18 个块就有 33 条路径']
    ],
    theory: '<p>五个准则，五套分母。块是语句，判定是整个 if，条件是 if 里的每个原子判断。</p>' +
      '<div class="formula">块 18 · 判定 7×2=14 · 条件 12×2=24\n' +
      '判定-条件 38 · 路径 33</div>' +
      '<p class="mt6">插桩只是量尺，不改变业务结果。</p>',
    prereq: '控制流、判定与条件的区别。',
    scopeNote: '单元级，对象是单个纯函数。',
    notDo: '不做循环路径与数据流覆盖。',

    params: [
      {
        key: 'criterion', type: 'select', label: '覆盖准则',
        options: Q.WB_CRITERIA.map(function (c) { return { v: c.key, l: c.label }; }),
        hint: '决定达成判定与分母，也决定补齐目标。'
      },
      {
        key: 'cases', type: 'checks', label: '用例库（勾选参与执行）', cols: 2,
        options: Q.WB_LIBRARY.map(function (u) { return { v: u.id, l: u.id + ' ' + (u.short || u.label) }; }),
        hint: '勾得越少，越看得清哪条补了哪个分支。'
      },
      {
        key: 'defect', type: 'select', label: '被测版本（注入缺陷）',
        options: [
          { v: 'none', l: '无缺陷（规格实现）' },
          { v: 'SEAT_BOUNDARY', l: 'D1 团体折扣下界判定错误' },
          { v: 'ROUND_DOWN', l: 'D2 金额向下取整' },
          { v: 'COUPON_CAP', l: 'D3 优惠券负值未截断（B16 不可达）' },
          { v: 'RETRAIN_STACK', l: 'D4 折扣被叠加' }
        ],
        hint: 'D3 会让 B16 永远执行不到（上限 17/18）。'
      },
      {
        key: 'autoBudget', type: 'select', label: '自动补齐预算',
        options: [
          { v: 0, l: '关闭（只用我勾选的用例）' },
          { v: 4, l: '最多补 4 条' },
          { v: 8, l: '最多补 8 条' },
          { v: 12, l: '最多补 12 条' }
        ],
        hint: '贪心补齐，补进来的用例标“自动”。'
      }
    ],
    defaults: {
      criterion: 'decision',
      cases: ['U1', 'U2', 'U3', 'U4'],
      defect: 'none',
      autoBudget: 0,
      cHours: 11, cSeats: 3, cCoupon: 0, cType: 'new', cHasCert: true,
      custom: []
    },

    compute: compute,
    viz: function (res, st) { return viz(res, st) + customBlock(st); },
    verify: verify,

    onAction: function (name, arg, st) {
      if (name === 'add-case') {
        var h = st.cHours, s = st.cSeats, c = st.cCoupon;
        var okNum = function (v, lo, hi) {
          return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
        };
        if (!okNum(h, 0, 200)) { WB.toast('课时数需为 0–200 的整数（留空无效）', 'warn'); return false; }
        if (!okNum(s, 0, 30)) { WB.toast('报名人数需为 0–30 的整数（留空无效）', 'warn'); return false; }
        if (!okNum(c, 0, 600)) { WB.toast('券额需为 0–600 的整数（留空无效）', 'warn'); return false; }
        st.custom = (st.custom || []).concat([{ hours: h, seats: s, coupon: c, type: st.cType, hasCert: !!st.cHasCert }]);
        if (st.custom.length > 6) st.custom = st.custom.slice(-6);
        WB.toast('已添加自定义用例');
        return true;
      }
      if (name === 'del-case') {
        st.custom = (st.custom || []).filter(function (_, i) { return String(i) !== String(arg); });
        return true;
      }
      if (name === 'select-min') {
        var g = Q.wbGreedyMinSet(Q.WB_POOL, st.criterion, st.defect === 'none' ? null : st.defect);
        var ids = [];
        g.cases.forEach(function (inp) {
          var u = Q.WB_LIBRARY.filter(function (x) { return JSON.stringify(x.input) === JSON.stringify(inp); })[0];
          if (u) ids.push(u.id);
        });
        st.cases = ids;
        st.custom = [];
        st.autoBudget = 0;
        WB.toast('已按“' + (Q.WB_CRITERIA.filter(function (c) { return c.key === st.criterion; })[0] || {}).short +
          '”选出 ' + ids.length + ' 条用例（贪心，不保证最优）');
        return true;
      }
      return false;
    },

    evidence: function (res, st) {
      var a = res.a;
      var rate = st.criterion === 'statement' ? a.blocks.rate
        : st.criterion === 'decision' ? a.decisions.rate
        : st.criterion === 'condition' ? a.conditions.rate
        : st.criterion === 'dc' ? a.dc.rate : a.paths.rate;
      var status = rate === 100 ? 'pass' : rate >= 70 ? 'warn' : 'fail';
      return {
        status: status,
        coverage: rate,
        label: (Q.WB_CRITERIA.filter(function (c) { return c.key === st.criterion; })[0] || {}).label || st.criterion,
        defects: res.hitDefects,
        note: res.cases.length + ' 条用例；块 ' + a.blocks.covered + '/' + a.blocks.total +
          '，判定 ' + a.decisions.covered + '/' + a.decisions.total +
          '，条件 ' + a.conditions.covered + '/' + a.conditions.total +
          '，路径 ' + a.paths.covered + '/' + a.paths.total
      };
    }
  });

  function customBlock(st) {
    var opts = Q.CONFIG.types.map(function (t) { return { v: t, l: Q.CONFIG.typeLabels[t] }; });
    return '<section class="card"><h3 class="card-h">自定义用例<span class="card-hint">' + (st.custom || []).length + ' 条</span></h3><div class="card-b">' +
      '<div class="btn-row mb6"><button class="btn sm" data-act="select-min">按当前准则自动选最少用例</button>' +
      '<span class="tiny muted">会覆盖上面的勾选（贪心算法，不保证全局最优）</span></div>' +
      '<div class="cust-grid">' +
      '<label>课时<input type="number" data-p="cHours" value="' + (st.cHours == null ? '' : st.cHours) + '" min="0" max="200" step="1"></label>' +
      '<label>人数<input type="number" data-p="cSeats" value="' + (st.cSeats == null ? '' : st.cSeats) + '" min="0" max="30" step="1"></label>' +
      '<label>券额<input type="number" data-p="cCoupon" value="' + (st.cCoupon == null ? '' : st.cCoupon) + '" min="0" max="600" step="1"></label>' +
      '<label>类型<select data-p="cType">' + opts.map(function (o) {
        return '<option value="' + o.v + '"' + (st.cType === o.v ? ' selected' : '') + '>' + o.l + '</option>';
      }).join('') + '</select></label>' +
      '<label>持证<select data-p="cHasCert"><option value="1"' + (st.cHasCert ? ' selected' : '') + '>是</option>' +
      '<option value="0"' + (!st.cHasCert ? ' selected' : '') + '>否</option></select></label>' +
      '<button class="btn primary sm" data-act="add-case">添加</button>' +
      '</div>' +
      ((st.custom || []).length ? '<div class="row wrap mt6">' + st.custom.map(function (c, i) {
        return '<span class="chip">' + E(c.hours + '/' + c.seats + '/' + c.coupon + '/' + Q.CONFIG.typeLabels[c.type]) +
          ' <button class="chip-x" data-act="del-case" data-arg="' + i + '" aria-label="删除">×</button></span>';
      }).join('') + '</div>' : '') +
      '</div></section>';
  }
})();

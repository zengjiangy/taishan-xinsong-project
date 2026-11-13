/* ============================================================================
 * m2.js — 实验二：等价类划分
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc, C = Q.CONFIG;

  var DEFECT_OPTS = Q.DEFECTS.map(function (d) {
    return { v: d.id, l: d.short + ' ' + d.name };
  });

  function compute(st) {
    return Q.ecExecute({
      field: st.field,
      level: st.level,
      strategy: st.strategy,
      includeInvalid: !!st.includeInvalid,
      defects: st.defects || [],
      customCases: (st.custom || []).map(function (c) { return { input: c }; })
    });
  }

  /* ------------------------------------------------------------ 类分布图 */
  function classMap(res) {
    function bucket(c) {
      if (c.validClass) return 'valid';
      if (c.kind === 'nonint' || c.kind === 'invalidAll') return 'type';
      if (c.lo == null) return 'low';
      return 'high';
    }
    var groups = [
      { key: 'low', label: '下界外（低于有效域）', items: [] },
      { key: 'valid', label: '有效等价类', items: [] },
      { key: 'high', label: '上界外（高于有效域）', items: [] },
      { key: 'type', label: '类型 / 全集无效', items: [] }
    ];
    var gm = {};
    groups.forEach(function (g) { gm[g.key] = g; });
    res.classes.forEach(function (c) { gm[bucket(c)].items.push(c); });

    var used = {};
    res.cases.forEach(function (c) { used[c.cls] = (used[c.cls] || 0) + 1; });

    var html = '<div class="clsmap">';
    groups.forEach(function (g) {
      if (!g.items.length) return;
      html += '<div class="clsgroup"><div class="clsgroup-h">' + g.label + '</div><div class="clsrow">';
      g.items.forEach(function (c) {
        var n = used[c.id] || 0;
        html += '<div class="cls' + (n ? ' on' : '') + '" title="' + E(c.name) + '">' +
          '<div class="cls-id">' + E(c.id) + '</div>' +
          '<div class="cls-nm">' + E(c.name) + '</div>' +
          '<div class="cls-ct">' + (n ? '✓ ' + n + ' 例' : '○ 未覆盖') + '</div>' +
          '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function viz(res, st) {
    var h = '';
    var cov = res.coverage;
    h += '<section class="card"><h3 class="card-h">实时反馈 · 等价类覆盖与检出<span class="card-hint">' +
      (st.includeInvalid ? '含无效类' : '已排除无效类') + '</span></h3><div class="card-b">';

    h += '<div class="metrics mb10">' +
      '<div class="metric"><div class="m-l">用例数</div><div class="m-v">' + res.cases.length + '</div></div>' +
      '<div class="metric hl"><div class="m-l">等价类覆盖率</div><div class="m-v">' + Q.num(cov.rate, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">无效类覆盖</div><div class="m-v">' + cov.invalidCovered + '<small>/' + cov.invalidTotal + '</small></div></div>' +
      '<div class="metric"><div class="m-l">可检出缺陷</div><div class="m-v">' + res.detectedCount + '<small>/4</small></div></div>' +
      '<div class="metric"><div class="m-l">失败用例</div><div class="m-v">' + res.failCount + '</div></div>' +
      '</div>';


    if (res.warn) h += '<div class="callout warn mt6">' + E(res.warn) + '</div>';

    h += '<div class="clsmap-wrap mt10">' + classMap(res) + '</div>';
    h += '<div class="chart-cap">实心卡片 = 已被用例覆盖，虚线卡片 = 一条都没有。分母是当前方案的类总数。</div>';

    if (cov.missed.length) {
      h += '<div class="callout warn mt6"><b>未覆盖的类：</b>' + E(cov.missed.join('、')) + '</div>';
    }

    h += '</div></section>';

    // 缺陷检出矩阵
    h += '<section class="card"><h3 class="card-h">缺陷检出矩阵<span class="card-hint">评估当前用例集的故障捕获潜力</span></h3><div class="card-b">';
    h += '<div class="dmatrix">' + res.matrix.map(function (m) {
      var cls = m.detected ? 'dm-hit' : 'dm-miss';
      return '<div class="dm ' + cls + (m.injected ? ' dm-inj' : '') + '">' +
        '<div class="dm-h"><span class="chip">' + E(m.short) + '</span>' + (m.injected ? '<span class="tiny">已注入</span>' : '') + '</div>' +
        '<div class="dm-n">' + E(m.name) + '</div>' +
        '<div class="dm-r">' + (m.detected ? '✓ 可检出 · ' + m.caseCount + ' 条用例命中' : '✕ 检不出 · 无用例命中差异') + '</div>' +
        '</div>';
    }).join('') + '</div>';
    h += '<div class="chart-cap mt6">命中 = 预期与实际不一致。部分组合缺陷需要同时触发多个参数条件才会暴露。</div>';
    h += '</div></section>';

    // 用例表（收纳式卡片）
    var rows = res.cases.map(function (c) {
      return {
        cls: c.pass ? 'row-pass' : 'row-fail',
        cells: [
          { html: '<b>' + E(c.id) + '</b>' },
          { html: c.custom ? '<span class="chip">自定义</span>' : E(c.cls) },
          { v: c.custom ? '组合' : String(c.value) },
          { html: c.pass ? Q.badge('pass', '与预期一致') : Q.badge('fail', '不一致') },
          { html: '<span class="mono">' + (c.expected.ok ? Q.fmtMoney(c.expected.payable) : 'E_INPUT') + '</span>' },
          { html: '<span class="mono">' + (c.actual && c.actual.ok ? Q.fmtMoney(c.actual.payable) : 'E_INPUT') + '</span>' },
          { html: c.hits.length ? c.hits.map(function (id) {
            var inj = (st.defects || []).indexOf(id) >= 0;
            return '<span class="chip' + (inj ? ' on' : '') + '" title="' + (inj ? '已注入' : '未注入，仅表示该用例能检出') + '">' + E(Q.DEFECT_MAP[id].short) + '</span>';
          }).join(' ') : '<span class="muted">—</span>' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>用例与结果明细</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">共 ' + res.cases.length + ' 条 · 绿色边框为已注入缺陷</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b flush"><div class="tbl-scroll">' +
      Q.table(['用例', '等价类', '取值', '判定', '预期应付(元)', '实际应付(元)', '可检出的缺陷'], rows) +
      '</div></div></details>';

    return h;
  }

  /* ------------------------------------------------------------ 验证区 */
  function verify(res, st) {
    var cov = res.coverage;
    var okA = cov.rate === 100;
    var okB = res.detectedCount === 4;
    var hit = res.matrix.filter(function (x) { return x.detected; });
    var miss = res.matrix.filter(function (x) { return !x.detected; });
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(okA ? 'ok' : 'no',
      (okA ? '✓ ' : '✕ ') + '已覆盖 ' + cov.covered + ' / ' + cov.total + ' 个等价类',
      [
        ['覆盖详情', res.cases.length + ' 条用例 · 总体 ' + Q.num(cov.rate, 1) + '% · 无效类 ' + cov.invalidCovered + '/' + cov.invalidTotal],
        cov.missed.length ? ['未覆盖', cov.missed.join('、')] : null
      ]);

    h += Q.concl(okB ? 'ok' : 'no',
      (okB ? '✓ ' : '✕ ') + '可检出 ' + res.detectedCount + ' / 4 个故障',
      [
        ['已捕获', hit.length ? hit.map(function (x) { return x.short + '（' + x.caseCount + ' 条命中）'; }).join('、') : '暂无用例触发差异'],
        miss.length ? ['能力边界', miss.map(function (x) { return x.short; }).join('、') + ' 属于多字段组合逻辑，单字段取样无法触及。'] : null
      ]);

    if (cov.rate === 100 && res.detectedCount < 4) {
      h += Q.concl('insight', '◆ 关键启发：高覆盖 ≠ 零缺陷',
        [['发现', '类覆盖率已达 100%，仍有 ' + (4 - res.detectedCount) + ' 处故障遗漏——等价类只保证测到每类，无法替代跨字段组合。']]);
    }
    h += '</div></section>';
    return h;
  }

  function customBlock(st) {
    var opts = Q.CONFIG.types.map(function (t) { return { v: t, l: Q.CONFIG.typeLabels[t] }; });
    return '<section class="card"><h3 class="card-h">自定义组合用例<span class="card-hint">' + (st.custom || []).length + ' 条</span></h3><div class="card-b">' +
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

  WB.registerExp({
    id: 'm2', no: 2,
    title: '等价类划分',
    subtitle: '把无穷输入拆成有限个等价区间，用更少用例代表同类行为。',
    chapter: '第8章 8.1.1 等价类划分法',
    knowledge: '按规格划分有效/无效等价类，用类覆盖率与无效类覆盖度衡量用例集；理解类覆盖不等于缺陷检出。',
    minutes: 12,
    goals: [
      '给任一字段划出有效类与无效类',
      '看清覆盖率的分母是类数',
      '造出“覆盖满但不报错”的反例'
    ],
    blockers: [
      ['多测几个值 = 划分', '同类的值再多，覆盖的类也没变'],
      ['无效类测一个就够', '越界和类型错走的是不同分支'],
      ['覆盖率达标就放心', '组合场景全藏在类的缝隙里']
    ],
    theory: '<p>把输入空间按“处理逻辑相同”切成若干类，每类取代表值。有效类证明系统能做对，无效类证明它不会做错。</p>' +
      '<div class="formula">类覆盖率 = 已覆盖的类 ÷ 类总数\n' +
      '无效类覆盖率 = 已覆盖无效类 ÷ 无效类总数</div>' +
      '<p class="mt6">分母由规格决定，不由你测多少决定。</p>',
    prereq: '理解“有效域”与整数约束。',
    scopeNote: '表单校验、金额计算这类由规格直接约束的输入。',
    notDo: '不做组合测试与边界邻域分析。',

    params: [
      {
        key: 'field', type: 'select', label: '被测字段', value: 'seats',
        options: [
          { v: 'hours', l: '培训课时数（1–120）' },
          { v: 'seats', l: '报名人数（1–20）' },
          { v: 'coupon', l: '优惠券面额（0–500）' }
        ],
        hint: '其余字段固定为基准值（11 课时 / 1 人 / 新学员 / 持证）。'
      },
      {
        key: 'level', type: 'select', label: '划分粒度',
        options: [
          { v: 'coarse', l: '粗放 · 每字段 2 类' },
          { v: 'standard', l: '标准 · 3–4 个有效类 + 3 个无效类' },
          { v: 'fine', l: '精细 · 细分有效区间 + 3–4 个无效类' }
        ],
        hint: '粒度决定分母：类越多，达标越难。'
      },
      {
        key: 'strategy', type: 'select', label: '取样策略',
        options: [
          { v: 'mid', l: '类中点（每类 1 个）' },
          { v: 'edges', l: '类内两端（每类最多 2 个）' },
          { v: 'seeded', l: '固定种子随机（种子 20261112）' }
        ],
        hint: '固定种子 20261112，可复现。'
      },
      { key: 'includeInvalid', type: 'check', label: '包含无效等价类用例', sub: '关闭后无效类不可能被覆盖', value: true },
      { key: 'defects', type: 'checks', label: '注入缺陷', options: DEFECT_OPTS }
    ],
    defaults: {
      field: 'seats', level: 'standard', strategy: 'mid', includeInvalid: true,
      defects: ['SEAT_BOUNDARY'],
      cHours: 1, cSeats: 1, cCoupon: 500, cType: 'new', cHasCert: true,
      custom: [], snapA: null, snapB: null
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
        if (st.custom.length > 8) st.custom = st.custom.slice(-8);
        WB.toast('已添加自定义用例');
        return true;
      }
      if (name === 'del-case') {
        st.custom = (st.custom || []).filter(function (_, i) { return String(i) !== String(arg); });
        return true;
      }
      if (name === 'snap-a' || name === 'snap-b') {
        var res = compute(st);
        var snap = {
          field: st.field, level: st.level, strategy: st.strategy,
          cases: res.cases.length, rate: res.coverage.rate, detected: res.detectedCount,
          injTotal: res.injected.length,
          injHit: res.matrix.filter(function (m) { return m.injected && m.detected; }).length
        };
        st[name === 'snap-a' ? 'snapA' : 'snapB'] = snap;
        WB.toast('已存为对照 ' + (name === 'snap-a' ? 'A' : 'B'));
        return true;
      }
      if (name === 'snap-clear') { st.snapA = null; st.snapB = null; return true; }
      return false;
    },

    evidence: function (res) {
      var cov = res.coverage.rate;
      var status = cov === 100 && res.detectedCount >= 3 ? 'pass' : (cov >= 60 ? 'warn' : 'fail');
      var missed = res.matrix.filter(function (m) { return !m.detected; }).map(function (m) { return m.short; });
      return {
        status: status,
        coverage: cov,
        label: '等价类覆盖率',
        defects: res.matrix.filter(function (m) { return m.detected; }).map(function (m) { return m.id; }),
        note: res.cases.length + ' 条用例覆盖 ' + res.coverage.covered + '/' + res.coverage.total + ' 类，可检出 ' +
          res.detectedCount + '/4 缺陷' + (missed.length ? '（未检出 ' + missed.join('/') + '）' : '')
      };
    }
  });
})();

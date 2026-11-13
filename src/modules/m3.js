/* ============================================================================
 * m3.js — 实验三：边界值分析
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc, C = Q.CONFIG;

  var DEFECT_OPTS = Q.DEFECTS.map(function (d) {
    return { v: d.id, l: d.short + ' ' + d.name };
  });

  function compute(st) {
    return Q.bvExecute({
      field: st.field, strategy: st.strategy, base: st.base, defects: st.defects || []
    });
  }

  /* ---------------------------------------------------------- 数轴取值图 */
  function axisChart(res) {
    var pts = res.points;
    if (!pts.length) return '<div class="empty">当前策略没有生成取值点</div>';
    var w = 660, h = 172, padL = 26, padR = 26;
    var baseY = 92;
    var vals = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals.concat([res.domain[0]]));
    var hi = Math.max.apply(null, vals.concat([res.domain[1]]));
    if (hi === lo) hi = lo + 1;
    var x = function (v) { return padL + ((v - lo) / (hi - lo)) * (w - padL - padR); };
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img" aria-label="边界取值点分布图">'];

    // 有效域色带
    var domX0 = x(res.domain[0]), domW = Math.max(4, x(res.domain[1]) - domX0);
    out.push('<rect x="' + domX0.toFixed(1) + '" y="' + (baseY - 18) + '" width="' +
      domW.toFixed(1) + '" height="36" rx="8" fill="rgba(13, 148, 136, 0.08)" stroke="rgba(13, 148, 136, 0.25)"/>');

    // 档位分界（顶部小标签 + 虚线）
    var lastTierX = -999, tierRow = 0;
    res.pairs.forEach(function (p) {
      if (p.kind !== 'tier') return;
      var bx = (x(p.below) + x(p.above)) / 2;
      if (Math.abs(bx - lastTierX) < 34) tierRow = 1 - tierRow;
      else tierRow = 0;
      lastTierX = bx;
      var ty = tierRow ? 34 : 18;
      out.push('<line x1="' + bx.toFixed(1) + '" y1="' + (ty + 4) + '" x2="' + bx.toFixed(1) + '" y2="' + (baseY + 22) +
        '" stroke="#d97706" stroke-width="1.1" stroke-dasharray="3 3" opacity=".65"/>');
      out.push('<rect x="' + (bx - 16).toFixed(1) + '" y="' + (ty - 10) + '" width="32" height="14" rx="4" fill="#fffbeb" stroke="#fcd34d" stroke-width=".8"/>');
      out.push('<text x="' + bx.toFixed(1) + '" y="' + ty + '" font-size="8.5" font-weight="600" fill="#b45309" text-anchor="middle" font-family="monospace">' +
        p.below + '|' + p.above + '</text>');
    });

    // 轴线
    out.push('<line x1="' + padL + '" y1="' + baseY + '" x2="' + (w - padR) + '" y2="' + baseY + '" stroke="#cbd5e1" stroke-width="1.5"/>');

    // 取值点（临近点错峰放置数值标签，避免重影）
    var prevPxRow0 = -999, prevPxRow1 = -999;
    pts.forEach(function (p, i) {
      var c = res.cases[i];
      var px = x(p.v);
      var fail = c && c.pass === false;
      var color = fail ? '#dc2626' : '#0066cc';
      var row = 0;
      if (px - prevPxRow0 < 24) row = 1;
      if (row === 0) prevPxRow0 = px; else prevPxRow1 = px;
      var labelY = row === 0 ? baseY + 32 : baseY + 46;
      out.push('<line x1="' + px.toFixed(1) + '" y1="' + (baseY - 14) + '" x2="' + px.toFixed(1) + '" y2="' + (labelY - 10) +
        '" stroke="' + color + '" stroke-width=".9" opacity=".32"/>');
      if (fail) {
        out.push('<circle cx="' + px.toFixed(1) + '" cy="' + baseY + '" r="6.5" fill="rgba(220, 38, 38, 0.14)"/>');
      }
      out.push('<circle cx="' + px.toFixed(1) + '" cy="' + baseY + '" r="4.2" fill="#ffffff" stroke="' + color + '" stroke-width="2"/>');
      out.push('<text x="' + px.toFixed(1) + '" y="' + labelY + '" font-size="9.5" font-weight="' + (fail ? '700' : '500') + '" fill="' + color +
        '" text-anchor="middle" font-family="monospace">' + p.v + '</text>');
    });

    // 轴端标注
    out.push('<text x="' + padL + '" y="' + (h - 6) + '" font-size="8.5" fill="#94a3b8" font-family="monospace">' + lo + '</text>');
    out.push('<text x="' + (w - padR) + '" y="' + (h - 6) + '" font-size="8.5" fill="#94a3b8" text-anchor="end" font-family="monospace">' + hi + '</text>');
    out.push('<text x="' + (domX0 + 8).toFixed(1) + '" y="' + (baseY - 23) + '" font-size="9" font-weight="600" fill="#0d9488" font-family="sans-serif">有效域 ' +
      res.domain[0] + '–' + res.domain[1] + '</text>');
    out.push('</svg>');
    return '<div class="chart-box">' + out.join('') + '</div>' +
      '<div class="chart-cap">蓝点 = 符合规格；红圈点 = 实际与预期不符；琥珀虚线 = 业务档位边界。</div>';
  }

  function viz(res, st) {
    var h = '';
    h += '<section class="card"><h3 class="card-h">实时反馈 · 取值点与边界命中<span class="card-hint">' +
      Q.BV_STRATEGIES[res.strategy].label + '</span></h3><div class="card-b">';
    h += '<div class="metrics mb10">' +
      '<div class="metric"><div class="m-l">取值点数</div><div class="m-v">' + res.caseCount + '</div></div>' +
      '<div class="metric hl"><div class="m-l">边界对命中率</div><div class="m-v">' + Q.num(res.hitRate, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">命中边界对</div><div class="m-v">' + res.boundaryHit + '<small>/' + res.boundaryTotal + '</small></div></div>' +
      '<div class="metric"><div class="m-l">可检出缺陷</div><div class="m-v">' + res.detectedCount + '<small>/4</small></div></div>' +
      '<div class="metric"><div class="m-l">失败用例</div><div class="m-v">' + res.failCount + '</div></div>' +
      '</div>';
    h += axisChart(res);
    h += '</div></section>';

    // 边界对表
    var rows = res.pairStatus.map(function (p) {
      return {
        cells: [
          { html: '<span class="chip">' + E(p.id) + '</span>' },
          { v: p.label },
          { html: '<span class="mono">' + p.below + '</span> / <span class="mono">' + p.above + '</span>' },
          { html: (p.hasBelow ? '✓' : '✕') + ' / ' + (p.hasAbove ? '✓' : '✕') },
          { html: p.hit ? Q.badge('pass', '命中') : Q.badge('fail', '未命中') }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>边界对命中明细</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">命中 ' + res.boundaryHit + ' / ' + res.boundaryTotal + ' 对（两侧均取到）</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b flush">' + Q.table(['编号', '边界说明', 'below / above', '两侧是否取到', '结论'], rows) + '</div></details>';

    // 缺陷矩阵
    h += '<section class="card"><h3 class="card-h">缺陷检出矩阵</h3><div class="card-b">' +
      '<div class="dmatrix">' + res.matrix.map(function (m) {
        return '<div class="dm ' + (m.detected ? 'dm-hit' : 'dm-miss') + (m.injected ? ' dm-inj' : '') + '">' +
          '<div class="dm-h"><span class="chip">' + E(m.short) + '</span>' + (m.injected ? '<span class="tiny">已注入</span>' : '') + '</div>' +
          '<div class="dm-n">' + E(m.name) + '</div>' +
          '<div class="dm-r">' + (m.detected ? '✓ 可检出 · ' + m.caseCount + ' 条命中' : '✕ 检不出') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="chart-cap mt6">注意：D4 折扣叠加是双字段组合故障，单字段边界无论如何取点都无法触达，需配合正交或自定义组合测试。</div>' +
      '</div></section>';

    // 用例表（收纳式卡片）
    var crow = res.cases.map(function (c) {
      return {
        cls: c.pass ? 'row-pass' : 'row-fail',
        cells: [
          { html: '<b>' + E(c.id) + '</b>' },
          { html: '<span class="mono">' + c.value + '</span>' },
          { v: c.roles.join(' / ') },
          { html: c.pass ? Q.badge('pass', '一致') : Q.badge('fail', c.diff || '不一致') },
          { html: '<span class="mono">' + (c.expected.ok ? Q.fmtMoney(c.expected.payable) : 'E_INPUT') + '</span>' },
          { html: '<span class="mono">' + (c.actual && c.actual.ok ? Q.fmtMoney(c.actual.payable) : 'E_INPUT') + '</span>' },
          { html: c.hits.length ? c.hits.map(function (id) { return '<span class="chip">' + E(Q.DEFECT_MAP[id].short) + '</span>'; }).join(' ') : '—' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>取值用例与验证明细</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">共 ' + res.cases.length + ' 条边界取样</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b flush"><div class="tbl-scroll">' +
      Q.table(['用例', '取值', '取值角色', '判定', '预期应付', '实际应付', '命中缺陷'], crow) +
      '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var okA = res.hitRate === 100;
    var hit = res.matrix.filter(function (x) { return x.detected; });
    var miss = res.matrix.filter(function (x) { return !x.detected; });
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(okA ? 'ok' : 'no',
      (okA ? '✓ ' : '✕ ') + '命中边界对 ' + res.boundaryHit + ' / ' + res.boundaryTotal,
      [
        ['取样', Q.BV_STRATEGIES[res.strategy].label + ' · 共 ' + res.caseCount + ' 点：' + res.points.map(function (p) { return p.v; }).join('、')],
        okA ? null : ['缺口', res.pairStatus.filter(function (p) { return !p.hit; }).map(function (p) { return p.label; }).join('、') + ' 仅覆盖了单侧。']
      ]);

    h += Q.concl(res.detectedCount > 0 ? 'ok' : 'no',
      (res.detectedCount > 0 ? '✓ ' : '✕ ') + '可检出 ' + res.detectedCount + ' / 4 个故障',
      [
        ['命中', hit.length ? hit.map(function (x) { return x.short; }).join('、') : '当前取样未触发差异'],
        miss.length ? ['盲区', miss.map(function (x) { return x.short; }).join('、') + ' 需组合条件或特定小额基准才能暴露。'] : null
      ]);

    h += Q.concl('insight', '◆ 下一步探究',
      [['建议', '切换“仅边界点”与“边界点 + 外侧邻点”，观察检出数变化，即可直观定位 off-by-one 误差方向。']]);
    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm3', no: 3,
    title: '边界值分析',
    subtitle: '故障高发在区间边缘：聚焦“边界上”和“外侧一步”，用最小成本暴露临界错。',
    chapter: '第8章 8.1.2 边界值分析法',
    knowledge: '从档位配置推导边界对，按 2 值/3 值/加端点三种策略取点，用边界对命中率与 off-by-one 检出衡量有效性。',
    minutes: 12,
    goals: [
      '从档位配置推导出全部边界',
      '分辨三种取值策略的差别',
      '解释边界值为什么抓不到组合缺陷'
    ],
    blockers: [
      ['边界值就是取两个数', '不写清取哪两个，和随机取样没区别'],
      ['2 值 / 3 值混着用', '口径不写清，覆盖率没法比'],
      ['只测边界上', 'off-by-one 常常在边界外一步']
    ],
    theory: '<p>边界有两个来源：字段的有效域端点、业务档位的分界。</p>' +
      '<div class="formula">2 值：below、above\n' +
      '3 值：below−1、below、above、above+1\n' +
      '边界对命中率 = 两侧都取到的对数 ÷ 边界对总数</div>',
    prereq: '先做 M2，理解什么是等价类。',
    scopeNote: '整数、有序、边界明确的字段。',
    notDo: '不做多字段联合边界与浮点精度。',

    params: [
      {
        key: 'field', type: 'select', label: '被测字段',
        options: [
          { v: 'seats', l: '报名人数（档位 2|3、5|6、10|11）' },
          { v: 'hours', l: '培训课时数（域端点 1、120）' },
          { v: 'coupon', l: '优惠券面额（域端点 0、500）' }
        ],
        hint: '人数同时含档位分界与域端点，边界最密。'
      },
      {
        key: 'strategy', type: 'select', label: '边界取值策略',
        options: [
          { v: 'on', l: '仅边界点（每个边界 2 个）' },
          { v: 'off', l: '边界点 + 外侧邻点（每个边界 4 个）' },
          { v: 'full', l: '3 值 + 有效域端点' }
        ],
        hint: '决定能否看到边界外一步的行为。'
      },
      {
        key: 'base', type: 'select', label: '基准输入',
        options: [
          { v: 'typical', l: '典型：11 课时 / 持证（折扣额含 .5 元）' },
          { v: 'small', l: '小额：1 课时 / 持证（易触发券后负值）' },
          { v: 'large', l: '大额：120 课时 / 无证' }
        ],
        hint: '其他字段固定；基准选错会检不出某些缺陷。'
      },
      { key: 'defects', type: 'checks', label: '注入缺陷', options: DEFECT_OPTS }
    ],
    defaults: {
      field: 'seats', strategy: 'off', base: 'typical',
      defects: ['SEAT_BOUNDARY', 'ROUND_DOWN'],
      snapA: null, snapB: null
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onAction: function (name, arg, st) {
      if (name === 'snap-a' || name === 'snap-b') {
        var res = compute(st);
        st[name === 'snap-a' ? 'snapA' : 'snapB'] = {
          strategy: st.strategy, base: st.base, cases: res.caseCount,
          hit: res.boundaryHit, total: res.boundaryTotal, detected: res.detectedCount
        };
        return true;
      }
      if (name === 'snap-clear') { st.snapA = null; st.snapB = null; return true; }
      return false;
    },

    evidence: function (res) {
      var status = res.hitRate === 100 && res.detectedCount >= 2 ? 'pass' : (res.hitRate >= 60 ? 'warn' : 'fail');
      return {
        status: status,
        coverage: res.hitRate,
        label: '边界对命中率',
        defects: res.matrix.filter(function (m) { return m.detected; }).map(function (m) { return m.id; }),
        note: Q.BV_STRATEGIES[res.strategy].label + '，' + res.caseCount + ' 个取值点，命中 ' +
          res.boundaryHit + '/' + res.boundaryTotal + ' 个边界对，可检出 ' + res.detectedCount + '/4 缺陷'
      };
    }
  });
})();

/* ============================================================================
 * m5.js — 实验五：状态迁移测试
 * 状态、事件、守卫、迁移动作都参与真实执行；覆盖率分母由当前模型（开关后）决定。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;
  var NW = 78, NH = 30;

  function compute(st) {
    var toggles = {
      allowRevise: !!st.allowRevise, allowReopen: !!st.allowReopen, allowPromote: !!st.allowPromote
    };
    var res = Q.fsmRun({ events: st.events || [], toggles: toggles, seatsLeft: st.seatsLeft });
    res.toggles = toggles;
    res.criterion = st.criterion;
    var crit = res.coverage[st.criterion];
    res.crit = crit;
    res.critPassed = st.criterion === 'path' ? null : (crit.rate === 100);
    return res;
  }

  /* ---------------------------------------------------------- 状态迁移图 */
  function diagram(res) {
    var W = 920, H = 330;
    var byId = {};
    Q.FSM_STATES.forEach(function (s) { byId[s.id] = s; });
    var covered = {};
    res.trace.forEach(function (t) { if (t.ok) covered[t.tid] = true; });

    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" class="fsm-svg" role="img" aria-label="报名单状态迁移图">'];
    out.push('<defs>');
    out.push('<marker id="fsm-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#cbd5e1"/></marker>');
    out.push('<marker id="fsm-arw-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#0d9488"/></marker>');
    out.push('</defs>');

    // 边
    res.active.forEach(function (t) {
      var a = byId[t.from], b = byId[t.to];
      if (!a || !b) return;
      var on = !!covered[t.id];
      var color = on ? '#0d9488' : '#cbd5e1';
      var dx = b.x - a.x, dy = b.y - a.y;
      var tt = Math.min((NW / 2) / (Math.abs(dx) || 1e-6), (NH / 2) / (Math.abs(dy) || 1e-6));
      var ax = a.x + dx * tt, ay = a.y + dy * tt;
      var bx = b.x - dx * tt, by = b.y - dy * tt;
      var back = bx < ax - 4;
      var cx, cy;
      if (back) { cx = (ax + bx) / 2; cy = Math.max(ay, by) + 92; }
      else if (Math.abs(dy) > 40) { cx = (ax + bx) / 2; cy = (ay + by) / 2; }
      else { cx = (ax + bx) / 2; cy = Math.min(ay, by) - 24; }
      var d = 'M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
      out.push('<path class="' + (on ? 'fsm-edge-on' : 'fsm-edge') + '" d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + (on ? 2.2 : 1.3) +
        '" marker-end="url(#' + (on ? 'fsm-arw-on' : 'fsm-arw') + ')"/>');
      // 二次贝塞尔中点
      var lx = 0.25 * ax + 0.5 * cx + 0.25 * bx;
      var ly = 0.25 * ay + 0.5 * cy + 0.25 * by;
      out.push(label(lx, ly, t.label + (t.guard ? ' ⟨' + t.guard.replace('seatsLeft', '名额') + '⟩' : ''), on));
    });

    // 节点
    Q.FSM_STATES.forEach(function (s) {
      var isVisited = res.coveredStates.indexOf(s.id) >= 0;
      var isFinal = res.final === s.id;
      var fill = isFinal ? '#0066cc' : isVisited ? '#f0fdfa' : '#ffffff';
      var stroke = isFinal ? '#004999' : isVisited ? '#5eead4' : '#e2e8f0';
      out.push('<g>');
      if (isFinal) {
        out.push('<rect class="fsm-pulse" x="' + (s.x - NW / 2 - 4) + '" y="' + (s.y - NH / 2 - 4) + '" width="' + (NW + 8) + '" height="' + (NH + 8) + '" rx="11" fill="none" stroke="#0066cc" stroke-width="1.6"/>');
      }
      out.push('<rect x="' + (s.x - NW / 2) + '" y="' + (s.y - NH / 2) + '" width="' + NW + '" height="' + NH +
        '" rx="8" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isFinal ? 2 : 1.3) + '"/>');
      out.push('<text x="' + s.x + '" y="' + (s.y + 4.5) + '" font-size="12" font-weight="' + (isFinal ? '600' : '500') + '" text-anchor="middle" fill="' +
        (isFinal ? '#ffffff' : isVisited ? '#0f766e' : '#64748b') + '" font-family="sans-serif">' + E(s.label) + '</text>');
      if (s.kind === 'start') out.push('<circle cx="' + (s.x - NW / 2 - 10) + '" cy="' + s.y + '" r="3.5" fill="#0d9488"/>');
      out.push('</g>');
    });
    out.push('</svg>');
    return '<div class="chart-box fsm-box">' + out.join('') + '</div>' +
      '<div class="chart-cap">青色路径 = 已触发迁移，浅灰 = 未到达，尖括号内为守卫条件。</div>';
  }

  function label(x, y, text, on) {
    var w = Math.max(28, text.length * 5.6 + 8);
    return '<g><rect x="' + (x - w / 2).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" width="' + w.toFixed(1) +
      '" height="13" rx="3" fill="#ffffff" fill-opacity="0.92"/>' +
      '<text x="' + x.toFixed(1) + '" y="' + (y + 2.5).toFixed(1) + '" font-size="9" text-anchor="middle" fill="' +
      (on ? '#0f766e' : '#94a3b8') + '" font-family="sans-serif">' + E(text) + '</text></g>';
  }

  function viz(res, st) {
    var h = '';
    var c = res.coverage;
    h += '<section class="card"><h3 class="card-h">实时反馈 · 执行轨迹与覆盖<span class="card-hint">' +
      res.eventCount + ' 个事件，' + res.invalid.length + ' 次无效操作</span></h3><div class="card-b">';

    h += '<div class="metrics mb10">' +
      '<div class="metric hl"><div class="m-l">状态覆盖</div><div class="m-v">' + Q.num(c.state.rate, 1) + '<small>%</small></div></div>' +
      '<div class="metric hl"><div class="m-l">迁移覆盖</div><div class="m-v">' + Q.num(c.transition.rate, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">迁移对覆盖</div><div class="m-v">' + Q.num(c.pair.rate, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">到达终态</div><div class="m-v">' + c.path.terminalReached.length + '<small>/3</small></div></div>' +
      '<div class="metric"><div class="m-l">无效操作</div><div class="m-v">' + res.invalid.length + '</div></div>' +
      '</div>';

    h += diagram(res);

    h += '<div class="fsm-legend">' +
      '<span><i class="cv-swatch" style="background:#0066cc;border-color:#004999"></i>当前状态：' + E(Q.fsmStateLabel(res.final)) + '</span>' +
      '<span><i class="cv-swatch" style="background:#f0fdfa;border-color:#5eead4"></i>已访问状态 ' + res.coveredStates.length + '/' + res.allStates + '</span>' +
      '<span><i class="cv-swatch" style="background:#ffffff;border-color:#e2e8f0"></i>未访问状态</span>' +
      '<span>剩余名额：' + res.seatsLeft + '</span>' +
      '</div>';
    h += '</div></section>';

    // 序列编辑器
    h += '<section class="card"><h3 class="card-h">事件序列编辑器<span class="card-hint">点击事件按钮追加到序列末尾</span></h3><div class="card-b">';
    h += '<div class="seqbox">' + ((st.events || []).length ?
      st.events.map(function (ev, i) {
        var t = res.trace[i];
        var cls = t && t.ok ? 'ok' : 'bad';
        return '<span class="seqchip ' + cls + '" title="' + E(t ? (t.ok ? t.from + ' → ' + t.to : t.reason) : '') + '">' +
          (i + 1) + '. ' + E(((Q.FSM_EVENTS.filter(function (x) { return x.id === ev; })[0]) || {}).label || ev) +
          '</span>';
      }).join('') : '<span class="tiny muted">（空序列：直接读初始状态）</span>') + '</div>';
    h += '<div class="btn-row mb6" style="margin-top:8px">' +
      Q.FSM_EVENTS.map(function (e) {
        return '<button class="btn sm" data-act="push-event" data-arg="' + e.id + '">+ ' + E(e.label) + '</button>';
      }).join('') + '</div>';
    h += '<div class="btn-row">' +
      '<button class="btn sm" data-act="suggest-seq">生成覆盖序列（贪心）</button>' +
      '<button class="btn sm ghost" data-act="pop-event">撤销最后一个</button>' +
      '<button class="btn sm ghost" data-act="clear-events">清空序列</button>' +
      '<span class="tiny muted">序列长度 ' + (st.events || []).length + ' / 24</span>' +
      '</div>';
    h += '</div></section>';

    // 执行轨迹 & 迁移总表（收纳式卡片）
    var coveredMap = {};
    res.trace.forEach(function (t) { if (t.ok) coveredMap[t.tid] = true; });
    var rows = res.trace.map(function (t) {
      return {
        cls: t.ok ? 'row-pass' : 'row-fail',
        cells: [
          { html: '<b>' + t.index + '</b>' },
          { v: t.eventLabel },
          { html: '<span class="chip">' + E(Q.fsmStateLabel(t.from)) + '</span>' },
          { html: t.ok ? '→ <span class="chip">' + E(Q.fsmStateLabel(t.to)) + '</span>' : '<span class="chip">未迁移</span>' },
          { html: t.ok ? Q.badge('pass', E(t.tid)) : Q.badge('fail', '无效') },
          { html: '<span class="tiny ' + (t.ok ? 'muted' : '') + '">' + E(t.ok ? t.label : t.reason) + '</span>' }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>执行轨迹与状态迁移详情表</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">步数 ' + rows.length + ' · 已覆盖迁移 ' + c.transition.covered + '/' + c.transition.total + '</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b">' +
      (rows.length ? '<div class="tbl-scroll mb10">' + Q.table(['#', '事件', '起始状态', '结果状态', '迁移', '说明'], rows) + '</div>'
        : Q.empty('序列为空：暂无执行轨迹。')) +
      '<div class="tiny muted mb6">全模型启用迁移覆盖情况</div>' +
      '<div class="tbl-wrap" style="max-height:240px;overflow:auto">' +
      Q.table(['迁移', '从', '到', '触发事件', '守卫条件', '本次覆盖'], res.active.map(function (t) {
        return {
          cls: coveredMap[t.id] ? 'row-pass' : '',
          cells: [
            { html: '<b>' + E(t.id) + '</b>' },
            { v: Q.fsmStateLabel(t.from) },
            { v: Q.fsmStateLabel(t.to) },
            { v: t.label },
            { html: t.guard ? '<span class="mono tiny">' + E(t.guard) + '</span>' : '<span class="muted">无</span>' },
            { html: coveredMap[t.id] ? Q.badge('pass', '已覆盖') : Q.badge('mute', '未覆盖') }
          ]
        };
      })) + '</div>' +
      '</div></details>';

    // 覆盖清单（收纳式卡片）
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>状态与迁移覆盖缺口清单</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">状态 ' + c.state.covered + '/' + c.state.total + ' · 未覆盖迁移 ' + c.transition.missed.length + ' 条</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b"><div class="grid g2">' +
      '<div><div class="tiny muted mb6">已覆盖状态 ' + c.state.covered + ' / ' + c.state.total + '</div>' +
      '<div class="chips">' + res.coveredStates.map(function (s) { return '<span class="chip on">' + E(Q.fsmStateLabel(s)) + '</span>'; }).join('') +
      (c.state.missed.length ? c.state.missed.map(function (s) { return '<span class="chip">' + E(s) + '</span>'; }).join('') : '') +
      '</div></div>' +
      '<div><div class="tiny muted mb6">未覆盖迁移 ' + c.transition.missed.length + ' 条</div>' +
      '<div class="chips">' + (c.transition.missed.length ? c.transition.missed.map(function (s) {
        return '<span class="chip">' + E(s) + '</span>';
      }).join('') : '<span class="chip on">全部覆盖</span>') + '</div></div>' +
      '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var c = res.coverage[st.criterion];
    var critLabel = (Q.FSM_CRITERIA.filter(function (x) { return x.key === st.criterion; })[0] || {}).label || st.criterion;
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    if (st.criterion === 'path') {
      h += Q.concl('insight', '◆ 已抵达 ' + c.path.terminalReached.length + ' / 3 个业务终态',
        [['终态清单', c.path.terminalReached.length ? c.path.terminalReached.join('、') : '尚未进入任何终态'],
         ['模型说明', '状态机包含环路，理论路径无穷多，因此以终态到达数替代路径百分比。']]);
    } else {
      h += Q.concl(c.rate === 100 ? 'ok' : 'no',
        (c.rate === 100 ? '✓ ' : '✕ ') + critLabel + ' ' + c.rate + '%',
        [
          ['覆盖统计', c.covered + ' / ' + c.total + '（当前启用 ' + res.allStates + ' 个状态、' + res.active.length + ' 条迁移）'],
          c.missed && c.missed.length ? ['仍缺口', c.missed.slice(0, 6).join('、') + (c.missed.length > 6 ? ' 等 ' + c.missed.length + ' 项' : '')] : null
        ]);
    }

    h += Q.concl(res.invalid.length ? 'ok' : 'no',
      (res.invalid.length ? '✓ ' : '· ') + '触发并拦截 ' + res.invalid.length + ' 次非法操作',
      [
        ['拦截记录', res.invalid.length ? res.invalid.slice(0, 3).map(function (t) { return '第 ' + t.index + ' 步「' + t.eventLabel + '」' + t.reason; }).join('；')
          : '尚未测试非法事件，可尝试在当前状态下点不合法事件验证防御能力。'],
        ['判定原则', '状态机拒绝非法迁移是系统防御生效，不计入覆盖分母。']
      ]);

    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm5', no: 5, navLabel: '状态迁移',
    title: '状态迁移测试',
    subtitle: '用“状态—事件—守卫”追踪业务生命周期，验证合法流转与非法操作拦截。',
    chapter: '第8章 8.1.4 基于状态的测试；8.5 基于模型的测试',
    knowledge: '建立状态模型并用事件序列驱动执行；区分有效迁移与无效操作；按状态/迁移/迁移对/终态路径四种准则度量覆盖。',
    minutes: 15,
    goals: [
      '把业务生命周期画成状态机',
      '构造覆盖全部迁移的事件序列',
      '分清有效迁移与无效操作'
    ],
    blockers: [
      ['覆盖率 = 走过的节点数', '那只是状态覆盖，最容易漏的是迁移'],
      ['忽略守卫条件', '守卫不建，就漏掉“名额为 0”这条分支'],
      ['无效操作不记录', '它正是系统防御能力的证据']
    ],
    theory: '<p>四要素：状态、事件、守卫、动作。缺一项模型就失真。</p>' +
      '<div class="formula">状态覆盖 = 访问过的状态 ÷ 状态总数\n' +
      '迁移覆盖 = 走过的迁移 ÷ 有效迁移数\n' +
      '迁移对覆盖 = 相邻两跳 ÷ 可接续的迁移对</div>' +
      '<p class="mt6">有回边时路径无法穷举，所以这里不给路径覆盖率。</p>',
    prereq: '有限状态机的基本概念。',
    scopeNote: '单实体生命周期：报名单、订单、工单。',
    notDo: '不做并发、超时迁移与多实体交互。',

    params: [
      {
        key: 'preset', type: 'select', label: '事件序列预设',
        options: Q.FSM_PRESETS.map(function (p) { return { v: p.key, l: p.label }; }),
        hint: '同时设置序列与名额，之后可继续追加。'
      },
      {
        key: 'seatsLeft', type: 'number', label: '初始剩余名额', min: 0, max: 5, step: 1,
        hint: '为 0 时，预约只能进候补。'
      },
      {
        key: 'criterion', type: 'select', label: '覆盖准则',
        options: Q.FSM_CRITERIA.map(function (c) { return { v: c.key, l: c.label }; }),
        hint: '不同准则分母不同。'
      },
      {
        key: 'toggles', type: 'checks', label: '模型开关（改变状态机本身）',
        options: [
          { v: 'allowRevise', l: '允许驳回后修改重提（REJECTED → DRAFT）', s: '关闭后 REJECTED 成为终态' },
          { v: 'allowReopen', l: '允许取消后重新开启（CANCELLED → DRAFT）', s: '关闭后 CANCELLED 成为终态' },
          { v: 'allowPromote', l: '允许候补转正（WAITLIST → BOOKED）', s: '关闭后候补无法转正' }
        ],
        hint: '改变的是模型，不是测试数据。'
      }
    ],
    defaults: {
      preset: 'happy', seatsLeft: 3, criterion: 'transition',
      toggles: ['allowRevise', 'allowReopen', 'allowPromote'],
      allowRevise: true, allowReopen: true, allowPromote: true,
      events: ['submit', 'startReview', 'approve', 'book', 'attend', 'complete']
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onParam: function (key, st) {
      if (key === 'preset') {
        var p = Q.FSM_PRESETS.filter(function (x) { return x.key === st.preset; })[0];
        if (p) { st.events = p.events.slice(); st.seatsLeft = p.seatsLeft; }
      }
      if (key === 'toggles') {
        st.allowRevise = (st.toggles || []).indexOf('allowRevise') >= 0;
        st.allowReopen = (st.toggles || []).indexOf('allowReopen') >= 0;
        st.allowPromote = (st.toggles || []).indexOf('allowPromote') >= 0;
      }
    },

    onAction: function (name, arg, st) {
      if (name === 'push-event') {
        if ((st.events || []).length >= 24) { WB.toast('序列最长 24 个事件', 'warn'); return false; }
        st.events = (st.events || []).concat([arg]);
        st.preset = 'custom';
        return true;
      }
      if (name === 'pop-event') { st.events = (st.events || []).slice(0, -1); st.preset = 'custom'; return true; }
      if (name === 'clear-events') { st.events = []; st.preset = 'custom'; return true; }
      if (name === 'suggest-seq') {
        var s = Q.fsmSuggest({ allowRevise: st.allowRevise, allowReopen: st.allowReopen, allowPromote: st.allowPromote }, st.seatsLeft);
        st.events = s.events;
        WB.toast('已生成贪心序列：覆盖 ' + s.coveredTransitions + '/' + s.total + ' 条迁移（不是最优解）');
        return true;
      }
      return false;
    },

    evidence: function (res, st) {
      var crit = res.coverage[st.criterion];
      var rate = st.criterion === 'path' ? null : crit.rate;
      var status = st.criterion === 'path'
        ? (crit.terminalReached.length >= 1 ? 'warn' : 'fail')
        : (rate === 100 ? 'pass' : rate >= 60 ? 'warn' : 'fail');
      return {
        status: status,
        coverage: rate,
        label: (Q.FSM_CRITERIA.filter(function (c) { return c.key === st.criterion; })[0] || {}).label || st.criterion,
        defects: [],
        note: '状态 ' + res.coverage.state.covered + '/' + res.coverage.state.total +
          '，迁移 ' + res.coverage.transition.covered + '/' + res.coverage.transition.total +
          '，迁移对 ' + res.coverage.pair.covered + '/' + res.coverage.pair.total +
          '，无效操作 ' + res.invalid.length
      };
    }
  });
})();

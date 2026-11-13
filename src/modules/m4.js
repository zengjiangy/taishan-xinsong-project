/* ============================================================================
 * m4.js — 实验四：决策表测试
 * 规则表可编辑：点击条件格循环 Y → N → —，点击动作格循环四种动作。
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT, WB = window.WB;
  var E = Q.esc;
  var COND = Q.DT_COND_LABELS;
  var ACTION_KEYS = ['PASS', 'COND_A', 'COND_B', 'REJECT'];
  var ACT_SHORT = { PASS: '通过', COND_A: '条件A', COND_B: '条件B', REJECT: '拒绝' };
  var STATUS_META = {
    ok: { glyph: '✓', label: '与规格一致', cls: 'ok' },
    wrong: { glyph: '≠', label: '动作与规格不一致', cls: 'wrong' },
    conflict: { glyph: '!', label: '规则冲突', cls: 'conflict' },
    blocked: { glyph: '■', label: '冲突已阻断', cls: 'blocked' },
    uncovered: { glyph: '○', label: '无规则覆盖', cls: 'uncovered' }
  };

  function compute(st) {
    var rules = st.rules || [];
    var res = Q.dtEvaluate(rules, { strategy: st.strategy, scope: st.scope });
    var input = { age: st.caseAge, edu: st.caseEdu, years: st.caseYears, recommend: !!st.caseRec };
    res.single = Q.dtEvalInput(rules, input, st.strategy);
    res.singleConds = Q.appConditions(input);
    res.rules = rules;
    return res;
  }

  /* --------------------------------------------------------------- 规则表 */
  function ruleTable(res, st) {
    var rows = res.rules.map(function (r, ri) {
      var diag = res.ruleDiag[ri];
      var cells = [
        { html: '<b>' + E(r.id) + '</b>' },
        { html: cellBtn(r.id, 0, r.c[0], ri) },
        { html: cellBtn(r.id, 1, r.c[1], ri) },
        { html: cellBtn(r.id, 2, r.c[2], ri) },
        { html: cellBtn(r.id, 3, r.c[3], ri) },
        { html: '<button class="actbtn a-' + r.action + '" data-act="cycle-action" data-arg="' + ri + '">' + E(ACT_SHORT[r.action]) + '</button>' },
        { html: '<span class="num">' + (diag ? diag.match : 0) + '</span>' },
        { html: diag && diag.status === 'active' ? Q.badge('pass', '可触发')
          : diag && diag.status === 'shadowed' ? Q.badge('warn', '被遮蔽')
          : Q.badge('fail', '不可达') },
        { html: '<button class="btn sm ghost" data-act="del-rule" data-arg="' + ri + '" aria-label="删除规则 ' + E(r.id) + '">删除</button>' }
      ];
      return { cells: cells, cls: diag && diag.status !== 'active' ? 'row-warn' : '' };
    });
    return Q.table(['规则', 'C1 年龄', 'C2 学历', 'C3 年限', 'C4 推荐函', '动作', '匹配组合', '状态', ''], rows, { cls: 'ruletbl' });
  }

  function cellBtn(ruleId, i, v, ri) {
    var cls = v === 'Y' ? 'cv-y' : v === 'N' ? 'cv-n' : 'cv-d';
    return '<button class="cellbtn ' + cls + '" data-act="cycle-cell" data-arg="' + ri + ':' + i + '"' +
      ' aria-label="规则 ' + E(ruleId) + ' 条件 ' + (i + 1) + ' 当前为 ' + (v === '-' ? '不关心' : v) + '">' +
      (v === '-' ? '—' : v) + '</button>';
  }

  /* ------------------------------------------------------ 16 组合热力矩阵 */
  function matrix(res) {
    var pairsRow = [['Y', 'Y'], ['Y', 'N'], ['N', 'Y'], ['N', 'N']];
    var pairsCol = [['Y', 'Y'], ['Y', 'N'], ['N', 'Y'], ['N', 'N']];
    var map = {};
    res.rows.forEach(function (r) { map[r.key] = r; });
    var h = '<div class="matrix"><div class="mx-corner">C1·C2 \\ C3·C4</div>';
    pairsCol.forEach(function (c) {
      h += '<div class="mx-h">' + c.join('·') + '</div>';
    });
    pairsRow.forEach(function (rowP) {
      h += '<div class="mx-rh">' + rowP.join('·') + '</div>';
      pairsCol.forEach(function (colP) {
        var key = (rowP[0] === 'Y' ? '1' : '0') + (rowP[1] === 'Y' ? '1' : '0') +
          (colP[0] === 'Y' ? '1' : '0') + (colP[1] === 'Y' ? '1' : '0');
        var r = map[key];
        if (!r) {
          h += '<div class="mx-c mx-na" title="当前组合空间口径下不参与统计"><span class="mx-g">–</span><span class="mx-a">折叠</span></div>';
          return;
        }
        var m = STATUS_META[r.status];
        h += '<div class="mx-c mx-' + m.cls + '" title="' + E(r.label + '：' + m.label + '，判定 ' + (r.resolved ? ACT_SHORT[r.resolved] : '—')) + '">' +
          '<span class="mx-g">' + m.glyph + '</span>' +
          '<span class="mx-a">' + E(r.resolved ? ACT_SHORT[r.resolved] : '无结论') + '</span>' +
          '<span class="mx-k">' + E(r.label) + '</span>' +
          '</div>';
      });
    });
    h += '</div>';
    h += '<div class="mx-legend">' +
      Object.keys(STATUS_META).filter(function (k) { return k !== 'blocked'; }).map(function (k) {
        return '<span><i class="mx-sw mx-' + STATUS_META[k].cls + '"></i>' + STATUS_META[k].glyph + ' ' + STATUS_META[k].label + '</span>';
      }).join('') +
      '</div>';
    return h;
  }

  function viz(res, st) {
    var h = '';
    h += '<section class="card"><h3 class="card-h">实时反馈 · 规则表与组合覆盖<span class="card-hint">' +
      (res.scope === 'full' ? '组合空间：16 个' : '组合空间：9 个（不可达已折叠）') + '</span></h3><div class="card-b">';
    h += '<div class="metrics mb10">' +
      '<div class="metric hl"><div class="m-l">组合覆盖率</div><div class="m-v">' + Q.num(res.coverage, 1) + '<small>%</small></div></div>' +
      '<div class="metric hl"><div class="m-l">与规格一致率</div><div class="m-v">' + Q.num(res.accuracy, 1) + '<small>%</small></div></div>' +
      '<div class="metric"><div class="m-l">未覆盖组合</div><div class="m-v">' + res.uncovered.length + '</div></div>' +
      '<div class="metric"><div class="m-l">冲突组合</div><div class="m-v">' + res.conflicts.length + '</div></div>' +
      '<div class="metric"><div class="m-l">不可用规则</div><div class="m-v">' +
      res.ruleDiag.filter(function (d) { return d.status !== 'active'; }).length + '</div></div>' +
      '</div>';

    h += '<div class="btn-row mb6">' +
      '<button class="btn sm" data-act="add-rule">新增一条规则</button>' +
      '<button class="btn sm ghost" data-act="reset-rules">恢复为所选预设</button>' +
      '<span class="tiny muted">点击 Y / N / — 与动作格可循环切换</span>' +
      '</div>';
    h += '<div class="tbl-wrap ruletbl-wrap">' + ruleTable(res, st) + '</div>';
    h += '<div class="chart-cap">“匹配组合”= 该规则按 don\'t care 展开后会命中的组合数。' +
      '“被遮蔽”= 它命中的组合都被前序规则先命中，永远不会触发。' +
      '“不可达”= 条件自相矛盾（如 C1=N 且 C2=Y）。</div>';
    h += '</div></section>';

    h += '<section class="card"><h3 class="card-h">16 个条件组合的判定结果<span class="card-hint">行 = C1 年龄·C2 学历　列 = C3 年限·C4 推荐函</span></h3>' +
      '<div class="card-b">' + matrix(res) + '</div></section>';

    var s = res.single;
    var condRows = COND.map(function (c) {
      var v = res.singleConds[c.key];
      return {
        cells: [
          { html: '<b>' + E(c.key) + '</b> ' + E(c.label) },
          { html: '<span class="tiny muted">' + E(c.hint) + '</span>' },
          { html: v ? Q.badge('pass', '是') : Q.badge('mute', '否') }
        ]
      };
    });
    h += '<details class="sec-card"><summary class="sec-card-h">' +
      '<span>单点判定试算（当前输入走查）</span>' +
      '<span class="row" style="gap:8px"><span class="card-hint">规则结论：' + E(s.resolved ? Q.APP_ACTIONS[s.resolved].label : '无结论') +
      ' · 规格：' + E(Q.APP_ACTIONS[s.spec].label) + '</span><span class="sec-arrow">▾</span></span>' +
      '</summary><div class="sec-card-b">' +
      Q.table(['条件', '含义', '取值'], condRows) +
      '<div class="callout ' + (s.correct ? '' : 'warn') + ' mt6">' +
      '<b>命中规则：</b>' + (s.matched.length ? s.matched.join('、') : '无') +
      '　<b>规则结论：</b>' + (s.resolved ? Q.APP_ACTIONS[s.resolved].label : '无结论') +
      '　<b>规格结论：</b>' + Q.APP_ACTIONS[s.spec].label +
      (s.status === 'conflict' ? '　<span class="chip">冲突已按策略消解</span>' : '') +
      '</div></div></details>';

    return h;
  }

  function verify(res, st) {
    var okA = res.accuracy === 100 && res.uncovered.length === 0;
    var bad = res.ruleDiag.filter(function (d) { return d.status !== 'active'; });
    var h = '<section class="card"><h3 class="card-h">结论验证区</h3><div class="card-b">';

    h += Q.concl(okA ? 'ok' : 'no',
      (okA ? '✓ ' : '✕ ') + '规格一致率 ' + Q.num(res.accuracy, 1) + '%',
      [
        ['校验', res.total + ' 个组合中有 ' + (res.total - res.wrong.length) + ' 个与规格完全吻合。'],
        res.wrong.length ? ['偏差', res.wrong.slice(0, 4).map(function (r) {
          return r.label + ' 得 ' + (r.resolved ? ACT_SHORT[r.resolved] : '无') + '（应为 ' + ACT_SHORT[r.spec] + '）';
        }).join('；') + (res.wrong.length > 4 ? ' 等' : '')] : null
      ]);

    h += Q.concl(res.uncovered.length ? 'no' : 'ok',
      (res.uncovered.length ? '✕ ' : '✓ ') + '未覆盖组合 ' + res.uncovered.length + ' 个',
      [
        ['详情', res.uncovered.length ? '缺少命中规则：' + res.uncovered.map(function (r) { return r.label; }).join('、') + '，线上极易掉入默认兜底分支。'
          : '全部条件组合均有规则响应。']
      ]);

    h += Q.concl(res.conflicts.length || bad.length ? 'no' : 'ok',
      (res.conflicts.length || bad.length ? '✕ ' : '✓ ') + '规则冲突 ' + res.conflicts.length + ' 处 · 冗余/矛盾 ' + bad.length + ' 条',
      [
        ['诊断', bad.length ? bad.map(function (d) { return d.id + '（' + (d.status === 'shadowed' ? '被遮蔽' : '条件矛盾') + '）'; }).join('、') : '规则间无遮蔽或自相矛盾。']
      ]);

    h += '</div></section>';
    return h;
  }

  WB.registerExp({
    id: 'm4', no: 4, navLabel: '决策表',
    title: '决策表测试',
    subtitle: '把复杂的组合逻辑摊平成条件-动作矩阵，让规则遗漏与冲突无处遁形。',
    chapter: '第8章 8.1.3 决策表测试',
    knowledge: '把业务规则转成条件-动作表；用 don\'t care 压缩规则并展开校验；识别规则遗漏、冲突与不可达规则。',
    minutes: 15,
    goals: [
      '把需求写成条件-动作表',
      '用 don’t care 压缩并展开校验',
      '找出遗漏、冲突与被遮蔽的规则'
    ],
    blockers: [
      ['用 if-else 想规则', '只想到走通的那条路'],
      ['don’t care 掩盖冲突', '一个“—”展开后可能和别的规则撞车'],
      ['跑通就算对', '表能跑通，动作也可能是错的']
    ],
    theory: '<p>规则 = 条件组合 + 对应动作。4 个布尔条件就是 16 种组合。</p>' +
      '<div class="formula">组合覆盖率 = 被命中的组合 ÷ 组合空间\n' +
      '与规格一致率 = 判定正确的组合 ÷ 组合空间</div>' +
      '<p class="mt6">填不满说明需求有洞，有冲突说明需求自相矛盾。</p>',
    prereq: '布尔逻辑与组合计数。',
    scopeNote: '规则可枚举、条件可布尔化的业务判定。',
    notDo: '不做多值条件的完全组合爆炸。',

    params: [
      {
        key: 'preset', type: 'select', label: '规则表预设',
        options: Q.DT_PRESETS.map(function (p) { return { v: p.key, l: p.label }; }),
        hint: '会覆盖当前规则表，之后仍可手工编辑。'
      },
      {
        key: 'strategy', type: 'select', label: '冲突消解策略',
        options: Q.DT_STRATEGIES.map(function (s) { return { v: s.key, l: s.label }; }),
        hint: '同一张冲突表，换策略结论不同。'
      },
      {
        key: 'scope', type: 'select', label: '组合空间口径',
        options: [
          { v: 'full', l: '全展开：16 个组合' },
          { v: 'reachable', l: '可达折叠：9 个组合' }
        ],
        hint: '口径改变覆盖率的分母。'
      },
      { key: 'caseAge', group: '单点规则试算（可选）', type: 'number', label: '年龄', min: 10, max: 70, step: 1 },
      {
        key: 'caseEdu', group: '单点规则试算（可选）', type: 'select', label: '学历',
        options: [
          { v: 'junior', l: '初中及以下' }, { v: 'senior', l: '高中/中专' },
          { v: 'college', l: '大专' }, { v: 'bachelor', l: '本科及以上' }
        ]
      },
      { key: 'caseYears', group: '单点规则试算（可选）', type: 'number', label: '相关工作年限', min: 0, max: 30, step: 1 },
      { key: 'caseRec', group: '单点规则试算（可选）', type: 'check', label: '有单位推荐函' }
    ],
    defaults: {
      preset: 'complete', strategy: 'first', scope: 'full',
      rules: Q.dtPresetRules('complete'),
      caseAge: 30, caseEdu: 'bachelor', caseYears: 1, caseRec: false
    },

    compute: compute,
    viz: viz,
    verify: verify,

    onParam: function (key, st) {
      if (key === 'preset') st.rules = Q.dtPresetRules(st.preset);
    },

    onAction: function (name, arg, st) {
      var parts;
      if (name === 'cycle-cell') {
        parts = String(arg).split(':');
        var ri = Number(parts[0]), ci = Number(parts[1]);
        var order = ['Y', 'N', '-'];
        var cur = st.rules[ri].c[ci];
        st.rules[ri].c[ci] = order[(order.indexOf(cur) + 1) % 3];
        st.preset = 'custom';
        return true;
      }
      if (name === 'cycle-action') {
        var i = Number(arg);
        var cur2 = st.rules[i].action;
        st.rules[i].action = ACTION_KEYS[(ACTION_KEYS.indexOf(cur2) + 1) % ACTION_KEYS.length];
        st.preset = 'custom';
        return true;
      }
      if (name === 'add-rule') {
        if (st.rules.length >= 12) { WB.toast('最多 12 条规则，避免规则表失控', 'warn'); return false; }
        var used = {};
        st.rules.forEach(function (r) { used[r.id] = true; });
        var n = 1, id;
        do { id = 'R' + n; n++; } while (used[id]);
        st.rules.push({ id: id, c: ['Y', 'N', 'N', 'N'], action: 'REJECT', note: '手工新增' });
        st.preset = 'custom';
        return true;
      }
      if (name === 'del-rule') {
        if (st.rules.length <= 1) { WB.toast('至少保留一条规则', 'warn'); return false; }
        st.rules.splice(Number(arg), 1);
        st.preset = 'custom';
        return true;
      }
      if (name === 'reset-rules') {
        st.rules = Q.dtPresetRules(st.preset === 'custom' ? 'complete' : st.preset);
        if (st.preset === 'custom') st.preset = 'complete';
        return true;
      }
      return false;
    },

    evidence: function (res) {
      var status = res.accuracy === 100 && res.uncovered.length === 0 && res.conflicts.length === 0
        ? 'pass' : (res.accuracy >= 80 ? 'warn' : 'fail');
      return {
        status: status,
        coverage: res.accuracy,
        label: '规则表与规格一致率',
        defects: [],
        note: res.total + ' 个组合：未覆盖 ' + res.uncovered.length + '，冲突 ' + res.conflicts.length +
          '，遮蔽/不可达规则 ' + res.ruleDiag.filter(function (d) { return d.status !== 'active'; }).length
      };
    }
  });
})();

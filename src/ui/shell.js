/* ============================================================================
 * shell.js — 顶部渐变工作台 + 吸顶关卡胶囊栏 + 单舞台卡通互动容器
 * ==========================================================================*/
(function () {
  'use strict';

  var STORE_KEY = 'qinglan.qa.lab.v1';
  var SCHEMA = 'qinglan-qa-lab/1';
  var Q = window.QT;

  var WB = window.WB = {
    exps: [],
    byId: {},
    evidence: {},
    state: {},
    quizAnswers: {},
    quizDrafts: {},
    quizFilter: { topic: 'all', type: 'all', diff: 'all', mode: 'all', wrongOnly: false },
    session: { tab: {}, gFocus: 'm1', guideSeen: false, animTimer: null },
    version: '2.0.0',
    schema: SCHEMA,
    registerExp: registerExp
  };

  var EXP_META = {
    m1: { emoji: '🔍', short: '静态找茬', plain: '不运行程序，直接扫代码揪出隐藏漏洞' },
    m2: { emoji: '🎯', short: '等价分区', plain: '把百万种输入分成几组“同一国”，每组挑一个代表' },
    m3: { emoji: '🚧', short: '边界跳崖', plain: 'Bug 最喜欢躲在恰好卡线、加1减1的门槛边上' },
    m4: { emoji: '🚦', short: '决策开关', plain: '好几个条件凑一起？用开关表一眼看穿谁漏了谁打架' },
    m5: { emoji: '🚂', short: '状态闯关', plain: '状态不对点按钮必须拦住！检查每站之间的合法路线' },
    m6: { emoji: '💡', short: '白盒电路', plain: '揭开代码盒子，挑最少用例把所有路线点亮' },
    m7: { emoji: '🏭', short: '流水线', plain: '提交代码自动过四道关：核心冒烟挂了必须立刻亮红灯' },
    m8: { emoji: '🚀', short: '发布门禁', plain: '综合风险与门禁五盏绿灯，决定软件今天能不能起飞' }
  };

  /* ------------------------------------------------------------------ 持久化 */
  function loadStore() {
    try {
      var probe = '__qa_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.evidence) WB.evidence = parsed.evidence;
      if (parsed && parsed.state) WB.state = parsed.state;
      if (parsed && parsed.quizAnswers) WB.quizAnswers = parsed.quizAnswers;
    } catch (e) {
      WB.session.memOnly = true;
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        schema: SCHEMA,
        version: WB.version,
        savedAt: new Date().toISOString(),
        evidence: WB.evidence,
        state: WB.state,
        quizAnswers: WB.quizAnswers
      }));
    } catch (e) { /* ignore quota */ }
  }

  function clearAnim() {
    if (WB.session.animTimer) {
      clearInterval(WB.session.animTimer);
      clearTimeout(WB.session.animTimer);
      WB.session.animTimer = null;
    }
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function ensureState(exp) {
    if (!WB.state[exp.id]) WB.state[exp.id] = clone(exp.defaults || {});
    var st = WB.state[exp.id];
    var def = exp.defaults || {};
    Object.keys(def).forEach(function (k) {
      if (st[k] === undefined) st[k] = clone(def[k]);
    });
    return st;
  }

  function registerExp(spec) {
    WB.exps.push(spec);
    WB.byId[spec.id] = spec;
  }

  /* ------------------------------------------------------------------ Toast 提示 */
  function toast(msg, tone) {
    var host = document.getElementById('toast-host');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast' + (tone ? ' ' + tone : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2500);
  }
  WB.toast = toast;
  WB.save = saveStore;

  WB.record = function (expId, evObj) {
    if (!expId) return;
    WB.evidence[expId] = evObj;
    saveStore();
    refreshNav();
  };

  /* ------------------------------------------------------------------ 路由 */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h || h === 'overview') return { view: 'overview', id: null };
    if (h === 'graph') return { view: 'graph', id: null };
    if (h === 'quiz') return { view: 'quiz', id: null };
    if (h === 'evidence') return { view: 'evidence', id: null };
    if (h === 'about') return { view: 'about', id: null };
    var m = h.match(/^exp\/(m[1-8])$/);
    if (m) return { view: 'exp', id: m[1] };
    return { view: 'overview', id: null };
  }

  function go(route) {
    var target = '#/' + route.replace(/^#?\/?/, '');
    if (location.hash === target) render();
    else location.hash = target;
  }
  WB.go = go;

  /* ------------------------------------------------------------------ 顶部外壳 & 胶囊导航 */
  function buildHeader() {
    return '<header class="app-header">' +
      '<div class="header-inner">' +
        '<div class="brand-block">' +
          '<button type="button" class="brand-badge" data-nav="overview" aria-label="返回青蓝 QA Lab 首页">🛡️</button>' +
          '<div>' +
            '<div class="brand-name-row">' +
              '<h1 class="brand-name">青蓝 QA Lab</h1>' +
              '<span class="team-pill">🚩 泰山新松队</span>' +
            '</div>' +
            '<div class="brand-sub">零门槛软件测试交互游乐场 · 点一点看懂抓虫与门禁</div>' +
          '</div>' +
        '</div>' +
        '<div class="header-actions">' +
          '<span id="stat" class="stat-pill">档案 0/8 · 答题 0/48</span>' +
          '<button type="button" class="hdr-btn" data-act="help">🧭 新手引导</button>' +
          '<button type="button" class="hdr-btn" data-act="export-all">📤 导出档案</button>' +
          '<button type="button" class="hdr-btn" data-act="import-all">📥 导入</button>' +
          '<input type="file" id="import-file" accept=".json" hidden>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function buildTopTabs() {
    var expTabs = WB.exps.slice().sort(function (a, b) { return a.no - b.no; }).map(function (e) {
      var m = EXP_META[e.id] || { emoji: '●', short: e.title };
      return '<button type="button" class="top-tab" data-nav="exp/' + e.id + '">' +
        '<span>' + e.no + ' ' + m.emoji + ' ' + Q.esc(m.short) + '</span>' +
        '<i class="tab-dot" data-dot="' + e.id + '"></i>' +
      '</button>';
    }).join('');

    return '<div class="top-tabs-wrap"><nav class="top-tabs" aria-label="功能导航">' +
      '<button type="button" class="top-tab" data-nav="overview">🗺️ 总览导图</button>' +
      expTabs +
      '<button type="button" class="top-tab" data-nav="quiz">✨ 随堂挑战</button>' +
      '<button type="button" class="top-tab" data-nav="evidence">📦 档案与地图</button>' +
    '</nav></div>';
  }

  function refreshNav() {
    var r = parseHash();
    var currentNav = r.view === 'exp' ? 'exp/' + r.id : (r.view === 'graph' ? 'overview' : r.view);
    Array.prototype.forEach.call(document.querySelectorAll('.top-tab[data-nav]'), function (el) {
      var on = el.getAttribute('data-nav') === currentNav;
      el.classList.toggle('active', on);
      el.setAttribute('aria-current', on ? 'page' : 'false');
    });
    WB.exps.forEach(function (e) {
      var dot = document.querySelector('[data-dot="' + e.id + '"]');
      if (dot) dot.classList.toggle('done', Boolean(WB.evidence[e.id]));
    });
    var stat = document.getElementById('stat');
    if (stat) {
      var evN = WB.exps.filter(function (e) { return Boolean(WB.evidence[e.id]); }).length;
      var qS = Q.quizStats(WB.quizAnswers);
      stat.textContent = '档案 ' + evN + '/' + WB.exps.length + ' · 答题 ' + qS.answered + '/' + qS.total;
    }
  }

  /* ------------------------------------------------------------------ 视图 1：总览导图 */
  function renderOverview() {
    var host = document.getElementById('view');
    var sorted = WB.exps.slice().sort(function (a, b) { return a.no - b.no; });
    var doneN = sorted.filter(function (e) { return Boolean(WB.evidence[e.id]); }).length;
    var nextExp = sorted.find(function (e) { return !WB.evidence[e.id]; }) || sorted[0];
    var qStats = Q.quizStats(WB.quizAnswers);
    var evPct = Math.round((doneN / (sorted.length || 1)) * 100);
    var qPct = qStats.answered ? Math.round((qStats.correct / qStats.answered) * 100) : null;

    var html = [];

    html.push('<section class="hero-banner">' +
      '<div>' +
        '<span class="hero-eyebrow">🎯 像玩小游戏一样学会软件测试</span>' +
        '<h2 class="hero-title">八大测试闯关游乐场</h2>' +
        '<p class="hero-lead">不用死记术语！挑一关点进去，拨动按钮、跑一遍动画、看懂底下的“大白话教练”，最后到「随堂挑战」检验实力。</p>' +
        '<div class="btn-row mt12">' +
          '<button type="button" class="btn primary lg" data-nav="exp/' + nextExp.id + '">🚀 ' + (doneN === 0 ? '从第 1 关开始玩' : '继续玩 M' + nextExp.no + ' ' + EXP_META[nextExp.id].short) + '</button>' +
          '<button type="button" class="btn lg" data-nav="quiz">✨ 随堂挑战（' + qStats.total + ' 题）</button>' +
        '</div>' +
      '</div>' +
      '<div class="hero-stats">' +
        '<div class="hg-mini">' + Q.ring(evPct, { size: 52, color: '#0e9f8a', label: '关卡档案' }) +
          '<div><div class="hg-k">已打卡关卡</div><div class="hg-v">' + doneN + ' / ' + sorted.length + ' 关</div></div></div>' +
        '<div class="hg-mini">' + Q.ring(qPct, { size: 52, color: '#0284c7', label: '挑战正确率' }) +
          '<div><div class="hg-k">随堂挑战进度</div><div class="hg-v">' + qStats.answered + ' / ' + qStats.total + ' 题</div></div></div>' +
      '</div>' +
    '</section>');

    html.push('<div class="card mt14">' +
      '<div class="card-h">' +
        '<div><span class="card-t">🗺️ 学习闯关路线图</span> <span class="card-sub">鼠标放上去看上下游连线，点卡片直接挑一关开玩</span></div>' +
        '<div class="btn-row"><button type="button" class="btn sm" data-nav="evidence">📦 查看过关档案</button></div>' +
      '</div>' +
      '<div class="card-b">' +
        '<div id="overview-graph"></div>' +
        '<div id="overview-gdetail" class="mt10"></div>' +
      '</div>' +
    '</div>');

    var cards = sorted.map(function (e) {
      var m = EXP_META[e.id] || { emoji: '🎯', short: e.title, plain: e.hook };
      var ev = WB.evidence[e.id];
      var stChip = ev
        ? (ev.pass ? Q.badge('pass', '✅ 已过关') : Q.badge('warn', '📌 已打卡'))
        : Q.badge('mute', '未游玩');
      return '<button type="button" class="bento-exp" data-nav="exp/' + e.id + '">' +
        '<div class="be-top"><span class="be-no">' + m.emoji + ' 第 ' + e.no + ' 关</span>' + stChip + '</div>' +
        '<div class="be-title">' + Q.esc(e.title) + '</div>' +
        '<div class="be-hook">' + Q.esc(m.plain) + '</div>' +
        '<div class="be-foot"><span>' + Q.esc(e.chapter) + '</span><span class="be-go">进去玩 →</span></div>' +
      '</button>';
    }).join('');

    html.push('<div class="grid g4 mt14">' + cards + '</div>');

    var cfg = Q.CONFIG;
    var specBody = '<div class="spec-strip">' +
      '<div><div class="spec-k">📝 大家共同测谁？一个「职业技能培训报名算费系统」</div>' +
      '<table class="tbl mt6"><thead><tr><th>输入框</th><th>规矩</th></tr></thead><tbody>' +
        '<tr><td><b>培训课时</b></td><td>整数 ' + cfg.hours.min + ' ~ ' + cfg.hours.max + ' 课时</td></tr>' +
        '<tr><td><b>报名人数</b></td><td>整数 ' + cfg.seats.min + ' ~ ' + cfg.seats.max + ' 人</td></tr>' +
        '<tr><td><b>优惠券额</b></td><td>整数 ' + cfg.coupon.min + ' ~ ' + cfg.coupon.max + ' 元（最少付0元）</td></tr>' +
        '<tr><td><b>学员类型</b></td><td>新学员 / 复训(7折) / 企业团体</td></tr>' +
      '</tbody></table></div>' +
      '<div><div class="spec-k">💰 算钱规矩（无证 ' + cfg.unitPrice + ' 元/课时 · 持证 ' + cfg.certUnitPrice + ' 元/课时）</div>' +
      '<table class="tbl mt6"><thead><tr><th>人数或身份</th><th>享受折扣（不叠加取更优）</th></tr></thead><tbody>' +
      cfg.seatTiers.map(function (t) {
        return '<tr><td>' + Q.esc(t.label.split(' ')[0]) + '</td><td><b>' + (Math.round(t.rate * 100) / 10) + ' 折</b>（系数 ' + t.rate + '）</td></tr>';
      }).join('') +
      '<tr><td>复训学员</td><td><b>7 折</b>（与团体折扣二选一更省）</td></tr>' +
      '</tbody></table></div>' +
    '</div>';
    html.push('<div class="mt14">' + Q.drawer('💡 所有关卡测的都是同一个小系统（想看规矩点这里展开）', '统一被测物速查', specBody, false) + '</div>');

    host.innerHTML = html.join('');
    mountInteractiveGraph('overview-graph', 'overview-gdetail');
  }

  function mountInteractiveGraph(graphId, detailId) {
    var gHost = document.getElementById(graphId);
    if (!gHost) return;
    function draw(focusId) {
      Q.kgRender(gHost, {
        nodes: Q.KG_NODES,
        edges: Q.KG_EDGES,
        edgeTypes: Q.KG_EDGE_TYPES,
        active: focusId,
        onSelect: function (nid) {
          if (WB.session.gFocus === nid && WB.byId[nid]) {
            go('exp/' + nid);
            return;
          }
          WB.session.gFocus = nid;
          draw(nid);
          renderGraphDetail(detailId, nid);
        }
      });
    }
    var initId = WB.session.gFocus || 'm1';
    draw(initId);
    renderGraphDetail(detailId, initId);
  }

  function renderGraphDetail(detailId, id) {
    var dHost = document.getElementById(detailId);
    if (!dHost) return;
    var node = Q.KG_NODES.find(function (x) { return x.id === id; }) || Q.KG_NODES[0];
    var exp = WB.byId[node.id];
    var m = EXP_META[node.id];
    dHost.innerHTML = '<div class="coach-fb is-info">' +
      '<div class="cf-ico">' + (m ? m.emoji : '✨') + '</div>' +
      '<div class="cf-main">' +
        '<div class="cf-title">' + Q.esc(node.label) + ' <span class="chapter-tag">' + Q.esc(node.chapter) + '</span></div>' +
        '<div class="cf-text">' + Q.esc(m ? m.plain : (node.note || '对应书本基础概念节点，点击任意 M1~M8 卡片可直接动手体验。')) + '</div>' +
      '</div>' +
      (exp ? '<button type="button" class="btn primary" data-nav="exp/' + exp.id + '">▶ 进去玩第 ' + exp.no + ' 关</button>' : '') +
    '</div>';
  }

  /* ------------------------------------------------------------------ 视图 2：知识图谱独立页（兼容 #/graph） */
  function renderGraphPage() {
    var host = document.getElementById('view');
    host.innerHTML = '<div class="card">' +
      '<div class="card-h"><div><span class="card-t">🗺️ 测试知识点通关全景图</span></div>' +
      '<button type="button" class="btn sm" data-nav="overview">← 回到总览</button></div>' +
      '<div class="card-b"><div id="graph-page-host"></div><div id="graph-page-detail" class="mt10"></div></div>' +
    '</div>';
    mountInteractiveGraph('graph-page-host', 'graph-page-detail');
  }

  /* ------------------------------------------------------------------ 视图 3：单实验舞台 */
  function renderParamControl(p, st) {
    var val = st[p.key];
    if (p.type === 'action') {
      return '<div class="ctrl-acts"><button type="button" class="btn ' + (p.variant || 'fun') + '" data-act="' + Q.attr(p.action) + '">' + Q.esc(p.label) + '</button>' +
        (p.hint ? '<span class="tiny muted">' + Q.esc(p.hint) + '</span>' : '') + '</div>';
    }
    if (p.type === 'pills' || p.type === 'radio') {
      var opts = p.options || [];
      return '<div class="field"><label>' + Q.esc(p.label) + '</label>' +
        '<div class="seg" role="group">' + opts.map(function (o) {
          return '<button type="button" class="' + (String(val) === String(o.v) ? 'on' : '') + '" data-p="' + Q.attr(p.key) + '" data-v="' + Q.attr(o.v) + '">' + Q.esc(o.l) + '</button>';
        }).join('') + '</div></div>';
    }
    if (p.type === 'select') {
      return '<div class="field"><label for="p-' + Q.attr(p.key) + '">' + Q.esc(p.label) + '</label>' +
        '<select id="p-' + Q.attr(p.key) + '" data-p="' + Q.attr(p.key) + '">' +
        (p.options || []).map(function (o) {
          return '<option value="' + Q.attr(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + Q.esc(o.l) + '</option>';
        }).join('') + '</select></div>';
    }
    if (p.type === 'range') {
      var unit = p.unit || '';
      return '<div class="field"><label for="p-' + Q.attr(p.key) + '">' + Q.esc(p.label) + '</label>' +
        '<div class="range-row"><input id="p-' + Q.attr(p.key) + '" type="range" data-p="' + Q.attr(p.key) + '" min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 1) + '" value="' + Q.attr(val) + '">' +
        '<output data-out="' + Q.attr(p.key) + '">' + Q.esc(String(val)) + Q.esc(unit) + '</output></div></div>';
    }
    if (p.type === 'checkbox') {
      return '<label class="check"><input type="checkbox" data-p="' + Q.attr(p.key) + '"' + (val ? ' checked' : '') + '><span><b>' + Q.esc(p.label) + '</b>' +
        (p.hint ? '<span class="ck-sub">' + Q.esc(p.hint) + '</span>' : '') + '</span></label>';
    }
    if (p.type === 'checks') {
      var list = Array.isArray(val) ? val : [];
      return '<div class="field"><span class="field-label">' + Q.esc(p.label) + '</span>' +
        '<div class="checks2">' + (p.options || []).map(function (o) {
          var on = list.indexOf(o.v) >= 0;
          return '<label class="check"><input type="checkbox" data-p="' + Q.attr(p.key) + '" data-multi="1" value="' + Q.attr(o.v) + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + Q.esc(o.l) + (o.sub ? '<span class="ck-sub">' + Q.esc(o.sub) + '</span>' : '') + '</span></label>';
        }).join('') + '</div></div>';
    }
    return '';
  }

  function renderCtrlBar(exp, st) {
    var plist = typeof exp.params === 'function' ? exp.params(st, WB) : (exp.params || []);
    var quick = plist.filter(function (p) { return !p.advanced; });
    var adv = plist.filter(function (p) { return Boolean(p.advanced); });

    var mainItems = quick.map(function (p) {
      var cls = p.type === 'action' ? 'ctrl-acts' : ('ctrl-item' + (p.wide ? ' is-wide' : ''));
      if (p.type === 'action') return renderParamControl(p, st);
      return '<div class="' + cls + '">' + renderParamControl(p, st) + '</div>';
    }).join('');

    var advHtml = '';
    if (adv.length) {
      advHtml = '<details class="adv-details">' +
        '<summary>⚙️ 高级调节 & 更多选项（想细调参数点这里）</summary>' +
        '<div class="adv-grid">' + adv.map(function (p) { return '<div>' + renderParamControl(p, st) + '</div>'; }).join('') + '</div>' +
      '</details>';
    }

    return '<div class="ctrl-bar">' +
      '<div class="ctrl-main-row">' + mainItems + '</div>' +
      advHtml +
    '</div>';
  }

  function buildRightHtml(exp, res, st) {
    var vizHtml = exp.viz(res, st, WB);
    var vfyHtml = exp.verify ? exp.verify(res, st, WB) : '';
    return vizHtml + (vfyHtml ? '<div class="mt2">' + vfyHtml + '</div>' : '');
  }

  function updateExpStage(exp, rebuildCtrl) {
    var st = ensureState(exp);
    var res = exp.compute(st, WB);
    if (rebuildCtrl) {
      var ctrlHost = document.getElementById('exp-ctrl-host');
      if (ctrlHost) ctrlHost.innerHTML = renderCtrlBar(exp, st);
    }
    var colR = document.getElementById('col-right');
    if (colR) colR.innerHTML = buildRightHtml(exp, res, st);
    refreshNav();
  }

  function renderExpQuizTab(exp) {
    var pool = Q.quizByExp(exp.id);
    var stats = Q.quizStats(WB.quizAnswers, pool);
    return '<div class="card quiz-banner"><div class="card-b"><div class="split" style="align-items:center">' +
      '<div class="btn-row">' +
        Q.ring(stats.answered ? Math.round((stats.correct / stats.answered) * 100) : null, { size: 50, color: '#0284c7' }) +
        '<div><div class="card-t">第 ' + exp.no + ' 关随堂小测</div>' +
        '<div class="tiny muted">已答 ' + stats.answered + '/' + stats.total + ' 题 · 答对 ' + stats.correct + ' 题（点击选项立刻告诉你对不对 & 为啥）</div></div>' +
      '</div>' +
      '<div class="btn-row" style="justify-content:flex-end">' +
        '<button type="button" class="btn sm" data-act="quiz-clear-exp" data-eid="' + exp.id + '">重置本关小题</button>' +
        '<button type="button" class="btn sm primary" data-nav="quiz">去全套随堂挑战 →</button>' +
      '</div>' +
    '</div></div></div>' +
    '<div class="quiz-list mt12">' +
      pool.map(function (q, idx) { return renderQuizCard(q, idx + 1, { compact: true }); }).join('') +
    '</div>';
  }

  function renderExpPage(id) {
    clearAnim();
    var exp = WB.byId[id];
    if (!exp) { go('overview'); return; }
    var st = ensureState(exp);
    var res = exp.compute(st, WB);
    var m = EXP_META[exp.id] || { emoji: '🧪', plain: exp.hook };
    var tab = WB.session.tab[exp.id] || 'lab';
    var qPool = Q.quizByExp(exp.id);
    var ev = WB.evidence[exp.id];
    var host = document.getElementById('view');

    var evBadge = ev
      ? (ev.pass ? Q.badge('pass', '✅ 已打卡过关') : Q.badge('warn', '📌 已记入档案'))
      : '';

    var headHtml = '<div class="exp-head">' +
      '<div class="exp-head-main">' +
        '<div class="exp-no">' + m.emoji + '</div>' +
        '<div class="exp-title-wrap">' +
          '<div class="exp-title-row">' +
            '<h1>第 ' + exp.no + ' 关 · ' + Q.esc(exp.title) + '</h1>' +
            '<span class="chapter-tag">' + Q.esc(exp.chapter) + '</span>' + evBadge +
          '</div>' +
          '<div class="exp-sub">' + Q.esc(m.plain) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="exp-meta">' +
        '<div class="seg-tabs" role="tablist">' +
          '<button type="button" role="tab" class="' + (tab === 'lab' ? 'on' : '') + '" data-act="exp-tab" data-t="lab">🎮 动手玩</button>' +
          '<button type="button" role="tab" class="' + (tab === 'quiz' ? 'on' : '') + '" data-act="exp-tab" data-t="quiz">📝 随堂测 <span class="tab-cnt">' + qPool.length + '</span></button>' +
          '<button type="button" role="tab" class="' + (tab === 'theory' ? 'on' : '') + '" data-act="exp-tab" data-t="theory">💡 一句话秘诀</button>' +
        '</div>' +
        '<div class="exp-head-acts">' +
          '<button type="button" class="btn primary sm" data-act="record-evidence">📌 记为过关档案</button>' +
          '<button type="button" class="btn sm" data-act="reset-exp">↺ 重置</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var bodyHtml = '';
    if (tab === 'lab') {
      bodyHtml = '<div id="exp-ctrl-host">' + renderCtrlBar(exp, st) + '</div>' +
        '<div id="col-right" class="col-right">' + buildRightHtml(exp, res, st) + '</div>';
    } else if (tab === 'quiz') {
      bodyHtml = '<div class="exp-panel-scroll">' + renderExpQuizTab(exp) + '</div>';
    } else {
      bodyHtml = '<div class="exp-panel-scroll">' +
        (exp.goal ? '<div class="coach-fb is-info mb10"><div class="cf-ico">🎯</div><div class="cf-main"><div class="cf-title">这一关 30 秒搞懂啥？</div><ul class="goal-list mt6">' +
          exp.goal.map(function (g) { return '<li><b>✓</b><span>' + Q.esc(g) + '</span></li>'; }).join('') +
        '</ul></div></div>' : '') +
        (exp.theory ? exp.theory(st, res, WB) : '') +
      '</div>';
    }

    host.innerHTML = '<section class="exp">' + headHtml + bodyHtml + '</section>';
  }

  function applyExpParam(exp, key, val, target) {
    var st = ensureState(exp);
    st[key] = val;
    var host = document.getElementById('view');
    if (host && target && target.type === 'range') {
      var out = host.querySelector('[data-out="' + key + '"]');
      if (out) {
        var plist = typeof exp.params === 'function' ? exp.params(st, WB) : (exp.params || []);
        var meta = plist.find(function (p) { return p.key === key; });
        out.textContent = String(val) + ((meta && meta.unit) || '');
      }
    }
    if (exp.onParam) exp.onParam(key, val, st, WB);
    saveStore();
    updateExpStage(exp, false);
  }

  /* ------------------------------------------------------------------ 视图 4：随堂挑战题库 */
  function renderQuizCard(q, idx, opts) {
    opts = opts || {};
    var qtype = q.type || 'single';
    var typeTag = qtype === 'multi'
      ? '<span class="q-type qt-multi">多选题</span>'
      : (qtype === 'fill' ? '<span class="q-type qt-fill">填空题</span>' : '<span class="q-type qt-single">单选题</span>');
    var diffMap = { '基础': ['基础', 'qdiff-base'], '进阶': ['进阶', 'qdiff-mid'], '综合': ['综合', 'qdiff-adv'] };
    var dm = diffMap[q.diff] || ['基础', 'qdiff-base'];
    var ans = WB.quizAnswers[q.id];
    var done = Q.quizIsAnswered(q, ans);
    var ok = done ? Q.quizCheck(q, ans) : false;

    var cardCls = 'card qcard' + (done ? (ok ? ' is-ok' : ' is-bad') : '');
    var letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    var topicLabel = (Q.QUIZ_TOPICS.find(function (t) { return t.key === q.topic; }) || { label: q.chapter || q.topic }).label;

    var bodyInner = '';
    if (qtype === 'fill') {
      var fillVal = done ? String(ans) : (WB.quizDrafts[q.id] || '');
      bodyInner = '<div class="q-fill-box">' +
        '<input type="text" class="q-fill-inp" data-q-fill="' + Q.attr(q.id) + '" placeholder="' + Q.attr(q.placeholder || '输入答案关键词或数字…') + '" value="' + Q.attr(fillVal) + '"' + (done ? ' disabled' : '') + '>' +
        (!done
          ? '<button type="button" class="btn primary" data-act="quiz-submit-fill" data-qid="' + Q.attr(q.id) + '">提交答案</button>'
          : '<button type="button" class="btn sm" data-act="quiz-clear" data-qid="' + Q.attr(q.id) + '">重做此题</button>') +
      '</div>' +
      (done ? '<div class="q-actbar"><span class="tiny muted">你的填写：<b>' + Q.esc(ans) + '</b> · 参考答案：<b>' + Q.esc(Q.quizFormatAnswer(q)) + '</b></span></div>' : '');
    } else if (qtype === 'multi') {
      var draft = Array.isArray(WB.quizDrafts[q.id]) ? WB.quizDrafts[q.id] : [];
      var rightSet = q.answer || [];
      var pickedSet = done ? (Array.isArray(ans) ? ans : []) : draft;
      bodyInner = '<div class="q-opts">' +
        (q.options || []).map(function (opt, oi) {
          var lt = letters[oi] || String(oi + 1);
          var isPicked = pickedSet.indexOf(oi) >= 0;
          var isRight = rightSet.indexOf(oi) >= 0;
          var cls = 'q-opt';
          var tag = '';
          if (!done) {
            if (isPicked) cls += ' opt-picked';
          } else {
            if (isPicked && isRight) cls += ' opt-right';
            else if (isPicked && !isRight) cls += ' opt-wrong';
            else if (!isPicked && isRight) { cls += ' opt-miss'; tag = '<span class="q-miss-tag">漏选</span>'; }
            else cls += ' opt-dim';
          }
          return '<button type="button" class="' + cls + '" data-act="quiz-toggle" data-qid="' + Q.attr(q.id) + '" data-opt="' + oi + '"' + (done ? ' disabled' : '') + '>' +
            '<span class="q-letter q-chk">' + lt + '</span>' +
            '<span class="q-otext">' + Q.esc(opt) + tag + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="q-actbar"><span class="tiny muted">' +
        (done ? '正确答案：<b>' + Q.esc(Q.quizFormatAnswer(q)) + '</b>' : ('已勾选 ' + draft.length + ' 项（支持多选）')) +
      '</span>' +
      (!done
        ? '<button type="button" class="btn primary sm" data-act="quiz-submit-multi" data-qid="' + Q.attr(q.id) + '"' + (draft.length ? '' : ' disabled') + '>确认提交</button>'
        : '<button type="button" class="btn sm" data-act="quiz-clear" data-qid="' + Q.attr(q.id) + '">重做此题</button>') +
      '</div>';
    } else {
      bodyInner = '<div class="q-opts">' +
        (q.options || []).map(function (opt, oi) {
          var lt = letters[oi] || String(oi + 1);
          var isPicked = done && ans === oi;
          var isRight = q.answer === oi;
          var cls = 'q-opt';
          if (done) {
            if (isRight) cls += ' opt-right';
            else if (isPicked && !isRight) cls += ' opt-wrong';
            else cls += ' opt-dim';
          }
          return '<button type="button" class="' + cls + '" data-act="quiz-pick" data-qid="' + Q.attr(q.id) + '" data-opt="' + oi + '"' + (done ? ' disabled' : '') + '>' +
            '<span class="q-letter">' + lt + '</span>' +
            '<span class="q-otext">' + Q.esc(opt) + '</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      (done ? '<div class="q-actbar"><span class="tiny muted">你的选择：<b>' + Q.esc(letters[ans] || ans) + '</b> · 正确答案：<b>' + Q.esc(Q.quizFormatAnswer(q)) + '</b></span><button type="button" class="btn sm" data-act="quiz-clear" data-qid="' + Q.attr(q.id) + '">重做此题</button></div>' : '');
    }

    var explainHtml = '';
    if (done) {
      var optList = (q.optionNotes || []).map(function (note, oi) {
        var r = qtype === 'multi' ? ((q.answer || []).indexOf(oi) >= 0) : (q.answer === oi);
        var lt = letters[oi] || String(oi + 1);
        return '<li class="' + (r ? 'is-r' : 'is-w') + '"><span class="qe-opt-tag">' + lt + '</span><span>' + Q.esc(note) + '</span></li>';
      }).join('');
      explainHtml = '<div class="q-explain ' + (ok ? 'ok' : 'bad') + '">' +
        '<div class="qe-head"><b>' + (ok ? '🎉 答对了！' : '💡 差一点！正确答案是 ' + Q.esc(Q.quizFormatAnswer(q))) + '</b>' +
        (q.exp && !opts.compact ? '<button type="button" class="link tiny" data-nav="exp/' + q.exp + '">回第 ' + q.exp.slice(1) + ' 关再试试 →</button>' : '') +
        '</div>' +
        '<p class="qe-sum">' + Q.esc(q.explain || '') + '</p>' +
        (optList ? '<div class="qe-breakdown"><div class="qe-sub">逐项大白话拆解</div><ul class="qe-opts">' + optList + '</ul></div>' : '') +
      '</div>';
    }

    return '<div class="' + cardCls + '" data-qid="' + Q.attr(q.id) + '">' +
      '<div class="qcard-h">' +
        '<div class="btn-row"><span class="q-id">#' + idx + ' · ' + Q.esc(q.id) + '</span>' + typeTag + '<span class="q-diff ' + dm[1] + '">' + dm[0] + '</span></div>' +
        '<span class="chapter-tag">' + Q.esc(q.chapter || topicLabel) + '</span>' +
      '</div>' +
      '<div class="qcard-b">' +
        '<div class="q-stem"><span class="q-idx">Q' + idx + '.</span> ' + Q.esc(q.stem) + '</div>' +
        bodyInner +
        explainHtml +
      '</div>' +
    '</div>';
  }

  function renderQuizPage() {
    var host = document.getElementById('view');
    var f = WB.quizFilter;
    var allStats = Q.quizStats(WB.quizAnswers, Q.QUIZ_QUESTIONS);
    var pool = Q.quizFilter({ topic: f.topic, diff: f.diff, type: f.type });
    if (f.wrongOnly) {
      pool = pool.filter(function (q) {
        return Q.quizIsAnswered(q, WB.quizAnswers[q.id]) && !Q.quizCheck(q, WB.quizAnswers[q.id]);
      });
    }
    var list = f.mode === 'quick5' ? pool.slice(0, 5) : pool;
    var acc = allStats.answered ? Math.round((allStats.correct / allStats.answered) * 100) : null;

    var kpis = Q.kpiStrip([
      { icon: '📚', label: '题库总题量', value: allStats.total + ' 题', sub: '单选 28 · 多选 10 · 填空 10', tone: 'blue' },
      { icon: '✏️', label: '已完成挑战', value: allStats.answered + ' 题', sub: '进度会自动存进本地档案', tone: 'teal' },
      { icon: '🎉', label: '当前正确率', value: acc == null ? '—' : acc + '%', sub: '累计答对 ' + allStats.correct + ' 题', tone: acc >= 80 ? 'ok' : (acc == null ? 'blue' : 'warn') },
      { icon: '🔍', label: '错题本', value: allStats.wrong + ' 题', sub: '点下面「只看错题」一键复盘', tone: allStats.wrong ? 'bad' : 'ok' }
    ]);

    var topicPills = Q.QUIZ_TOPICS.map(function (t) {
      return '<button type="button" class="pill-btn' + (f.topic === t.key ? ' on' : '') + '" data-act="quiz-filter" data-fk="topic" data-fv="' + t.key + '">' + Q.esc(t.label) + '</button>';
    }).join('');

    var typePills = [
      { v: 'all', l: '全部题型' }, { v: 'single', l: '单选题' }, { v: 'multi', l: '多选题' }, { v: 'fill', l: '填空题' }
    ].map(function (x) {
      return '<button type="button" class="pill-btn' + (f.type === x.v ? ' on' : '') + '" data-act="quiz-filter" data-fk="type" data-fv="' + x.v + '">' + x.l + '</button>';
    }).join('');

    var diffPills = [
      { v: 'all', l: '全部难度' }, { v: '基础', l: '基础' }, { v: '进阶', l: '进阶' }, { v: '综合', l: '综合' }
    ].map(function (x) {
      return '<button type="button" class="pill-btn' + (f.diff === x.v ? ' on' : '') + '" data-act="quiz-filter" data-fk="diff" data-fv="' + x.v + '">' + x.l + '</button>';
    }).join('');

    host.innerHTML = '<section class="exp">' +
      kpis +
      '<div class="card"><div class="card-b"><div class="quiz-filters">' +
        '<div class="qf-row"><span class="qf-lbl">主题</span><div class="qf-pills">' + topicPills + '</div></div>' +
        '<div class="qf-row"><span class="qf-lbl">题型</span><div class="qf-pills">' + typePills +
          '<button type="button" class="pill-btn' + (f.wrongOnly ? ' on warn' : '') + '" data-act="quiz-filter" data-fk="wrongOnly" data-fv="toggle">🚨 只看错题 (' + allStats.wrong + ')</button>' +
          '<button type="button" class="pill-btn' + (f.mode === 'quick5' ? ' on' : '') + '" data-act="quiz-filter" data-fk="mode" data-fv="' + (f.mode === 'quick5' ? 'all' : 'quick5') + '">⚡ 只刷前5题</button>' +
        '</div></div>' +
        '<div class="qf-row"><span class="qf-lbl">难度</span><div class="qf-pills">' + diffPills +
          '<button type="button" class="btn sm ghost" data-act="quiz-reset">🧹 清空作答记录</button>' +
        '</div></div>' +
      '</div></div></div>' +
      (list.length
        ? '<div class="quiz-list">' + list.map(function (q, i) { return renderQuizCard(q, i + 1); }).join('') + '</div>'
        : Q.empty('当前筛选条件没有匹配的题目，换个主题或取消“只看错题”试试！', '🎉')) +
    '</section>';
  }

  /* ------------------------------------------------------------------ 视图 5：档案与教材地图 */
  function renderEvidencePage() {
    var host = document.getElementById('view');
    var sorted = WB.exps.slice().sort(function (a, b) { return a.no - b.no; });
    var done = sorted.filter(function (e) { return Boolean(WB.evidence[e.id]); }).length;

    var rows = sorted.map(function (e) {
      var ev = WB.evidence[e.id];
      var m = EXP_META[e.id] || { emoji: '●', short: e.title };
      return [
        m.emoji + ' M' + e.no + ' ' + e.title,
        { html: ev ? Q.badge(ev.pass ? 'pass' : 'warn', ev.pass ? '✅ 达标过关' : '📌 未达门槛') : Q.badge('mute', '未打卡') },
        { html: ev ? Q.esc(ev.summary || '已记录') : '<span class="muted">先去体验再点击「记为过关档案」</span>' },
        { html: '<button type="button" class="btn sm" data-nav="exp/' + e.id + '">' + (ev ? '去看看' : '去闯关') + '</button>' }
      ];
    });

    var kbRows = sorted.map(function (e) {
      var m = EXP_META[e.id] || { emoji: '🎯', plain: e.hook };
      return [
        { html: '<span class="chapter-tag">' + Q.esc(e.chapter) + '</span>' },
        m.emoji + ' M' + e.no + ' ' + e.title,
        m.plain,
        { html: '<button type="button" class="link" data-nav="exp/' + e.id + '">直达关卡 →</button>' }
      ];
    });

    host.innerHTML = '<section class="exp">' +
      Q.kpiStrip([
        { icon: '🏆', label: '通关档案进度', value: done + ' / ' + sorted.length, sub: 'M1~M7 的结果会自动喂给 M8 发布门禁', tone: done >= 8 ? 'ok' : 'blue' },
        { icon: '🚩', label: '参赛团队', value: '泰山新松队', sub: '青蓝 QA Lab v' + WB.version, tone: 'teal' }
      ]) +
      '<div class="card">' +
        '<div class="card-h">' +
          '<span class="card-t">📦 我的过关实验档案</span>' +
          '<div class="btn-row">' +
            '<button type="button" class="btn sm primary" data-act="export-all">📤 导出 JSON 档案</button>' +
            '<button type="button" class="btn sm" data-act="import-all">📥 导入 JSON</button>' +
            '<button type="button" class="btn sm" data-act="clear-all">🗑️ 全部清空</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-b flush">' + Q.table(['关卡', '过关状态', '记录内容摘要', '直达'], rows) + '</div>' +
      '</div>' +
      Q.drawer('📚 《软件质量保证与测试：原理技术与实践》教材对应地图（点击展开）', '8 关对照表', Q.table(['教材章节', '实训关卡', '一句话大白话说明', '跳转'], kbRows), false) +
    '</section>';
  }

  function renderAboutPage() {
    renderEvidencePage();
  }

  /* ------------------------------------------------------------------ 导出 / 导入 / 引导 */
  function doExport() {
    var payload = {
      schema: SCHEMA,
      version: WB.version,
      exportedAt: new Date().toISOString(),
      evidence: WB.evidence,
      state: WB.state,
      quizAnswers: WB.quizAnswers
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'qinglan-qa-archive-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已导出学习与过关档案 JSON');
  }

  function doImportFile(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var obj = JSON.parse(String(rd.result || ''));
        if (!obj || typeof obj !== 'object' || obj.schema !== SCHEMA) {
          toast('导入被拒绝：不是本平台合法档案格式', 'fail');
          return;
        }
        if (obj.evidence) WB.evidence = obj.evidence;
        if (obj.state) WB.state = obj.state;
        if (obj.quizAnswers) WB.quizAnswers = obj.quizAnswers;
        saveStore();
        render();
        toast('档案导入成功！');
      } catch (e) {
        toast('导入失败：JSON 文件格式不对', 'fail');
      }
    };
    rd.readAsText(file);
  }

  function openGuide() {
    var overlay = document.getElementById('guide-overlay');
    if (!overlay) return;
    var step = 0;
    var steps = [
      {
        t: '① 像玩游戏一样点开任意一关',
        b: '页面顶部 1~8 号胶囊就是 8 个独立小游戏。不用先背定义，直接点进你想玩的一关，点亮卡片、扫一扫代码或踩踩边界！'
      },
      {
        t: '② 看懂底部「大白话教练气泡」',
        b: '每当你点了一个按钮或改了开关，下方卡通气泡都会用最直白的话告诉你：为什么报错、哪里会漏虫。需要细调才点「高级调节」。'
      },
      {
        t: '③ 攒齐档案，通关随堂挑战',
        b: '玩出满意结果时点右上角「📌 记为过关档案」，第 8 关「发布门禁」会自动收集前 7 关战果帮你拍板能不能发布！'
      }
    ];
    function paint() {
      var cur = steps[step];
      var bars = steps.map(function (_, i) { return '<i' + (i <= step ? ' class="on"' : '') + '></i>'; }).join('');
      overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-h"><h2>' + Q.esc(cur.t) + '</h2></div>' +
        '<div class="modal-b"><div class="guide-steps">' + bars + '</div><p>' + Q.esc(cur.b) + '</p></div>' +
        '<div class="modal-f">' +
          '<button type="button" class="btn ghost" data-g="close">跳过</button>' +
          (step > 0 ? '<button type="button" class="btn" data-g="prev">上一步</button>' : '') +
          '<button type="button" class="btn primary" data-g="' + (step < steps.length - 1 ? 'next' : 'close') + '">' +
            (step < steps.length - 1 ? '下一步 →' : '开始玩！') +
          '</button>' +
        '</div></div>';
      overlay.hidden = false;
    }
    overlay.onclick = function (ev) {
      var btn = ev.target.closest('[data-g]');
      if (!btn && ev.target !== overlay) return;
      var g = btn ? btn.getAttribute('data-g') : 'close';
      if (g === 'next') { step++; paint(); }
      else if (g === 'prev') { step--; paint(); }
      else { overlay.hidden = true; WB.session.guideSeen = true; }
    };
    paint();
  }

  /* ------------------------------------------------------------------ 全局事件委派 */
  function wireGlobalEvents() {
    document.addEventListener('click', function (ev) {
      var navEl = ev.target.closest('[data-nav]');
      if (navEl) {
        go(navEl.getAttribute('data-nav'));
        return;
      }
      var pbtn = ev.target.closest('button[data-p]');
      if (pbtn) {
        var rr = parseHash();
        if (rr.view === 'exp' && WB.byId[rr.id]) {
          var k = pbtn.getAttribute('data-p');
          var v = pbtn.getAttribute('data-v');
          Array.prototype.forEach.call(pbtn.parentElement.querySelectorAll('button[data-p]'), function (b) {
            b.classList.toggle('on', b === pbtn);
          });
          applyExpParam(WB.byId[rr.id], k, v, pbtn);
          return;
        }
      }
      var actEl = ev.target.closest('[data-act]');
      if (!actEl) return;
      var act = actEl.getAttribute('data-act');

      if (act === 'help') { openGuide(); return; }
      if (act === 'export-all') { doExport(); return; }
      if (act === 'import-all') {
        var inp = document.getElementById('import-file');
        if (inp) { inp.value = ''; inp.click(); }
        return;
      }
      if (act === 'clear-all') {
        WB.evidence = {}; WB.state = {}; WB.quizAnswers = {}; WB.quizDrafts = {};
        saveStore();
        render();
        toast('已重置所有关卡与答题记录');
        return;
      }

      /* 实验页头按钮 */
      var r = parseHash();
      if (r.view === 'exp' && WB.byId[r.id]) {
        var exp = WB.byId[r.id];
        if (act === 'exp-tab') {
          WB.session.tab[exp.id] = actEl.getAttribute('data-t') || 'lab';
          renderExpPage(exp.id);
          return;
        }
        if (act === 'record-evidence') {
          var st = ensureState(exp);
          var res = exp.compute(st, WB);
          var evData = exp.evidence(res, st, WB);
          WB.evidence[exp.id] = evData;
          saveStore();
          renderExpPage(exp.id);
          refreshNav();
          toast('已记录第 ' + exp.no + ' 关过关档案：' + (evData.pass ? '达标' : '已存档'));
          return;
        }
        if (act === 'reset-exp') {
          WB.state[exp.id] = clone(exp.defaults || {});
          saveStore();
          renderExpPage(exp.id);
          toast('已恢复第 ' + exp.no + ' 关默认状态');
          return;
        }
      }

      /* 随堂测试交互 */
      if (act === 'quiz-pick') {
        var qid = actEl.getAttribute('data-qid');
        WB.quizAnswers[qid] = parseInt(actEl.getAttribute('data-opt'), 10);
        saveStore();
        rerenderQuizHost(r);
        return;
      }
      if (act === 'quiz-toggle') {
        var mqid = actEl.getAttribute('data-qid');
        var optIdx = parseInt(actEl.getAttribute('data-opt'), 10);
        var cur = Array.isArray(WB.quizDrafts[mqid]) ? WB.quizDrafts[mqid].slice() : [];
        var idx = cur.indexOf(optIdx);
        if (idx >= 0) cur.splice(idx, 1); else cur.push(optIdx);
        WB.quizDrafts[mqid] = cur;
        rerenderQuizHost(r);
        return;
      }
      if (act === 'quiz-submit-multi') {
        var sqid = actEl.getAttribute('data-qid');
        var d = WB.quizDrafts[sqid] || [];
        if (d.length) {
          WB.quizAnswers[sqid] = d.slice().sort(function (a, b) { return a - b; });
          delete WB.quizDrafts[sqid];
          saveStore();
          rerenderQuizHost(r);
        }
        return;
      }
      if (act === 'quiz-submit-fill') {
        var fqid = actEl.getAttribute('data-qid');
        var finp = document.querySelector('[data-q-fill="' + fqid + '"]');
        var rawVal = finp ? finp.value.trim() : (WB.quizDrafts[fqid] || '').trim();
        if (!rawVal) { toast('先填一个关键词或数字再提交吧', 'warn'); return; }
        WB.quizAnswers[fqid] = rawVal;
        delete WB.quizDrafts[fqid];
        saveStore();
        rerenderQuizHost(r);
        return;
      }
      if (act === 'quiz-clear') {
        var cqid = actEl.getAttribute('data-qid');
        delete WB.quizAnswers[cqid];
        delete WB.quizDrafts[cqid];
        saveStore();
        rerenderQuizHost(r);
        return;
      }
      if (act === 'quiz-clear-exp') {
        var eid = actEl.getAttribute('data-eid');
        Q.quizByExp(eid).forEach(function (q) {
          delete WB.quizAnswers[q.id]; delete WB.quizDrafts[q.id];
        });
        saveStore();
        rerenderQuizHost(r);
        toast('已清空本关随堂小题作答记录');
        return;
      }
      if (act === 'quiz-filter') {
        var fk = actEl.getAttribute('data-fk');
        var fv = actEl.getAttribute('data-fv');
        if (fk === 'wrongOnly') WB.quizFilter.wrongOnly = !WB.quizFilter.wrongOnly;
        else WB.quizFilter[fk] = fv;
        renderQuizPage();
        return;
      }
      if (act === 'quiz-reset') {
        WB.quizAnswers = {}; WB.quizDrafts = {};
        saveStore();
        renderQuizPage();
        refreshNav();
        toast('已清空随堂挑战作答记录');
        return;
      }

      if (r.view === 'exp' && WB.byId[r.id] && WB.byId[r.id].onAction) {
        var curExp = WB.byId[r.id];
        var curSt = ensureState(curExp);
        var actRes = curExp.onAction(act, actEl, curSt, WB, function (rebuildAll) {
          saveStore();
          updateExpStage(curExp, Boolean(rebuildAll));
        });
        if (actRes === 'sync-ctrl' || actEl.closest('#exp-ctrl-host')) {
          saveStore();
          updateExpStage(curExp, true);
        } else if (actRes === true) {
          saveStore();
          updateExpStage(curExp, false);
        }
      }
    });

    document.addEventListener('input', function (ev) {
      var finp = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-q-fill');
      if (finp) { WB.quizDrafts[finp] = ev.target.value; return; }
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-p') !== null) {
        var r = parseHash();
        if (r.view === 'exp' && WB.byId[r.id] && (t.type === 'range' || t.type === 'text' || t.type === 'number')) {
          var val = (t.type === 'range' || t.type === 'number') ? Number(t.value) : t.value;
          applyExpParam(WB.byId[r.id], t.getAttribute('data-p'), val, t);
        }
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-q-fill')) {
        var qid = ev.target.getAttribute('data-q-fill');
        var btn = document.querySelector('[data-act="quiz-submit-fill"][data-qid="' + qid + '"]');
        if (btn) btn.click();
      }
    });

    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.id === 'import-file' && t.files && t.files[0]) {
        doImportFile(t.files[0]);
        return;
      }
      if (t && t.getAttribute && t.getAttribute('data-p') !== null) {
        var r = parseHash();
        if (r.view === 'exp' && WB.byId[r.id]) {
          var exp = WB.byId[r.id];
          var k = t.getAttribute('data-p');
          if (t.type === 'checkbox' && t.getAttribute('data-multi')) {
            var st = ensureState(exp);
            var arr = Array.isArray(st[k]) ? st[k].slice() : [];
            if (t.checked) { if (arr.indexOf(t.value) < 0) arr.push(t.value); }
            else arr = arr.filter(function (x) { return x !== t.value; });
            applyExpParam(exp, k, arr, t);
          } else if (t.type === 'checkbox') {
            applyExpParam(exp, k, Boolean(t.checked), t);
          } else if (t.tagName === 'SELECT') {
            applyExpParam(exp, k, t.value, t);
          }
        }
      }
    });
  }

  function rerenderQuizHost(route) {
    refreshNav();
    if (route.view === 'quiz') renderQuizPage();
    else if (route.view === 'exp' && route.id) renderExpPage(route.id);
  }

  /* ------------------------------------------------------------------ 总渲染 & 启动 */
  function render() {
    clearAnim();
    var r = parseHash();
    refreshNav();
    if (r.view === 'overview') renderOverview();
    else if (r.view === 'graph') renderGraphPage();
    else if (r.view === 'quiz') renderQuizPage();
    else if (r.view === 'evidence') renderEvidencePage();
    else if (r.view === 'about') renderAboutPage();
    else if (r.view === 'exp') renderExpPage(r.id);
    refreshNav();
  }

  function boot() {
    loadStore();
    var app = document.getElementById('app');
    app.innerHTML = '<div class="app-wrap">' +
      buildHeader() +
      buildTopTabs() +
      '<main class="stage"><div id="view" class="view"></div></main>' +
    '</div>' +
    '<div id="guide-overlay" class="overlay" hidden></div>' +
    '<div id="toast-host" aria-live="polite"></div>';

    wireGlobalEvents();
    window.addEventListener('hashchange', render);
    render();
    if (WB.session.memOnly) toast('浏览器禁止了本地存储，已自动切换为内存临时模式', 'warn');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

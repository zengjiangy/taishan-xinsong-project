/* ============================================================================
 * shell.js — 应用外壳：路由、导航、实验容器、证据库、导入导出
 * ==========================================================================*/
(function () {
  'use strict';
  var Q = window.QT;
  var WB = window.WB = {
    exps: [], byId: {}, evidence: {}, state: {}, session: {},
    version: '1.0.0', schema: 'qinglan-qa-lab/1'
  };

  /* ------------------------------------------------------------- 存储适配 */
  var STORE_KEY = 'qinglan.qa.lab.v1';
  var memory = {};
  var storageOk = (function () {
    try {
      var k = '__probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  var store = {
    ok: storageOk,
    read: function () {
      if (!storageOk) return memory;
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return memory; }
    },
    write: function (obj) {
      if (!storageOk) { memory = obj; return false; }
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(obj));
        return true;
      } catch (e) { memory = obj; return false; }
    }
  };

  function persist() {
    var data = { schema: WB.schema, savedAt: new Date().toISOString(), evidence: WB.evidence, state: WB.state, session: WB.session };
    var ok = store.write(data);
    if (!ok) showStoreWarn();
    return ok;
  }

  var storeWarned = false;
  function showStoreWarn() {
    if (storeWarned) return;
    storeWarned = true;
    toast('浏览器本地存储不可用，当前会话数据仅保存在内存中，刷新后会丢失。', 'warn', 6000);
  }

  function loadPersisted() {
    var d = store.read();
    if (d && d.schema === WB.schema) {
      WB.evidence = d.evidence && typeof d.evidence === 'object' ? d.evidence : {};
      WB.state = d.state && typeof d.state === 'object' ? d.state : {};
      WB.session = d.session && typeof d.session === 'object' ? d.session : {};
    }
    if (!store.ok) showStoreWarn();
  }

  /* ----------------------------------------------------------------- 工具 */
  var E = Q.esc;
  var toastHost = null;
  function toast(msg, kind, ms) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.id = 'toast-host';
      document.body.appendChild(toastHost);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 2800);
  }
  WB.toast = toast;

  function download(name, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
      return true;
    } catch (e) {
      toast('导出失败：' + e.message, 'fail');
      return false;
    }
  }

  /* ------------------------------------------------------------- 实验注册 */
  WB.registerExp = function (def) {
    WB.exps.push(def);
    WB.byId[def.id] = def;
  };
  WB.exps.sort(function (a, b) { return a.no - b.no; });

  function expState(def) {
    if (!WB.state[def.id]) WB.state[def.id] = Q.clone(def.defaults || {});
    var st = WB.state[def.id];
    // 补齐新增字段（版本升级后旧存档缺字段）
    Object.keys(def.defaults || {}).forEach(function (k) {
      if (st[k] === undefined) st[k] = Q.clone(def.defaults[k]);
    });
    return st;
  }
  WB.expState = expState;

  function safeCompute(def, st) {
    try {
      return { ok: true, value: def.compute(st) };
    } catch (e) {
      return { ok: false, error: e.message, value: null };
    }
  }

  function expStatus(def) {
    var ev = WB.evidence[def.id];
    if (!ev) return { kind: 'mute', text: '未记录', label: '未记录证据' };
    if (ev.status === 'pass') return { kind: 'pass', text: '已达成', label: '已记录：达成' };
    if (ev.status === 'warn') return { kind: 'warn', text: '待改进', label: '已记录：待改进' };
    return { kind: 'fail', text: '未通过', label: '已记录：未通过' };
  }

  /* --------------------------------------------------------------- 导航 */
  var NAV = [
    { group: '课程', items: [
      { id: 'overview', label: '课程概览', icon: '◇' },
      { id: 'graph', label: '知识图谱', icon: '⌘' },
      { id: 'quiz', label: '随堂题库', icon: '✦' }
    ] },
    { group: '实验', items: [] },
    { group: '质量', items: [
      { id: 'evidence', label: '证据与报告', icon: '▤' },
      { id: 'about', label: '课程地图', icon: 'ⓘ' }
    ] }
  ];

  var EXP_HOOKS = {
    m1: '工具规则扫不出的缺陷，如何靠人工走查提前拦下？',
    m2: '等价类覆盖率 100% 时，为什么仍有漏网之鱼？',
    m3: '边界值只差 ±1 步，哪些故障能命中、哪些碰不到？',
    m4: '多条件交织的资格规则，怎样查出遗漏与冲突？',
    m5: '除正常主流程外，非法操作与守卫分支该如何验证？',
    m6: '语句 100% 覆盖后，判定与条件覆盖还差多少？',
    m7: 'CI 门禁为何不能只看通过率，而要设一票否决？',
    m8: '实验证据不足时，量化门禁为什么会直接亮红灯？'
  };

  function quizState() {
    if (!WB.session.quiz || typeof WB.session.quiz !== 'object') {
      WB.session.quiz = { answers: {}, drafts: {}, topic: 'all', diff: 'all', type: 'all', wrongOnly: false, expandAll: false, examIds: null };
    }
    var qz = WB.session.quiz;
    if (!qz.answers || typeof qz.answers !== 'object') qz.answers = {};
    if (!qz.drafts || typeof qz.drafts !== 'object') qz.drafts = {};
    if (!qz.topic) qz.topic = 'all';
    if (!qz.diff) qz.diff = 'all';
    if (!qz.type) qz.type = 'all';
    return qz;
  }

  function expTabOf(id) {
    if (!WB.session.expTabs || typeof WB.session.expTabs !== 'object') WB.session.expTabs = {};
    return WB.session.expTabs[id] || 'lab';
  }

  function buildRail() {
    var nav = document.getElementById('rail-nav');
    var qSt = Q.quizStats(quizState().answers);
    var html = '';
    NAV.forEach(function (g) {
      html += '<div class="rail-group"><div class="rail-group-h">' + E(g.group) + '</div>';
      var items = g.items.slice();
      if (g.group === '实验') {
        items = WB.exps.map(function (d) {
          var s = expStatus(d);
          return { id: 'exp/' + d.id, label: d.navLabel || d.title, no: d.no, tag: s.text, tagCls: s.kind === 'pass' ? 'done' : s.kind === 'warn' ? 'warn' : '' };
        });
      }
      items.forEach(function (it) {
        var tag = it.tag;
        var tagCls = it.tagCls || '';
        if (it.id === 'quiz') {
          tag = qSt.answered + '/' + qSt.total;
          tagCls = qSt.answered > 0 && qSt.accuracy >= 80 ? 'done' : '';
        }
        html += '<button class="rail-item" data-nav="' + E(it.id) + '">' +
          (it.no ? '<span class="idx">M' + it.no + '</span>' : '<span class="idx">' + (it.icon || '·') + '</span>') +
          '<span class="lbl">' + E(it.label) + '</span>' +
          (tag ? '<span class="tag ' + tagCls + '">' + E(tag) + '</span>' : '') +
          '</button>';
      });
      html += '</div>';
    });
    nav.innerHTML = html;
  }

  function markRail(view) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-nav') === view);
    });
  }

  /* --------------------------------------------------------------- 路由 */
  function parseHash() {
    var h = (location.hash || '#/overview').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    if (!parts.length) return { view: 'overview' };
    if (parts[0] === 'exp' && parts[1]) return { view: 'exp', id: parts[1] };
    return { view: parts[0] };
  }

  WB.go = function (view) {
    var target = '#/' + view;
    if (location.hash === target) { render(); return; }
    location.hash = target;
  };

  function render() {
    var r = parseHash();
    var view = r.view;
    if (view === 'exp' && !WB.byId[r.id]) view = 'overview';
    buildRail();
    markRail(view === 'exp' ? 'exp/' + r.id : view);

    var host = document.getElementById('view');
    host.className = 'view';
    if (view === 'exp') {
      var tab = expTabOf(r.id);
      if (tab === 'lab') host.classList.add('lock');
      renderExpPage(host, r.id);
    } else if (view === 'graph') {
      renderGraphPage(host, r.node);
    } else if (view === 'quiz') {
      renderQuizPage(host);
    } else if (view === 'evidence') {
      renderEvidencePage(host);
    } else if (view === 'about') {
      renderAboutPage(host);
    } else {
      renderOverview(host);
    }
    renderTopbar(view, r.id);
    host.scrollTop = 0;
  }

  function rerenderKeepScroll() {
    var host = document.getElementById('view');
    var scroller = host ? (host.querySelector('.exp-panel-scroll') || host) : null;
    var top = scroller ? scroller.scrollTop : 0;
    render();
    var scroller2 = host ? (host.querySelector('.exp-panel-scroll') || host) : null;
    if (scroller2) scroller2.scrollTop = top;
  }

  function renderTopbar(view, id) {
    var c = document.getElementById('crumb');
    var def = id ? WB.byId[id] : null;
    var html = '';
    if (view === 'exp' && def) {
      html = '<button class="link" data-nav="overview">课程概览</button><span class="sep">/</span>' +
        '<button class="link" data-nav="graph">知识图谱</button><span class="sep">/</span>' +
        '<b>M' + def.no + ' ' + E(def.title) + '</b>';
    } else {
      var map = { overview: '课程概览', graph: '知识图谱', quiz: '随堂题库', evidence: '证据与报告', about: '课程地图' };
      html = '<b>' + E(map[view] || '课程概览') + '</b>';
    }
    c.innerHTML = html;

    var total = WB.exps.length;
    var done = WB.exps.filter(function (d) { return WB.evidence[d.id]; }).length;
    var passed = WB.exps.filter(function (d) { return WB.evidence[d.id] && WB.evidence[d.id].status === 'pass'; }).length;
    var qSt = Q.quizStats(quizState().answers);
    document.getElementById('stat').innerHTML =
      '<span>证据 <b>' + done + '/' + total + '</b></span>' +
      '<span class="sep" style="color:var(--ink-4)">·</span>' +
      '<span>达成 <b>' + passed + '</b></span>' +
      '<span class="sep" style="color:var(--ink-4)">·</span>' +
      '<span>自测 <b>' + qSt.answered + '/' + qSt.total + '</b></span>';
  }

  /* --------------------------------------------------------- 实验页渲染 */
  function renderExpPage(host, id) {
    var def = WB.byId[id];
    var st = expState(def);
    var res = safeCompute(def, st);
    var tab = expTabOf(id);
    var expQs = Q.quizByExp(def.id);
    var qSt = Q.quizStats(quizState().answers, expQs);

    var head = '<header class="exp-head">' +
      '<div class="exp-head-main">' +
      '<div class="exp-no">M' + def.no + '</div>' +
      '<div class="exp-title-wrap">' +
      '<div class="exp-title-row"><h1>' + E(def.title) + '</h1><span class="chapter-tag">' + E(def.chapter) + '</span></div>' +
      '<div class="exp-sub">' + E(def.subtitle) + '</div>' +
      '</div></div>' +
      '<div class="exp-meta">' +
      '<div class="seg-tabs" role="tablist" aria-label="实验视图切换">' +
      '<button type="button" role="tab" aria-selected="' + (tab === 'lab') + '" class="' + (tab === 'lab' ? 'on' : '') + '" data-act="exp-tab" data-arg="lab">交互实验</button>' +
      '<button type="button" role="tab" aria-selected="' + (tab === 'quiz') + '" class="' + (tab === 'quiz' ? 'on' : '') + '" data-act="exp-tab" data-arg="quiz">随堂自测 <span class="tab-cnt">' + qSt.answered + '/' + qSt.total + '</span></button>' +
      '<button type="button" role="tab" aria-selected="' + (tab === 'theory') + '" class="' + (tab === 'theory' ? 'on' : '') + '" data-act="exp-tab" data-arg="theory">原理与误区</button>' +
      '</div>' +
      '<div class="exp-head-acts">' +
      '<button class="btn sm ghost" data-act="export-exp">导出</button>' +
      '<button class="btn sm ghost" data-act="reset-exp">重置</button>' +
      '</div></div></header>';

    if (tab === 'quiz') {
      host.innerHTML = '<div class="exp exp-subview">' + head +
        '<div class="exp-panel-scroll">' + renderExpQuizPanel(def, expQs, qSt) + '</div></div>';
      return;
    }

    if (tab === 'theory') {
      host.innerHTML = '<div class="exp exp-subview">' + head +
        '<div class="exp-panel-scroll">' + renderExpTheoryPanel(def) + '</div></div>';
      return;
    }

    var focusStrip = '<div class="focus-strip">' +
      '<div class="fs-k">本实验核心探究</div>' +
      '<div class="fs-q">' + E(EXP_HOOKS[def.id] || def.goals[0]) + '</div>' +
      '<button type="button" class="link tiny mt6" data-act="exp-tab" data-arg="theory">查看目标与公式 →</button>' +
      '</div>';

    var left = '<aside class="col-left">' + focusStrip + paramsHtml(def, st) + '</aside>';
    var right = '<div class="col-right" id="col-right">' + rightHtml(def, st, res) + '</div>';

    host.innerHTML = '<div class="exp">' + head + '<div class="exp-cols">' + left + right + '</div></div>';
    bindParams();
  }

  function renderExpTheoryPanel(def) {
    var html = '<div class="grid g2">';
    html += '<section class="card"><h3 class="card-h">学习目标<span class="card-hint">约 ' + def.minutes + ' 分钟</span></h3><div class="card-b">' +
      '<ul class="goal-list">' + def.goals.map(function (g) {
        return '<li><b>✓</b><span>' + E(g) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="divider"></div>' +
      '<div class="theory-note">' +
      '<p><b>前置知识：</b>' + E(def.prereq) + '</p>' +
      '<p class="mt6"><b>适用场景：</b>' + E(def.scopeNote) + '</p>' +
      '</div></div></section>';

    html += '<section class="card"><h3 class="card-h">常见认知误区<span class="card-hint">' + def.blockers.length + ' 条辨析</span></h3><div class="card-b">' +
      def.blockers.map(function (b) {
        return '<div class="blocker"><b>' + E(b[0]) + '</b><span>' + E(b[1]) + '</span></div>';
      }).join('') + '</div></section>';
    html += '</div>';

    html += '<section class="card mt14"><h3 class="card-h">核心理论与度量公式</h3><div class="card-b"><div class="theory-note">' + def.theory + '</div></div></section>';
    html += '<div class="btn-row mt14"><button class="btn primary" data-act="exp-tab" data-arg="lab">回到交互实验</button>' +
      '<button class="btn" data-act="exp-tab" data-arg="quiz">去做本节自测 →</button></div>';
    return html;
  }

  function renderExpQuizPanel(def, expQs, qSt) {
    var acc = qSt.accuracy == null ? null : qSt.accuracy;
    var hdr = '<section class="card quiz-banner"><div class="card-b row wrap" style="justify-content:space-between;gap:14px">' +
      '<div class="row" style="gap:14px">' +
      Q.ring(acc, { size: 54, text: acc == null ? '—' : Math.round(acc) + '%', color: acc >= 75 ? '#059669' : '#0066cc' }) +
      '<div><div style="font-weight:650;font-size:15px">M' + def.no + ' 随堂自测（' + qSt.answered + '/' + qSt.total + ' 题已作答）</div>' +
      '<div class="tiny muted mt2">围绕「' + E(def.title) + '」精选 ' + qSt.total + ' 道单选、多选与填空题，作答后即可查看逐项剖析。</div></div></div>' +
      '<div class="btn-row">' +
      '<button class="btn sm" data-act="exp-tab" data-arg="lab">返回实验面板</button>' +
      '<button class="btn sm ghost" data-nav="quiz">进入 ' + Q.QUIZ_QUESTIONS.length + ' 题综合题库 →</button>' +
      '</div></div></section>';
    return hdr + '<div class="mt12">' + renderQuizList(expQs, { showExpLink: false }) + '</div>';
  }

  function escInline(s) {
    return E(s).replace(/`([^`]+)`/g, '<code class="q-code">$1</code>');
  }

  function renderQuizList(questions, opts) {
    opts = opts || {};
    var qz = quizState();
    var ans = qz.answers;
    var drafts = qz.drafts;
    if (!questions.length) {
      return '<section class="card"><div class="card-b">' + Q.empty('当前筛选条件下暂无匹配题目。') + '</div></section>';
    }
    var letters = ['A', 'B', 'C', 'D', 'E'];
    var typeLabel = { single: '单选题', multi: '多选题', fill: '填空题' };
    return '<div class="quiz-list">' + questions.map(function (q, idx) {
      var qtype = q.type || 'single';
      var pick = ans[q.id];
      var done = Q.quizIsAnswered(q, pick);
      var ok = done && Q.quizCheck(q, pick);
      var statusBadge = !done ? '<span class="chip">未作答</span>'
        : ok ? Q.badge('pass', '回答正确') : Q.badge('fail', '再思考');
      var diffCls = q.diff === '综合' ? 'qdiff-adv' : q.diff === '进阶' ? 'qdiff-mid' : 'qdiff-base';
      var expDef = q.exp ? WB.byId[q.exp] : null;

      var body = '<div class="q-stem"><span class="q-idx">' + (idx + 1) + '.</span> ' + escInline(q.stem) + '</div>';

      if (qtype === 'single') {
        body += '<div class="q-opts">' +
          q.options.map(function (opt, oi) {
            var cls = 'q-opt';
            if (done) {
              if (oi === q.answer) cls += ' opt-right';
              else if (oi === pick) cls += ' opt-wrong';
              else cls += ' opt-dim';
            }
            return '<button type="button" class="' + cls + '" data-act="quiz-pick" data-arg="' + E(q.id) + ':' + oi + '">' +
              '<span class="q-letter">' + letters[oi] + '</span>' +
              '<span class="q-otext">' + escInline(opt) + '</span></button>';
          }).join('') +
          '</div>';
      } else if (qtype === 'multi') {
        var curDraft = Array.isArray(drafts[q.id]) ? drafts[q.id] : [];
        var pickedList = done ? (Array.isArray(pick) ? pick : []) : curDraft;
        var rightSet = {};
        (q.answer || []).forEach(function (i) { rightSet[i] = true; });
        body += '<div class="q-opts">' +
          q.options.map(function (opt, oi) {
            var isPicked = pickedList.indexOf(oi) >= 0;
            var isRight = !!rightSet[oi];
            var cls = 'q-opt q-opt-multi';
            if (!done) {
              if (isPicked) cls += ' opt-picked';
            } else {
              if (isRight && isPicked) cls += ' opt-right';
              else if (isRight && !isPicked) cls += ' opt-miss';
              else if (!isRight && isPicked) cls += ' opt-wrong';
              else cls += ' opt-dim';
            }
            return '<button type="button" class="' + cls + '" data-act="quiz-toggle" data-arg="' + E(q.id) + ':' + oi + '"' +
              (done ? ' disabled' : '') + '>' +
              '<span class="q-letter q-chk">' + (isPicked ? '✓' : letters[oi]) + '</span>' +
              '<span class="q-otext">' + escInline(opt) + (done && isRight && !isPicked ? ' <span class="q-miss-tag">漏选</span>' : '') + '</span></button>';
          }).join('') +
          '</div>';
        if (!done) {
          body += '<div class="q-actbar">' +
            '<span class="tiny muted">已勾选 ' + curDraft.length + ' 项（支持多个答案）</span>' +
            '<button type="button" class="btn primary sm" data-act="quiz-submit-multi" data-arg="' + E(q.id) + '"' +
            (curDraft.length ? '' : ' disabled') + '>提交多选</button>' +
            '</div>';
        }
      } else {
        var fillVal = done ? String(pick) : String(drafts[q.id] || '');
        body += '<div class="q-fill-box">' +
          '<input type="text" class="q-fill-inp" data-fill-qid="' + E(q.id) + '" value="' + E(fillVal) + '" placeholder="' +
          E(q.placeholder || '请输入答案，按回车或点提交') + '"' + (done ? ' disabled' : '') + '>' +
          (done ? '' : '<button type="button" class="btn primary sm" data-act="quiz-submit-fill" data-arg="' + E(q.id) + '">提交答案</button>') +
          '</div>';
      }

      if (done) {
        var ansLabel = Q.quizFormatAnswer(q);
        var expHtml = '<div class="q-explain ' + (ok ? 'ok' : 'bad') + '">' +
          '<div class="qe-head"><b>' + (ok ? '✓ 解析确认' : '参考答案：' + E(ansLabel)) + '</b>' +
          '<button type="button" class="link tiny" data-act="quiz-clear-one" data-arg="' + E(q.id) + '">重做本题</button></div>' +
          '<p class="qe-sum">' + escInline(q.explain) + '</p>';
        if (Array.isArray(q.optionNotes) && q.optionNotes.length) {
          var rightMap = {};
          if (qtype === 'multi') (q.answer || []).forEach(function (i) { rightMap[i] = true; });
          else rightMap[q.answer] = true;
          expHtml += '<div class="qe-breakdown"><div class="qe-sub">逐项剖析</div><ul class="qe-opts">' +
            q.optionNotes.map(function (note, oi) {
              var isOkOpt = !!rightMap[oi];
              return '<li class="' + (isOkOpt ? 'is-r' : 'is-w') + '">' +
                '<span class="qe-opt-tag">' + letters[oi] + ' · ' + (isOkOpt ? '对' : '错') + '</span>' +
                '<span>' + escInline(note) + '</span></li>';
            }).join('') +
            '</ul></div>';
        }
        expHtml += '</div>';
        body += expHtml;
      }

      return '<article class="card qcard ' + (done ? (ok ? 'is-ok' : 'is-bad') : '') + '" data-qid="' + E(q.id) + '">' +
        '<div class="qcard-h">' +
        '<div class="row wrap" style="gap:7px">' +
        '<span class="q-id">' + E(q.id) + '</span>' +
        '<span class="q-type qt-' + qtype + '">' + (typeLabel[qtype] || '单选') + '</span>' +
        '<span class="q-diff ' + diffCls + '">' + E(q.diff) + '</span>' +
        '<span class="chapter-tag">' + E(q.chapter) + '</span>' +
        '</div>' +
        '<div class="row" style="gap:8px">' +
        (opts.showExpLink && expDef ? '<button type="button" class="link tiny" data-nav="exp/' + E(expDef.id) + '">关联 M' + expDef.no + ' →</button>' : '') +
        statusBadge +
        '</div></div>' +
        '<div class="qcard-b">' + body + '</div></article>';
    }).join('') + '</div>';
  }

  /* 参数控件渲染 */
  function paramsHtml(def, st) {
    var body = '';
    var groups = [];
    def.params.forEach(function (p) {
      var g = p.group || '';
      var last = groups[groups.length - 1];
      if (!last || last.name !== g) groups.push({ name: g, items: [p] });
      else last.items.push(p);
    });

    groups.forEach(function (grp) {
      if (grp.name) {
        body += '<details class="sec pgroup"><summary><span>' + E(grp.name) + '</span><em>' + grp.items.length + ' 项</em></summary><div class="sec-b">';
      }
      grp.items.forEach(function (p) {
      var v = st[p.key];
      body += '<div class="field">';
      if (p.type === 'select') {
        body += '<label for="p-' + def.id + '-' + p.key + '">' + E(p.label) + '</label>' +
          '<select id="p-' + def.id + '-' + p.key + '" data-p="' + E(p.key) + '">' +
          p.options.map(function (o) {
            return '<option value="' + E(o.v) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + E(o.l) + '</option>';
          }).join('') + '</select>';
      } else if (p.type === 'seg') {
        body += '<span class="field-label">' + E(p.label) + '</span><div class="seg">' +
          p.options.map(function (o) {
            return '<button type="button" data-seg="' + E(p.key) + '" data-val="' + E(o.v) + '"' +
              (String(o.v) === String(v) ? ' class="on"' : '') + '>' + E(o.l) + '</button>';
          }).join('') + '</div>';
      } else if (p.type === 'range') {
        body += '<label for="p-' + def.id + '-' + p.key + '">' + E(p.label) + '</label>' +
          '<div class="range-row"><input id="p-' + def.id + '-' + p.key + '" type="range" data-p="' + E(p.key) + '"' +
          ' min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 1) + '" value="' + v + '">' +
          '<output data-out="' + E(p.key) + '">' + (p.fmt ? p.fmt(v) : v) + '</output></div>';
      } else if (p.type === 'number') {
        body += '<label for="p-' + def.id + '-' + p.key + '">' + E(p.label) + '</label>' +
          '<input id="p-' + def.id + '-' + p.key + '" type="number" data-p="' + E(p.key) + '" value="' + v + '"' +
          (p.min !== undefined ? ' min="' + p.min + '"' : '') + (p.max !== undefined ? ' max="' + p.max + '"' : '') +
          (p.step !== undefined ? ' step="' + p.step + '"' : '') + '>';
      } else if (p.type === 'text') {
        body += '<label for="p-' + def.id + '-' + p.key + '">' + E(p.label) + '</label>' +
          '<input id="p-' + def.id + '-' + p.key + '" type="text" data-p="' + E(p.key) + '" value="' + E(v) + '" maxlength="' + (p.maxlen || 24) + '">';
      } else if (p.type === 'check') {
        body += '<label class="check"><input type="checkbox" data-p="' + E(p.key) + '"' + (v ? ' checked' : '') + '>' +
          '<span>' + E(p.label) + (p.sub ? '<span class="ck-sub">' + E(p.sub) + '</span>' : '') + '</span></label>';
      } else if (p.type === 'checks') {
        body += '<span class="field-label">' + E(p.label) + '</span>';
        if (p.cols === 2) body += '<div class="checks2">';
        body += p.options.map(function (o) {
          var on = (v || []).indexOf(o.v) >= 0;
          return '<label class="check"><input type="checkbox" data-p="' + E(p.key) + '" data-multi="1" value="' + E(o.v) + '"' +
            (on ? ' checked' : '') + '><span>' + E(o.l) + (o.s ? '<span class="ck-sub">' + E(o.s) + '</span>' : '') + '</span></label>';
        }).join('');
        if (p.cols === 2) body += '</div>';
      }
        if (p.hint) body += '<div class="hint">' + p.hint + '</div>';
        body += '</div>';
      });
      if (grp.name) body += '</div></details>';
    });

    return '<section class="card"><h3 class="card-h">参数调节区<span class="card-hint">' + def.params.length + ' 项</span></h3>' +
      '<div class="card-b">' + body + '</div></section>';
  }

  function rightHtml(def, st, res) {
    if (!res.ok) {
      return Q.card('计算出错', '<div class="callout fail"><b>实验计算抛出异常：</b>' + E(res.error) +
        '<p class="mt6">请调整参数后重试。该异常已被捕获，不会影响其他实验。</p></div>');
    }
    var html = '';
    if (st.__dirty && def.needsRun) {
      html += '<div class="callout warn"><b>参数已变更，下方结果已失效。</b>' +
        '<p>当前展示的是上一次执行的结果，请点击“执行”重新计算后再下结论。</p></div>';
    }
    html += def.viz(res.value, st);
    html += def.verify(res.value, st);
    html += evidenceBar(def, res.value, st);
    return html;
  }

  function evidenceBar(def, res, st) {
    var info = null;
    try { info = def.evidence(res, st); } catch (e) { info = null; }
    var recorded = WB.evidence[def.id];
    var body = '';
    if (!info) {
      body = '<p class="muted">本实验未定义证据采集规则。</p>';
    } else if (info.disabled) {
      body = '<p class="muted">' + E(info.note || '尚未产生可记录的结论。') + ' 请先完成本实验的核心操作。</p>';
    } else {
      body += '<div class="row wrap mb6">' +
        Q.badge(info.status, info.status === 'pass' ? '当前结果达到达成条件' : info.status === 'warn' ? '当前结果存在待改进项' : '当前结果未达达成条件') +
        '<span class="tiny muted">主指标：' + E(info.label) + ' = ' + (info.coverage === null || info.coverage === undefined ? '—' : Q.num(info.coverage, 1) + '%') + '</span>' +
        '</div>';
      if (info.note) body += '<p class="tiny muted mb6">' + E(info.note) + '</p>';
      body += '<div class="btn-row"><button class="btn primary sm" data-act="record-evidence">记录本次结果到证据库</button>' +
        (recorded ? '<span class="tiny muted">上次记录：' + E(recorded.at || '—') + '</span>' : '<span class="tiny muted">尚未记录</span>') +
        '</div>';
    }
    return '<section class="card"><h3 class="card-h">证据与结论沉淀</h3><div class="card-b">' + body + '</div></section>';
  }

  /* --------------------------------------------------------- 参数事件绑定 */
  function bindParams() {
    var left = document.querySelector('.col-left');
    if (!left) return;
    left.addEventListener('change', function (ev) {
      var el = ev.target;
      if (el.hasAttribute && el.hasAttribute('data-p')) {
        var k = applyControl(el);
        afterParamChange(k);
      }
    });
    left.addEventListener('input', function (ev) {
      var el = ev.target;
      if (el.type === 'range' && el.hasAttribute('data-p')) {
        var out = left.querySelector('[data-out="' + el.getAttribute('data-p') + '"]');
        if (out) {
          var p = currentDef().params.filter(function (x) { return x.key === el.getAttribute('data-p'); })[0];
          out.value = p && p.fmt ? p.fmt(Number(el.value)) : el.value;
          out.textContent = p && p.fmt ? p.fmt(Number(el.value)) : el.value;
        }
        var kk = applyControl(el);
        afterParamChange(kk);
      }
    });
  }

  function currentDef() {
    var r = parseHash();
    return r.view === 'exp' ? WB.byId[r.id] : null;
  }

  function applyControl(el) {
    var def = currentDef();
    if (!def) return null;
    var st = expState(def);
    var key = el.getAttribute('data-p');
    if (!key) return null;
    if (el.type === 'checkbox' && el.getAttribute('data-multi') === '1') {
      var all = document.querySelectorAll('[data-p="' + key + '"][data-multi="1"]');
      var vals = [];
      Array.prototype.forEach.call(all, function (x) { if (x.checked) vals.push(x.value); });
      st[key] = vals;
    } else if (el.type === 'checkbox') {
      st[key] = el.checked;
    } else if (el.type === 'range') {
      var n = Number(el.value);
      st[key] = isFinite(n) ? n : 0;
    } else if (el.type === 'number') {
      // 留空时置为 null，让各实验能区分“填了 0”和“没填”
      if (el.value === '' || !isFinite(Number(el.value))) st[key] = null;
      else st[key] = Number(el.value);
    } else {
      st[key] = el.value;
    }
    return key;
  }

  function afterParamChange(key) {
    var def = currentDef();
    if (!def) return;
    var st = expState(def);
    if (def.onParam) {
      try { def.onParam(key, st); } catch (e) { /* 参数联动失败不应中断渲染 */ }
    }
    if (def.needsRun) st.__dirty = true;
    persist();
    var col = document.getElementById('col-right');
    if (!col) return;
    var top = col.scrollTop;
    var res = safeCompute(def, st);
    col.innerHTML = rightHtml(def, st, res);
    col.scrollTop = top;
  }

  /* 右栏内的输入控件（如自定义用例表单）只更新状态，不触发整块重绘，避免打断输入 */
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute || !el.hasAttribute('data-p')) return;
    if (!el.closest || !el.closest('#col-right')) return;
    if (applyControl(el)) persist();
  });

  /* 填空题输入草稿实时保存 + 回车直接提交 */
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el || !el.getAttribute) return;
    var qid = el.getAttribute('data-fill-qid');
    if (!qid) return;
    quizState().drafts[qid] = el.value;
    persist();
  });

  document.addEventListener('keydown', function (ev) {
    var el = ev.target;
    if (ev.key === 'Enter' && el && el.getAttribute && el.hasAttribute('data-fill-qid')) {
      ev.preventDefault();
      handleAction('quiz-submit-fill', el.getAttribute('data-fill-qid'), el, ev);
      return;
    }
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (!el || !el.getAttribute) return;
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    if (!el.hasAttribute('data-act')) return;
    ev.preventDefault();
    handleAction(el.getAttribute('data-act'), el.getAttribute('data-arg'), el, ev);
  });

  /* ------------------------------------------------------------- 动作派发 */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-nav]') : null;
    if (t) {
      ev.preventDefault();
      WB.go(t.getAttribute('data-nav'));
      return;
    }
    var seg = ev.target.closest ? ev.target.closest('[data-seg]') : null;
    if (seg) {
      var def = currentDef();
      if (!def) return;
      var st = expState(def);
      st[seg.getAttribute('data-seg')] = seg.getAttribute('data-val');
      if (def.needsRun) st.__dirty = true;
      persist();
      render();
      return;
    }
    var act = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!act) return;
    var name = act.getAttribute('data-act');
    var arg = act.getAttribute('data-arg');
    handleAction(name, arg, act, ev);
  });

  function handleAction(name, arg, el, ev) {
    var def = currentDef();
    var st = def ? expState(def) : null;

    if (name === 'reset-exp' && def) {
      if (!confirm('将清空「M' + def.no + ' ' + def.title + '」的参数与操作记录（其他实验不受影响）。继续？')) return;
      WB.state[def.id] = Q.clone(def.defaults || {});
      persist();
      render();
      toast('已重置本实验');
      return;
    }
    if (name === 'export-exp' && def) {
      var res = safeCompute(def, st);
      var payload = {
        schema: WB.schema, kind: 'experiment-record', exportedAt: new Date().toISOString(),
        experiment: { id: def.id, no: def.no, title: def.title, chapter: def.chapter },
        state: Q.clone(st),
        result: res.ok ? res.value : { error: res.error },
        evidence: WB.evidence[def.id] || null
      };
      download('qlab-' + def.id + '-record.json', JSON.stringify(payload, jsonSafe, 2), 'application/json');
      return;
    }
    if (name === 'record-evidence' && def) {
      var r = safeCompute(def, st);
      if (!r.ok) { toast('计算异常，无法记录证据', 'fail'); return; }
      var info = def.evidence(r.value, st);
      if (!info) return;
      WB.evidence[def.id] = {
        status: info.status, coverage: info.coverage, label: info.label,
        defects: info.defects || [], note: info.note || '',
        at: new Date().toLocaleString('zh-CN', { hour12: false }),
        exp: def.id, no: def.no, title: def.title
      };
      persist();
      render();
      toast('已记录 M' + def.no + ' 的证据');
      return;
    }
    if (def && def.onAction) {
      var handled = def.onAction(name, arg, st, el, ev);
      if (handled) {
        persist();
        var col = document.getElementById('col-right');
        if (col) {
          var top = col.scrollTop;
          col.innerHTML = rightHtml(def, st, safeCompute(def, st));
          col.scrollTop = top;
        }
        renderTopbar('exp', def.id);
        buildRail();
        markRail('exp/' + def.id);
      }
    }
    if (name === 'help') { openGuide(0, true); return; }
    if (name === 'exp-tab' && def) {
      if (!WB.session.expTabs || typeof WB.session.expTabs !== 'object') WB.session.expTabs = {};
      WB.session.expTabs[def.id] = arg || 'lab';
      render();
      return;
    }
    if (name === 'quiz-pick') {
      var parts = String(arg || '').split(':');
      var qid = parts[0], optIdx = Number(parts[1]);
      var qObj = Q.QUIZ_QUESTIONS.filter(function (x) { return x.id === qid; })[0];
      if (!qObj || !isFinite(optIdx)) return;
      var qz = quizState();
      qz.answers[qid] = optIdx;
      persist();
      rerenderKeepScroll();
      toast(Q.quizCheck(qObj, optIdx) ? qid + ' 回答正确' : qid + ' 已作答，对照逐项剖析看看思路', Q.quizCheck(qObj, optIdx) ? '' : 'warn');
      return;
    }
    if (name === 'quiz-toggle') {
      var tp = String(arg || '').split(':');
      var mqid = tp[0], mIdx = Number(tp[1]);
      var mq = Q.QUIZ_QUESTIONS.filter(function (x) { return x.id === mqid; })[0];
      var mqz = quizState();
      if (!mq || !isFinite(mIdx) || Q.quizIsAnswered(mq, mqz.answers[mqid])) return;
      var dr = Array.isArray(mqz.drafts[mqid]) ? mqz.drafts[mqid].slice() : [];
      var pos = dr.indexOf(mIdx);
      if (pos >= 0) dr.splice(pos, 1);
      else dr.push(mIdx);
      dr.sort(function (a, b) { return a - b; });
      mqz.drafts[mqid] = dr;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-submit-multi') {
      var sq = Q.QUIZ_QUESTIONS.filter(function (x) { return x.id === arg; })[0];
      var sqz = quizState();
      if (!sq) return;
      var sel = Array.isArray(sqz.drafts[sq.id]) ? sqz.drafts[sq.id].slice().sort(function (a, b) { return a - b; }) : [];
      if (!sel.length) { toast('请先至少勾选一个选项', 'warn'); return; }
      sqz.answers[sq.id] = sel;
      delete sqz.drafts[sq.id];
      persist();
      rerenderKeepScroll();
      toast(Q.quizCheck(sq, sel) ? sq.id + ' 多选全对' : sq.id + ' 已提交，对照逐项剖析核查漏错', Q.quizCheck(sq, sel) ? '' : 'warn');
      return;
    }
    if (name === 'quiz-submit-fill') {
      var fq = Q.QUIZ_QUESTIONS.filter(function (x) { return x.id === arg; })[0];
      var fqz = quizState();
      if (!fq) return;
      var inp = document.querySelector('[data-fill-qid="' + fq.id + '"]');
      var rawVal = inp ? inp.value : String(fqz.drafts[fq.id] || '');
      if (!Q.quizNormalizeFill(rawVal)) { toast('请先填写答案再提交', 'warn'); return; }
      fqz.answers[fq.id] = String(rawVal).trim();
      delete fqz.drafts[fq.id];
      persist();
      rerenderKeepScroll();
      toast(Q.quizCheck(fq, fqz.answers[fq.id]) ? fq.id + ' 填空正确' : fq.id + ' 已提交，看看推导步骤', Q.quizCheck(fq, fqz.answers[fq.id]) ? '' : 'warn');
      return;
    }
    if (name === 'quiz-clear-one') {
      var qz2 = quizState();
      delete qz2.answers[arg];
      delete qz2.drafts[arg];
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-topic') {
      var qz3 = quizState();
      qz3.topic = arg || 'all';
      qz3.examIds = null;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-diff') {
      var qz4 = quizState();
      qz4.diff = arg || 'all';
      qz4.examIds = null;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-type') {
      var qzt = quizState();
      qzt.type = arg || 'all';
      qzt.examIds = null;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-expand-all') {
      var qze = quizState();
      qze.expandAll = !qze.expandAll;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-wrong-only') {
      var qz5 = quizState();
      qz5.wrongOnly = !qz5.wrongOnly;
      qz5.examIds = null;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-exam') {
      var qz6 = quizState();
      qz6.examIds = Q.quizSample(Q.QUIZ_QUESTIONS, 10).map(function (q) { return q.id; });
      qz6.wrongOnly = false;
      persist();
      rerenderKeepScroll();
      toast('已生成 10 题随堂抽测卷（涵括单选、多选与填空）');
      return;
    }
    if (name === 'quiz-exam-exit') {
      var qz7 = quizState();
      qz7.examIds = null;
      persist();
      rerenderKeepScroll();
      return;
    }
    if (name === 'quiz-reset') {
      if (!confirm('将清空所有随堂自测作答记录。继续？')) return;
      quizState().answers = {};
      quizState().drafts = {};
      quizState().examIds = null;
      quizState().wrongOnly = false;
      persist();
      render();
      toast('已清空自测作答记录');
      return;
    }
    if (name === 'export-all') { exportAll(); return; }
    if (name === 'import-all') { importAll(); return; }
    if (name === 'clear-all') {
      if (!confirm('将清空全部实验参数与证据记录（不可撤销）。继续？')) return;
      WB.evidence = {}; WB.state = {}; WB.session = {};
      persist(); render();
      toast('已清空全部记录');
      return;
    }
    if (name === 'download-report') { downloadReport(); return; }
    if (name === 'load-demo') {
      if (!confirm('将写入一组示例演示证据，用于在尚未逐个完成前置实验时探索 M8 门禁模型。继续？')) return;
      WB.evidence = Q.qaDemoEvidence();
      Object.keys(WB.evidence).forEach(function (k) {
        WB.evidence[k].at = '演示数据（示例）';
        WB.evidence[k].demo = true;
      });
      persist(); render();
      toast('已载入示例演示证据', 'warn', 4000);
      return;
    }
  }
  function jsonSafe(k, v) {
    if (typeof v === 'number' && !isFinite(v)) return null;
    return v;
  }

  /* --------------------------------------------------------- 概览页 */
  function renderOverview(host) {
    var done = WB.exps.filter(function (d) { return WB.evidence[d.id]; }).length;
    var qAll = Q.quizStats(quizState().answers);
    var evPct = Math.round((done / WB.exps.length) * 100);
    var html = '';

    var totalQ = Q.QUIZ_QUESTIONS.length;
    var perExpQ = WB.exps.length ? Q.quizByExp(WB.exps[0].id).length : 5;
    // Hero 焦点区：一眼看清定位、当前进度与入口
    html += '<section class="hero-card">' +
      '<div class="hero-copy">' +
      '<div class="hero-eyebrow">《软件质量保证与测试》交互式实验平台</div>' +
      '<h1 class="hero-title">青蓝 QA Lab</h1>' +
      '<p class="hero-lead">把静态审查、等价类、边界值、状态机、白盒覆盖与 CI 门禁，做成参数一调就动的实时实验，搭配 ' + totalQ + ' 道单选、多选与填空自测题随堂验证理解。</p>' +
      '<div class="btn-row mt14">' +
      '<button class="btn primary lg" data-nav="exp/m2">从 M2 等价类开始实验</button>' +
      '<button class="btn lg" data-nav="quiz">进入随堂题库（' + qAll.answered + '/' + qAll.total + '）</button>' +
      '<button class="btn ghost lg" data-nav="graph">查看知识图谱</button>' +
      '</div></div>' +
      '<div class="hero-glass">' +
      '<div class="hg-item">' + Q.ring(evPct, { size: 58, text: done + '/8', color: '#0066cc', label: '实验证据' }) +
      '<div><div class="hg-k">实验证据沉淀</div><div class="hg-v">已记录 ' + done + ' / 8 项</div><div class="tiny muted">汇总后驱动 M8 放行门禁</div></div></div>' +
      '<div class="hg-sep"></div>' +
      '<div class="hg-item">' + Q.ring(qAll.progress, { size: 58, text: qAll.answered + '/' + qAll.total, color: '#0d9488', label: '随堂题库' }) +
      '<div><div class="hg-k">随堂测验掌握</div><div class="hg-v">' + (qAll.accuracy == null ? '待作答' : '正确率 ' + qAll.accuracy + '%') + '</div><div class="tiny muted">第 1–11 章 · 单选/多选/填空</div></div></div>' +
      '</div></section>';

    // 四阶段学习路径
    var stages = [
      { no: '01', title: '静态防线', desc: '代码走查与规则扫描', exp: 'm1', tag: '第7章' },
      { no: '02', title: '黑盒设计', desc: '等价类、边界、决策表、状态机', exp: 'm2', tag: '第8章上' },
      { no: '03', title: '结构与 CI', desc: '白盒覆盖与回归流水线', exp: 'm6', tag: '第8/11章' },
      { no: '04', title: '发布门禁', desc: '风险建模与放行判断', exp: 'm8', tag: '第1/4/9章' }
    ];
    html += '<div class="section-h"><h2>四步学习脉络</h2><span class="tiny muted">推荐沿 01 → 04 推进，也可按需直达</span></div>';
    html += '<div class="grid g4">';
    stages.forEach(function (st) {
      html += '<button class="stage-pill" data-nav="exp/' + st.exp + '">' +
        '<div class="row" style="justify-content:space-between"><span class="stage-no">' + st.no + '</span><span class="tiny muted">' + st.tag + '</span></div>' +
        '<div class="stage-t">' + st.title + '</div>' +
        '<div class="stage-d">' + st.desc + '</div></button>';
    });
    html += '</div>';

    // 八个核心实验 Bento 网格
    html += '<div class="section-h"><h2>八个核心实验</h2><span class="tiny muted">每个实验内置交互调参、' + perExpQ + ' 道多题型随堂测与误区辨析</span></div>';
    html += '<div class="grid g4">';
    WB.exps.forEach(function (d) {
      var s = expStatus(d);
      var qExp = Q.quizStats(quizState().answers, Q.quizByExp(d.id));
      html += '<button class="bento-exp" data-nav="exp/' + d.id + '">' +
        '<div class="be-top">' +
        '<span class="be-no">M' + d.no + '</span>' +
        '<div class="row" style="gap:5px"><span class="chip">' + qExp.correct + '/' + qExp.total + '题</span>' + Q.badge(s.kind, s.text) + '</div>' +
        '</div>' +
        '<div class="be-title">' + E(d.title) + '</div>' +
        '<div class="be-hook">' + E(EXP_HOOKS[d.id] || d.subtitle) + '</div>' +
        '<div class="be-foot"><span>' + E(d.chapter.split(' ')[0]) + '</span><span class="be-go">进入实验 →</span></div>' +
        '</button>';
    });
    html += '</div>';

    // 统一实训底座（紧凑胶囊卡片，去冗余文字）
    html += '<section class="card mt14"><h3 class="card-h">共用业务场景：青蓝人才服务平台<span class="card-hint">培训报名计费与认定资格审批双主线</span></h3>' +
      '<div class="card-b spec-strip">' +
      '<div class="spec-col">' +
      '<div class="spec-k">计费规则（M2 · M3 · M6 · M7）</div>' +
      '<div class="chips mt6">' +
      '<span class="chip">基础 120元/时 · 持证 90元</span>' +
      '<span class="chip">团体 3–5人95折 / 6–10人9折 / 11–20人85折</span>' +
      '<span class="chip">复训 7折（与团购不叠加，取更优）</span>' +
      '<span class="chip">优惠券 0–500元，应付最低为 0</span>' +
      '</div></div>' +
      '<div class="spec-col">' +
      '<div class="spec-k">资格与流程（M4 · M5 · M8）</div>' +
      '<div class="chips mt6">' +
      '<span class="chip">年龄 16–60 岁 · 大专及以上 · 工龄 ≥ 2年</span>' +
      '<span class="chip">缺 1 项且有推荐函 → 条件通过</span>' +
      '<span class="chip">11 状态 / 14 迁移全生命周期校验</span>' +
      '</div></div></div></section>';

    host.innerHTML = html;
  }

  /* --------------------------------------------------------- 随堂题库页 */
  function renderQuizPage(host) {
    var qz = quizState();
    var allStats = Q.quizStats(qz.answers, Q.QUIZ_QUESTIONS);
    var inExam = Array.isArray(qz.examIds) && qz.examIds.length > 0;
    var list;
    if (inExam) {
      var idMap = {};
      Q.QUIZ_QUESTIONS.forEach(function (q) { idMap[q.id] = q; });
      list = qz.examIds.map(function (id) { return idMap[id]; }).filter(Boolean);
    } else {
      list = Q.quizFilter({ topic: qz.topic, diff: qz.diff, type: qz.type });
      if (qz.wrongOnly) {
        list = list.filter(function (q) {
          var p = qz.answers[q.id];
          return Q.quizIsAnswered(q, p) && !Q.quizCheck(q, p);
        });
      }
    }
    var subStats = Q.quizStats(qz.answers, list);
    var isGrouped = !inExam && qz.topic === 'all' && qz.diff === 'all' && qz.type === 'all' && !qz.wrongOnly && !qz.expandAll;

    var html = '<div class="page-h"><div><h1>随堂测验与教材题库</h1>' +
      '<div class="sub">紧扣《软件质量保证与测试》第 1–11 章，包含单选、多选与填空三种题型，每道题均带逐项剖析与 10 题随机抽测。</div></div>' +
      '<div class="btn-row">' +
      (inExam
        ? '<button class="btn primary" data-act="quiz-exam">再抽一套 10 题</button><button class="btn" data-act="quiz-exam-exit">返回题库浏览</button>'
        : '<button class="btn primary" data-act="quiz-exam">10 题随堂抽测</button>') +
      (!inExam && qz.topic === 'all' && qz.diff === 'all' && qz.type === 'all' && !qz.wrongOnly
        ? '<button class="btn" data-act="quiz-expand-all">' + (qz.expandAll ? '按章节收纳' : '展开全部章节') + '</button>' : '') +
      '<button class="btn ghost" data-act="quiz-reset">清空记录</button>' +
      '</div></div>';

    // 顶部掌握度总览条
    html += '<section class="card quiz-banner"><div class="card-b quiz-stats-grid">' +
      '<div class="row" style="gap:14px">' +
      Q.ring(allStats.accuracy, { size: 58, text: allStats.accuracy == null ? '—' : Math.round(allStats.accuracy) + '%', color: allStats.accuracy >= 80 ? '#059669' : '#0066cc' }) +
      '<div><div class="tiny muted">全库总正确率</div><div class="score-big" style="font-size:20px">' +
      (allStats.accuracy == null ? '待作答' : allStats.accuracy + '%') + '</div></div></div>' +
      '<div><div class="tiny muted">已作答进度</div><div class="score-big" style="font-size:20px">' + allStats.answered + ' <small>/ ' + allStats.total + ' 题</small></div></div>' +
      '<div><div class="tiny muted">答对 / 错题</div><div class="score-big" style="font-size:20px">' +
      '<span style="color:var(--green)">' + allStats.correct + '</span> <small>/ <span style="color:var(--red)">' + allStats.wrong + '</span></small></div></div>' +
      '<div><div class="tiny muted">当前视图题目</div><div class="score-big" style="font-size:20px">' + list.length + ' <small>题（已答 ' + subStats.answered + '）</small></div></div>' +
      '</div></section>';

    if (!inExam) {
      html += '<section class="card"><div class="card-b quiz-filters">';
      html += '<div class="qf-row"><span class="qf-lbl">主题</span><div class="qf-pills">' +
        Q.QUIZ_TOPICS.map(function (t) {
          var sub = t.key === 'all' ? Q.QUIZ_QUESTIONS : Q.quizFilter({ topic: t.key, diff: 'all' });
          var st = Q.quizStats(qz.answers, sub);
          return '<button type="button" class="pill-btn' + (qz.topic === t.key ? ' on' : '') + '" data-act="quiz-topic" data-arg="' + E(t.key) + '">' +
            E(t.label) + ' <em>' + st.correct + '/' + st.total + '</em></button>';
        }).join('') + '</div></div>';
      html += '<div class="qf-row"><span class="qf-lbl">题型</span><div class="qf-pills">' +
        [
          { k: 'all', l: '全部题型' },
          { k: 'single', l: '单选题' },
          { k: 'multi', l: '多选题' },
          { k: 'fill', l: '填空题' }
        ].map(function (tp) {
          var cnt = tp.k === 'all' ? Q.QUIZ_QUESTIONS.length : Q.quizFilter({ type: tp.k }).length;
          return '<button type="button" class="pill-btn' + (qz.type === tp.k ? ' on' : '') + '" data-act="quiz-type" data-arg="' + E(tp.k) + '">' +
            E(tp.l) + ' <em>' + cnt + '</em></button>';
        }).join('') + '</div></div>';
      html += '<div class="qf-row"><span class="qf-lbl">难度</span><div class="qf-pills">' +
        ['all', '基础', '进阶', '综合'].map(function (df) {
          return '<button type="button" class="pill-btn' + (qz.diff === df ? ' on' : '') + '" data-act="quiz-diff" data-arg="' + E(df) + '">' +
            (df === 'all' ? '全部难度' : E(df)) + '</button>';
        }).join('') +
        '<button type="button" class="pill-btn' + (qz.wrongOnly ? ' on warn' : '') + '" data-act="quiz-wrong-only">仅看错题（' + allStats.wrong + '）</button>' +
        '</div></div>';
      html += '</div></section>';
    } else {
      html += '<div class="callout mt10"><b>随机抽测模式：</b>当前共 ' + list.length + ' 题（覆盖第 1–11 章，含单选/多选/填空），作答后即时显示逐项剖析。</div>';
    }

    if (isGrouped) {
      html += '<div class="quiz-groups mt12">' +
        Q.QUIZ_TOPICS.slice(1).map(function (t, gi) {
          var sub = Q.quizFilter({ topic: t.key });
          var st = Q.quizStats(qz.answers, sub);
          return '<details class="sec-card quiz-sec"' + (gi === 0 ? ' open' : '') + '>' +
            '<summary class="sec-card-h">' +
            '<div class="row wrap" style="gap:8px"><span class="chapter-tag">' + E(t.chapter) + '</span><b>' + E(t.label) + '</b></div>' +
            '<div class="row" style="gap:8px"><span class="chip' + (st.answered === st.total && st.wrong === 0 && st.total > 0 ? ' on' : '') + '">' +
            '已答 ' + st.answered + '/' + st.total + ' · 正确 ' + st.correct + '</span><span class="sec-arrow">▾</span></div>' +
            '</summary>' +
            '<div class="sec-card-b">' + renderQuizList(sub, { showExpLink: true }) + '</div>' +
            '</details>';
        }).join('') +
        '</div>';
    } else {
      html += '<div class="mt12">' + renderQuizList(list, { showExpLink: true }) + '</div>';
    }
    host.innerHTML = html;
  }

  /* --------------------------------------------------------- 图谱页 */
  function renderGraphPage(host, focusId) {
    var nodes = Q.KG_NODES, edges = Q.KG_EDGES, types = Q.KG_EDGE_TYPES;
    var active = focusId || WB.session.graphNode || 'm2';
    var html = '<div class="page-h"><div><h1>知识图谱</h1>' +
      '<div class="sub">悬停节点高亮关联链路，点击即可查看章节定位并一键进入对应实验。</div></div></div>';

    html += '<div class="split">';
    html += '<div class="f1"><div class="graph-wrap" id="graph-host"></div>' +
      '<div class="row wrap mt6" style="gap:14px">' +
      Object.keys(types).map(function (k) {
        var t = types[k];
        return '<span class="row" style="gap:5px;font-size:11px;color:var(--ink-3)">' +
          '<svg width="26" height="8"><line x1="1" y1="4" x2="25" y2="4" stroke="' + t.color +
          '" stroke-width="2" stroke-dasharray="' + (t.dash === '0' ? 'none' : t.dash) + '"/></svg>' + t.label + '</span>';
      }).join('') +
      '<span class="tiny muted">虚线框 = 基础与支撑知识</span></div></div>';
    html += '<div style="width:300px;flex:0 0 300px" id="graph-detail"></div>';
    html += '</div>';

    html += '<details class="sec-card mt14"><summary class="sec-card-h"><span>文字版知识关系（与上图等价）</span><span class="row" style="gap:8px"><span class="card-hint">' +
      Q.KG_EDGES.length + ' 条关联边</span><span class="sec-arrow">▾</span></span></summary>' +
      '<div class="sec-card-b flush">' + graphTextTable() + '</div></details>';

    host.innerHTML = html;

    Q.kgRender(document.getElementById('graph-host'), {
      nodes: nodes, edges: edges, edgeTypes: types, active: active,
      onSelect: function (id) { WB.session.graphNode = id; renderGraphPage(host, id); }
    });
    renderGraphDetail(active);
  }

  function renderGraphDetail(id) {
    var n = Q.kgNode(id);
    var host = document.getElementById('graph-detail');
    if (!n || !host) return;
    var ins = Q.KG_EDGES.filter(function (e) { return e.to === id; });
    var outs = Q.KG_EDGES.filter(function (e) { return e.from === id; });
    var html = '<section class="card"><h3 class="card-h">' + E(n.label) + '</h3><div class="card-b">';
    html += '<div class="row wrap mb6"><span class="chapter-tag">' + E(n.chapter) + '</span>' +
      (n.kind === 'exp' ? '<span class="chip">核心实验</span>' : '<span class="chip">关联知识</span>') + '</div>';
    if (n.kind === 'exp') {
      var d = WB.byId[n.id];
      html += '<p class="theory-note">' + E(d.subtitle) + '</p>';
      var s = expStatus(d);
      html += '<div class="mt6">' + Q.badge(s.kind, s.label) + '</div>';
      html += '<button class="btn primary sm mt10" data-nav="exp/' + n.id + '">进入实验 M' + n.no + '</button>';
    } else {
      html += '<p class="theory-note">该节点为课程前置与支撑知识模块，帮助衔接对应实验中的质量活动与度量指标。</p>';
    }
    html += '</div></section>';

    if (ins.length) {
      html += '<section class="card"><h3 class="card-h">指向本节点的关系</h3><div class="card-b">' +
        ins.map(function (e) {
          var t = Q.KG_EDGE_TYPES[e.type];
          return '<div class="mb6"><span class="chip" style="color:' + t.color + '">' + t.label + '</span> ' +
            '<b class="tiny">' + E(Q.kgNode(e.from).short) + ' → 本节点</b>' +
            '<div class="tiny muted">' + E(e.why) + '</div></div>';
        }).join('') + '</div></section>';
    }
    if (outs.length) {
      html += '<section class="card"><h3 class="card-h">从本节点出发</h3><div class="card-b">' +
        outs.map(function (e) {
          var t = Q.KG_EDGE_TYPES[e.type];
          return '<div class="mb6"><span class="chip" style="color:' + t.color + '">' + t.label + '</span> ' +
            '<b class="tiny">本节点 → ' + E(Q.kgNode(e.to).short) + '</b>' +
            '<div class="tiny muted">' + E(e.why) + '</div></div>';
        }).join('') + '</div></section>';
    }
    host.innerHTML = html;
  }

  function graphTextTable() {
    var rows = Q.KG_EDGES.map(function (e) {
      var t = Q.KG_EDGE_TYPES[e.type];
      return {
        cells: [
          { html: '<b>' + E(Q.kgNode(e.from).short) + '</b> → <b>' + E(Q.kgNode(e.to).short) + '</b>' },
          { html: '<span class="chip" style="color:' + t.color + '">' + t.label + '</span>' },
          { v: e.why }
        ]
      };
    });
    return Q.table(['关系', '类型', '为什么相连'], rows);
  }

  /* --------------------------------------------------------- 证据页 */
  function renderEvidencePage(host) {
    var html = '<div class="page-h"><div><h1>证据库与报告</h1>' +
      '<div class="sub">沉淀 M1–M7 实验结论与 ' + Q.QUIZ_QUESTIONS.length + ' 题随堂测试成绩，用于 M8 发布评估与报告导出。</div></div></div>';

    var rows = WB.exps.map(function (d) {
      var ev = WB.evidence[d.id];
      return {
        cells: [
          { html: '<b>M' + d.no + '</b> ' + E(d.title) },
          { html: ev ? Q.badge(ev.status, ev.status === 'pass' ? '达成' : ev.status === 'warn' ? '待改进' : '未通过') : Q.badge('mute', '未记录') },
          { html: ev ? '<span class="num">' + (ev.coverage === null ? '—' : Q.num(ev.coverage, 1) + '%') + '</span> <span class="tiny muted">' + E(ev.label || '') + '</span>' : '—' },
          { html: ev ? E(ev.note || '—') : '—' },
          { html: ev ? E(ev.at || '—') + (ev.demo ? ' <span class="chip" style="color:var(--amber)">演示</span>' : '') : '—' }
        ]
      };
    });
    html += Q.card('各实验证据（' + Object.keys(WB.evidence).length + '/' + WB.exps.length + ' 已记录）',
      Q.table(['实验', '结论', '主指标', '说明', '记录时间'], rows), { cls: '' });

    var qAll = Q.quizStats(quizState().answers);
    var qTopicBadges = Q.QUIZ_TOPICS.slice(1).map(function (t) {
      var st = Q.quizStats(quizState().answers, Q.quizFilter({ topic: t.key, diff: 'all' }));
      return '<span class="chip' + (st.answered === st.total && st.wrong === 0 ? ' on' : '') + '">' +
        E(t.label.replace(/^M\d+\s/, 'M' + (t.key.slice(1) || '') + ' ')) + ' ' + st.correct + '/' + st.total + '</span>';
    }).join(' ');
    html += '<section class="card mt14"><h3 class="card-h">随堂自测掌握度<span class="card-hint">已答 ' +
      qAll.answered + ' / ' + qAll.total + ' · 正确率 ' + (qAll.accuracy == null ? '—' : qAll.accuracy + '%') + '</span></h3>' +
      '<div class="card-b row wrap" style="justify-content:space-between;align-items:center;gap:12px">' +
      '<div class="chips" style="flex:1;min-width:220px">' + qTopicBadges + '</div>' +
      '<button class="btn sm" data-nav="quiz">前往题库练习</button>' +
      '</div></section>';

    html += '<div class="grid g3 mt14">';
    html += Q.card('导出与导入', '<p class="theory-note">一键导出当前实验记录与随堂测验成绩，便于保存复盘或跨设备恢复。</p>' +
      '<div class="btn-row mt6">' +
      '<button class="btn" data-act="export-all">导出全部记录（JSON）</button>' +
      '<button class="btn" data-act="download-report">导出报告（HTML）</button>' +
      '<button class="btn" data-act="import-all">导入记录（JSON）</button>' +
      '</div>');
    html += Q.card('存储状态', '<p class="theory-note">' +
      (store.ok ? '已启用本地持久存储，刷新或重新打开页面数据仍在。'
        : '<b>本地存储不可用</b>，当前仅保存在内存中。') +
      '</p><div class="btn-row mt6"><button class="btn" data-act="clear-all">清空全部记录</button></div>');
    html += Q.card('发布门禁摘要', (function () {
      var ev = Q.qaNormEvidence(WB.evidence);
      var risk = Q.qaComputeRisk(ev, Q.QA_DEFAULT_PARAMS);
      var g = Q.qaGate(ev, Q.QA_DEFAULT_PARAMS, risk);
      var demoUsed = Object.keys(WB.evidence).some(function (k) { return WB.evidence[k].demo; });
      return '<div class="row wrap mb6">' +
        (g.passed ? Q.badge('pass', '按默认门禁参数：可发布') : Q.badge('fail', '按默认门禁参数：不可发布')) +
        (demoUsed ? Q.badge('warn', '含演示数据') : '') + '</div>' +
        '<p class="tiny muted">风险指数 R = ' + risk.risk + '（阈值 ' + Q.QA_DEFAULT_PARAMS.riskThreshold + '）；' +
        '证据 ' + risk.evidencePresent + '/7；加权覆盖率 ' + risk.coverage + '%。' +
        (risk.evidencePresent === 0 ? '<br>尚未记录实验证据，先完成实验再看放行结论。' : '') +
        '</p>' +
        '<button class="btn sm mt6" data-nav="exp/m8">前往 M8 调整门禁</button>';
    })());
    html += '</div>';

    host.innerHTML = html;
    var fileInput = document.getElementById('import-file');
    if (fileInput) fileInput.addEventListener('change', onImportFile);
  }

  function exportAll() {
    var payload = {
      schema: WB.schema, kind: 'full-record', exportedAt: new Date().toISOString(),
      app: { name: '青蓝 QA Lab', version: WB.version },
      evidence: WB.evidence, state: WB.state, quiz: Q.clone(quizState().answers)
    };
    download('qlab-full-record.json', JSON.stringify(payload, jsonSafe, 2), 'application/json');
  }

  function importAll() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.id = 'import-file';
    document.body.appendChild(input);
    input.addEventListener('change', onImportFile);
    input.click();
  }

  function onImportFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('文件过大（>2MB），已拒绝导入', 'fail'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('JSON 解析失败，文件可能已损坏', 'fail'); return; }
      var err = validateImport(data);
      if (err) { toast('导入被拒绝：' + err, 'fail', 5000); return; }
      WB.evidence = sanitizeEvidence(data.evidence);
      WB.state = sanitizeState(data.state);
      quizState().answers = data.quiz ? sanitizeQuiz(data.quiz) : {};
      persist();
      render();
      toast('导入成功：' + Object.keys(WB.evidence).length + ' 条证据，' + Object.keys(WB.state).length + ' 个实验状态');
    };
    reader.onerror = function () { toast('文件读取失败', 'fail'); };
    reader.readAsText(f);
    if (ev.target) ev.target.value = '';
  }

  function validateImport(d) {
    if (!d || typeof d !== 'object') return '顶层不是对象';
    if (d.schema !== WB.schema) return 'schema 不匹配（期望 ' + WB.schema + '）';
    if (d.evidence && typeof d.evidence !== 'object') return 'evidence 不是对象';
    if (d.state && typeof d.state !== 'object') return 'state 不是对象';
    if (d.quiz !== undefined && (!d.quiz || typeof d.quiz !== 'object' || Array.isArray(d.quiz))) return 'quiz 不是对象';
    var ids = WB.exps.map(function (e) { return e.id; });
    var keys = Object.keys(d.evidence || {});
    for (var i = 0; i < keys.length; i++) {
      if (ids.indexOf(keys[i]) < 0) return '未知实验标识：' + keys[i];
      var e = d.evidence[keys[i]];
      if (!e || typeof e !== 'object') return '证据项格式错误：' + keys[i];
      if (['pass', 'warn', 'fail'].indexOf(e.status) < 0) return '证据状态非法：' + keys[i];
    }
    var sk = Object.keys(d.state || {});
    for (var j = 0; j < sk.length; j++) {
      if (ids.indexOf(sk[j]) < 0) return '未知实验状态：' + sk[j];
      if (!d.state[sk[j]] || typeof d.state[sk[j]] !== 'object') return '状态格式错误：' + sk[j];
    }
    return null;
  }

  function sanitizeQuiz(raw) {
    var out = {};
    var byId = {};
    Q.QUIZ_QUESTIONS.forEach(function (q) { byId[q.id] = q; });
    Object.keys(raw || {}).forEach(function (k) {
      var q = byId[k];
      if (!q) return;
      var v = raw[k];
      if (q.type === 'multi') {
        if (Array.isArray(v)) {
          var clean = v.filter(function (x) { return Number.isInteger(x) && x >= 0 && x < q.options.length; });
          if (clean.length) out[k] = clean;
        }
      } else if (q.type === 'fill') {
        if (typeof v === 'string' && v.trim()) out[k] = clip(v.trim(), 80);
      } else {
        if (Number.isInteger(v) && v >= 0 && v < q.options.length) out[k] = v;
      }
    });
    return out;
  }

  function clip(s, n) { return typeof s === 'string' ? s.slice(0, n) : s; }

  function sanitizeEvidence(ev) {
    var out = {};
    Object.keys(ev || {}).forEach(function (k) {
      var e = ev[k];
      out[k] = {
        status: e.status, coverage: typeof e.coverage === 'number' && isFinite(e.coverage) ? e.coverage : null,
        label: clip(String(e.label || ''), 40), note: clip(String(e.note || ''), 200),
        defects: Array.isArray(e.defects) ? e.defects.slice(0, 20).map(function (x) { return clip(String(x), 40); }) : [],
        at: clip(String(e.at || ''), 40), exp: k, no: e.no, title: clip(String(e.title || ''), 40),
        demo: !!e.demo
      };
    });
    return out;
  }

  function sanitizeState(st) {
    var out = {};
    Object.keys(st || {}).forEach(function (k) {
      var def = WB.byId[k];
      if (!def) return;
      var src = st[k] || {};
      var dst = Q.clone(def.defaults || {});
      Object.keys(dst).forEach(function (f) {
        if (src[f] === undefined) return;
        var t = typeof dst[f];
        if (t === 'number') { if (typeof src[f] === 'number' && isFinite(src[f])) dst[f] = src[f]; }
        else if (t === 'boolean') { dst[f] = !!src[f]; }
        else if (Array.isArray(dst[f])) { if (Array.isArray(src[f])) dst[f] = src[f].slice(0, 40).map(function (x) { return clip(String(x), 40); }); }
        else dst[f] = clip(String(src[f]), 400);
      });
      out[k] = dst;
    });
    return out;
  }

  function downloadReport() {
    var rows = WB.exps.map(function (d) {
      var ev = WB.evidence[d.id];
      return '<tr><td>M' + d.no + ' ' + E(d.title) + '</td><td>' + (ev ? (ev.status === 'pass' ? '达成' : ev.status === 'warn' ? '待改进' : '未通过') : '未记录') +
        '</td><td>' + (ev && ev.coverage != null ? Q.num(ev.coverage, 1) + '%' : '—') + '</td><td>' + E(ev ? ev.note : '—') + '</td><td>' + E(ev ? ev.at : '—') + '</td></tr>';
    }).join('');
    var ev = Q.qaNormEvidence(WB.evidence);
    var risk = Q.qaComputeRisk(ev, Q.QA_DEFAULT_PARAMS);
    var g = Q.qaGate(ev, Q.QA_DEFAULT_PARAMS, risk);
    var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>青蓝 QA Lab 实验报告</title><style>' +
      'body{font-family:"Microsoft YaHei",system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#14181d;line-height:1.7;font-size:13px}' +
      'h1{font-size:20px}h2{font-size:15px;margin-top:26px;border-bottom:1px solid #e0e5e9;padding-bottom:4px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}th,td{border:1px solid #e0e5e9;padding:5px 8px;text-align:left}' +
      'th{background:#fafbfb}.muted{color:#727a86;font-size:11.5px}.tag{display:inline-block;padding:1px 6px;border-radius:3px;background:#e4efee;color:#08423f}' +
      '</style></head><body>';
    html += '<h1>「青蓝」软件质量保证与测试实验工作台 · 实验报告</h1>';
    html += '<p class="muted">生成时间：' + E(new Date().toLocaleString('zh-CN', { hour12: false })) + '　版本 ' + E(WB.version) + '</p>';
    html += '<p class="muted">本报告汇总当前已记录的实验结论、发布质量门禁评估与随堂测验成绩。</p>';
    html += '<h2>一、各实验结论</h2><table><thead><tr><th>实验</th><th>结论</th><th>主指标</th><th>说明</th><th>记录时间</th></tr></thead><tbody>' + rows + '</tbody></table>';
    html += '<h2>二、发布质量门禁（默认参数）</h2>';
    html += '<p>结论：<b>' + (g.passed ? '可发布' : '不可发布') + '</b>　风险指数 R = ' + risk.risk + '（阈值 ' + Q.QA_DEFAULT_PARAMS.riskThreshold + '）' +
      '　证据 ' + risk.evidencePresent + '/7　加权覆盖率 ' + risk.coverage + '%　回归通过率 ' + (risk.passRate === null ? '—' : risk.passRate + '%') + '</p>';
    html += '<table><thead><tr><th>门禁检查项</th><th>结论</th><th>证据来源</th><th>详情</th></tr></thead><tbody>' +
      g.checks.map(function (c) {
        return '<tr><td>' + E(c.label) + '</td><td>' + (c.ok ? '通过' : '未通过') + '</td><td>' + E(c.source) + '</td><td>' + E(c.detail) + '</td></tr>';
      }).join('') + '</tbody></table>';
    html += '<h2>三、风险指数构成</h2><table><thead><tr><th>维度</th><th>归一化值</th><th>权重</th><th>贡献（0–100）</th></tr></thead><tbody>' +
      risk.parts.map(function (p) {
        return '<tr><td>' + E(p.label) + '</td><td>' + Q.num(p.value, 3) + '</td><td>' + Q.num(p.weight, 2) + '</td><td>' + Q.num(p.contribution, 1) + '</td></tr>';
      }).join('') + '</tbody></table>';
    html += '<h2>四、随堂测验掌握度</h2>';
    var qAll = Q.quizStats(quizState().answers);
    html += '<p>已作答 <b>' + qAll.answered + '/' + qAll.total + '</b> 题 · 答对 ' + qAll.correct + ' 题 · 正确率 <b>' +
      (qAll.accuracy == null ? '—' : qAll.accuracy + '%') + '</b></p>';
    html += '</body></html>';
    download('qlab-report.html', html, 'text/html;charset=utf-8');
  }

  /* --------------------------------------------------------- 课程地图页 */
  function renderAboutPage(host) {
    var rows = WB.exps.map(function (d) {
      return { cells: [{ html: '<b>M' + d.no + '</b>' }, { v: d.title }, { v: d.chapter }, { v: d.knowledge }] };
    });
    var html = '<div class="page-h"><div><h1>课程地图</h1>' +
      '<div class="sub">《软件质量保证与测试：原理、技术与实践》全书章节与实验体系总览。</div></div></div>';

    html += Q.card('平台体量与构成',
      '<p class="theory-note">围绕统一业务场景「青蓝人才服务平台」串联全书核心质量工程方法，将理论公式转化为可实时调参、可核对分母、可当场自测的交互实验。</p>' +
      '<div class="grid g4 mt10">' +
      '<div class="metric"><div class="m-l">交互实验模块</div><div class="m-v">' + WB.exps.length + '</div></div>' +
      '<div class="metric"><div class="m-l">多题型随堂试题</div><div class="m-v">' + Q.QUIZ_QUESTIONS.length + '</div></div>' +
      '<div class="metric"><div class="m-l">可调实验参数</div><div class="m-v">' + WB.exps.reduce(function (a, d) { return a + d.params.length; }, 0) + '</div></div>' +
      '<div class="metric"><div class="m-l">知识图谱节点 / 边</div><div class="m-v">' + Q.KG_NODES.length + ' / ' + Q.KG_EDGES.length + '</div></div>' +
      '</div>');

    html += Q.card('教材章节与实验能力映射',
      Q.table(['编号', '实验主题', '对应教材章节', '核心能力目标'], rows),
      { cls: 'mt14' });

    html += Q.card('双主线实训体系架构',
      '<div class="grid g2">' +
      '<div class="spec-col"><div class="spec-k">报名计费线（M2 · M3 · M6 · M7）</div>' +
      '<p class="theory-note mt6">共用同一套企业培训计费业务规则（基础单价 120 元 / 持证 90 元、团体阶梯折扣与复训 7 折互斥、优惠券 0–500 元且应付封底为 0），可对照观察等价类、边界值、代码控制流覆盖与回归断言如何从不同视角检验同一段核心逻辑。</p></div>' +
      '<div class="spec-col"><div class="spec-k">资格审批与质量门禁线（M1 · M4 · M5 · M8）</div>' +
      '<p class="theory-note mt6">贯通静态代码审查、4 条件 16 组合资格决策表、11 状态全生命周期状态机与持续集成门禁；各模块实操结论最终沉淀为质量证据，共同驱动 M8 量化风险评估与发布放行判定。</p></div>' +
      '</div>',
      { cls: 'mt14' });

    host.innerHTML = html;
  }

  /* --------------------------------------------------------- 首次引导 */
  var guideStep = 0;
  var GUIDE = [
    {
      t: '欢迎使用青蓝 QA Lab',
      b: '<p>8 个交互实验 + ' + Q.QUIZ_QUESTIONS.length + ' 道单选、多选与填空自测题，带你走完「审查 → 设计 → 覆盖 → 门禁」全流程。</p>' +
        '<p class="mt6">左侧调节参数，右侧图表、反例诊断与证据状态同步刷新。</p>'
    },
    {
      t: '做完实验，马上随堂验证',
      b: '<p>每个实验顶部支持一键切换 <b>交互实验 / 随堂自测 / 原理与误区</b>。</p>' +
        '<p class="mt6">推荐从 <b>M2 等价类</b> 或 <b>M1 静态审查</b> 起步，记录的实验结论会自动汇总到 M8 质量门禁。</p>'
    },
    {
      t: '灵活收纳与成果导出',
      b: '<p>页面细节表格采用卡片收纳设计，点开即看；顶部支持随时导出 JSON 记录与排版完整的 HTML 实训报告。</p>'
    }
  ];

  function openGuide(step, forced) {
    guideStep = step || 0;
    var old = document.getElementById('guide-overlay');
    if (old) old.remove();
    var g = GUIDE[guideStep];
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'guide-overlay';
    ov.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">' +
      '<div class="modal-h"><h2 id="guide-title">' + E(g.t) + '</h2></div>' +
      '<div class="modal-b"><div class="guide-steps">' +
      GUIDE.map(function (_, i) { return '<i class="' + (i <= guideStep ? 'on' : '') + '"></i>'; }).join('') +
      '</div>' + g.b + '</div>' +
      '<div class="modal-f">' +
      (forced ? '<button class="btn ghost" data-guide="skip">跳过</button>' : '') +
      (guideStep > 0 ? '<button class="btn" data-guide="prev">上一步</button>' : '') +
      '<button class="btn primary" data-guide="' + (guideStep === GUIDE.length - 1 ? 'done' : 'next') + '">' +
      (guideStep === GUIDE.length - 1 ? '开始使用' : '下一步') + '</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-guide]');
      if (!b) { if (ev.target === ov) closeGuide(); return; }
      var a = b.getAttribute('data-guide');
      if (a === 'next') openGuide(guideStep + 1, forced);
      else if (a === 'prev') openGuide(guideStep - 1, forced);
      else closeGuide();
    });
    var first = ov.querySelector('button');
    if (first) first.focus();
  }
  function closeGuide() {
    var ov = document.getElementById('guide-overlay');
    if (ov) ov.remove();
    try { window.localStorage.setItem('qinglan.guide.seen', '1'); } catch (e) {}
  }

  /* --------------------------------------------------------------- 启动 */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;

    var root = document.getElementById('app');
    root.className = 'app';
    root.innerHTML =
      '<aside class="rail">' +
      '<div class="rail-brand"><div class="mark"><span class="dot"></span>青蓝 QA Lab</div>' +
      '<div class="sub">软件质量保证与测试</div></div>' +
      '<nav class="rail-nav" id="rail-nav"></nav>' +
      '<div class="rail-foot">单文件 · 离线可用 · v' + WB.version + '</div>' +
      '</aside>' +
      '<div class="main">' +
      '<header class="topbar"><div class="crumb" id="crumb"></div><div class="topbar-spacer"></div>' +
      '<div class="row" id="topbar-actions" style="gap:6px"></div></header>' +
      '<div class="view" id="view"></div>' +
      '</div>';

    document.getElementById('topbar-actions').innerHTML =
      '<span class="topbar-stat" id="stat"></span>' +
      '<button class="icon-btn" data-act="import-all" title="导入 JSON 记录">导入</button>' +
      '<button class="icon-btn" data-act="export-all" title="导出全部记录">导出</button>' +
      '<button class="icon-btn" data-act="help" title="重新查看引导">引导</button>';

    loadPersisted();
    window.addEventListener('hashchange', render);
    render();

    var seen = false;
    try { seen = window.localStorage.getItem('qinglan.guide.seen') === '1'; } catch (e) { seen = false; }
    if (!seen) openGuide(0, true);

    if (!store.ok) showStoreWarn();
  }

  WB.act = handleAction;
  WB.render = render;
  WB.storeOk = store.ok;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();

/* ============================================================================
 * graph.js — 知识图谱 SVG 渲染（手写，无第三方库）
 * 节点可点击/可键盘聚焦；悬停高亮相邻节点与边；支持外部指定当前节点。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QT = root.QT || {}; Object.assign(root.QT, factory()); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 920, H = 556;
  var NW = 130, NH = 38;

  function render(host, opts) {
    var nodes = opts.nodes || [];
    var edges = opts.edges || [];
    var types = opts.edgeTypes || {};
    var active = opts.active || null;
    var onSelect = opts.onSelect || function () {};

    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    var svg = [];
    svg.push('<svg class="graph-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="软件质量保证与测试闯关路线图，共 ' + nodes.length + ' 个节点、' + edges.length + ' 条连线">');
    svg.push('<defs>');
    svg.push('<filter id="gCardSh" x="-10%" y="-15%" width="120%" height="145%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f2744" flood-opacity="0.08"/></filter>');
    Object.keys(types).forEach(function (k) {
      var t = types[k];
      svg.push('<marker id="arw-' + k + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M 0 1 L 9 5 L 0 9 z" fill="' + t.color + '"/></marker>');
    });
    svg.push('</defs>');

    // 柔和分区背景带（色彩明快，顶边胶囊与节点留足安全距离）
    var bands = [
      { y: 42, h: 68, label: '01 基础与静态抓虫', fill: '#ecfdf5', stroke: '#a7f3d0', pill: '#0d9488' },
      { y: 162, h: 68, label: '02 黑盒设计闯关', fill: '#eff6ff', stroke: '#bfdbfe', pill: '#0284c7' },
      { y: 302, h: 68, label: '03 白盒电路与流水线', fill: '#f0f9ff', stroke: '#bae6fd', pill: '#0369a1' },
      { y: 444, h: 68, label: '04 发布决策与门禁', fill: '#fffbeb', stroke: '#fde68a', pill: '#d97706' }
    ];
    bands.forEach(function (b) {
      var pw = b.label.length * 10.5 + 22;
      svg.push('<rect x="8" y="' + b.y + '" width="' + (W - 16) + '" height="' + b.h + '" rx="16" fill="' + b.fill + '" stroke="' + b.stroke + '" stroke-width="1.4"/>');
      svg.push('<rect x="18" y="' + (b.y - 12) + '" width="' + pw + '" height="22" rx="11" fill="' + b.pill + '"/>');
      svg.push('<text x="29" y="' + (b.y + 3) + '" font-size="11" font-weight="700" fill="#ffffff" font-family="sans-serif" letter-spacing="0.2">' + b.label + '</text>');
    });

    // 连线
    edges.forEach(function (e) {
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return;
      var t = types[e.type];
      var cls = 'gedge' + (e.type === 'req' ? ' gedge-req' : '');
      var hw = NW / 2, hh = NH / 2;
      var dx = b.x - a.x, dy = b.y - a.y;
      var ax, ay, bx, by, d;
      if (Math.abs(dy) < 10) {
        var sx = dx >= 0 ? 1 : -1;
        ax = a.x + sx * hw; ay = a.y;
        bx = b.x - sx * hw; by = b.y;
        d = 'M ' + ax + ' ' + ay + ' L ' + bx + ' ' + by;
      } else if (e.type === 'evid') {
        ax = a.x; ay = a.y + hh;
        bx = b.x; by = b.y - hh;
        d = 'M ' + ax + ' ' + ay + ' C ' + ax + ' ' + (ay + 56) + ', ' + bx + ' ' + (by - 56) + ', ' + bx + ' ' + by;
      } else {
        var tt = Math.min(hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dy) || 1e-6));
        ax = a.x + dx * tt; ay = a.y + dy * tt;
        bx = b.x - dx * tt; by = b.y - dy * tt;
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        d = 'M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' Q ' + mx.toFixed(1) + ' ' + (my - 22).toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
      }
      var marker = t.arrow ? ' marker-end="url(#arw-' + e.type + ')"' : '';
      svg.push('<path class="' + cls + '" data-from="' + e.from + '" data-to="' + e.to + '" d="' + d +
        '" stroke="' + t.color + '" stroke-dasharray="' + (t.dash === '0' ? 'none' : t.dash) +
        '" opacity="' + (e.type === 'evid' ? '.48' : '.76') + '"' + marker + '/>');
    });

    // 卡通卡片节点
    var pillColors = { m1: '#0d9488', m2: '#0284c7', m3: '#0284c7', m4: '#0284c7', m5: '#2563eb', m6: '#0369a1', m7: '#7c3aed', m8: '#d97706' };
    nodes.forEach(function (n) {
      var isRef = n.kind === 'ref';
      var x = n.x - NW / 2, y = n.y - NH / 2;
      var pc = pillColors[n.id] || '#0284c7';
      svg.push('<g class="gnode' + (active === n.id ? ' on' : '') + (isRef ? ' gnode-ref' : '') + '" data-id="' + n.id + '" tabindex="0" role="button" aria-label="' + n.label + '，' + n.chapter + '">');
      svg.push('<rect class="gn-box" x="' + x + '" y="' + y + '" width="' + NW + '" height="' + NH + '" rx="13" filter="url(#gCardSh)"' +
        (isRef ? ' stroke-dasharray="5 3" fill="#faf5ff" stroke="#d8b4fe"' : '') + '/>');
      if (!isRef) {
        svg.push('<rect class="gn-pill" x="' + (x + 7) + '" y="' + (y + 8) + '" width="26" height="22" rx="8" fill="' + pc + '"/>');
        svg.push('<text class="gn-no" x="' + (x + 20) + '" y="' + (y + 22.5) + '" text-anchor="middle" fill="#ffffff">M' + n.no + '</text>');
        svg.push('<text class="gn-title" x="' + (x + 39) + '" y="' + (y + 23) + '">' + trim(n.short.replace(/^M\d+\s/, ''), 7) + '</text>');
      } else {
        svg.push('<rect x="' + (x + 6) + '" y="' + (y + 9) + '" width="30" height="20" rx="7" fill="#ede9fe"/>');
        svg.push('<text x="' + (x + 21) + '" y="' + (y + 22.5) + '" text-anchor="middle" fill="#7c3aed" font-size="10" font-weight="700">拓展</text>');
        svg.push('<text class="gn-title" x="' + (x + 41) + '" y="' + (y + 23) + '">' + trim(n.short, 7) + '</text>');
      }
      svg.push('</g>');
    });

    svg.push('</svg>');
    host.innerHTML = svg.join('');

    // 交互
    var g = host.querySelector('svg');
    function focusNode(id) {
      Array.prototype.forEach.call(g.querySelectorAll('.gnode'), function (el) {
        var related = el.getAttribute('data-id') === id;
        var neighbor = edges.some(function (e) {
          return (e.from === id && e.to === el.getAttribute('data-id')) || (e.to === id && e.from === el.getAttribute('data-id'));
        });
        el.classList.toggle('dim', !(related || neighbor));
      });
      Array.prototype.forEach.call(g.querySelectorAll('.gedge'), function (el) {
        var hot = el.getAttribute('data-from') === id || el.getAttribute('data-to') === id;
        el.classList.toggle('hot', hot);
        el.classList.toggle('dim', !hot);
      });
    }
    function clearFocus() {
      Array.prototype.forEach.call(g.querySelectorAll('.gnode'), function (el) { el.classList.remove('dim'); });
      Array.prototype.forEach.call(g.querySelectorAll('.gedge'), function (el) { el.classList.remove('hot', 'dim'); });
    }

    Array.prototype.forEach.call(g.querySelectorAll('.gnode'), function (el) {
      var id = el.getAttribute('data-id');
      el.addEventListener('mouseenter', function () { focusNode(id); });
      el.addEventListener('mouseleave', clearFocus);
      el.addEventListener('focus', function () { focusNode(id); });
      el.addEventListener('blur', clearFocus);
      el.addEventListener('click', function () { onSelect(id); });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(id); }
      });
    });
  }

  function trim(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  return { kgRender: render, KG_W: W, KG_H: H };
});

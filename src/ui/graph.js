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
    svg.push('<svg class="graph-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="软件质量保证与测试知识点关系图，共 ' + nodes.length + ' 个节点、' + edges.length + ' 条关联边">');
    svg.push('<defs>');
    Object.keys(types).forEach(function (k) {
      var t = types[k];
      svg.push('<marker id="arw-' + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + t.color + '"/></marker>');
    });
    svg.push('</defs>');

    // 分层背景带（标签置左上角外缘胶囊，彻底避开最左侧节点）
    var bands = [
      { y: 42, h: 68, label: '01 基础与静态分析', tint: 'rgba(13, 148, 136, 0.04)' },
      { y: 162, h: 68, label: '02 黑盒测试设计', tint: 'rgba(0, 102, 204, 0.04)' },
      { y: 302, h: 68, label: '03 结构与回归', tint: 'rgba(2, 132, 199, 0.04)' },
      { y: 444, h: 68, label: '04 质量决策', tint: 'rgba(124, 58, 237, 0.04)' }
    ];
    bands.forEach(function (b) {
      var pw = b.label.length * 10 + 18;
      svg.push('<rect x="8" y="' + b.y + '" width="' + (W - 16) + '" height="' + b.h + '" rx="12" fill="' + b.tint + '" stroke="#e5e7eb"/>');
      svg.push('<rect x="18" y="' + (b.y - 11) + '" width="' + pw + '" height="20" rx="10" fill="#ffffff" stroke="#e5e7eb"/>');
      svg.push('<text x="27" y="' + (b.y + 2.5) + '" font-size="10" font-weight="600" fill="#64748b" font-family="sans-serif" letter-spacing="0.3">' + b.label + '</text>');
    });

    // 边
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
        '" opacity="' + (e.type === 'evid' ? '.38' : '.68') + '"' + marker + '/>');
    });

    // 节点
    nodes.forEach(function (n) {
      var isRef = n.kind === 'ref';
      var x = n.x - NW / 2, y = n.y - NH / 2;
      svg.push('<g class="gnode' + (active === n.id ? ' on' : '') + (isRef ? ' gnode-ref' : '') + '" data-id="' + n.id + '" tabindex="0" role="button" aria-label="' + n.label + '，' + n.chapter + '">');
      svg.push('<rect class="gn-box" x="' + x + '" y="' + y + '" width="' + NW + '" height="' + NH + '" rx="10"' +
        (isRef ? ' stroke-dasharray="4 3" fill="#fafafa"' : '') + '/>');
      if (!isRef) {
        svg.push('<rect class="gn-pill" x="' + (x + 7) + '" y="' + (y + 9) + '" width="24" height="20" rx="6"/>');
        svg.push('<text class="gn-no" x="' + (x + 19) + '" y="' + (y + 22.5) + '" text-anchor="middle">M' + n.no + '</text>');
        svg.push('<text class="gn-title" x="' + (x + 37) + '" y="' + (y + 23) + '">' + n.short.replace(/^M\d+\s/, '') + '</text>');
      } else {
        svg.push('<text x="' + (x + 11) + '" y="' + (y + 23) + '" fill="#7c3aed" font-size="10" font-weight="600">拓展</text>');
        svg.push('<text class="gn-title" x="' + (x + 39) + '" y="' + (y + 23) + '">' + n.short + '</text>');
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

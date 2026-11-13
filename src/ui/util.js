/* ============================================================================
 * util.js — 渲染与格式化工具（无第三方依赖）
 * 所有用户输入在拼接进 HTML 前必须经过 esc()。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QT = root.QT || {}; Object.assign(root.QT, factory()); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(v) { return esc(v); }

  function num(v, digits) {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '—';
    var d = digits == null ? 0 : digits;
    return Number(v).toFixed(d);
  }
  function pctText(v, digits) {
    if (v === null || v === undefined) return '—';
    return num(v, digits == null ? 1 : digits) + '%';
  }

  /* 徽标：同时用文字与图形编码状态，不只依赖颜色 */
  function badge(kind, text) {
    var map = {
      pass: { cls: 'b-pass', glyph: '✓' },
      fail: { cls: 'b-fail', glyph: '✕' },
      warn: { cls: 'b-warn', glyph: '!' },
      info: { cls: 'b-info', glyph: 'i' },
      mute: { cls: 'b-mute', glyph: '·' }
    };
    var m = map[kind] || map.mute;
    return '<span class="badge ' + m.cls + '"><i aria-hidden="true">' + m.glyph + '</i>' +
      '<span>' + esc(text) + '</span></span>';
  }

  function card(title, bodyHtml, opts) {
    opts = opts || {};
    return '<section class="card' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      (title ? '<h3 class="card-h">' + esc(title) + (opts.hint ? '<span class="card-hint">' + esc(opts.hint) + '</span>' : '') + '</h3>' : '') +
      '<div class="card-b">' + bodyHtml + '</div></section>';
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + (r[2] ? r[1] : esc(r[1])) + '</dd>';
    }).join('') + '</dl>';
  }

  function table(headers, rows, opts) {
    opts = opts || {};
    return '<div class="tbl-wrap"><table class="tbl' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<thead><tr>' + headers.map(function (h) {
        return '<th' + (h.w ? ' style="width:' + h.w + '"' : '') + (h.align ? ' class="ta-' + h.align + '"' : '') + '>' +
          (typeof h === 'string' ? esc(h) : h.html || esc(h.label)) + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' +
          (r.cells || r).map(function (c) {
            if (c && typeof c === 'object') return '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.html || esc(c.v)) + '</td>';
            return '<td>' + esc(c) + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function meter(value, opts) {
    opts = opts || {};
    var v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
    var tone = opts.tone || (v >= (opts.good || 99.5) ? 'ok' : v >= (opts.mid || 60) ? 'mid' : 'low');
    return '<div class="meter" role="img" aria-label="' + attr((opts.label || '') + ' ' + num(value, 1) + '%') + '">' +
      '<div class="meter-track"><div class="meter-fill tone-' + tone + '" style="width:' + v.toFixed(1) + '%"></div></div>' +
      '<div class="meter-val">' + (value === null ? '—' : num(value, 1) + '%') + '</div></div>';
  }

  function empty(msg) {
    return '<div class="empty"><span class="empty-glyph" aria-hidden="true">◦</span><p>' + esc(msg) + '</p></div>';
  }

  function legend(items) {
    return '<ul class="legend">' + items.map(function (i) {
      return '<li><span class="lg-swatch" style="background:' + i.color + (i.dash ? ';background-image:repeating-linear-gradient(90deg,transparent 0 4px,' + i.color + ' 4px 7px)' : '') + '"></span>' + esc(i.label) + '</li>';
    }).join('') + '</ul>';
  }

  /* --------------------------------------------------------------- 折线图 */
  function lineChart(o) {
    var w = o.w || 340, h = o.h || 120;
    var pad = { l: 30, r: 8, t: 8, b: 20 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var series = o.series || [];
    var n = o.n || (series[0] ? series[0].values.length : 0);
    var yMax = o.yMax;
    if (yMax == null) {
      yMax = 0;
      series.forEach(function (s) { s.values.forEach(function (v) { yMax = Math.max(yMax, v); }); });
      yMax = yMax || 1;
    }
    var x = function (i) { return pad.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); };
    var y = function (v) { return pad.t + ih - (ih * Math.min(v, yMax)) / yMax; };
    var out = ['<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img" aria-label="' + attr(o.aria || '折线图') + '">'];
    var ticks = o.yTicks || 4;
    for (var t = 0; t <= ticks; t++) {
      var vv = (yMax * t) / ticks;
      var yy = y(vv);
      out.push('<line x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (w - pad.r) + '" y2="' + yy.toFixed(1) + '" stroke="#eef1f3"/>');
      out.push('<text x="' + (pad.l - 4) + '" y="' + (yy + 3).toFixed(1) + '" font-size="8.5" fill="#9aa2ad" text-anchor="end" font-family="sans-serif">' +
        (o.fmtY ? o.fmtY(vv) : Math.round(vv)) + '</text>');
    }
    (o.xLabels || []).forEach(function (lb, i) {
      if (o.xEvery && i % o.xEvery !== 0) return;
      out.push('<text x="' + x(i).toFixed(1) + '" y="' + (h - 6) + '" font-size="8.5" fill="#9aa2ad" text-anchor="middle" font-family="sans-serif">' + esc(lb) + '</text>');
    });
    series.forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      out.push('<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
        (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>');
      s.values.forEach(function (v, i) {
        out.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.5" fill="#fff" stroke="' + s.color + '" stroke-width="1.6"/>');
      });
    });
    out.push('</svg>');
    return '<div class="chart-box">' + out.join('') + '</div>' +
      (o.legend ? legend(series.map(function (s) { return { label: s.name, color: s.color }; })) : '');
  }

  /* 结论块：标题一行 + 若干 [标签, 内容] 行 */
  function concl(kind, title, rows) {
    var body = rows.filter(Boolean).map(function (r) {
      return '<p><b>' + r[0] + '</b>' + r[1] + '</p>';
    }).join('');
    return '<div class="concl ' + kind + '"><div class="cc-h">' + title + '</div><div class="cc-b">' + body + '</div></div>';
  }

  /* 水平条形（用于比例构成） */
  function hbars(items, opts) {
    opts = opts || {};
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return '<div class="hbars">' + items.map(function (i) {
      var w = max ? Math.max(0, Math.min(100, (i.value / max) * 100)) : 0;
      return '<div class="hbar"><span class="hb-l">' + esc(i.label) + '</span>' +
        '<span class="hb-track"><span class="hb-fill" style="width:' + w.toFixed(1) + '%;background:' + (i.color || '#0d9488') + '"></span></span>' +
        '<span class="hb-v">' + esc(i.text != null ? i.text : i.value) + '</span></div>';
    }).join('') + '</div>';
  }

  /* 环形进度指示（用于概览与随堂自测统计） */
  function ring(pct, opts) {
    opts = opts || {};
    var size = opts.size || 56;
    var stroke = opts.stroke || 5.5;
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    var off = c * (1 - v / 100);
    var color = opts.color || '#0066cc';
    var text = opts.text != null ? opts.text : (pct == null ? '—' : Math.round(v) + '%');
    return '<div class="q-ring" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="' + attr((opts.label || '进度') + ' ' + text) + '">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
      '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r.toFixed(1) + '" fill="none" stroke="rgba(15,23,42,0.08)" stroke-width="' + stroke + '"/>' +
      '<circle class="q-ring-fg" cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + r.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')"/>' +
      '</svg><span class="q-ring-txt">' + esc(text) + '</span></div>';
  }

  return {
    esc: esc, attr: attr, num: num, pctText: pctText,
    badge: badge, card: card, kv: kv, table: table, meter: meter, empty: empty, legend: legend,
    lineChart: lineChart, hbars: hbars, ring: ring, concl: concl
  };
});

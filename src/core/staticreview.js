/* ============================================================================
 * staticreview.js — 静态测试与代码审查（M1）
 * 说明：
 *   · CODE 中的代码清单是**审查对象文本**，不会被浏览器执行（无 eval / new Function）。
 *   · BASELINE 是人工标注的缺陷基线（相当于资深评审者给出的参考答案），
 *     定位方式为“按行内容匹配”，而不是写死行号，避免清单调整后基线错位。
 *   · RULES 是 8 条内置检查规则，检出能力有限且会产生误报——这本身是教学点。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QT = root.QT || {};
    Object.assign(root.QT, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFECT_TYPES = [
    { key: 'validation', label: '输入校验缺失' },
    { key: 'magic', label: '硬编码 / 阈值未配置' },
    { key: 'precision', label: '取整或精度处理错误' },
    { key: 'rule', label: '业务规则实现偏差' },
    { key: 'exception', label: '异常处理不当' },
    { key: 'security', label: '敏感信息泄露' },
    { key: 'naming', label: '命名与可读性' },
    { key: 'duplicate', label: '重复代码' },
    { key: 'atomic', label: '缺少原子性 / 事务边界' }
  ];

  var CODE = {
    'v1.0': [
      '// bookingService.js — 报名名额与预约处理（v1.0 首版）',
      '// 本清单仅作静态审查对象，不参与运行。',
      'const MAX_SEATS = 20;',
      'const WAITLIST_LIMIT = 50;',
      '',
      'function bookSeat(order, seatPool) {',
      '  var s = seatPool.left;',
      '  var data = order.data;',
      '  var flag = false;',
      '',
      '  if (s > 0) {',
      '    seatPool.left = s - 1;',
      '    order.state = "BOOKED";',
      '    flag = true;',
      '  }',
      '',
      '  if (s === 0 && seatPool.waitlist.length < WAITLIST_LIMIT) {',
      '    seatPool.waitlist.push(order.id);',
      '    order.state = "WAITLIST";',
      '  }',
      '',
      '  if (seatPool.waitlist.length < WAITLIST_LIMIT) {',
      '    if (s === 0) {',
      '      seatPool.waitlist.push(order.id);',
      '      order.state = "WAITLIST";',
      '    }',
      '  }',
      '',
      '  notify(order.phone, flag ? "预约成功" : "已进入候补");',
      '  console.log("booked", order.phone, data.idCard);',
      '  return flag;',
      '}',
      '',
      'function cancelSeat(order, seatPool) {',
      '  try {',
      '    seatPool.left = seatPool.left + 1;',
      '    order.state = "CANCELLED";',
      '  } catch (e) {}',
      '  return true;',
      '}'
    ],
    'v1.1': [
      '// bookingService.js — 报名名额与预约处理（v1.1 修复部分评审意见）',
      '// 本清单仅作静态审查对象，不参与运行。',
      'const MAX_SEATS = 20;',
      'const WAITLIST_LIMIT = 50;',
      '',
      'function bookSeat(order, seatPool) {',
      '  var s = seatPool.left;',
      '  var data = order.data;',
      '  var flag = false;',
      '',
      '  if (s > 0) {',
      '    seatPool.left = s - 1;',
      '    order.state = "BOOKED";',
      '    flag = true;',
      '  }',
      '',
      '  if (s === 0 && seatPool.waitlist.length < WAITLIST_LIMIT) {',
      '    seatPool.waitlist.push(order.id);',
      '    order.state = "WAITLIST";',
      '  }',
      '',
      '  notify(order.phone, flag ? "预约成功" : "已进入候补");',
      '  console.log("booked", order.id);',
      '  return flag;',
      '}',
      '',
      'function cancelSeat(order, seatPool) {',
      '  if (!order || !seatPool) {',
      '    throw new Error("参数缺失");',
      '  }',
      '  seatPool.left = seatPool.left + 1;',
      '  order.state = "CANCELLED";',
      '  try {',
      '    audit.log("cancel", order.id);',
      '  } catch (e) {',
      '    console.warn("审计写入失败", e);',
      '  }',
      '  return true;',
      '}'
    ],
    'v1.2': [
      '// bookingService.js — 报名名额与预约处理（v1.2 候选）',
      '// 本清单仅作静态审查对象，不参与运行。',
      'const MAX_SEATS = 20;',
      'const WAITLIST_LIMIT = 50;',
      '',
      'function bookSeat(order, seatPool) {',
      '  var left = seatPool.left;',
      '  var booked = false;',
      '',
      '  if (!order || !seatPool) {',
      '    throw new Error("参数缺失");',
      '  }',
      '  if (left > 0) {',
      '    seatPool.left = left - 1;',
      '    order.state = "BOOKED";',
      '    booked = true;',
      '  } else if (seatPool.waitlist.length < WAITLIST_LIMIT) {',
      '    seatPool.waitlist.push(order.id);',
      '    order.state = "WAITLIST";',
      '  }',
      '',
      '  notify(order.phone, booked ? "预约成功" : "已进入候补");',
      '  return booked;',
      '}',
      '',
      'function cancelSeat(order, seatPool) {',
      '  if (!order || !seatPool) {',
      '    throw new Error("参数缺失");',
      '  }',
      '  seatPool.left = seatPool.left + 1;',
      '  order.state = "CANCELLED";',
      '  try {',
      '    audit.log("cancel", order.id);',
      '  } catch (e) {',
      '    console.warn("审计写入失败", e);',
      '  }',
      '  return true;',
      '}'
    ]
  };

  /* 基线：at 为 [行内容, 第几次出现] */
  var BASELINE_SPEC = {
    'v1.0': [
      { id: 'STATIC_D1', at: [['var s = seatPool.left;', 1]], type: 'validation', severity: 'major',
        title: '入参未校验：seatPool 或 order 为 undefined 时直接读取属性', desc: 's 可能为 undefined，后续 s > 0 判断为假，学员被静默判为“进入候补”。' },
      { id: 'STATIC_D2', at: [['const MAX_SEATS = 20;', 1], ['const WAITLIST_LIMIT = 50;', 1]], type: 'magic', severity: 'minor',
        title: '名额上限与候补上限硬编码在模块顶部', desc: '与需求文档中的配置项重复书写，改口径需改代码并重新发布。' },
      { id: 'STATIC_D3', at: [['console.log("booked", order.phone, data.idCard);', 1]], type: 'security', severity: 'trivial',
        title: '日志输出手机号与身份证号完整值', desc: '日志会被集中采集，构成个人信息泄露风险。' },
      { id: 'STATIC_D4', at: [['seatPool.waitlist.push(order.id);', 2]], type: 'duplicate', severity: 'major',
        title: '候补入队逻辑重复两处，第二处缺少 s === 0 前置条件', desc: '满员且已入队时，第二个代码块会再次 push 同一订单，造成重复候补。' },
      { id: 'STATIC_D5', at: [['} catch (e) {}', 1]], type: 'exception', severity: 'major',
        title: 'catch 块为空，取消失败被静默吞掉', desc: '异常被吞没后仍 return true，调用方误认为取消成功。' }
    ],
    'v1.1': [
      { id: 'STATIC_D1', at: [['var s = seatPool.left;', 1]], type: 'validation', severity: 'major',
        title: 'bookSeat 仍未做入参校验（评审意见只改了 cancelSeat）', desc: '同类问题只修一处，属于典型的“打补丁式修复”。' },
      { id: 'STATIC_D2', at: [['const MAX_SEATS = 20;', 1]], type: 'magic', severity: 'minor',
        title: '名额与候补上限仍未配置化', desc: '与 v1.0 相同，该项评审意见未闭环。' },
      { id: 'STATIC_D6', at: [['seatPool.left = seatPool.left + 1;', 1]], type: 'atomic', severity: 'major',
        title: '先回补名额再写审计，两步不在同一事务内', desc: 'audit.log 抛错时名额已回补，出现“名额已释放但无审计记录”，对账困难。' }
    ],
    'v1.2': [
      { id: 'STATIC_D2', at: [['const MAX_SEATS = 20;', 1]], type: 'magic', severity: 'minor',
        title: '名额与候补上限仍未配置化（三个版本均未闭环）', desc: '长期未处理的技术债。' },
      { id: 'STATIC_D6', at: [['seatPool.left = seatPool.left + 1;', 1]], type: 'atomic', severity: 'major',
        title: '先回补名额再写审计，两步不在同一事务内', desc: '与 v1.1 相同。' },
      { id: 'STATIC_D7', at: [['var left = seatPool.left;', 1]], type: 'validation', severity: 'minor',
        title: '校验顺序错误：先读取属性再校验参数', desc: '第 7 行已从可能为 undefined 的对象上取值，第 10 行才校验，异常路径可读性和定位性都变差。' }
    ]
  };

  function resolveLine(lines, needle, nth) {
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === needle) {
        count++;
        if (count === (nth || 1)) return i + 1;
      }
    }
    return -1;
  }

  var BASELINE = {};
  Object.keys(BASELINE_SPEC).forEach(function (v) {
    BASELINE[v] = BASELINE_SPEC[v].map(function (d) {
      var lines = CODE[v];
      var resolved = d.at.map(function (a) { return resolveLine(lines, a[0], a[1]); });
      return {
        id: d.id, type: d.type, severity: d.severity, title: d.title, desc: d.desc,
        lines: resolved.filter(function (n) { return n > 0; }),
        unresolved: resolved.filter(function (n) { return n <= 0; }).length
      };
    });
  });

  var SCOPES = [
    { key: 'all', label: '全部代码', ranges: null },
    { key: 'core', label: '仅核心逻辑段（第 5–25 行）', ranges: [[5, 25]] },
    { key: 'guard', label: '仅校验与收尾段（第 1–4、26 行以后）', ranges: [[1, 4], [26, 60]] }
  ];

  function inScope(scope, line) {
    var s = SCOPES.filter(function (x) { return x.key === scope; })[0] || SCOPES[0];
    if (!s.ranges) return true;
    return s.ranges.some(function (r) { return line >= r[0] && line <= r[1]; });
  }

  var RULES = [
    { id: 'R01', name: '空的异常处理块', type: 'exception', severity: 'major', kind: 'line',
      test: function (t) { return /catch\s*\([^)]*\)\s*\{\s*\}/.test(t); } },
    { id: 'R02', name: '日志输出敏感字段', type: 'security', severity: 'trivial', kind: 'line',
      test: function (t) { return /console\.(log|info|warn)\s*\(/.test(t) && /(phone|idCard|password|手机号|身份证)/.test(t); } },
    { id: 'R03', name: '硬编码阈值常量', type: 'magic', severity: 'minor', kind: 'line',
      test: function (t) { return /^\s*const\s+[A-Z_]+\s*=\s*-?\d+(\.\d+)?\s*;/.test(t); } },
    { id: 'R04', name: '取整方式可疑', type: 'precision', severity: 'major', kind: 'line',
      test: function (t) { return /Math\.(floor|ceil)\s*\(/.test(t); } },
    { id: 'R05', name: '折扣率相乘（疑似叠加）', type: 'rule', severity: 'major', kind: 'line',
      test: function (t) { return /groupRate\s*\*\s*retrainRate|retrainRate\s*\*\s*groupRate/.test(t); } },
    { id: 'R06', name: '缺少参数校验', type: 'validation', severity: 'major', kind: 'block', test: null,
      block: function (lines, scope) {
        var hasGuard = lines.some(function (l) { return /if\s*\(\s*!order/.test(l); });
        if (hasGuard) return [];
        var ln = resolveLine(lines, 'function bookSeat(order, seatPool) {', 1);
        return ln > 0 ? [ln] : [];
      } },
    { id: 'R07', name: '命名不可读（data / flag / tmp）', type: 'naming', severity: 'minor', kind: 'line',
      test: function (t) { return /(?:var|let|const)\s+(data|tmp|flag|res|obj)\b/.test(t); } },
    { id: 'R08', name: '疑似重复代码块', type: 'duplicate', severity: 'major', kind: 'block', test: null,
      block: function (lines) {
        var hits = [];
        for (var i = 0; i < lines.length - 3; i++) {
          var a = lines.slice(i, i + 3).join('|').replace(/\s+/g, '');
          if (a.length < 24) continue;
          for (var j = i + 3; j < lines.length - 2; j++) {
            if (lines.slice(j, j + 3).join('|').replace(/\s+/g, '') === a) { hits.push(j + 1); break; }
          }
        }
        return hits;
      } }
  ];

  /* 规则扫描：产生建议标注（可能含误报，学生需自行判断） */
  function ruleScan(version, enabled) {
    var lines = CODE[version] || CODE['v1.0'];
    var marks = {};
    var hits = [];
    RULES.forEach(function (r) {
      if (enabled && enabled.indexOf(r.id) < 0) return;
      if (r.kind === 'line') {
        lines.forEach(function (t, i) {
          if (r.test(t)) {
            if (!marks[i + 1]) marks[i + 1] = r.type;
            hits.push({ rule: r.id, line: i + 1, type: r.type, text: t.trim() });
          }
        });
      } else if (r.block) {
        r.block(lines).forEach(function (ln) {
          if (!marks[ln]) marks[ln] = r.type;
          hits.push({ rule: r.id, line: ln, type: r.type, text: (lines[ln - 1] || '').trim() });
        });
      }
    });
    return { marks: marks, hits: hits, count: hits.length };
  }

  var SEV_ORDER = { trivial: 1, minor: 2, major: 3, fatal: 4 };

  /* 评审：把学生的标注与基线比对 */
  function review(version, marks, opts) {
    opts = opts || {};
    var scope = opts.scope || 'all';
    var baseline = BASELINE[version] || [];
    var inScopeDefects = baseline.filter(function (d) {
      return d.lines.some(function (l) { return inScope(scope, l); });
    });
    var outScopeDefects = baseline.filter(function (d) {
      return !d.lines.some(function (l) { return inScope(scope, l); });
    });

    var markedLines = Object.keys(marks || {}).map(Number)
      .filter(function (n) { return inScope(scope, n); })
      .sort(function (a, b) { return a - b; });

    var detected = [], missed = [];
    inScopeDefects.forEach(function (d) {
      var hitLine = d.lines.filter(function (l) { return marks && marks[l]; })[0];
      if (hitLine) {
        detected.push({
          id: d.id, title: d.title, line: hitLine, severity: d.severity,
          markedType: marks[hitLine], expectedType: d.type, typeOk: marks[hitLine] === d.type
        });
      } else {
        missed.push({ id: d.id, title: d.title, lines: d.lines, severity: d.severity, desc: d.desc });
      }
    });

    var baselineLines = {};
    inScopeDefects.forEach(function (d) { d.lines.forEach(function (l) { baselineLines[l] = d.id; }); });
    var falsePositives = markedLines.filter(function (l) { return !baselineLines[l]; })
      .map(function (l) { return { line: l, type: marks[l], text: (CODE[version] || [])[l - 1] }; });

    var threshold = opts.severityThreshold || 'trivial';
    var remaining = missed.filter(function (d) { return SEV_ORDER[d.severity] >= SEV_ORDER[threshold]; });

    return {
      version: version, scope: scope,
      totalInScope: inScopeDefects.length,
      outOfScope: outScopeDefects.length,
      detected: detected, missed: missed, falsePositives: falsePositives,
      missedOutOfScope: outScopeDefects,
      markedCount: markedLines.length,
      metrics: {
        detectionRate: pctOrNull(detected.length, inScopeDefects.length),
        typeAccuracy: pctOrNull(detected.filter(function (d) { return d.typeOk; }).length, detected.length),
        falsePositiveRate: pctOrNull(falsePositives.length, markedLines.length)
      },
      gateOk: remaining.length === 0 && inScopeDefects.length > 0,
      remaining: remaining,
      empty: markedLines.length === 0
    };
  }

  function pctOrNull(n, d) { return d ? Math.round((n / d) * 1000) / 10 : null; }

  return {
    SR_DEFECT_TYPES: DEFECT_TYPES,
    SR_SCOPES: SCOPES,
    SR_CODE: CODE,
    SR_BASELINE: BASELINE,
    SR_RULES: RULES,
    SR_SEV_ORDER: SEV_ORDER,
    srRuleScan: ruleScan,
    srReview: review,
    srInScope: inScope
  };
});

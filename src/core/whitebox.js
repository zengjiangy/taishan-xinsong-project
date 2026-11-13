/* ============================================================================
 * whitebox.js — 白盒测试与覆盖分析（M6）
 * 关键设计：
 *   · 代码视图由 `_calcFee.toString()` 实时解析得到，展示的就是实际执行的函数；
 *   · 覆盖率数据来自插桩调用轨迹，不是人工标注；
 *   · 控制流图（CFG）以块编号显式声明，并由测试校验其节点与解析出的代码块一致。
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spec.js'));
  } else {
    root.QT = root.QT || {};
    Object.assign(root.QT, factory(root.QT));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (S) {
  'use strict';

  var BLOCK_DESC = {
    B01: '读取入参并校验', B02: '返回输入错误', B03: '准备单价',
    B04: '持证单价 90', B05: '默认单价 120', B06: '计算基础费用',
    B07: '团体 95 折', B08: '团体 90 折', B09: '团体 85 折', B10: '无团体折扣',
    B11: '复训 7 折', B12: '非复训', B13: '取更优折扣率',
    B14: '计算折扣金额', B15: '计算应付金额', B16: '负值截断为 0',
    B17: '无需截断', B18: '返回结果'
  };

  var DEC_DESC = {
    D1: '输入是否全部合法', D2: '是否持证', D3: '人数是否 3–5',
    D4: '人数是否 6–10', D5: '人数是否 ≥11', D6: '是否复训学员', D7: '应付金额是否 <0'
  };

  var COND_DESC = {
    C1: '课时为 1–120 整数', C2: '人数为 1–20 整数', C3: '券额为 0–500 整数',
    C4: '类型合法且持证标记为布尔', C5: '持证 = true',
    C6: 'seats ≥ 3', C7: 'seats ≤ 5', C8: 'seats ≥ 6', C9: 'seats ≤ 10',
    C10: 'seats ≥ 11', C11: 'type = retrain', C12: '应付 < 0'
  };

  /* 控制流图：显式声明，保证路径枚举可核对 */
  var CFG = {
    entry: 'B01',
    edges: {
      B01: ['B02', 'B03'], B02: [],
      B03: ['B04', 'B05'], B04: ['B06'], B05: ['B06'],
      B06: ['B07', 'B08', 'B09', 'B10'],
      B07: ['B11', 'B12'], B08: ['B11', 'B12'], B09: ['B11', 'B12'], B10: ['B11', 'B12'],
      B11: ['B13'], B12: ['B13'],
      B13: ['B14'], B14: ['B15'], B15: ['B16', 'B17'],
      B16: ['B18'], B17: ['B18'], B18: []
    }
  };

  var CRITERIA = [
    { key: 'statement', label: '语句/块覆盖', short: '块覆盖', desc: '已执行的语句块 / 全部语句块' },
    { key: 'decision', label: '判定覆盖', short: '判定覆盖', desc: '每个判定的真、假分支各至少执行一次 → 分母 = 2 × 判定数' },
    { key: 'condition', label: '条件覆盖', short: '条件覆盖', desc: '每个原子条件的真、假各至少取一次 → 分母 = 2 × 条件数' },
    { key: 'dc', label: '判定-条件覆盖', short: 'DC 覆盖', desc: '判定覆盖与条件覆盖同时满足' },
    { key: 'path', label: '路径覆盖', short: '路径覆盖', desc: '已执行的不同执行路径 / 控制流图中可枚举的路径总数（受上限截断）' }
  ];

  /* ---------------------------------------------------------------- 代码解析 */
  function parseCode(source) {
    var raw = String(source).split('\n');
    var lines = [];
    var cur = null;
    for (var i = 0; i < raw.length; i++) {
      var text = raw[i];
      var t = text.trim();
      if (!t) { lines.push({ no: i + 1, text: text, kind: 'blank', block: cur }); continue; }
      var mB = t.match(/^T\.b\('([A-Z0-9]+)'\);/);
      if (mB) {
        cur = mB[1];
        lines.push({ no: i + 1, text: text, kind: 'instr', block: cur, target: cur });
        continue;
      }
      var mC = t.match(/^T\.c\('([A-Z0-9]+)'/);
      if (mC) { lines.push({ no: i + 1, text: text, kind: 'instr', block: cur, cond: mC[1] }); continue; }
      var mD = t.match(/^T\.d\('([A-Z0-9]+)'/);
      if (mD) { lines.push({ no: i + 1, text: text, kind: 'instr', block: cur, dec: mD[1] }); continue; }
      var isMut = /MUT\./.test(t);
      lines.push({ no: i + 1, text: text, kind: isMut ? 'mut' : 'code', block: cur });
    }
    var blocks = [];
    var decs = [];
    var conds = [];
    lines.forEach(function (l) {
      if (l.target && blocks.indexOf(l.target) < 0) blocks.push(l.target);
      if (l.dec && decs.indexOf(l.dec) < 0) decs.push(l.dec);
      if (l.cond && conds.indexOf(l.cond) < 0) conds.push(l.cond);
    });
    return { lines: lines, blocks: blocks, decisions: decs, conditions: conds };
  }

  /* 轨迹采集器：记录有序事件 */
  function makeTracer() {
    var events = [];
    return {
      events: events,
      b: function (id) { events.push({ t: 'b', id: id }); },
      c: function (id, v) { events.push({ t: 'c', id: id, v: !!v }); },
      d: function (id, v) { events.push({ t: 'd', id: id, v: !!v }); },
      note: function () {}
    };
  }

  function runOne(input, defect, tracer) {
    var mut = defect && defect !== 'none' ? JSON.parse('{"' + defect + '":true}') : null;
    var tr = tracer || makeTracer();
    tr.events.length = 0;
    var out = S._calcFee(input, tr, { defect: mut });
    var seq = tr.events.filter(function (e) { return e.t === 'b'; }).map(function (e) { return e.id; });
    return { out: out, events: tr.events.slice(), blocks: seq, path: seq.join('>') };
  }

  /* 路径枚举 */
  function enumeratePaths(limit) {
    var out = [];
    var cap = limit || 500;
    function dfs(node, acc) {
      if (out.length >= cap) return;
      var next = CFG.edges[node] || [];
      acc.push(node);
      if (!next.length) { out.push(acc.slice()); }
      else { for (var i = 0; i < next.length; i++) { dfs(next[i], acc); if (out.length >= cap) break; } }
      acc.pop();
    }
    dfs(CFG.entry, []);
    return out;
  }

  var TOTAL_PATHS = enumeratePaths(500).length;

  /* ------------------------------------------------------------- 覆盖率计算 */
  function analyze(runs) {
    var parsed = parseCode(S._calcFee.toString());
    var hitBlocks = {};
    var decSeen = {};   // D -> {t:[], f:[]}
    var condSeen = {};
    var paths = {};

    runs.forEach(function (r) {
      r.blocks.forEach(function (b) { hitBlocks[b] = true; });
      r.events.forEach(function (e) {
        if (e.t === 'd') {
          decSeen[e.id] = decSeen[e.id] || { t: 0, f: 0 };
          decSeen[e.id][e.v ? 't' : 'f']++;
        }
        if (e.t === 'c') {
          condSeen[e.id] = condSeen[e.id] || { t: 0, f: 0 };
          condSeen[e.id][e.v ? 't' : 'f']++;
        }
      });
      paths[r.path] = true;
    });

    var bTotal = parsed.blocks.length;
    var bHit = parsed.blocks.filter(function (b) { return hitBlocks[b]; }).length;

    var decItems = [], decCovered = 0;
    parsed.decisions.forEach(function (d) {
      var s = decSeen[d] || { t: 0, f: 0 };
      var okT = s.t > 0, okF = s.f > 0;
      if (okT) decCovered++;
      if (okF) decCovered++;
      decItems.push({ id: d, desc: DEC_DESC[d], t: okT, f: okF, ok: okT && okF });
    });

    var condItems = [], condCovered = 0;
    parsed.conditions.forEach(function (c) {
      var s = condSeen[c] || { t: 0, f: 0 };
      var okT = s.t > 0, okF = s.f > 0;
      if (okT) condCovered++;
      if (okF) condCovered++;
      condItems.push({ id: c, desc: COND_DESC[c], t: okT, f: okF, ok: okT && okF });
    });

    var dcCovered = decCovered + condCovered;
    var pathKeys = Object.keys(paths);
    var enumPaths = enumeratePaths(500);

    return {
      parsed: parsed,
      blocks: {
        total: bTotal, covered: bHit, rate: S.pct(bHit, bTotal, 1),
        missed: parsed.blocks.filter(function (b) { return !hitBlocks[b]; }).map(function (b) { return b + ' ' + (BLOCK_DESC[b] || ''); })
      },
      decisions: {
        items: decItems, total: parsed.decisions.length * 2, covered: decCovered,
        rate: S.pct(decCovered, parsed.decisions.length * 2, 1),
        missed: decItems.filter(function (x) { return !x.ok; }).map(function (x) { return x.id + ' ' + (DEC_DESC[x.id] || ''); })
      },
      conditions: {
        items: condItems, total: parsed.conditions.length * 2, covered: condCovered,
        rate: S.pct(condCovered, parsed.conditions.length * 2, 1),
        missed: condItems.filter(function (x) { return !x.ok; }).map(function (x) { return x.id + ' ' + (COND_DESC[x.id] || ''); })
      },
      dc: {
        total: parsed.decisions.length * 2 + parsed.conditions.length * 2,
        covered: dcCovered,
        rate: S.pct(dcCovered, parsed.decisions.length * 2 + parsed.conditions.length * 2, 1)
      },
      paths: {
        covered: pathKeys.length, total: enumPaths.length, rate: S.pct(pathKeys.length, enumPaths.length, 1),
        executed: pathKeys
      },
      hitBlocks: hitBlocks,
      decSeen: decSeen, condSeen: condSeen,
      runCount: runs.length
    };
  }

  /* 覆盖准则达成判定 */
  function criterionStatus(a, criterion) {
    var value, total;
    if (criterion === 'statement') { value = a.blocks.covered; total = a.blocks.total; }
    else if (criterion === 'decision') { value = a.decisions.covered; total = a.decisions.total; }
    else if (criterion === 'condition') { value = a.conditions.covered; total = a.conditions.total; }
    else if (criterion === 'dc') { value = a.dc.covered; total = a.dc.total; }
    else { value = a.paths.covered; total = a.paths.total; }
    var passed = total > 0 && value >= total;
    return { value: value, total: total, passed: passed, rate: S.pct(value, total, 1) };
  }

  /* 贪心最小用例集：从候选池中选出能最快达成准则的最小子集 */
  function greedyMinSet(pool, criterion, defects) {
    var coveredItems = {};
    var chosen = [];
    var runs = [];
    function keysOf(run) {
      var k = [];
      if (criterion === 'statement') k = run.blocks.slice();
      else if (criterion === 'decision') {
        run.events.forEach(function (e) { if (e.t === 'd') k.push(e.id + (e.v ? ':T' : ':F')); });
      } else if (criterion === 'condition') {
        run.events.forEach(function (e) { if (e.t === 'c') k.push(e.id + (e.v ? ':T' : ':F')); });
      } else if (criterion === 'dc') {
        run.events.forEach(function (e) {
          if (e.t === 'd' || e.t === 'c') k.push(e.id + (e.v ? ':T' : ':F'));
        });
      } else k = [run.path];
      return k.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    }
    var all = pool.map(function (p) { return { p: p, run: runOne(p, defects) }; });
    var target = {};
    all.forEach(function (x) { keysOf(x.run).forEach(function (k) { target[k] = true; }); });
    var targetKeys = Object.keys(target);
    var guard = 0;
    while (guard++ < 30) {
      var best = null, bestGain = 0;
      all.forEach(function (x) {
        if (x.picked) return;
        var gain = keysOf(x.run).filter(function (k) { return !coveredItems[k]; }).length;
        if (gain > bestGain) { bestGain = gain; best = x; }
      });
      if (!best) break;
      best.picked = true;
      chosen.push(best.p);
      keysOf(best.run).forEach(function (k) { coveredItems[k] = true; });
      if (Object.keys(coveredItems).length >= targetKeys.length) break;
    }
    return { cases: chosen, coveredKeys: Object.keys(coveredItems).length, targetKeys: targetKeys.length };
  }

  /* 候选输入池（用于最小集建议；全部为显式数值，非随机） */
  var POOL = [
    { hours: 1, seats: 1, coupon: 0, type: 'new', hasCert: false },
    { hours: 11, seats: 1, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 3, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 6, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 11, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 20, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 3, coupon: 0, type: 'retrain', hasCert: true },
    { hours: 11, seats: 1, coupon: 0, type: 'retrain', hasCert: true },
    { hours: 1, seats: 1, coupon: 500, type: 'new', hasCert: true },
    { hours: 120, seats: 20, coupon: 0, type: 'corp', hasCert: false },
    { hours: 0, seats: 1, coupon: 0, type: 'new', hasCert: true },
    { hours: 121, seats: 1, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 0, coupon: 0, type: 'new', hasCert: true },
    { hours: 11, seats: 1, coupon: 501, type: 'new', hasCert: true },
    { hours: 11, seats: 1, coupon: 0, type: 'vip', hasCert: true }
  ];

  /* 默认用例库：4 条已勾选，其余供学生自行启用 */
  var LIBRARY = [
    { id: 'U1', label: '1 课时 / 1 人 / 无证', short: '1/1 无证', input: POOL[0], on: true },
    { id: 'U2', label: '11 课时 / 1 人 / 持证', short: '11/1 持证', input: POOL[1], on: true },
    { id: 'U3', label: '11 课时 / 3 人 / 持证', short: '11/3 持证', input: POOL[2], on: true },
    { id: 'U4', label: '11 课时 / 6 人 / 持证', short: '11/6 持证', input: POOL[3], on: true },
    { id: 'U5', label: '11 课时 / 11 人 / 持证', short: '11/11 持证', input: POOL[4], on: false },
    { id: 'U6', label: '11 课时 / 20 人 / 持证', short: '11/20 持证', input: POOL[5], on: false },
    { id: 'U7', label: '11 课时 / 3 人 / 复训 / 持证', short: '11/3 复训', input: POOL[6], on: false },
    { id: 'U8', label: '11 课时 / 1 人 / 复训 / 持证', short: '11/1 复训', input: POOL[7], on: false },
    { id: 'U9', label: '1 课时 / 1 人 / 券 500 / 持证（应付为负）', short: '1/1 券500', input: POOL[8], on: false },
    { id: 'U10', label: '120 课时 / 20 人 / 企业团体 / 无证', short: '120/20 团体', input: POOL[9], on: false },
    { id: 'U11', label: '0 课时（非法输入）', short: '0 课时·错', input: POOL[10], on: false },
    { id: 'U12', label: '121 课时（非法输入）', short: '121 课时·错', input: POOL[11], on: false },
    { id: 'U13', label: '0 人（非法输入）', short: '0 人·错', input: POOL[12], on: false },
    { id: 'U14', label: '券 501 元（非法输入）', short: '券 501·错', input: POOL[13], on: false },
    { id: 'U15', label: '学员类型 vip（非法输入）', short: 'vip 型·错', input: POOL[14], on: false }
  ];

  return {
    WB_BLOCK_DESC: BLOCK_DESC,
    WB_DEC_DESC: DEC_DESC,
    WB_COND_DESC: COND_DESC,
    WB_CFG: CFG,
    WB_CRITERIA: CRITERIA,
    WB_POOL: POOL,
    WB_LIBRARY: LIBRARY,
    WB_TOTAL_PATHS: TOTAL_PATHS,
    wbParseCode: parseCode,
    wbMakeTracer: makeTracer,
    wbRunOne: runOne,
    wbEnumeratePaths: enumeratePaths,
    wbAnalyze: analyze,
    wbCriterionStatus: criterionStatus,
    wbGreedyMinSet: greedyMinSet
  };
});

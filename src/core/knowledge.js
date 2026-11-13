/* ============================================================================
 * knowledge.js — 知识图谱数据（节点 / 类型化关联边 / 学习路线 / 文字关系表）
 * 边类型：dep 前置依赖 · cmp 方法对比 · flow 流程衔接 · evid 证据关联
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

  var EDGE_TYPES = {
    dep: { key: 'dep', label: '前置依赖', color: '#0066cc', dash: '0', arrow: true },
    cmp: { key: 'cmp', label: '方法对比', color: '#7c3aed', dash: '6 4', arrow: false },
    flow: { key: 'flow', label: '流程衔接', color: '#0d9488', dash: '3 3', arrow: true },
    evid: { key: 'evid', label: '证据汇总', color: '#d97706', dash: '0', arrow: true }
  };

  var NODES = [
    { id: 'k1', label: '软件质量与 SQA', short: '质量与SQA', kind: 'ref', chapter: '第1章 1.1 / 1.3；第4章 4.3–4.6', x: 150, y: 72 },
    { id: 'k2', label: '测试过程与级别', short: '测试过程', kind: 'ref', chapter: '第5章 5.2；第6章 6.1–6.4', x: 420, y: 72 },
    { id: 'k4', label: '软件质量标准', short: '质量标准', kind: 'ref', chapter: '第2章 2.1–2.3', x: 150, y: 470 },
    { id: 'k3', label: '测试组织与管理', short: '测试管理', kind: 'ref', chapter: '第9章 9.2–9.5', x: 800, y: 470 },

    { id: 'm1', label: 'M1 静态测试与代码审查', short: 'M1 静态审查', kind: 'exp', no: 1, chapter: '第7章 7.1–7.5', x: 118, y: 190 },
    { id: 'm2', label: 'M2 等价类划分', short: 'M2 等价类', kind: 'exp', no: 2, chapter: '第8章 8.1.1', x: 288, y: 190 },
    { id: 'm3', label: 'M3 边界值分析', short: 'M3 边界值', kind: 'exp', no: 3, chapter: '第8章 8.1.2', x: 458, y: 190 },
    { id: 'm4', label: 'M4 决策表测试', short: 'M4 决策表', kind: 'exp', no: 4, chapter: '第8章 8.1.3', x: 628, y: 190 },
    { id: 'm5', label: 'M5 状态迁移测试', short: 'M5 状态迁移', kind: 'exp', no: 5, chapter: '第8章 8.1.4 / 8.5', x: 800, y: 190 },
    { id: 'm6', label: 'M6 白盒与覆盖分析', short: 'M6 白盒覆盖', kind: 'exp', no: 6, chapter: '第8章 8.4', x: 380, y: 330 },
    { id: 'm7', label: 'M7 自动化回归与 CI', short: 'M7 回归与CI', kind: 'exp', no: 7, chapter: '第11章 11.1–11.4', x: 600, y: 330 },
    { id: 'm8', label: 'M8 质量门禁与发布决策', short: 'M8 质量门禁', kind: 'exp', no: 8, chapter: '第1/4/9 章', x: 490, y: 470 }
  ];

  var EDGES = [
    { from: 'k1', to: 'k2', type: 'dep', why: '质量保证的评审、验证与确认活动要通过测试过程落地，先理解 SQA 的职责边界，才知道测试在过程中的位置。' },
    { from: 'k4', to: 'm1', type: 'dep', why: '代码审查需要判据；质量标准与编码规范提供了“什么算不合格”的依据。' },
    { from: 'k1', to: 'm1', type: 'dep', why: '静态测试是 SQA 活动（评审、验证与确认）中最靠前的一道关口。' },
    { from: 'k1', to: 'm8', type: 'dep', why: '发布质量门禁是 SQA 的组织级决策动作，需要独立的证据与判据。' },
    { from: 'k2', to: 'm2', type: 'dep', why: '等价类划分属于测试设计活动，位于测试过程“测试分析与设计”阶段。' },
    { from: 'k2', to: 'm3', type: 'dep', why: '边界值分析同样属于基于规格说明的测试设计技术。' },
    { from: 'k2', to: 'm4', type: 'dep', why: '决策表用于把组合型业务规则转成可测的规则集合。' },
    { from: 'k2', to: 'm5', type: 'dep', why: '状态迁移测试依赖对业务流程与时序的建模。' },
    { from: 'k3', to: 'm5', type: 'dep', why: '状态模型常用于系统测试与验收测试级别的场景回归。' },

    { from: 'm2', to: 'm3', type: 'cmp', why: '两者都基于规格说明，但等价类关心“分几类”，边界值关心“分界处取哪些点”；常配合使用。' },
    { from: 'm4', to: 'm5', type: 'cmp', why: '决策表刻画条件组合，状态迁移刻画时序；前者回答“什么条件下做什么”，后者回答“什么顺序下能做什么”。' },
    { from: 'm3', to: 'm6', type: 'cmp', why: '边界值是黑盒视角，白盒覆盖是结构视角；同一个缺陷可能被两者之一发现，也可能都发现不了。' },
    { from: 'm4', to: 'm6', type: 'flow', why: '决策表的每个条件通常会落到代码里的判定与条件，规则覆盖率与条件覆盖率可以互相对照。' },
    { from: 'm1', to: 'm7', type: 'flow', why: '静态检查是流水线的第一个质量阶段，与回归测试共同构成提交前的自动防线。' },
    { from: 'm6', to: 'm7', type: 'flow', why: '单元级的白盒用例是回归套件的底座；覆盖率可作为套件充分性的辅助指标。' },
    { from: 'm5', to: 'm7', type: 'flow', why: '状态迁移用例通常以场景级回归的形式长期保留。' },

    { from: 'm2', to: 'm8', type: 'evid', why: 'M2 输出等价类覆盖率与检出缺陷，作为门禁的覆盖率证据与待修台账来源。' },
    { from: 'm3', to: 'm8', type: 'evid', why: 'M3 输出边界对命中率与 off-by-one 检出结果。' },
    { from: 'm4', to: 'm8', type: 'evid', why: 'M4 输出规则一致率，反映需求与实现的偏差程度。' },
    { from: 'm5', to: 'm8', type: 'evid', why: 'M5 输出迁移覆盖率，反映核心流程被验证的充分性。' },
    { from: 'm6', to: 'm8', type: 'evid', why: 'M6 输出判定覆盖率与“高覆盖仍有缺陷”的反例。' },
    { from: 'm7', to: 'm8', type: 'evid', why: 'M7 输出回归通过率与门禁结论，是发布决策最直接的输入。' },
    { from: 'm1', to: 'm8', type: 'evid', why: 'M1 输出缺陷台账与严重度，进入风险模型的加权缺陷项。' }
  ];

  var ROUTES = [
    {
      key: 'beginner', label: '推荐路线 · 从零开始（约 90 分钟）',
      steps: ['k1', 'm1', 'm2', 'm3', 'm6', 'm7', 'm8'],
      note: '先建立“质量不是测出来的”这一前提，再依次走一遍黑盒→白盒→自动化→门禁，最后用证据做一次放行决策。'
    },
    {
      key: 'design', label: '设计技术深化（约 70 分钟）',
      steps: ['m2', 'm3', 'm4', 'm5'],
      note: '四种黑盒设计技术的横向对比：类、边界、组合、时序。适合已学过基础概念的复习。'
    },
    {
      key: 'engineering', label: '工程化与质量保证（约 60 分钟）',
      steps: ['m1', 'm6', 'm7', 'm8'],
      note: '面向 SQA / 测试开发岗位：从评审到流水线再到发布门禁，关注的是流程与证据，而不是单个用例。'
    }
  ];

  function nodeById(id) {
    return NODES.filter(function (n) { return n.id === id; })[0] || null;
  }

  return {
    KG_EDGE_TYPES: EDGE_TYPES,
    KG_NODES: NODES,
    KG_EDGES: EDGES,
    KG_ROUTES: ROUTES,
    kgNode: nodeById
  };
});

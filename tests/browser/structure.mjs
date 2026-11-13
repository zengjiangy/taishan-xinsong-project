/**
 * tests/browser/structure.mjs — 结构完整性检查（不是视觉检查）
 * 检查项：模块注册契约、参数数量、锚点链接、重复 id、空占位、禁用词。
 * 用法：node tests/browser/structure.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const errors = [];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✕'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--allow-file-access-from-files', '--no-sandbox']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });

console.log('\n模块契约');
const mods = await page.evaluate(() => WB.exps.map((d) => ({
  id: d.id, no: d.no, title: d.title, params: d.params.length,
  hasGoals: Array.isArray(d.goals) && d.goals.length >= 3,
  blockers: Array.isArray(d.blockers) && d.blockers.length >= 3,
  theory: typeof d.theory === 'string' && d.theory.length >= 100 && d.theory.indexOf('formula') >= 0,
  prereq: !!(d.prereq && d.scopeNote),
  chapter: /第\d+章/.test(d.chapter),
  fns: ['compute', 'viz', 'verify', 'evidence'].every((k) => typeof d[k] === 'function')
})));
check('注册 8 个实验', mods.length === 8, mods.map((m) => 'M' + m.no).join(' '));
check('编号 1–8 连续无重复', JSON.stringify(mods.map((m) => m.no)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]));
check('每个实验 ≥3 个参数', mods.every((m) => m.params >= 3), mods.map((m) => 'M' + m.no + '=' + m.params).join(' '));
check('每个实验有 ≥3 条学习目标', mods.every((m) => m.hasGoals));
check('每个实验有 ≥3 条认知堵点', mods.every((m) => m.blockers));
check('每个实验有理论正文且含公式块', mods.every((m) => m.theory));
check('每个实验声明前置与适用场景', mods.every((m) => m.prereq));
check('每个实验标注教材章节', mods.every((m) => m.chapter), mods.map((m) => m.chapter).join(' | '));

console.log('\n占位与禁用内容');
const banned = await page.evaluate(() => {
  const txt = document.body.innerText;
  const hits = [];
  ['建设中', '待补充', 'TODO', 'TBD', 'Lorem', '占位', '敬请期待', 'Coming soon'].forEach((k) => {
    if (txt.includes(k)) hits.push(k);
  });
  return hits;
});
check('页面无占位文案', banned.length === 0, banned.join(',') || '无');
const placeholderBtns = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  return btns.filter((b) => {
    const t = b.innerText.trim();
    return t === '' && !b.getAttribute('aria-label') && !b.querySelector('svg,i');
  }).length;
});
check('无空白无标签按钮', placeholderBtns === 0, '可疑按钮 ' + placeholderBtns + ' 个');

console.log('\n导航与链接');
const navs = await page.evaluate(() => {
  const list = Array.from(document.querySelectorAll('[data-nav]')).map((b) => b.getAttribute('data-nav'));
  return Array.from(new Set(list));
});
const badNav = await page.evaluate((list) => list.filter((v) => {
  if (v === 'overview' || v === 'graph' || v === 'quiz' || v === 'evidence' || v === 'about') return false;
  const m = v.split('/');
  return !(m[0] === 'exp' && WB.byId[m[1]]);
}), navs);
check('所有导航目标有效', badNav.length === 0, badNav.join(',') || navs.length + ' 个目标');

const anchors = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#/"]')).map((a) => a.getAttribute('href')));
check('页面内锚点格式统一', anchors.every((h) => /^#\/(overview|graph|quiz|evidence|about|exp\/m[1-8])$/.test(h)), anchors.join(','));

const quizMeta = await page.evaluate(() => {
  if (!window.QT || !Array.isArray(QT.QUIZ_QUESTIONS)) return { ok: false, n: 0 };
  const qs = QT.QUIZ_QUESTIONS;
  const perExp = WB.exps.every((e) => QT.quizByExp(e.id).length === 5);
  const hasTypes = ['single', 'multi', 'fill'].every((t) => qs.some((q) => (q.type || 'single') === t));
  return { ok: qs.length === 48 && perExp && hasTypes, n: qs.length };
});
check('随堂题库 48 题（含单选/多选/填空）且每实验 5 题', quizMeta.ok, quizMeta.n + ' 题');

console.log('\n重复 id 与内联风险');
for (const v of ['overview', 'graph', 'quiz', 'exp/m6', 'evidence', 'about']) {
  await page.evaluate((h) => { location.hash = '#/' + h; }, v);
  await new Promise((r) => setTimeout(r, 240));
  const dup = await page.evaluate(() => {
    const seen = {};
    const dups = [];
    document.querySelectorAll('[id]').forEach((el) => {
      if (seen[el.id]) dups.push(el.id);
      seen[el.id] = 1;
    });
    return dups;
  });
  check('#' + v + ' 无重复 id', dup.length === 0, dup.join(',') || '无');
}

const inject = await page.evaluate(() => {
  // 尝试注入 HTML 片段到自定义用例并渲染（应被转义）
  const st = WB.expState(WB.byId.m2);
  st.custom = [];
  WB.toast('<img src=x onerror=alert(1)>');
  const el = document.querySelector('#toast-host .toast');
  return { hasImg: !!(el && el.querySelector('img')), text: el ? el.innerText : '' };
});
check('提示条内容以纯文本呈现（无 HTML 注入）', !inject.hasImg, inject.text.slice(0, 40));

console.log('\n知识图谱');
await page.evaluate(() => { location.hash = '#/graph'; });
await new Promise((r) => setTimeout(r, 300));
const kg = await page.evaluate(() => {
  const ids = new Set(WB.exps.map((e) => e.id));
  const nodes = QT.KG_NODES.map((n) => n.id);
  const badEdges = QT.KG_EDGES.filter((e) => !nodes.includes(e.from) || !nodes.includes(e.to));
  const expNodes = QT.KG_NODES.filter((n) => n.kind === 'exp');
  const types = new Set(QT.KG_EDGES.map((e) => e.type));
  return {
    nodes: nodes.length, edges: QT.KG_EDGES.length,
    badEdges: badEdges.length,
    expNodes: expNodes.length,
    allExpLinked: expNodes.every((n) => ids.has(n.id)),
    types: Array.from(types).sort(),
    hasTextTable: !!document.querySelector('#view table'),
    svgNodes: document.querySelectorAll('.gnode').length,
    svgEdges: document.querySelectorAll('.gedge').length
  };
});
check('图谱含 8 个实验节点', kg.expNodes === 8);
check('图谱节点 id 与实验模块一致', kg.allExpLinked);
check('所有边指向存在的节点', kg.badEdges === 0, '非法边 ' + kg.badEdges);
check('四种关系类型齐全', kg.types.join(',') === 'cmp,dep,evid,flow', kg.types.join(','));
check('SVG 实际渲染节点与边', kg.svgNodes === kg.nodes && kg.svgEdges === kg.edges, kg.svgNodes + '/' + kg.svgEdges);
check('提供等价文字关系表', kg.hasTextTable);

await browser.close();
console.log('\n控制台错误：' + errors.length);
errors.slice(0, 6).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项检查，失败 ' + failed + ' 项');
process.exit(failed || errors.length ? 1 : 0);

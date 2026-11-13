/**
 * tests/browser/smoke.mjs — 真实浏览器冒烟：加载 index.html，捕获控制台错误，逐视图渲染检查。
 * 用法：node tests/browser/smoke.mjs [--shots]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, '.tmp/shots');

const VIEWS = [
  ['overview', '总览导图'],
  ['graph', '知识图谱'],
  ['quiz', '随堂挑战'],
  ['exp/m1', 'M1'],
  ['exp/m2', 'M2'],
  ['exp/m3', 'M3'],
  ['exp/m4', 'M4'],
  ['exp/m5', 'M5'],
  ['exp/m6', 'M6'],
  ['exp/m7', 'M7'],
  ['exp/m8', 'M8'],
  ['evidence', '档案地图'],
  ['about', '说明']
];

const errors = [];
const warnings = [];
function log(...a) { console.log(...a); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push('[console] ' + m.text());
  else if (t === 'warning') warnings.push('[warn] ' + m.text());
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url() + ' ' + (r.failure() || {}).errorText));

const requests = [];
page.on('request', (r) => requests.push(r.url()));

const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
log('打开：' + url);
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await new Promise((r) => setTimeout(r, 400));

if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
for (const [hash, label] of VIEWS) {
  await page.evaluate((h) => { location.hash = '#/' + h; }, hash);
  await new Promise((r) => setTimeout(r, 320));
  const info = await page.evaluate(() => {
    const v = document.getElementById('view');
    return {
      len: v ? v.innerText.trim().length : 0,
      cards: document.querySelectorAll('#view .card, #view .kpi-tile, #view .hero-banner').length,
      title: (document.querySelector('#view h1, #view h2') || {}).innerText || ''
    };
  });
  results.push({ hash, label, ...info });
  if (SHOTS) {
    await page.screenshot({ path: path.join(SHOT_DIR, hash.replace(/\//g, '-') + '.png') });
  }
}

log('\n视图渲染结果：');
let viewFail = 0;
for (const r of results) {
  const ok = r.len > 100 && r.cards > 0;
  if (!ok) viewFail++;
  log(`  ${ok ? '✓' : '✕'} ${r.hash.padEnd(10)} 标题="${r.title}" 文本=${r.len} 组件=${r.cards}`);
}

// 交互：M2 切字段胶囊 → 内容变化 + 记录过关档案
await page.evaluate(() => { location.hash = '#/exp/m2'; });
await new Promise((r) => setTimeout(r, 300));
const before = await page.evaluate(() => (document.getElementById('col-right') || {}).innerText || '');
await page.evaluate(() => {
  const btn = document.querySelector('button[data-p="field"][data-v="coupon"]');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 250));
const after = await page.evaluate(() => (document.getElementById('col-right') || {}).innerText || '');
const changed = before !== after && after.includes('C1');

const evBefore = await page.evaluate(() => (document.getElementById('stat') || {}).innerText || '');
await page.evaluate(() => {
  const b = document.querySelector('[data-act="record-evidence"]');
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 260));
const evAfter = await page.evaluate(() => (document.getElementById('stat') || {}).innerText || '');
const evidenceRecorded = evBefore !== evAfter;

log('\n交互检查：');
log('  参数变更后结果刷新：' + (changed ? '✓' : '✕'));
log('  记录证据后状态栏变化：' + (evidenceRecorded ? '✓' : '✕') + '（' + evBefore.trim() + ' → ' + evAfter.trim() + '）');

// 知识图谱节点点击
await page.evaluate(() => { location.hash = '#/graph'; });
await new Promise((r) => setTimeout(r, 300));
const graphInfo = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.gnode').length,
  edges: document.querySelectorAll('.gedge').length
}));
await page.evaluate(() => {
  const n = document.querySelector('.gnode[data-id="m4"]');
  if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 250));
const detail = await page.evaluate(() => (document.getElementById('graph-page-detail') || {}).innerText || '');
const graphOk = detail.includes('决策') || detail.includes('开关');
log('  图谱节点/边：' + graphInfo.nodes + '/' + graphInfo.edges + '，点击 M4 后详情：' + (graphOk ? '✓' : '✕'));

if (SHOTS) {
  await page.evaluate(() => { location.hash = '#/exp/m2'; });
  await new Promise((r) => setTimeout(r, 320));
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="exp-tab"][data-t="quiz"]');
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 320));
  await page.screenshot({ path: path.join(SHOT_DIR, 'exp-m2-quiz.png') });
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="exp-tab"][data-t="theory"]');
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 320));
  await page.screenshot({ path: path.join(SHOT_DIR, 'exp-m2-theory.png') });
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="exp-tab"][data-t="lab"]');
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 300));
}

// 尺寸检查：1366x768
await page.setViewport({ width: 1366, height: 768 });
await page.evaluate(() => { location.hash = '#/exp/m2'; });
await new Promise((r) => setTimeout(r, 320));
const overflow = await page.evaluate(() => {
  const doc = document.documentElement;
  return { hOverflow: doc.scrollWidth > doc.clientWidth + 2, sw: doc.scrollWidth, cw: doc.clientWidth };
});
if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, 'laptop-1366-m2.png') });
log('  1366×768 横向溢出：' + (overflow.hOverflow ? '✕ 有（' + overflow.sw + '>' + overflow.cw + '）' : '✓ 无'));

const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
log('  网络请求总数：' + requests.length + '，非 file:// 请求：' + external.length);

await browser.close();

log('\n控制台错误：' + errors.length);
errors.slice(0, 20).forEach((e) => log('  ' + e));
if (warnings.length) {
  log('控制台警告：' + warnings.length);
  warnings.slice(0, 5).forEach((w) => log('  ' + w));
}

const fail = errors.length > 0 || viewFail > 0 || !changed || !evidenceRecorded || !graphOk || overflow.hOverflow || external.length > 0;
log('\n结果：' + (fail ? '未通过' : '通过'));
process.exit(fail ? 1 : 0);

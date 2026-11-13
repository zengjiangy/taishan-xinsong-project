/**
 * tests/browser/persistence.mjs — 存储、导出、导入、重置隔离与降级测试
 */
import fs from 'node:fs';
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
  args: ['--allow-file-access-from-files', '--no-sandbox', '--window-size=1440,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 300));

const go = async (h) => { await page.evaluate((x) => { location.hash = '#/' + x; }, h); await new Promise((r) => setTimeout(r, 280)); };
const txt = (s) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; }, s);
const click = async (s) => { await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, s); await new Promise((r) => setTimeout(r, 260)); };

console.log('\n1. 持久化');
await go('exp/m2');
await click('[data-act="record-evidence"]');
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 350));
const afterReload = await txt('#stat');
check('刷新后档案仍保留', afterReload.includes('1/8'), afterReload);

console.log('\n2. 导出');
await page.evaluate(() => {
  window.__blob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = function (b) { window.__blob = b; return orig.call(URL, b); };
});
await click('[data-act="export-all"]');
const exported = await page.evaluate(async () => (window.__blob ? await window.__blob.text() : null));
let parsed = null;
try { parsed = JSON.parse(exported); } catch (e) {}
check('导出合法 JSON 且带 schema', parsed && parsed.schema === 'qinglan-qa-lab/1' && !!parsed.evidence);

console.log('\n3. 重置隔离性');
await go('exp/m3');
await click('button[data-p="strategy"][data-v="on"]');
await click('[data-act="record-evidence"]');
await click('[data-act="reset-exp"]');
const isOff = await page.evaluate(() => !!document.querySelector('button[data-p="strategy"][data-v="off"].on'));
check('重置恢复本关默认胶囊选项', isOff);
check('重置本关不删除已保存档案', (await txt('#stat')).includes('2/8'), await txt('#stat'));

console.log('\n4. 导入校验');
fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
const okFile = path.join(ROOT, '.tmp/import-ok.json');
const badFile = path.join(ROOT, '.tmp/import-bad.json');
fs.writeFileSync(okFile, JSON.stringify({
  schema: 'qinglan-qa-lab/1',
  evidence: { m1: { status: 'pass', pass: true, coverage: 100 }, m7: { status: 'fail', pass: false, coverage: 93.3 } },
  state: {}
}), 'utf8');
fs.writeFileSync(badFile, JSON.stringify({ schema: 'wrong', evidence: {} }), 'utf8');

const importFlow = async (file) => {
  const chooserPromise = page.waitForFileChooser({ timeout: 5000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="import-all"]'); if (b) b.click(); });
  const chooser = await chooserPromise;
  await chooser.accept([file]);
  await new Promise((r) => setTimeout(r, 500));
  return {
    stat: await txt('#stat'),
    toasts: await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText))
  };
};
const impOk = await importFlow(okFile);
check('导入合法档案更新为 2/8', impOk.stat.includes('2/8'), impOk.stat);
const impBad = await importFlow(badFile);
check('schema 不符拒绝导入并保留原档案', impBad.toasts.some((t) => t.includes('导入被拒绝')) && impBad.stat.includes('2/8'));

console.log('\n5. localStorage 不可用降级');
const page2 = await browser.newPage();
await page2.evaluateOnNewDocument(() => {
  const fake = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }, clear() { throw new Error('blocked'); } };
  Object.defineProperty(window, 'localStorage', { get() { return fake; }, configurable: true });
});
await page2.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
const deg = await page2.evaluate(() => ({
  hasNav: !!document.querySelector('.top-tab'),
  toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText)
}));
check('存储受限时仍正常渲染并提示内存模式', deg.hasNav && deg.toasts.some((t) => t.includes('内存')));
await page2.close();

console.log('\n6. 空自定义输入校验');
await go('exp/m2');
const emptyWarn = await page.evaluate(async () => {
  const d = document.querySelector('#col-right details.sec-card');
  if (d) d.open = true;
  const h = document.getElementById('c-h');
  if (h) h.value = '';
  const b = document.querySelector('[data-act="add-custom"]');
  if (b) b.click();
  await new Promise((r) => setTimeout(r, 200));
  return Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText);
});
check('留空添加自定义用例弹出警告拦截', emptyWarn.some((t) => t.includes('留空无效')), emptyWarn.join(' | '));

await browser.close();
console.log('\n控制台错误：' + errors.length);
errors.slice(0, 8).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项检查，失败 ' + failed + ' 项');
process.exit(failed || errors.length ? 1 : 0);

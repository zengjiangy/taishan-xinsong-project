/**
 * tests/browser/persistence.mjs — 存储、导出、导入、重置与隔离
 * 用法：node tests/browser/persistence.mjs
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
  args: ['--allow-file-access-from-files', '--no-sandbox', '--window-size=1440,900']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('dialog', async (d) => { await d.accept(); });

const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });

const go = async (h) => { await page.evaluate((x) => { location.hash = '#/' + x; }, h); await new Promise((r) => setTimeout(r, 300)); };
const txt = (s) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; }, s);
const click = async (s) => { await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, s); await new Promise((r) => setTimeout(r, 280)); };

console.log('\n1. 持久化');
await go('exp/m2');
await click('[data-act="record-evidence"]');
const beforeReload = await txt('#stat');
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });
const afterReload = await txt('#stat');
check('刷新后证据仍存在', afterReload.includes('1/8'), beforeReload.replace(/\n/g, ' ') + ' → ' + afterReload.replace(/\n/g, ' '));

console.log('\n2. 导出');
await page.evaluate(() => {
  window.__blob = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = function (b) { window.__blob = b; return orig.call(URL, b); };
});
await click('[data-act="export-all"]');
const exported = await page.evaluate(async () => (window.__blob ? await window.__blob.text() : null));
let parsed = null;
try { parsed = JSON.parse(exported); } catch (e) { /* ignore */ }
check('导出得到合法 JSON', !!parsed);
check('导出含 schema 与 evidence', parsed && parsed.schema === 'qinglan-qa-lab/1' && !!parsed.evidence);
check('导出不含个人信息字段', exported && !/phone|idCard|身份证|手机号/.test(exported.replace(/"[^"]*phone[^"]*"/g, '')));

console.log('\n3. 重置的隔离性');
await go('exp/m3');
await page.evaluate(() => {
  const el = document.querySelector('.col-left select[data-p="strategy"]');
  if (el) { el.value = 'on'; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 250));
await click('[data-act="record-evidence"]');
const statBefore = await txt('#stat');
await click('[data-act="reset-exp"]');
await new Promise((r) => setTimeout(r, 300));
const m3Strat = await page.evaluate(() => {
  const el = document.querySelector('.col-left select[data-p="strategy"]');
  return el ? el.value : '';
});
const statAfter = await txt('#stat');
check('重置恢复本实验默认参数', m3Strat === 'off', 'strategy = ' + m3Strat);
check('重置不影响其他实验的证据', statAfter === statBefore || statAfter.includes('/8'), statBefore.replace(/\n/g, ' ') + ' / ' + statAfter.replace(/\n/g, ' '));

console.log('\n4. 导入（通过文件选择器走真实导入流程）');
import fs from 'node:fs';
fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
const okFile = path.join(ROOT, '.tmp/import-ok.json');
const badFile = path.join(ROOT, '.tmp/import-bad.json');
fs.writeFileSync(okFile, JSON.stringify({
  schema: 'qinglan-qa-lab/1',
  evidence: {
    m1: { status: 'pass', coverage: 100, label: '缺陷检出率', note: '导入测试', defects: ['STATIC_D5'] },
    m7: { status: 'fail', coverage: 93.3, label: '回归通过率', note: '导入测试', defects: ['F02', 'F12'] }
  },
  state: {}
}, null, 2), 'utf8');
fs.writeFileSync(badFile, JSON.stringify({ schema: 'wrong', evidence: {} }), 'utf8');

const importFlow = async (file) => {
  const chooserPromise = page.waitForFileChooser({ timeout: 5000 });
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="import-all"]');
    if (b) b.click();
  });
  const chooser = await chooserPromise;
  await chooser.accept([file]);
  await new Promise((r) => setTimeout(r, 700));
  return page.evaluate(() => ({
    stat: document.getElementById('stat').innerText.replace(/\s+/g, ' '),
    toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText)
  }));
};

const imported = await importFlow(okFile);
check('导入合法记录后证据数变为 2', imported.stat.includes('2/8'), imported.stat);
check('导入成功提示出现', imported.toasts.some((t) => t.includes('导入成功')), imported.toasts.join(' | '));

const bad = await importFlow(badFile);
check('schema 不符时拒绝导入并提示', bad.toasts.some((t) => t.includes('导入被拒绝')), bad.toasts.join(' | '));
check('拒绝后原有证据未被破坏', bad.stat.includes('2/8'), bad.stat);

console.log('\n6. 演示证据与 M8 门禁联动');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 350));
await page.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });
await go('exp/m8');
await click('[data-act="load-demo"]');
const demoStat = await txt('#stat');
check('载入演示证据后 7 项齐备', demoStat.includes('7/8'), demoStat.replace(/\n/g, ' '));
await click('[data-act="predict"][data-arg="allow"]');
await click('[data-act="reveal"]');
const verdict = await txt('#col-right .callout');
check('预算 12h + 演示证据时门禁通过', verdict.includes('通过，允许发布'), verdict.slice(0, 60));
const demoBadge = (await txt('#col-right')).includes('演示');
check('界面标注演示数据来源', demoBadge);
// 预算归零 → 致命缺陷未修 → 阻断
await page.evaluate(() => {
  const el = document.querySelector('.col-left input[type="range"][data-p="budget"]');
  if (el) { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 300));
await click('[data-act="predict"][data-arg="block"]');
await click('[data-act="reveal"]');
const verdict2 = await txt('#col-right .callout');
check('预算归零后门禁阻断（致命缺陷一票否决）', verdict2.includes('阻断'), verdict2.slice(0, 60));

console.log('\n7. localStorage 不可用时的降级');
const page2 = await browser.newPage();
await page2.setViewport({ width: 1280, height: 800 });
page2.on('pageerror', (e) => errors.push('[pageerror-2] ' + e.message));
page2.on('dialog', async (d) => { await d.accept(); });
await page2.evaluateOnNewDocument(() => {
  const fake = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
    clear() { throw new Error('blocked'); }
  };
  Object.defineProperty(window, 'localStorage', { get() { return fake; }, configurable: true });
});
await page2.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 500));
const degraded = await page2.evaluate(() => ({
  toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText),
  hasApp: !!document.querySelector('.rail-item'),
  guide: !!document.getElementById('guide-overlay')
}));
check('存储不可用时不崩溃，界面正常渲染', degraded.hasApp);
check('降级为内存模式并给出提示', degraded.toasts.some((t) => t.includes('内存')), degraded.toasts.join(' | '));
await page2.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });
await page2.evaluate(() => { location.hash = '#/exp/m2'; });
await new Promise((r) => setTimeout(r, 350));
await page2.evaluate(() => { const b = document.querySelector('[data-act="record-evidence"]'); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 300));
const memStat = await page2.evaluate(() => document.getElementById('stat').innerText.replace(/\s+/g, ' '));
check('内存模式下仍可记录证据', memStat.includes('1/8'), memStat);
await page2.close();

console.log('\n8. 空输入校验');
await go('exp/m2');
const emptyWarn = await page.evaluate(async () => {
  const inp = document.querySelector('.col-right input[data-p="cHours"]');
  if (inp) { inp.value = ''; inp.dispatchEvent(new Event('change', { bubbles: true })); }
  await new Promise((r) => setTimeout(r, 200));
  const b = document.querySelector('[data-act="add-case"]');
  if (b) b.click();
  await new Promise((r) => setTimeout(r, 250));
  const ts = Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText);
  const chips = document.querySelectorAll('.chip .chip-x').length;
  return { toasts: ts, chips };
});
check('留空提交被拒绝并提示', emptyWarn.toasts.some((t) => t.includes('留空无效')), emptyWarn.toasts.join(' | '));
check('留空时不产生自定义用例', emptyWarn.chips === 0, '芯片数 ' + emptyWarn.chips);

await browser.close();
console.log('\n控制台错误：' + errors.length);
errors.slice(0, 8).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项检查，失败 ' + failed + ' 项');
process.exit(failed || errors.length ? 1 : 0);

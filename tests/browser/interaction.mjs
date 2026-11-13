/**
 * tests/browser/interaction.mjs — M1~M8 与随堂挑战真实浏览器交互测试
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

await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 300));

const go = async (hash) => {
  await page.evaluate((h) => { location.hash = '#/' + h; }, hash);
  await new Promise((r) => setTimeout(r, 300));
};
const txt = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
}, sel);
const click = async (sel) => {
  const ok = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
  await new Promise((r) => setTimeout(r, 240));
  return ok;
};
const kpi = (labelPart) => page.evaluate((lb) => {
  const tiles = Array.from(document.querySelectorAll('#col-right .kpi-tile'));
  const hit = tiles.find((t) => ((t.querySelector('.kpi-lbl') || {}).innerText || '').includes(lb));
  return hit ? hit.querySelector('.kpi-val').innerText.replace(/\s+/g, ' ').trim() : '';
}, labelPart);

/* ------------------------------------------------------------------ M1 */
console.log('\nM1 静态找茬');
await go('exp/m1');
await click('[data-act="rule-scan"]');
await new Promise((r) => setTimeout(r, 250));
const rBefore = parseFloat(await kpi('抓虫命中率'));
check('M1 自动扫雷后命中率 > 0', rBefore > 0, rBefore + '%');
await click('[data-act="toggle-mark"][data-line="7"]');
const rAfter = parseFloat(await kpi('抓虫命中率'));
check('手工点击第 7 行提升抓虫命中率', rAfter > rBefore, rBefore + '% → ' + rAfter + '%');
await click('[data-act="record-evidence"]');
check('M1 档案记录成功', (await txt('#stat')).includes('1/8'));

/* ------------------------------------------------------------------ M2 & M3 */
console.log('\nM2 等价分区 & M3 边界跳崖');
await go('exp/m2');
await click('[data-act="drop-sample"][data-idx="5"]');
const ballTxt = await txt('#col-right .ball-drop-pill');
check('M2 投球演示触发实际反馈（含具体金额）', (ballTxt.includes('Bug') || ballTxt.includes('落桶')) && !ballTxt.includes('undefined'), ballTxt);
const dmBefore = parseInt(await kpi('捕获暗藏'), 10);
await click('[data-act="combo-preset"]');
const dmAfter = parseInt(await kpi('捕获暗藏'), 10);
check('M2 一键试组合坑捕获 D4 组合缺陷', dmAfter > dmBefore && (await txt('.dmatrix')).includes('抓住了'), dmBefore + ' → ' + dmAfter);

await go('exp/m3');
await click('button[data-p="field"][data-v="seats"]');
await click('[data-act="animate-bv"]');
await new Promise((r) => setTimeout(r, 520));
const bvSpot = await txt('#col-right .ball-drop-pill');
check('M3 动画挨个踩边界点亮高亮步骤', bvSpot.includes('第 ') && bvSpot.includes('步踩在'), bvSpot);

/* ------------------------------------------------------------------ M4 */
console.log('\nM4 决策开关');
await go('exp/m4');
check('完整规则一致率 100%', (await kpi('一致率')).includes('100'));
await click('button[data-p="preset"][data-v="conflict"]');
check('冲突版出现规则打架格', parseInt(await kpi('打架格'), 10) > 0, await kpi('打架格'));
await click('button[data-p="preset"][data-v="missing"]');
check('遗漏版出现灰色盲区', parseInt(await kpi('漏写盲区'), 10) > 0, await kpi('漏写盲区'));
await click('button[data-p="preset"][data-v="complete"]');
await click('[data-act="cycle-cell"][data-r="0"][data-c="0"]');
const cTxt = await txt('[data-act="cycle-cell"][data-r="0"][data-c="0"]');
check('点击条件格实时切换 Y/N/—', cTxt === 'N' || cTxt === '-', '变为 ' + cTxt);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M5 */
console.log('\nM5 状态闯关');
await go('exp/m5');
await click('button[data-p="seatsLeft"][data-v="0"]');
await click('[data-act="fsm-auto"]');
check('满员推荐路线到达候补', (await txt('#col-right .seqbox')).includes('候补'));
await click('[data-act="fsm-bad-demo"]');
check('故意乱点被门卫拦截计数增加', parseInt(await kpi('拦下乱点'), 10) > 0, await kpi('拦下乱点'));
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M6 */
console.log('\nM6 白盒电路');
await go('exp/m6');
const wBefore = parseFloat(await kpi('通关准则'));
await click('button[data-p="criterion"][data-v="condition"]');
await click('[data-act="wb-minset"]');
const wAfter = parseFloat(await kpi('通关准则'));
check('一键最少用例凑齐条件覆盖 100%', wAfter === 100 && wAfter >= wBefore, wBefore + '% → ' + wAfter + '%');
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M7 */
console.log('\nM7 流水线');
await go('exp/m7');
check('v1.2-rc1 默认被红灯拦截', (await kpi('最终落闸')).includes('红灯'));
await click('button[data-p="version"][data-v="v1.0"]');
check('切换 v1.0 稳定版变为绿灯放行', (await kpi('最终落闸')).includes('绿灯'));
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M8 */
console.log('\nM8 发布门禁');
await go('exp/m8');
check('M8 读取已存前序档案', /[5-7]\s*\/\s*7/.test(await kpi('证据档案')), await kpi('证据档案'));
await click('[data-act="guess"][data-v="BLOCK"]');
const res8 = await kpi('总控台');
check('先猜后揭晓正常给出结论', /发射|拦停|不能拍板/.test(res8), res8);
await click('[data-act="toggle-demo"]');
await page.evaluate(() => {
  const r = document.querySelector('input[type="range"][data-p="budget"]');
  if (r) { r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 250));
check('预算归零且演示证据开启时致命缺陷拦截发布', (await kpi('总控台')).includes('拦停'), await kpi('总控台'));

/* ------------------------------------------------------------------ 随堂挑战 */
console.log('\n随堂挑战单选/多选/填空');
await go('exp/m2');
await click('[data-act="exp-tab"][data-t="quiz"]');
const qCnt = await page.evaluate(() => document.querySelectorAll('#view .qcard').length);
check('M2 随堂测呈现 5 题', qCnt === 5);
await click('.qcard[data-qid] [data-act="quiz-pick"]');
const hasExp = await page.evaluate(() => !!document.querySelector('#view .q-explain .qe-opts li'));
check('单选作答后展开逐项解析', hasExp);
await click('.qcard[data-qid] [data-act="quiz-toggle"]');
await click('.qcard[data-qid] [data-act="quiz-submit-multi"]');
await page.evaluate(() => {
  const inp = document.querySelector('#view input[data-q-fill]');
  if (inp) { inp.value = '边界'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await click('#view [data-act="quiz-submit-fill"]');
const exCnt = await page.evaluate(() => document.querySelectorAll('#view .q-explain').length);
check('多选与填空均可正常批改', exCnt >= 3, '已批改 ' + exCnt + ' 题');

await go('quiz');
await click('[data-act="quiz-filter"][data-fk="topic"][data-fv="m5"]');
check('按 M5 筛选 5 题', (await page.evaluate(() => document.querySelectorAll('#view .qcard').length)) === 5);
await click('[data-act="quiz-filter"][data-fk="topic"][data-fv="all"]');
await click('[data-act="quiz-filter"][data-fk="type"][data-fv="fill"]');
check('按填空筛选 10 题', (await page.evaluate(() => document.querySelectorAll('#view .qcard').length)) === 10);
await click('[data-act="quiz-filter"][data-fk="type"][data-fv="all"]');
await click('[data-act="quiz-filter"][data-fk="mode"][data-fv="quick5"]');
check('只刷前5题模式准确', (await page.evaluate(() => document.querySelectorAll('#view .qcard').length)) === 5);

const finalStat = await txt('#stat');
check('顶部计数同步更新', /档案\s*[5-8]\/8/.test(finalStat) && /答题\s*3\/48/.test(finalStat), finalStat);

await browser.close();
console.log('\n控制台错误：' + errors.length);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项检查，失败 ' + failed + ' 项');
process.exit(failed || errors.length ? 1 : 0);

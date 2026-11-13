/**
 * tests/browser/interaction.mjs — 关键实验路径的真实浏览器交互测试
 * 覆盖：M1 标注、M4 编辑规则/冲突、M5 事件序列、M6 自动补齐、M7 流水线与失效提示、M8 预测与揭晓。
 * 用法：node tests/browser/interaction.mjs
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
// 关闭引导
await page.evaluate(() => { const o = document.getElementById('guide-overlay'); if (o) o.remove(); });

const go = async (hash) => {
  await page.evaluate((h) => { location.hash = '#/' + h; }, hash);
  await new Promise((r) => setTimeout(r, 320));
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
  await new Promise((r) => setTimeout(r, 260));
  return ok;
};
const metric = (label) => page.evaluate((lb) => {
  const cards = Array.from(document.querySelectorAll('#col-right .metric'));
  const hit = cards.find((c) => (c.querySelector('.m-l') || {}).innerText === lb);
  return hit ? hit.querySelector('.m-v').innerText.replace(/\s+/g, ' ').trim() : '';
}, label);

const setSelect = async (key, val) => {
  await page.evaluate((k, v) => {
    const el = document.querySelector('.col-left select[data-p="' + k + '"]');
    if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
  }, key, val);
  await new Promise((r) => setTimeout(r, 300));
};
const setRange = async (key, val) => {
  await page.evaluate((k, v) => {
    const el = document.querySelector('.col-left input[type="range"][data-p="' + k + '"]');
    if (el) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }
  }, key, val);
  await new Promise((r) => setTimeout(r, 300));
};

/* ------------------------------------------------------------------ M1 */
console.log('\nM1 静态审查');
await go('exp/m1');
await click('[data-act="scan-rules"]');
const m1marked = await metric('已标注行数');
const m1rate = await metric('缺陷检出率');
check('规则扫描后产生标注', Number(m1marked) > 0, '已标注行数 ' + m1marked);
check('规则扫描检出率 > 0', parseFloat(m1rate) > 0, '检出率 ' + m1rate);

// 手工标注一行（第 7 行）→ 检出率应上升
const before = parseFloat(m1rate);
await page.evaluate(() => {
  const el = document.querySelector('[data-act="toggle-line"][data-arg="7"]');
  if (el) el.click();
});
await new Promise((r) => setTimeout(r, 250));
const after = parseFloat(await metric('缺陷检出率'));
check('手工标注第 7 行使检出率上升', after > before, before + '% → ' + after + '%');
await click('[data-act="record-evidence"]');
const evStat = await txt('#stat');
check('M1 证据已记录', evStat.includes('1/8'), evStat);

/* ------------------------------------------------------------------ M4 */
console.log('\nM4 决策表');
await go('exp/m4');
const acc1 = await metric('与规格一致率');
check('完整规则表一致率 100%', acc1.includes('100'), acc1);
await setSelect('preset', 'conflict');
const conflictCount = await metric('冲突组合');
check('冲突版出现冲突组合', Number(conflictCount) > 0, '冲突组合 ' + conflictCount);
await setSelect('preset', 'missing');
const uncov = await metric('未覆盖组合');
check('遗漏版出现未覆盖组合', Number(uncov) > 0, '未覆盖 ' + uncov);
// 手工切换一个条件格
await setSelect('preset', 'complete');
await click('[data-act="cycle-cell"][data-arg="0:0"]');
const r1c1 = await page.evaluate(() => {
  const b = document.querySelector('[data-act="cycle-cell"][data-arg="0:0"]');
  return b ? b.textContent.trim() : '';
});
check('点击条件格后取值循环', r1c1 === 'N' || r1c1 === '—', 'C1 变为 ' + r1c1);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M5 */
console.log('\nM5 状态迁移');
await go('exp/m5');
await setSelect('preset', 'waitlist');
const m5legend = await txt('#col-right .fsm-legend');
const m5seq = await txt('#col-right .seqbox');
check('满员预设经过候补状态', m5seq.includes('候补') || m5legend.includes('候补'), m5seq);
check('放弃候补后进入已取消', m5legend.includes('已取消'), m5legend.split('已访问')[0]);
const m5trans = await metric('迁移覆盖');
check('迁移覆盖有数值', parseFloat(m5trans) > 0, '迁移覆盖 ' + m5trans);
await page.evaluate(() => { const b = document.querySelector('[data-act="push-event"][data-arg="attend"]'); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 250));
const m5invalid = await metric('无效操作');
check('候补态签到记为无效操作', Number(m5invalid) > 0, '无效操作 ' + m5invalid);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M6 */
console.log('\nM6 白盒覆盖');
await go('exp/m6');
const condBefore = await metric('条件覆盖');
await setSelect('criterion', 'condition');
await setSelect('autoBudget', '12');
const condAfter = await metric('条件覆盖');
check('自动补齐后条件覆盖率提升', parseFloat(condAfter) > parseFloat(condBefore), condBefore + ' → ' + condAfter);
await page.evaluate(() => { const b = document.querySelector('[data-act="select-min"]'); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 350));
const condMin = await metric('条件覆盖');
check('按准则选出最少用例后条件覆盖达 100%', condMin.includes('100'), condMin);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M7 */
console.log('\nM7 回归流水线');
await go('exp/m7');
check('未执行时证据按钮被禁用', (await txt('#col-right')).includes('尚未执行流水线'));
await click('[data-act="run-pipeline"]');
const m7rate = await metric('通过率');
const m7gate = await metric('门禁');
check('v1.2-rc1 通过率 93.3%', m7rate.includes('93.3'), m7rate);
check('门禁阻断', m7gate.includes('阻断'), m7gate);
const failCount = await page.evaluate(() => document.querySelectorAll('#col-right tr.row-fail').length);
check('失败用例 2 条', failCount === 2, '表格中失败行 ' + failCount);
// 改阈值 → 结果失效提示
await setRange('minPassRate', 90);
const staleBanner = (await txt('#col-right')).includes('已失效');
check('改参数后出现结果失效提示', staleBanner);
await click('[data-act="run-pipeline"]');
const m7gate1b = await metric('门禁');
check('仅降低通过率阈值仍被其他判据阻断', m7gate1b.includes('阻断'), '门禁 ' + m7gate1b);
// 放宽策略：允许 2 条失败并关闭冒烟一票否决
await page.evaluate(() => {
  const el = document.querySelector('.col-left input[data-p="maxFailures"]');
  if (el) { el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 250));
const smokeBox = await page.evaluate(() => {
  const el = document.querySelector('.col-left input[data-p="requireSmoke"]');
  if (el && el.checked) { el.click(); return true; }
  return false;
});
await new Promise((r) => setTimeout(r, 250));
await click('[data-act="run-pipeline"]');
const m7gate2 = await metric('门禁');
check('放宽全部判据后门禁才通过', m7gate2.includes('通过'), '冒烟开关改动=' + smokeBox + '，门禁 ' + m7gate2);
await click('[data-act="compare"]');
const cmp = (await txt('#col-right')).includes('新增失败');
check('版本对比给出新增失败结论', cmp);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ M8 */
console.log('\nM8 质量门禁');
await go('exp/m8');
const m8ev = await metric('证据完备度');
check('M8 读到前序证据', /[5-7]\/7/.test(m8ev), '证据完备度 ' + m8ev);
await click('[data-act="reveal"]');
const blockedHint = (await txt('#col-right')).includes('请先选择一个预测');
check('未预测时揭晓被拒绝', blockedHint);
await click('[data-act="predict"][data-arg="block"]');
await click('[data-act="reveal"]');
const verdict = await txt('#col-right .callout');
check('揭晓后给出门禁结论与预测对比', /门禁结论/.test(verdict) && /判断/.test(verdict), verdict.slice(0, 80));
const minBudget = (await txt('#col-right')).includes('再投入') || (await txt('#col-right')).includes('无法通过门禁');
check('给出最小修复预算结论', minBudget);
await click('[data-act="record-evidence"]');

/* ------------------------------------------------------------------ 随堂自测与综合题库 */
console.log('\n随堂自测与题库');
await go('exp/m2');
await click('[data-act="exp-tab"][data-arg="quiz"]');
const expQuizCount = await page.evaluate(() => document.querySelectorAll('#view .qcard').length);
check('M2 随堂自测渲染 5 题（单选/多选/填空）', expQuizCount === 5, '题数 ' + expQuizCount);
await click('.qcard[data-qid] [data-act="quiz-pick"]');
const explainMeta = await page.evaluate(() => ({
  hasExplain: !!document.querySelector('#view .q-explain'),
  optNotes: document.querySelectorAll('#view .qe-opts li').length
}));
check('单选作答后显示逐项自然解析', explainMeta.hasExplain && explainMeta.optNotes >= 4, '解析项 ' + explainMeta.optNotes);
await click('.qcard[data-qid] [data-act="quiz-toggle"]');
await click('.qcard[data-qid] [data-act="quiz-submit-multi"]');
const multiGraded = await page.evaluate(() => document.querySelectorAll('#view .q-explain').length >= 2);
check('多选题支持勾选并批改', multiGraded);
await page.evaluate(() => {
  const inp = document.querySelector('#view input[data-fill-qid]');
  if (inp) { inp.value = '边界'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await click('#view [data-act="quiz-submit-fill"]');
const fillGraded = await page.evaluate(() => document.querySelectorAll('#view .q-explain').length >= 3);
check('填空题支持输入并批改', fillGraded);
await click('[data-act="exp-tab"][data-arg="lab"]');

await go('quiz');
await click('[data-act="quiz-topic"][data-arg="m5"]');
const m5QuizCount = await page.evaluate(() => document.querySelectorAll('#view .qcard').length);
check('题库支持按模块过滤（M5 共 5 题）', m5QuizCount === 5, '筛选结果 ' + m5QuizCount);
await click('[data-act="quiz-topic"][data-arg="all"]');
await click('[data-act="quiz-type"][data-arg="fill"]');
const fillFilterCount = await page.evaluate(() => document.querySelectorAll('#view .qcard').length);
check('题库支持按题型过滤（填空共 10 题）', fillFilterCount === 10, '筛选结果 ' + fillFilterCount);
await click('[data-act="quiz-type"][data-arg="all"]');
await click('[data-act="quiz-exam"]');
const examCount = await page.evaluate(() => document.querySelectorAll('#view .qcard').length);
check('10 题随机抽测模式可用', examCount === 10, '抽测题数 ' + examCount);

/* ------------------------------------------------------------ 状态一致性 */
console.log('\n跨实验一致性');
const stat = await txt('#stat');
check('状态栏显示累计证据', /证据\s*[4-8]\/8/.test(stat.replace(/\n/g, ' ')), stat.replace(/\n/g, ' '));
check('状态栏同步显示自测题数', /自测\s*\d+\/48/.test(stat.replace(/\n/g, ' ')), stat.replace(/\n/g, ' '));

await browser.close();

console.log('\n控制台错误：' + errors.length);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
const failed = results.filter((r) => !r.ok).length;
console.log('\n合计 ' + results.length + ' 项检查，失败 ' + failed + ' 项' + (errors.length ? '，控制台错误 ' + errors.length + ' 条' : ''));
process.exit(failed || errors.length ? 1 : 0);

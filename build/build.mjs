/**
 * build.mjs — 把 src/ 下的模块拼成单文件 index.html
 * 用法：node build/build.mjs [--check]
 * 顺序即依赖顺序，不引入打包器，保持产物可读、可审阅。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ORDER = [
  'src/core/spec.js',
  'src/core/equivalence.js',
  'src/core/boundary.js',
  'src/core/decision.js',
  'src/core/fsm.js',
  'src/core/whitebox.js',
  'src/core/regression.js',
  'src/core/quality.js',
  'src/core/staticreview.js',
  'src/core/knowledge.js',
  'src/core/quiz.js',
  'src/ui/util.js',
  'src/ui/graph.js',
  'src/ui/shell.js',
  'src/modules/m1.js',
  'src/modules/m2.js',
  'src/modules/m3.js',
  'src/modules/m4.js',
  'src/modules/m5.js',
  'src/modules/m6.js',
  'src/modules/m7.js',
  'src/modules/m8.js'
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, '');

function main() {
  const css = read('src/styles.css');
  const tpl = read('src/template.html');

  const missing = ORDER.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length) {
    console.error('缺少源文件：\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  const parts = [];
  for (const p of ORDER) {
    const code = read(p);
    if (/<\/script/i.test(code)) {
      console.error(`${p} 含有 </script 字面量，会导致内联脚本被提前截断`);
      process.exit(1);
    }
    parts.push(`/* ===== ${p} ===== */\n${code}`);
  }
  const js = parts.join('\n\n');
  const html = tpl.replace('/*__STYLE__*/', () => css.trim()).replace('/*__SCRIPT__*/', () => js);

  const out = path.join(ROOT, 'index.html');
  fs.writeFileSync(out, html, 'utf8');

  // 同步一份到 dist/，供 Cloudflare 部署使用（只发布这一个文件）
  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');

  const problems = validate(html);
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log(`已生成 index.html：${kb} KB，${html.split('\n').length} 行，${ORDER.length} 个源文件（同时写入 dist/）`);
  if (problems.length) {
    console.error('校验未通过：');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(2);
  }
  console.log('校验通过：无外链资源、无 eval / new Function、模块注册数 = ' + countExp(html));
  if (process.argv.includes('--check')) {
    console.log('（--check 模式：仅生成与校验，不做其他操作）');
  }
}

function countExp(html) {
  return (html.match(/WB\.registerExp\(\{/g) || []).length;
}

function validate(html) {
  const problems = [];
  const external = [
    [/<script[^>]+\bsrc=/i, '存在外部 script 引用'],
    [/<link[^>]+\bhref=/i, '存在 <link> 外部样式引用'],
    [/@import\s+url/i, 'CSS 中存在 @import'],
    [/\bsrc="https?:/i, '存在 http(s) 资源引用'],
    [/url\(\s*['"]?https?:/i, 'CSS 中存在 http(s) url()']
  ];
  external.forEach(([re, msg]) => { if (re.test(html)) problems.push(msg); });
  if (/\beval\s*\(/.test(html)) problems.push('存在 eval(');
  if (/new\s+Function\s*\(/.test(html)) problems.push('存在 new Function(');
  if (countExp(html) !== 8) problems.push('实验模块注册数不是 8（实际 ' + countExp(html) + '）');
  if (!/id="app"/.test(html)) problems.push('缺少 #app 挂载点');
  return problems;
}

main();

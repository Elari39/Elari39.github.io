#!/usr/bin/env node
/**
 * 构建产物守卫。
 *
 * 这个脚本不看源码，只看 `dist/`：它回答的问题是「发布出去的东西，是不是
 * 我们答应的那个样子」。所以每条检查都对应一条对外承诺：
 *
 *   结构     —— 该有的页面一个不少（含 404.html，GitHub Pages 直接用它）
 *   SEO      —— canonical / description / OG 齐全，且都指向用户站点地址
 *   内容     —— 条目数、order 唯一、仓库链接指向自己的 GitHub
 *   链接     —— 站内链接与图片在 dist 里确实存在（占位图 / 拼错路径当场暴露）
 *   CSP      —— 生产构建里有 CSP，且**每个内联脚本的哈希都在策略里**
 *   零外链   —— 运行时不请求任何第三方资源
 *   无内联样式 —— 因为 style-src 没有 'unsafe-inline'，行内 style 会被拦掉
 *   可访问性 —— 唯一的 h1、lang、skip link、img 都有 alt 与宽高、装饰 SVG 都 aria-hidden
 *   锚点     —— 每个 #锚点都要在目标页里真的存在对应的 id
 *   对比度   —— 用 global.css 里的真实 token 算 WCAG 比值，三套主题都算
 *   体积     —— 客户端 JS（gzip）与 CSS 都不超过预算
 *   反漂移   —— 首页数字条上的两个数字必须与这里的预算常量一致
 *
 * 零依赖：只用 node: 内置模块。跑法：pnpm guard
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const SITE_URL = 'https://elari39.github.io';
const OWNER = 'github.com/Elari39/';

/** 客户端 JS 预算（gzip 后，全部 .js 之和）。首页只有一个主题切换脚本。 */
const JS_BUDGET_BYTES = 4096;

/** CSS 预算（未压缩字节）。装饰、底纹与动效全在 global.css 里，得给它一条上限。 */
const CSS_BUDGET_BYTES = 48 * 1024;

const failures = [];
const notes = [];

function ok(message) {
  console.log(`  \u001b[32m✓\u001b[0m ${message}`);
}

function bad(message, detail) {
  failures.push(detail ? `${message}\n      ${detail}` : message);
  console.log(`  \u001b[31m✗\u001b[0m ${message}`);
}

function section(title) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
}

function check(condition, message, detail) {
  if (condition) ok(message);
  else bad(message, detail);
  return condition;
}

/* ------------------------------------------------------------------ 解析工具 */

/** 把路由映射到 dist 里的文件：目录格式 + 尾斜杠 */
function fileForRoute(route) {
  const clean = route.split('#')[0].split('?')[0];
  if (clean === '/') return path.join(DIST, 'index.html');
  if (clean.endsWith('/')) return path.join(DIST, clean.slice(1), 'index.html');
  return path.join(DIST, clean.slice(1));
}

/**
 * 收集所有匹配。
 * String.prototype.matchAll 对非 global 正则直接抛 TypeError，所以这里统一补上
 * g 标志，而不是要求每个调用点都记得写 —— 少一类自己踩自己的坑。
 */
function matchAll(html, regex) {
  const global = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
  return [...html.matchAll(global)].map((match) => match[0]);
}

function attributeOf(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match ? match[1] : undefined;
}

/** 找出所有 <script> 元素的内容（不含 src 的才算内联） */
function inlineScripts(html) {
  const found = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    found.push({ attrs, body: match[2] ?? '' });
  }
  return found;
}

/** 页面里所有 id 值 —— 用来核对页内锚点能不能落地 */
function idsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/\bid\s*=\s*"([^"]*)"/gi)) found.add(match[1]);
  return found;
}

function sha256base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

/* -------------------------------------------------------------- 对比度计算器 */

function relativeLuminance(hex) {
  const value = hex.replace('#', '').trim();
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** 从 global.css 里取出某个块里的全部 --c-* token */
function tokensFromBlock(css, blockStart) {
  const start = css.indexOf(blockStart);
  if (start === -1) return {};
  const end = css.indexOf('}', start);
  const block = css.slice(start, end);
  const tokens = {};
  for (const match of block.matchAll(/--(c-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1].replace(/^c-/, '')] = match[2];
  }
  return tokens;
}

/* --------------------------------------------------------------------- 主流程 */

console.log('\u001b[1mAshen Witch\'s Grimoire — 构建产物守卫\u001b[0m');
console.log(`dist: ${DIST}`);

if (!existsSync(DIST)) {
  console.error('\n\u001b[31m没有 dist/ —— 先跑 pnpm build\u001b[0m');
  process.exit(1);
}

/* --- 1. 条目来源（用来核对条目数与 order 唯一性） --- */
const contentDir = path.join(ROOT, 'src', 'content', 'projects');
const entryFiles = (await readdir(contentDir)).filter((name) => name.endsWith('.md'));
const entries = [];
for (const name of entryFiles) {
  const text = await readFile(path.join(contentDir, name), 'utf8');
  const order = Number(/^order:\s*(\d+)\s*$/m.exec(text)?.[1] ?? NaN);
  const draft = /^draft:\s*true\s*$/m.test(text);
  entries.push({ slug: name.replace(/\.md$/, ''), order, draft });
}
const published = entries.filter((entry) => !entry.draft);

/** 图版尺寸声明（由 pnpm assets 生成）：页面里的 <img class="plate"> 必须在其中 */
const platesSource = await readFile(path.join(ROOT, 'src', 'data', 'plates.ts'), 'utf8');
const declaredPlates = new Set(
  [...platesSource.matchAll(/"([^"]+)":\s*\{\s*width:/g)].map((match) => match[1]),
);

/* --- 2. 结构 --- */
section('结构');

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap-index.xml',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'og.png',
];
for (const file of REQUIRED_FILES) {
  check(existsSync(path.join(DIST, file)), `存在 ${file}`);
}

for (const entry of published) {
  check(
    existsSync(path.join(DIST, 'projects', entry.slug, 'index.html')),
    `存在 projects/${entry.slug}/index.html`,
  );
}

/* --- 3. 逐页检查 --- */
section('页面：SEO / 链接 / 可访问性 / CSP');

const routes = ['/', '/about/', ...published.map((entry) => `/projects/${entry.slug}/`)];

/** 按需读取任一目标页的 id 集合，用于核对 #锚点 */
const idCache = new Map();
async function idsForRoute(route) {
  if (!idCache.has(route)) {
    const file = fileForRoute(route);
    idCache.set(route, existsSync(file) ? idsOf(await readFile(file, 'utf8')) : new Set());
  }
  return idCache.get(route);
}
const siteLd = new Set();

for (const route of routes) {
  const file = fileForRoute(route);
  if (!existsSync(file)) {
    bad(`页面缺失：${route}`);
    continue;
  }

  const html = await readFile(file, 'utf8');
  const label = route;

  // --- SEO
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  check(title.length > 0, `${label} 有 <title>`);

  const description = attributeOf(
    matchAll(html, /<meta\b[^>]*name="description"[^>]*>/i)[0] ?? '',
    'content',
  );
  check(
    Boolean(description && description.length >= 20),
    `${label} 有 meta description`,
  );

  const canonical = attributeOf(
    matchAll(html, /<link\b[^>]*rel="canonical"[^>]*>/i)[0] ?? '',
    'href',
  );
  const expectedCanonical = new URL(route, SITE_URL).href;
  check(
    canonical === expectedCanonical,
    `${label} canonical 正确`,
    canonical ? `实际 ${canonical}，期望 ${expectedCanonical}` : '没有 canonical',
  );

  const ogImage = attributeOf(matchAll(html, /<meta\b[^>]*property="og:image"[^>]*>/i)[0] ?? '', 'content');
  check(
    ogImage === `${SITE_URL}/og.png`,
    `${label} og:image 指向绝对地址`,
    ogImage ?? '缺失',
  );

  // --- 站内链接与图片在 dist 里确实存在
  const hrefs = matchAll(html, /<a\b[^>]*href="([^"]*)"/gi)
    .map((tag) => attributeOf(tag, 'href') ?? '')
    .filter(Boolean);
  const broken = [];
  for (const href of hrefs) {
    if (/^(https?:|mailto:|tel:)/i.test(href)) continue;
    if (href.startsWith('#')) continue;
    const target = fileForRoute(href);
    if (!existsSync(target)) broken.push(href);
  }
  check(broken.length === 0, `${label} 站内链接全部可达`, broken.join(', '));

  // --- 页内锚点：每个 #x 都要在目标页里真的存在 id="x"
  // 详情页目录完全靠这个契约 —— 正文标题的 id 是构建期生成的，写错不会报错，
  // 只会在浏览器里默默跳不动。
  const brokenFragments = [];
  for (const href of hrefs) {
    const hashIndex = href.indexOf('#');
    if (hashIndex === -1) continue;
    const pathPart = href.slice(0, hashIndex);
    const fragment = href.slice(hashIndex + 1);
    if (!fragment) continue; // 光一个「#」没有目标可核对
    const ids = await idsForRoute(pathPart === '' ? route : pathPart);
    if (!ids.has(fragment)) brokenFragments.push(href);
  }
  check(brokenFragments.length === 0, `${label} 页内锚点都能落地`, brokenFragments.join(', '));

  // --- 同页 id 不得重复：重复 id 会让锚点跳到第一个，也会让 SVG 的
  // 渐变 / 滤镜引用错元素（印记里的 <linearGradient id> 就属于这一类）
  const idList = [...html.matchAll(/\bid\s*=\s*"([^"]*)"/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(idList.filter((id, index) => idList.indexOf(id) !== index))];
  check(duplicateIds.length === 0, `${label} 页内 id 不重复`, duplicateIds.join(', '));

  const sources = [
    ...matchAll(html, /<img\b[^>]*>/gi).map((tag) => attributeOf(tag, 'src') ?? ''),
    ...matchAll(html, /<link\b[^>]*>/gi).map((tag) => attributeOf(tag, 'href') ?? ''),
  ].filter(Boolean);
  const missingAssets = sources.filter((src) => {
    if (/^(https?:|data:)/i.test(src)) return false;
    return !existsSync(path.join(DIST, src.replace(/^\//, '').split('?')[0]));
  });
  check(missingAssets.length === 0, `${label} 引用的本地资源都存在`, missingAssets.join(', '));

  // 图版必须在 plates.ts 里声明过尺寸 —— 否则 <img> 没有 width/height，会跳版
  const plateImages = matchAll(html, /<img\b[^>]*class="plate"[^>]*>/gi)
    .map((tag) => attributeOf(tag, 'src') ?? '')
    .filter(Boolean);
  const undeclaredPlates = plateImages.filter(
    (src) => !declaredPlates.has(src.replace(/^\//, '')),
  );
  check(
    undeclaredPlates.length === 0,
    `${label} 图版尺寸已声明（${plateImages.length} 张）`,
    undeclaredPlates.join(', '),
  );

  // --- 可访问性
  const h1Count = matchAll(html, /<h1\b/gi).length;
  check(h1Count === 1, `${label} 恰好一个 <h1>`, `实际 ${h1Count} 个`);
  check(/<html\b[^>]*lang="zh-CN"/i.test(html), `${label} <html lang="zh-CN">`);
  check(/class="skip-link"/.test(html), `${label} 有跳到主内容的链接`);
  const imagesWithoutAlt = matchAll(html, /<img\b[^>]*>/gi).filter(
    (tag) => !/\balt\s*=/.test(tag),
  );
  check(imagesWithoutAlt.length === 0, `${label} 图片都有 alt`, imagesWithoutAlt.join(' '));

  // 图片一律要声明宽高：否则图片加载完成前占不住位置，会累计布局偏移
  const imagesWithoutSize = matchAll(html, /<img\b[^>]*>/gi).filter(
    (tag) => !/\bwidth\s*=/.test(tag) || !/\bheight\s*=/.test(tag),
  );
  check(
    imagesWithoutSize.length === 0,
    `${label} 图片都声明了 width/height`,
    imagesWithoutSize.slice(0, 2).join(' '),
  );

  // 装饰性 SVG 不得进入可访问性树 —— 需要语义的图形请改用 <img alt="…">
  const svgsWithoutHidden = matchAll(html, /<svg\b[^>]*>/gi).filter(
    (tag) => !/\baria-hidden\s*=\s*"true"/i.test(tag),
  );
  check(
    svgsWithoutHidden.length === 0,
    `${label} 装饰 SVG 都标了 aria-hidden`,
    svgsWithoutHidden.slice(0, 2).join(' '),
  );

  // skip-link 指向的 #main 此前从来没被检查过
  check(/\bid\s*=\s*"main"/.test(html), `${label} 有 id="main" 作为跳到主内容的目标`);

  // --- 零第三方资源
  const thirdParty = [
    ...matchAll(html, /<(?:img|script|link|iframe|source)\b[^>]*>/gi),
  ].filter((tag) => {
    const url = attributeOf(tag, 'src') ?? attributeOf(tag, 'href') ?? '';
    return /^https?:\/\//i.test(url) && !url.startsWith(SITE_URL);
  });
  check(thirdParty.length === 0, `${label} 没有第三方资源引用`, thirdParty.join(' '));

  // --- 行内 style（style-src 没有 unsafe-inline，行内样式会被拦掉）
  const inlineStyles = matchAll(html, /<[^>]+\bstyle\s*=\s*"[^"]*"[^>]*>/gi);
  check(inlineStyles.length === 0, `${label} 没有行内 style 属性`, inlineStyles.slice(0, 2).join(' '));

  // --- CSP：策略存在，且每个内联脚本的哈希都在里面
  const cspTag = matchAll(html, /<meta\b[^>]*content-security-policy[^>]*>/i)[0];
  const csp = cspTag ? attributeOf(cspTag, 'content') ?? '' : '';
  check(Boolean(csp), `${label} 有 CSP meta`);

  if (csp) {
    check(/default-src 'self'/.test(csp), `${label} CSP 含 default-src 'self'`);
    check(!/unsafe-inline/.test(csp), `${label} CSP 没有 unsafe-inline`);
    check(/object-src 'none'/.test(csp), `${label} CSP 含 object-src 'none'`);

    for (const script of inlineScripts(html)) {
      // JSON-LD 是数据块，不是可执行脚本，不受 script-src 约束
      if (/type\s*=\s*"application\/ld\+json"/i.test(script.attrs)) continue;
      const hash = `'sha256-${sha256base64(script.body)}'`;
      check(
        csp.includes(hash),
        `${label} 内联脚本的哈希已在 CSP 中放行`,
        `脚本开头：${script.body.slice(0, 60)}…`,
      );
    }

    // JSON-LD 至少要有站点级结构化数据
    const ldBlocks = inlineScripts(html).filter((script) =>
      /application\/ld\+json/i.test(script.attrs),
    );
    if (ldBlocks.length > 0) {
      try {
        const parsed = JSON.parse(ldBlocks[0].body);
        siteLd.add(parsed['@type']);
        ok(`${label} 有可解析的 JSON-LD（${ldBlocks.length} 块）`);
      } catch (error) {
        bad(`${label} JSON-LD 可解析`, String(error));
      }
    }
  }
}

/* --- 4. 内容完备性 --- */
section('内容完备性');

const orders = published.map((entry) => entry.order);
check(
  orders.every((order) => Number.isInteger(order) && order > 0),
  '每个条目都有正整数 order',
  JSON.stringify(orders),
);
check(new Set(orders).size === orders.length, 'order 互不重复', JSON.stringify(orders));
check(published.length >= 3, `至少 3 个已发布条目（当前 ${published.length}）`);

for (const entry of published) {
  const html = await readFile(path.join(DIST, 'projects', entry.slug, 'index.html'), 'utf8');
  check(
    html.includes(OWNER),
    `条目 ${entry.slug} 链到自己的 GitHub 仓库`,
  );
  const highlights = matchAll(
    await readFile(path.join(contentDir, `${entry.slug}.md`), 'utf8'),
    /^\s{2}- "/gm,
  ).length;
  check(highlights >= 3, `条目 ${entry.slug} 至少 3 条亮点（当前 ${highlights}）`);
}

/* --- 5. robots.txt 与 sitemap --- */
section('robots.txt 与 sitemap');

const robots = await readFile(path.join(DIST, 'robots.txt'), 'utf8');
check(/Sitemap:\s*https:\/\/elari39\.github\.io\/sitemap-index\.xml/.test(robots), 'robots.txt 指向 sitemap 索引');

const sitemapFiles = (await readdir(DIST)).filter((name) => /^sitemap.*\.xml$/.test(name));
const sitemapLocs = new Set();
for (const name of sitemapFiles) {
  const xml = await readFile(path.join(DIST, name), 'utf8');
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapLocs.add(match[1].trim());
  }
}
const missingFromSitemap = routes
  .map((route) => new URL(route, SITE_URL).href)
  .filter((url) => !sitemapLocs.has(url));
check(
  missingFromSitemap.length === 0,
  `sitemap 收录全部 ${routes.length} 个页面`,
  missingFromSitemap.join(', '),
);
check(
  ![...sitemapLocs].some((loc) => loc.endsWith('/404.html')),
  'sitemap 未收录 404 页',
);

/* --- 6. 对比度（用 global.css 里的真实 token 计算） --- */
section('对比度（WCAG）');

const css = await readFile(path.join(ROOT, 'src', 'styles', 'global.css'), 'utf8');
// 默认主题（新粗野主义）是基础层，token 写在 :root 上；羊皮纸与灰烬是它之上的
// 覆盖，只能手动选到 —— 但三套一样要过对比度：主题是用户自己选的，
// 可读性不是可选项。
const themes = {
  新粗野主义: tokensFromBlock(css, ':root {'),
  羊皮纸: tokensFromBlock(css, "[data-theme='light'] {"),
  灰烬: tokensFromBlock(css, "[data-theme='dark'] {"),
};

/** [前景, 背景, 最低要求, 说明] —— 正文与标记都是小字号，按 4.5 要求 */
const PAIRS = [
  ['body', 'canvas', 4.5, '正文'],
  ['ink', 'canvas', 4.5, '标题'],
  ['muted', 'canvas', 4.5, '次要文字'],
  ['muted-soft', 'canvas', 4.5, '页脚小字'],
  ['primary-ink', 'canvas', 4.5, '链接'],
  ['teal', 'canvas', 4.5, 'teal 标记'],
  ['amber', 'canvas', 4.5, 'amber 标记'],
  ['on-primary', 'primary', 4.5, '主按钮文字'],
  ['primary', 'canvas', 3.0, '强调色（大字号 / 装饰）'],
];

for (const [themeName, tokens] of Object.entries(themes)) {
  check(Object.keys(tokens).length > 0, `读到 ${themeName} 主题的 token`);
  for (const [foreground, background, minimum, label] of PAIRS) {
    const fg = tokens[foreground];
    const bg = tokens[background];
    if (!fg || !bg) {
      bad(`${themeName}：找不到 ${foreground} / ${background} token`);
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    check(
      ratio >= minimum,
      `${themeName} · ${label} ${fg} on ${bg} = ${ratio.toFixed(2)}:1（需 ≥ ${minimum}）`,
    );
  }
}

// 三套主题不能是"照抄一份、看不出区别"。这一步同时证明了三个 token 块都真的
// 被读到了 —— 选择器名写错（比如默认主题换了地方）会在这里露出来。
const canvases = Object.values(themes).map((tokens) => tokens.canvas);
check(
  canvases.every(Boolean) && new Set(canvases).size === canvases.length,
  `三套主题的画布色互不相同（${canvases.join(' / ')}）`,
);

/* --- 7. 体积预算 --- */
section('体积预算');

const astroDir = path.join(DIST, '_astro');
let externalRaw = 0;
let externalGzip = 0;
let externalCount = 0;
if (existsSync(astroDir)) {
  for (const name of await readdir(astroDir)) {
    if (!name.endsWith('.js')) continue;
    const content = await readFile(path.join(astroDir, name));
    externalCount += 1;
    externalRaw += content.length;
    externalGzip += gzipSync(content).length;
  }
}

// 内联脚本也要算进预算：Astro 会把体积很小的打包脚本内联进 HTML，
// 只统计 dist/_astro/*.js 会写成一个"永远为 0、永远通过"的假守卫。
const indexHtmlEarly = await readFile(path.join(DIST, 'index.html'), 'utf8');
let inlineRaw = 0;
let inlineGzip = 0;
for (const script of inlineScripts(indexHtmlEarly)) {
  if (/application\/ld\+json/i.test(script.attrs)) continue; // 数据块，不是要执行的代码
  const bytes = Buffer.from(script.body, 'utf8');
  inlineRaw += bytes.length;
  inlineGzip += gzipSync(bytes).length;
}

const jsGzip = externalGzip + inlineGzip;
notes.push(
  `客户端 JS：外链 ${externalCount} 个文件 ${(externalRaw / 1024).toFixed(1)} KB` +
    ` + 内联 ${(inlineRaw / 1024).toFixed(2)} KB = ${(jsGzip / 1024).toFixed(2)} KB（gzip）`,
);
check(
  jsGzip <= JS_BUDGET_BYTES,
  `客户端 JS（gzip）${(jsGzip / 1024).toFixed(2)} KB ≤ 预算 ${(JS_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

const indexHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
check(indexHtml.length <= 60 * 1024, `首页 HTML ${(indexHtml.length / 1024).toFixed(1)} KB ≤ 60 KB`);

// CSS 也要有预算：底纹、动效与装饰都在 global.css 里，体积代价得可见
let cssBytes = 0;
if (existsSync(astroDir)) {
  for (const name of await readdir(astroDir)) {
    if (!name.endsWith('.css')) continue;
    cssBytes += (await readFile(path.join(astroDir, name))).length;
  }
}
check(
  cssBytes <= CSS_BUDGET_BYTES,
  `CSS ${(cssBytes / 1024).toFixed(1)} KB ≤ 预算 ${(CSS_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

// 反漂移：首页数字条上的两个数字必须与这里的常量一致。
// 否则「面板写着 4 KB、守卫实际允许 8 KB」这种事会悄悄发生 ——
// 而那个面板存在的全部意义就是"它说的和检查的是同一件事"。
check(
  indexHtml.includes(`${JS_BUDGET_BYTES / 1024} KB`),
  `首页陈述的 JS 预算与守卫一致（${JS_BUDGET_BYTES / 1024} KB）`,
);
check(
  indexHtml.includes(`${PAIRS.length} 组`),
  `首页陈述的配色组数与守卫一致（${PAIRS.length} 组）`,
);
// 主题数同理：面板写"× 3 主题"，而守卫确实在算三套主题的对比度。
// 加一套主题却忘了改面板（或反过来）都会在这里红。
const themeCount = Object.keys(themes).length;
check(
  indexHtml.includes(`× ${themeCount} 主题`),
  `首页陈述的主题数与守卫一致（× ${themeCount} 主题）`,
);

/* ------------------------------------------------------------------- 结果 */

console.log('');
for (const note of notes) console.log(`  · ${note}`);

if (siteLd.size > 0) {
  console.log(`  · JSON-LD 类型：${[...siteLd].join(', ')}`);
}

if (failures.length > 0) {
  console.log(`\n\u001b[31m\u001b[1m${failures.length} 项未通过\u001b[0m`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log('\n\u001b[32m\u001b[1m全部通过。\u001b[0m');

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
 *   对比度   —— 用 global.css 里的真实 token 算 WCAG 比值，**每一套主题**都算
 *   主题清单 —— 主题 id 只有一处来源（theme.ts 的 THEME_IDS），产物里不出现未知主题
 *   体积     —— 客户端 JS（gzip）、CSS、首页 HTML 都不超过预算，且打包脚本仍在
 *                Astro 的内联阈值内（否则页面会多一个外链请求）
 *   反漂移   —— 首页数字条上的数字必须与预算常量、配色组数与主题数一致
 *
 * 体积与对比度的**口径**不在这里：它们在 scripts/budget.mjs，与 CI 里那条显式的
 * 「体积 / 对比度静态断言」共用同一份实现，避免两套数字互相矛盾。
 *
 * 零依赖：只用 node: 内置模块。跑法：pnpm guard
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { entries as readEntries } from './site-model.mjs';
import { audit } from './audit-site.mjs';
import {
  CSS_BUDGET_BYTES,
  HOME_HTML_BUDGET_BYTES,
  INLINE_SCRIPT_RAW_LIMIT,
  PAIRS,
  JS_BUDGET_BYTES,
  closesViewTransitionUnderReducedMotion,
  contrastMatrix,
  inlineScripts,
  measureCss,
  measureHomeHtml,
  measureJs,
  readThemeIds,
  readThemeSource,
  readThemeTokens,
} from './budget.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.argv.includes('--dist') ? process.argv[process.argv.indexOf('--dist') + 1] : path.join(ROOT, 'dist'));
const audited = await audit(ROOT, DIST);
if (audited.length) { console.error(audited.join('\n')); process.exit(1); }

const SITE_URL = 'https://elari39.github.io';
const OWNER = 'github.com/Elari39/';

/**
 * 体积预算与对比度阈值都不在这里定义 —— 它们在 scripts/budget.mjs，
 * 与 CI 里那条显式的「体积 / 对比度」断言共用同一份口径。
 * 这个脚本只负责「拿 dist 去核对」。 */

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
function fileForRoute(route, current = '/') {
  const clean = decodeURIComponent(new URL(route, new URL(current, SITE_URL)).pathname);
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

/** 页面里所有 id 值 —— 用来核对页内锚点能不能落地 */
function idsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/\bid\s*=\s*"([^"]*)"/gi)) found.add(match[1]);
  return found;
}

function sha256base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
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
const entries = await readEntries(ROOT);
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
  'og.jpg',
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

const routes = [
  '/',
  '/about/',
  '/grimoire/',
  ...published.map((entry) => `/projects/${entry.slug}/`),
];

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
  /* 不写死文件名。写死 "/og.png" 会让「换个图片格式」变成「改守卫」——
     而这条要挡的是 og:image 指向了 localhost，或者指向一个产物里并不存在的文件。
     所以只要求：本站的绝对地址 + dist 里真有这个文件。 */
  const ogPath = ogImage?.startsWith(`${SITE_URL}/`) ? ogImage.slice(SITE_URL.length) : null;
  check(
    ogPath !== null && existsSync(path.join(DIST, decodeURIComponent(ogPath))),
    `${label} og:image 是本站绝对地址且产物里存在`,
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
    const target = fileForRoute(href, route);
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
    const resolved = new URL(href, new URL(route, SITE_URL));
    if (resolved.origin !== SITE_URL) continue;
    const ids = await idsForRoute(resolved.pathname);
    if (!ids.has(decodeURIComponent(fragment))) brokenFragments.push(href);
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
    return !existsSync(fileForRoute(src, route));
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
  check(entry.highlights.length >= 3, `条目 ${entry.slug} 至少 3 条亮点`);
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

// 主题清单只有一处来源：src/lib/theme.ts 的 THEME_IDS（第 0 项即默认主题，
// 它同时决定引导脚本接受的合法值、<html data-theme> 的服务端渲染值、
// 以及主题面板里的选项）。守卫**不另抄一份数组** —— 抄一份就意味着
// 「加了一套主题但这里忘了改」会静默变成「有一整套主题从没被检查过」。
const themeSource = await readThemeSource(ROOT);
const THEME_IDS = readThemeIds(themeSource);
check(
  THEME_IDS.length >= 2,
  `主题清单来自 src/lib/theme.ts（${THEME_IDS.length} 套：${THEME_IDS.join(' / ')}）`,
  '没能从 THEME_IDS 解析出主题 id',
);

// 默认主题的 token 写在 `:root` 上（它是基础层，其余主题是它之上的覆盖），
// 所以第 0 项要落在含 `:root` 的块里；其余各落在 [data-theme='<id>'] 里。
// 取不到就报错，而不是"一套都没读到、于是对比度全过"。
const { tokens: themeTokens, problems: themeProblems } = readThemeTokens(css, THEME_IDS);
for (const problem of themeProblems) bad(problem);

const themes = new Map(THEME_IDS.map((id) => [id, themeTokens.get(id) ?? {}]));

for (const [themeId, tokens] of themes) {
  check(Object.keys(tokens).length > 0, `读到主题 ${themeId} 的 token`);
}

// 对比度矩阵由 scripts/budget.mjs 生成，与 CI 里那条显式断言用的是同一份口径。
for (const row of contrastMatrix(themes)) {
  if (row.ratio === null) {
    bad(`主题 ${row.theme}：找不到 ${row.foreground} / ${row.background} token`);
    continue;
  }
  check(
    row.ok,
    `主题 ${row.theme} · ${row.label} ${row.foreground} on ${row.background} = ${row.ratio.toFixed(2)}:1（需 ≥ ${row.minimum}）`,
  );
}

// 每套主题的 token 键集合必须完全一致。
// 这条是「加主题」时最容易漏的地方：新主题少写一个 --c-*，对比度那头会因为
// 「找不到 token」红一次，但只在它被 PAIRS 引用时才红；没被引用的装饰 token
// 漏掉则完全无声 —— 而面板色块、glow 这些恰好用的是非 PAIRS 的 token。
const keySets = [...themes].map(([id, tokens]) => [id, Object.keys(tokens).sort().join(',')]);
const referenceKeys = keySets[0]?.[1] ?? '';
const drifted = keySets.filter(([, keys]) => keys !== referenceKeys).map(([id]) => id);
check(
  drifted.length === 0,
  `${themes.size} 套主题的 token 键集合一致（基准 ${THEME_IDS[0]} 共 ${referenceKeys.split(',').length} 个）`,
  drifted.length ? `键集合不一致：${drifted.join(', ')}` : undefined,
);

// 主题之间不能是"照抄一份、看不出区别"。这一步同时证明了每个 token 块都真的
// 被读到了 —— 选择器名写错（比如默认主题换了地方）会在这里露出来。
const canvases = [...themes.values()].map((tokens) => tokens.canvas);
check(
  canvases.every(Boolean) && new Set(canvases).size === canvases.length,
  `${themes.size} 套主题的画布色互不相同（${canvases.join(' / ')}）`,
);

/* --- 6.5 动效契约（静态核对） --- */
section('动效契约（静态核对）');

// base 层那条「把所有 animation-duration 压到 0.01ms」的全局兜底只作用于
// *::before / *::after，**管不到视图过渡** —— 那几个伪元素在独立的顶层树里。
// 所以 prefers-reduced-motion 下必须有一条显式规则，否则开了 reduce 的访客
// 切主题时照样会看到一次全屏交叉淡出。这条很容易在重构样式时被顺手删掉。
check(
  closesViewTransitionUnderReducedMotion(css),
  'reduce 下显式关闭视图过渡（全局兜底管不到顶层伪元素）',
);

/* --- 7. 体积预算 --- */
section('体积预算');

// 口径在 scripts/budget.mjs：全部外链 gzip 之和 + 最大页面内联 gzip。
// 只统计 dist/_astro/*.js 会漏掉被 Astro 内联进 HTML 的那段，写成一个
// "永远为 0、永远通过"的假守卫。
const js = await measureJs(DIST);
notes.push(
  `客户端 JS：外链 ${js.externalFiles.length} 个文件 ${(js.externalRaw / 1024).toFixed(1)} KB` +
    ` + 内联 ${(js.inlineRaw / 1024).toFixed(2)} KB = ${(js.totalGzip / 1024).toFixed(2)} KB（gzip）`,
);
check(
  js.totalGzip <= JS_BUDGET_BYTES,
  `客户端 JS（gzip）${(js.totalGzip / 1024).toFixed(2)} KB ≤ 预算 ${(JS_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

// 「每页恰好两段脚本」这条由 audit-site.mjs 逐页核对（它先跑）。这里补的是另一半：
// 那两段**必须是内联的**。Astro 只在打包产物小于 4096 字节时才内联，超过就改吐
// _astro/*.js —— 页面会多一个请求，而这条契约没有别的地方盯着。
check(
  js.externalFiles.length === 0,
  '没有外链 JS 文件（打包产物仍在 Astro 的内联阈值内）',
  js.externalFiles.map((file) => path.relative(DIST, file)).join(', '),
);
check(
  js.inlineMaxRaw < INLINE_SCRIPT_RAW_LIMIT,
  `单段内联脚本最大 ${(js.inlineMaxRaw / 1024).toFixed(2)} KB < 阈值 ${(INLINE_SCRIPT_RAW_LIMIT / 1024).toFixed(0)} KB`,
);

const homeHtmlBytes = await measureHomeHtml(DIST);
check(
  homeHtmlBytes <= HOME_HTML_BUDGET_BYTES,
  `首页 HTML ${(homeHtmlBytes / 1024).toFixed(1)} KB ≤ ${(HOME_HTML_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

// CSS 也要有预算：底纹、动效与装饰都在 global.css 里，体积代价得可见
const cssBudget = await measureCss(DIST);
check(
  cssBudget.bytes <= CSS_BUDGET_BYTES,
  `CSS ${(cssBudget.bytes / 1024).toFixed(1)} KB ≤ 预算 ${(CSS_BUDGET_BYTES / 1024).toFixed(0)} KB`,
);

const indexHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');

// 反漂移：首页数字条上的数字必须与这里的常量一致。
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
// 主题数同理：面板陈述的主题数必须与守卫实际检查的数量一致。
// 加一套主题却忘了改面板（或反过来）都会在这里红。
const themeCount = themes.size;
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

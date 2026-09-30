#!/usr/bin/env node
/**
 * 体积与对比度：**唯一的测量口径**。
 *
 * 为什么要有这个文件：体积与对比度这两件事此前只写在 scripts/check-site.mjs 里，
 * 而需求又要求 CI 里有一条显式的「体积 ≤ 4 KB / 对比度达标」断言。如果那条断言
 * 自己重新实现一遍测量，迟早会出现「守卫算 3.9 KB、CI 断言算 4.1 KB」这种两套
 * 数字互相矛盾的局面 —— 而这两条检查存在的全部意义就是「它说的和实际检查的是
 * 同一件事」。所以测量只有这一份，check-site.mjs 与 assert-budgets.mjs 都从这里取。
 *
 * 零 npm 依赖：只用 node: 内置模块，保证任何环境（含 CI）都能直接跑。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/** 客户端 JS 预算（gzip 后：全部外链 .js 之和 + 首页内联脚本之和） */
export const JS_BUDGET_BYTES = 4096;

/** CSS 预算（未压缩字节：dist 下所有 .css 之和） */
export const CSS_BUDGET_BYTES = 48 * 1024;

/** 首页 HTML 预算（UTF-8 字节） */
export const HOME_HTML_BUDGET_BYTES = 60 * 1024;

/**
 * Astro 把打包脚本内联进 HTML 的阈值。
 *
 * 这不是我们随便定的：node_modules/astro 的 plugin-scripts 用
 * `build.assetsInlineLimit`（默认 4096）判断「内联还是外链」。低于它 → 内联成
 * `<script type="module">`（此时 base 层那条 CSP 哈希断言才管得住它）；
 * 高于它 → Astro 改吐 `_astro/*.js` 外链，页面就多一个同源请求。
 *
 * 站点对外承诺的是「零第三方请求」且「每页恰好两段脚本」，所以这里把
 * 「bundle 必须仍在阈值内、仍然内联」钉成一条契约：一旦某次改动把 bundle 撑过
 * 4096 字节，守卫会红，而不是悄悄多出一个请求。
 */
export const INLINE_SCRIPT_RAW_LIMIT = 4096;

/**
 * 对比度检查的颜色对。
 *
 * [前景, 背景, 最低要求, 说明] —— 正文与标记都是小字号，按 4.5 要求；
 * 只有强调色（大字号 / 纯装饰）放宽到 3.0。
 */
export const PAIRS = [
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

/* ------------------------------------------------------------------- 主题清单 */

/**
 * 从 src/lib/theme.ts 解析 THEME_IDS。
 *
 * 主题清单的唯一来源是那一行（第 0 项即默认主题，它同时决定引导脚本接受的合法值
 * 与 HTML 上服务端渲染的 data-theme）。守卫与浏览器验收都从这里取，
 * 而不是各自抄一份数组 —— 抄一份就意味着「加了主题但某处漏改」只会在线上暴露。
 */
export function readThemeIds(themeSource) {
  const match = /export\s+const\s+THEME_IDS[^=]*=\s*\[([^\]]*)\]/.exec(themeSource);
  if (!match) return [];
  return [...match[1].matchAll(/['"`]([a-z0-9-]+)['"`]/g)].map((item) => item[1]);
}

/** 默认主题 = THEME_IDS 的第 0 项 */
export function readDefaultTheme(themeSource) {
  return readThemeIds(themeSource)[0] ?? '';
}

export async function readThemeSource(root) {
  return readFile(path.join(root, 'src', 'lib', 'theme.ts'), 'utf8');
}

/* ----------------------------------------------------------------- 对比度计算 */

/** WCAG 2.x relative luminance（与 Chrome 里真实合成的口径一致） */
export function relativeLuminance(hex) {
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

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/* ------------------------------------------------------------------- 解析 CSS */

/**
 * 把样式表拆成**顶层块**（prelude + body）。
 *
 * 为什么不能再用 `css.indexOf(':root {')`：默认主题的 token 块现在写成
 * `:root,\n[data-theme='brutal'] { … }` —— 它同时是「基础层」和「brutal 的色板」，
 * 这样嵌在页面里的主题色块（<span data-theme="brutal">）才能拿到 brutal 的
 * `--c-*`。而字面量锚点 `':root {'` 在这个写法下直接 indexOf → -1，
 * 取不到 token 就会让整套对比度检查**静默跳过** —— 这正是要避免的失败模式。
 *
 * 同时用真正的括号深度取代锚点：@layer / @media / @supports 里的嵌套规则不会被
 * 误当成主题块（它们的深度 ≥ 2），@theme inline 里的 `--color-*` 也不会被误读成
 * `--c-*` token。
 */
export function topLevelBlocks(css) {
  // 先去掉注释：注释里出现 `:root {` 之类的字样不该被当成选择器
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  let depth = 0;
  let prelude = '';
  let current = null;

  for (const char of clean) {
    if (depth === 0) {
      if (char === '{') {
        current = { prelude: prelude.trim(), body: '' };
        blocks.push(current);
        prelude = '';
        depth = 1;
      } else if (char === ';' || char === '}') {
        // 语句结束（@import / @custom-variant）也要清掉累积，否则它的文本会黏在
        // 下一个块的选择器前面，把 `:root` 变成「以 @ 开头」而被当成 at-rule 跳过。
        prelude = '';
      } else {
        prelude += char;
      }
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (current) {
      current.body += char;
    }
  }

  return blocks;
}

/** 选择器串里是否**恰好**含有某个选择器（按逗号切分，逐段比较） */
function preludeHas(prelude, selector) {
  return prelude.split(',').some((part) => part.trim() === selector);
}

/**
 * 样式表里所有顶层的 `@media (prefers-reduced-motion: reduce)` 块。
 *
 * 存在的理由是视图过渡：base 层那条「把 animation-duration 压到 0.01ms」的全局兜底
 * 只作用于 `*::before` / `*::after`，而 `::view-transition-*` 在独立的顶层伪元素树里，
 * 兜底管不到。所以「reduce 下关掉切肤动效」只能靠一条显式规则 —— 而显式规则最容易被
 * 后续重构顺手删掉，且删掉之后没有任何症状（只有开了 reduce 的访客会看到全屏淡出）。
 * 守卫用这个函数把那条规则钉住。
 */
export function reducedMotionBlocks(css) {
  return topLevelBlocks(css).filter((block) =>
    /^@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(block.prelude),
  );
}

/** reduce 块里是否存在显式关闭视图过渡的规则 */
export function closesViewTransitionUnderReducedMotion(css) {
  return reducedMotionBlocks(css).some(
    (block) =>
      /::view-transition-(?:group|old|new)/.test(block.body) && /animation:\s*none/.test(block.body),
  );
}

/** 从一个块里取出全部 `--c-*: #hex;` —— 只认十六进制字面量 */
export function tokensIn(block) {
  const tokens = {};
  for (const match of (block ?? '').matchAll(/--(c-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1].replace(/^c-/, '')] = match[2];
  }
  return tokens;
}

/**
 * 按主题清单取出每套主题的 token。
 *
 * 第 0 项（默认主题）的 token 写在 `:root` 上 —— 它是基础层，其余主题是它之上的
 * 覆盖。这里断言第 0 项确实落在含 `:root` 的块里：写错就会报出来，
 * 而不是退回「一套主题都没读到，于是对比度全过」那种假绿。
 */
export function readThemeTokens(css, themeIds) {
  const blocks = topLevelBlocks(css);
  const tokens = new Map();
  const problems = [];

  themeIds.forEach((id, index) => {
    const selector = index === 0 ? ':root' : `[data-theme='${id}']`;
    const block = blocks.find(
      (item) => !item.prelude.startsWith('@') && preludeHas(item.prelude, selector),
    );
    if (!block) {
      tokens.set(id, {});
      problems.push(`找不到主题 ${id} 的 token 块（期望选择器 ${selector}）`);
      return;
    }
    tokens.set(id, tokensIn(block.body));
  });

  return { tokens, problems };
}

/**
 * 展开成对比度矩阵：每套主题 × 每一对颜色。
 * ratio 为 null 表示这对颜色在 token 里缺失（同样算失败）。
 */
export function contrastMatrix(themeTokens) {
  const rows = [];
  for (const [theme, tokens] of themeTokens) {
    for (const [foreground, background, minimum, label] of PAIRS) {
      const fg = tokens[foreground];
      const bg = tokens[background];
      if (!fg || !bg) {
        rows.push({ theme, foreground, background, minimum, label, ratio: null, ok: false });
        continue;
      }
      const ratio = contrastRatio(fg, bg);
      rows.push({ theme, foreground, background, minimum, label, ratio, ok: ratio >= minimum });
    }
  }
  return rows;
}

/* --------------------------------------------------------------------- 量体积 */

async function walk(dir) {
  const { readdir } = await import('node:fs/promises');
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found.sort();
}

/** 找出所有 <script> 元素的内容（不含 src 的才算内联） */
export function inlineScripts(html) {
  const found = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    found.push({ attrs, body: match[2] ?? '' });
  }
  return found;
}

/** 页面里可执行脚本的正文（JSON-LD 是数据块，不算） */
export function executableScripts(html) {
  return inlineScripts(html).filter((script) => !/application\/ld\+json/i.test(script.attrs));
}

/**
 * 客户端 JS 的量法：
 *   dist 下所有 .js/.mjs/.cjs 的 gzip 之和（外链）
 * + 首页 HTML 里内联脚本的 gzip 之和（Astro 会把小 bundle 内联进 HTML，
 *   只统计 _astro/*.js 会写成一个「永远为 0、永远通过」的假守卫）
 */
export async function measureJs(dist) {
  let externalRaw = 0;
  let externalGzip = 0;
  const externalFiles = [];
  for (const file of (await walk(dist)).filter((file) => /\.(?:js|mjs|cjs)$/.test(file))) {
    const content = await readFile(file);
    externalFiles.push(file);
    externalRaw += content.length;
    externalGzip += gzipSync(content).length;
  }

  const indexHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
  let inlineRaw = 0;
  let inlineGzip = 0;
  let inlineMaxRaw = 0;
  for (const script of executableScripts(indexHtml)) {
    const bytes = Buffer.from(script.body, 'utf8');
    inlineRaw += bytes.length;
    inlineGzip += gzipSync(bytes).length;
    inlineMaxRaw = Math.max(inlineMaxRaw, bytes.length);
  }

  return {
    externalRaw,
    externalGzip,
    externalFiles,
    inlineRaw,
    inlineGzip,
    inlineMaxRaw,
    totalGzip: externalGzip + inlineGzip,
  };
}

/** dist 下所有 .css 的未压缩字节之和 */
export async function measureCss(dist) {
  let bytes = 0;
  const files = [];
  for (const file of (await walk(dist)).filter((file) => file.endsWith('.css'))) {
    bytes += (await readFile(file)).length;
    files.push(file);
  }
  return { bytes, files };
}

export async function measureHomeHtml(dist) {
  return Buffer.byteLength(await readFile(path.join(dist, 'index.html'), 'utf8'), 'utf8');
}

export const kb = (bytes, digits = 2) => `${(bytes / 1024).toFixed(digits)} KB`;

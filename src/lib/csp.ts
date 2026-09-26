/**
 * 内容安全策略里「不由 Astro 代管」的那部分指令。
 *
 * script-src 与 style-src 刻意不写在这里：Astro 的 `security.csp`
 * （见 astro.config.mjs）会为页面里出现的每个内联脚本与样式算出 sha256 并
 * 自己加上 `'self'`。我们只需要管其余指令 —— 外加一个例外，见下面的
 * THEME_BOOT_HASH。
 *
 * GitHub Pages 不能自定义响应头，所以策略只能以 <meta http-equiv> 形式出现。
 * 这也意味着**挡不住点击劫持**：规范规定 meta 形式会忽略 `frame-ancestors`，
 * 而 Chrome 还会因为这条指令每页打一条控制台错误。所以这里干脆不写它 ——
 * 写了既无效又吵（浏览器级验收脚本会把那条错误判为失败）。
 *
 * 这条策略能立得住，靠的是本站几条硬约束（都由 scripts/check-site.mjs 守卫）：
 *   1. 不引任何第三方资源：字体是系统字体栈、图标是内联 SVG、没有 CDN 与分析脚本
 *   2. CSS 全部外链（astro.config.mjs 里 inlineStylesheets: 'never'）
 *   3. Markdown 不开 Shiki —— 否则高亮颜色会变成行内 style 属性，
 *      而行内样式在 style-src 'self' 下无法用哈希放行
 *   4. 页面上唯一的内联脚本是主题引导脚本，且它的哈希在下面
 */

import { createHash } from 'node:crypto';

import { THEME_BOOT_SCRIPT } from './theme';

/**
 * 主题引导脚本的 sha256。
 *
 * 为什么需要手工算：Astro 只为**它自己产出的**脚本生成哈希。实测确认过两件事：
 *   · Astro 内联的模块脚本（主题切换按钮那段）—— 自动有哈希；
 *   · 通过 set:html 注入的 is:inline 脚本（主题引导）—— **没有**哈希，
 *     浏览器会直接报 CSP 违规并把脚本拦掉，于是主题闪烁又回来了。
 *
 * 所以这里补一份，交给 astro.config.mjs 的 scriptDirective.hashes。
 * 守卫脚本会逐页核对「页面里每个内联脚本的哈希都在策略里」，所以这份哈希
 * 和真正注入 HTML 的那段脚本不可能悄悄不同步 —— 它们引用的是同一个常量。
 */
export const THEME_BOOT_HASH: `sha256-${string}` = `sha256-${createHash('sha256')
  .update(THEME_BOOT_SCRIPT, 'utf8')
  .digest('base64')}`;

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
] as const;

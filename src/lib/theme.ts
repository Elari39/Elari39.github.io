/**
 * 主题引导脚本。
 *
 * 这段代码必须在 <head> 里、在样式之前**同步**执行：晚一步就会先画出错误的
 * 主题再改成对的（闪一下白/黑）。所以它是内联脚本（`is:inline`），而不是
 * Astro 打包出来的外链模块脚本 —— 后者默认是 defer 的，一定来不及。
 *
 * 内联脚本又要满足 `script-src 'self'`，于是由 lib/csp.ts 用同一份字符串
 * 算出 sha256 哈希写进 CSP。两者不可能不同步：它们引用的是同一个常量。
 *
 * 契约（scripts/check-site.mjs 会验证）：
 *   - 手动选择过 -> <html data-theme> 与 data-theme-source="manual"
 *   - 没选过     -> 跟随 prefers-color-scheme，data-theme-source="system"
 *   - localStorage 不可用（隐私模式 / 被策略禁用）时不抛错，退化为跟随系统
 */

/** localStorage 的键；改它等于让所有访客的选择重置一次 */
export const THEME_STORAGE_KEY = 'grimoire-theme';

/** 供主题切换按钮使用：与引导脚本共用同一个键 */
export const THEME_TOGGLE_SCRIPT = `/* 见 src/lib/theme.ts —— 由 BaseLayout 内联注入 */`;

export const THEME_BOOT_SCRIPT = `(function(){var KEY='${THEME_STORAGE_KEY}';var root=document.documentElement;var stored=null;try{stored=localStorage.getItem(KEY)}catch(e){}var dark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(stored==='dark'||stored==='light'){root.dataset.theme=stored;root.dataset.themeSource='manual'}else{root.dataset.theme=dark?'dark':'light';root.dataset.themeSource='system'}})();`;

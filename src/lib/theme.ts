/**
 * 主题清单与主题引导脚本。
 *
 * 这段代码必须在 <head> 里、在样式之前**同步**执行：晚一步就会先画出错误的
 * 主题再改成对的（闪一下白/黑）。所以它是内联脚本（`is:inline`），而不是
 * Astro 打包出来的外链模块脚本 —— 后者默认是 defer 的，一定来不及。
 *
 * 内联脚本又要满足 `script-src 'self'`，于是由 lib/csp.ts 用同一份字符串
 * 算出 sha256 哈希写进 CSP。两者不可能不同步：它们引用的是同一个常量。
 *
 * 契约（scripts/check-site.mjs 与 scripts/verify-browser.mjs 会验证）：
 *   - 手动选择过 -> <html data-theme> 与 data-theme-source="manual"
 *   - 没选过     -> 默认主题（新粗野主义），data-theme-source="default"
 *   - localStorage 不可用（隐私模式 / 被策略禁用）时不抛错，退化为默认主题
 *
 * 主题清单是**唯一来源**：默认主题、引导脚本接受的合法值与切换按钮的循环顺序
 * 都由 THEME_IDS 生成（第 0 项就是默认），所以既不会"加了主题但引导脚本不认它"，
 * 也不会"默认值写在两处、改一处漏一处"。
 *
 * 默认主题不是猜出来的：BaseLayout 会把 data-theme 直接渲染到 <html> 上，
 * 这段脚本只在用户手动选过之后才改它 —— 所以整个站点没有
 * prefers-color-scheme 兜底，JS 被禁用时看到的也是新粗野主义，
 * 而不是"跟随系统的某个样子"。
 */

/** localStorage 的键；改它等于让所有访客的选择重置一次 */
export const THEME_STORAGE_KEY = 'grimoire-theme';

/**
 * 三套主题。**第 0 项就是默认主题**，其余顺序就是切换按钮的循环顺序：
 * 新粗野主义 → 羊皮纸（浅色） → 灰烬（深色） → 新粗野主义。
 */
export const THEME_IDS: readonly string[] = ['brutal', 'light', 'dark'];

/** 没选过主题时用的默认值；与 <html data-theme> 及 CSS 的 :root 基础层是同一套 */
export const DEFAULT_THEME = THEME_IDS[0] ?? 'brutal';

/** 主题的中文名。切换按钮用它拼 aria-label，站内文案也引用它。 */
export const THEME_LABELS: Record<string, string> = {
  light: '羊皮纸',
  dark: '灰烬',
  brutal: '新粗野主义',
};

/** 循环顺序里的下一个主题；遇到未知值一律回到第一个 */
export function nextTheme(current: string | undefined): string {
  const index = THEME_IDS.indexOf(current ?? '');
  return THEME_IDS[(index + 1) % THEME_IDS.length] ?? THEME_IDS[0] ?? 'light';
}

/** 主题的中文名；未知值原样返回，不认识的主题不瞎翻译 */
export function themeLabel(id: string | undefined): string {
  return (id && THEME_LABELS[id]) || id || '';
}

export const THEME_BOOT_SCRIPT = `(function(){var KEY='${THEME_STORAGE_KEY}';var OK=${JSON.stringify(THEME_IDS)};var D='${DEFAULT_THEME}';var root=document.documentElement;var stored=null;try{stored=localStorage.getItem(KEY)}catch(e){}if(OK.indexOf(stored)>-1){root.dataset.theme=stored;root.dataset.themeSource='manual'}else{root.dataset.theme=D;root.dataset.themeSource='default'}})();`;

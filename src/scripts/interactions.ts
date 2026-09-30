/**
 * 全站**唯一**的交互脚本。
 *
 * 为什么是一个文件而不是每个组件各带一段：守卫（scripts/audit-site.mjs）要求
 * **每页恰好两段可执行脚本**，而且所有页面的脚本体必须逐字节相同。
 * 第一段是 <head> 里同步执行的主题引导（来不及等模块加载，见 src/lib/theme.ts），
 * 第二段就是这个 —— 由 BaseLayout 统一引入，所有路由共用同一份产物。
 * 组件级的 <script> 会让首页变成三段、或者让各页脚本不一致，两条都会直接判红。
 *
 * 因此这里的每一块都按「元素可能在也可能不在」来写：面板块与过滤条只在首页出现，
 * 但这个脚本每页都跑。用 getElementById + 可选链兜住，而不是按路由判断。
 *
 * 体积是要守的：打包产物必须小于 4096 字节才能被 Astro 内联（否则页面多一个请求），
 * 所以能一行写完的就不写三行，能用事件委托的就不逐个绑定。多出来的字节不是风格问题，
 * 是守卫会红的问题。
 */

import { THEME_STORAGE_KEY, nextTheme, themeLabel } from '../lib/theme';

const root = document.documentElement;

/**
 * 把主题写到 <html> 上，并记住这次选择。
 *
 * 这里必须是**同步**的：视图过渡的回调里浏览器只接受同步的 DOM 改动 ——
 * 异步（等一个 await）之后才改的东西来不及被拍进新快照，过渡就会拍到一半的画面。
 */
function applyTheme(id: string): void {
  root.dataset.theme = id;
  root.dataset.themeSource = 'manual';

  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* 存不下（隐私模式 / 被策略禁用）就只影响本次会话，不弹错 */
  }

  sync();
}

/**
 * 切换主题：能走原生视图过渡就走，不能就直切。
 *
 * 降级是刻意做成一行的：Safari / Firefox 与旧版 Chrome 没有
 * document.startViewTransition，它们只是少一段淡出动画，行为与记住选择完全一致。
 * 不要在这里加"检测到不支持就换个手写动画"——那等于把同一件事做两遍。
 */
function switchTheme(id: string): void {
  const apply = () => applyTheme(id);

  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

/** 同步提示语与播报：按钮始终告诉用户「再点会变成什么」 */
function sync(): void {
  const current = root.dataset.theme;
  const next = nextTheme(current);
  const button = document.getElementById('theme-toggle');

  button?.setAttribute('aria-label', `切换界面主题（当前：${themeLabel(current)}）`);
  button?.setAttribute('title', `切换到：${themeLabel(next)}`);

  const live = document.getElementById('theme-live');
  if (live) live.textContent = `当前主题：${themeLabel(current)}`;
}

// 模块脚本默认是 defer 的，执行时 DOM 已经解析完，这里可以安全地直接取元素。
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  switchTheme(nextTheme(root.dataset.theme));
});

sync();

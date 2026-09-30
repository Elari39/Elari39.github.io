/**
 * 全站**唯一**的交互脚本。
 *
 * 为什么是一个文件而不是每个组件各带一段：守卫（scripts/audit-site.mjs）要求
 * **每页恰好两段可执行脚本**，而且所有页面的脚本体必须逐字节相同。
 * 第一段是 <head> 里同步执行的主题引导（来不及等模块加载，见 src/lib/theme.ts），
 * 第二段就是这个 —— 由 BaseLayout 统一引入，所有路由共用同一份产物。
 * 组件级的 <script> 会让首页变成三段、或者让各页脚本不一致，两条都会直接判红。
 *
 * 因此这里的每一块都按「元素可能在也可能不在」来写：主题面板每页都有，
 * 标签过滤条与预览抽屉只在首页出现，但这个脚本每页都跑。用 getElementById +
 * 可选链兜住，而不是按路由判断。
 *
 * 体积是要守的：打包产物必须小于 4096 字节才能被 Astro 内联（否则页面多一个请求），
 * 所以能一行写完的就不写三行，能用事件委托的就不逐个绑定。多出来的字节不是风格问题，
 * 是守卫会红的问题。（注释不计入：打包时会被压缩掉。）
 */

import { THEME_STORAGE_KEY, themeLabel } from '../lib/theme';

const root = document.documentElement;

/* --------------------------------------------------------------- 主题 */

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

  syncTheme();
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

const menu = document.getElementById('theme-menu');

/** 收起主题面板。<details> 原生不支持 Esc 与"点外面关闭"，都得自己补 */
function closeMenu(): void {
  if (menu instanceof HTMLDetailsElement && menu.open) {
    const inside = menu.contains(document.activeElement);
    menu.open = false;
    if (inside) document.getElementById('theme-toggle')?.focus({ preventScroll: true });
  }
}

/** 把"当前是哪套主题"同步到按钮提示、选项的 aria-pressed 与朗读区 */
function syncTheme(): void {
  const current = root.dataset.theme ?? '';
  const label = themeLabel(current);
  const trigger = document.getElementById('theme-toggle');

  trigger?.setAttribute('aria-label', `选择界面主题（当前：${label}）`);
  trigger?.setAttribute('title', `界面主题：${label}`);

  // aria-pressed 既是视觉选中态（CSS 用 [aria-pressed='true'] 上色）也是给辅助技术的
  // 状态，一个状态只有一个来源：不额外加 .is-active 之类的类，避免两者对不上。
  for (const option of document.querySelectorAll('[data-theme-opt]')) {
    option.setAttribute('aria-pressed', String(option.getAttribute('data-theme-opt') === current));
  }

  const live = document.getElementById('theme-live');
  if (live) live.textContent = `当前主题：${label}`;
}

/* ----------------------------------------------------------- 标签过滤 */

// 过滤条在服务端渲染时带 hidden：没有 JS 的访客看到的是一条完整的条目列表，
// 而不是一排点了没反应的按钮。这里才是它"被启用"的地方。
const tagbar = document.getElementById('tagbar');
const cards = document.querySelectorAll('[data-tags]');
const clearButton = document.querySelector('[data-tag-clear]');
const status = document.getElementById('tag-status');

const pressedTags = () =>
  [...document.querySelectorAll('[data-tag][aria-pressed="true"]')].map(
    (button) => button.getAttribute('data-tag') ?? '',
  );

/**
 * 按当前选中的标签切换每张卡片的显示状态。
 *
 * 只切 hidden 属性、不做数据重排：卡片始终留在 DOM 里且顺序不变 ——
 * 守卫会核对首页的卡片数量与顺序，重排会打破它；而对读屏与 SEO 来说，
 * "被筛掉的条目仍然在页面上"也比"被删掉"更稳妥。多选是并集。
 */
function applyFilter(): void {
  const active = pressedTags();
  let shown = 0;

  for (const card of cards) {
    const tags = (card.getAttribute('data-tags') ?? '').split(' ');
    const match = active.length === 0 || active.some((tag) => tags.includes(tag));
    card.toggleAttribute('hidden', !match);
    if (match) shown += 1;
  }

  if (clearButton) clearButton.toggleAttribute('hidden', active.length === 0);

  if (status) {
    status.textContent =
      active.length === 0 ? `共 ${cards.length} 条` : `筛出 ${shown} / ${cards.length} 条`;
  }
}

/* ------------------------------------------------------- 事件（一次委托） */

// 一个 document 级监听处理四件事：选主题、切标签、开关预览抽屉、
// 以及"点面板外面收起面板"。逐个元素绑定会在每次渲染后重复注册，
// 也会让体积随组件数增长。
document.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  if (!target) return;

  // 外部控件也可能走下面的提前返回分支，先收起菜单；不改变点击目标的焦点。
  if (menu instanceof HTMLDetailsElement && menu.open && !menu.contains(target)) menu.open = false;

  const option = target.closest('[data-theme-opt]');
  if (option) {
    const id = option.getAttribute('data-theme-opt');
    if (id) switchTheme(id);
    closeMenu();
    return;
  }

  const tag = target.closest('[data-tag]');
  if (tag) {
    tag.setAttribute('aria-pressed', String(tag.getAttribute('aria-pressed') !== 'true'));
    applyFilter();
    return;
  }

  if (target.closest('[data-tag-clear]')) {
    for (const button of document.querySelectorAll('[data-tag]')) {
      button.setAttribute('aria-pressed', 'false');
    }
    applyFilter();
    return;
  }

  // 卡片的「就地预览」抽屉。用原生 showModal()：焦点陷阱、Esc 关闭、背景 inert
  // 都由浏览器给，我们只需要"打开"这一件事。
  //
  // 后面那句 scrollTop = 0 不是多余的：showModal() 会把焦点交给抽屉里第一个可聚焦的
  // 东西（我们给了容器 autofocus，但浏览器仍会为"把焦点元素滚进视口"动一次滚动，
  // 实测停在 19px —— 正好是外层 1.2rem 的内边距），于是抽屉一打开就错过了自己的标题。
  // 与其去赌焦点元素的滚动对齐方式，不如打开后直接把它归位。
  const opener = target.closest('[data-preview]');
  if (opener) {
    const dialog = document.getElementById(opener.getAttribute('data-preview') ?? '');
    if (dialog instanceof HTMLDialogElement) {
      dialog.showModal();
      dialog.scrollTop = 0;
    }
    return;
  }

  if (target.closest('[data-preview-close]')) {
    target.closest('dialog')?.close();
    return;
  }

  // 点抽屉的背景关闭：命中背景时事件目标就是 <dialog> 本身（内容都在 .preview__inner 里）。
  // 原生 <dialog> 并不会因为点背景而关闭，这是要自己补的第二处。
  if (target instanceof HTMLDialogElement && target.classList.contains('preview')) {
    target.close();
    return;
  }

});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

/* ------------------------------------------------------------------ 初始化 */

// 模块脚本默认是 defer 的，执行时 DOM 已经解析完，这里可以安全地直接取元素。
syncTheme();

// 只有交互处理已就绪才启用依赖 JS 的入口；主题引导成功不代表交互脚本也成功。
menu?.removeAttribute('hidden');
for (const opener of document.querySelectorAll('[data-preview]')) opener.removeAttribute('hidden');

if (tagbar) {
  tagbar.toggleAttribute('hidden', false);
  applyFilter();
}

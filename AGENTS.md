# AGENTS.md

这个仓库的约定写在 **[README.md](./README.md)** 里，不在这里重复一份 —— 同一件事写两处，
两份迟早会各自漂移。动手之前按你要做的事去读对应那一节：

| 你要做的事 | 读 README 的哪一节 |
| --- | --- |
| 把站点跑起来 / 改完要跑什么 | 本地开发、质量守卫 |
| 加一个项目条目 | 内容：怎么加一个条目 |
| 改样式、配色或动效 | 设计系统 |
| 动 `scripts/` 或页面上的数字 | 质量守卫 |

## 不能破坏的不变量

每一条都有脚本盯着，改坏了 `pnpm verify` 就会红：

- 页面里不得出现行内 `style` 属性（`style-src` 没有 `unsafe-inline`）。
- 不引任何第三方资源：字体走系统字体栈，图标是内联 SVG。
- 客户端 JS 只有两段：一段主题引导（`is:inline`、同步、哈希手工登记）+ 一段交互
  （`src/scripts/interactions.ts`，由 `BaseLayout` 统一引入）。每页必须恰好两段、
  各页脚本体逐字节相同；打包产物必须仍小于 4096 字节（否则 Astro 会改吐外链，
  页面平白多一个请求）；两段合计 gzip ≤ 4 KB。要加交互先在 CSS 里想办法。
- `prefers-reduced-motion: reduce` 下必须显式关掉视图过渡 —— base 层那条全局兜底
  只作用于 `*::before` / `*::after`，管不到顶层伪元素树里的 `::view-transition-*`。
- 主题清单只有一处来源（`src/lib/theme.ts` 的 `THEME_IDS`）；各套主题的 token 键集合
  必须一致，且产物里不得出现未知的 `data-theme` 值。
- 每页恰好一个 `<h1>`；图片要有 `alt` 与 `width`/`height`；装饰 SVG 一律 `aria-hidden`。
- 现有 `--c-*` 色板与每一套主题的对比度是契约（每套 9 对：8 对 ≥ 4.5:1，1 对 ≥ 3:1）——
  改色或加主题之前先看守卫的对比度检查。
- 首页数字条上的数字必须与 `scripts/budget.mjs` 里的常量、配色组数、主题数一致。

## 三条真实命令

```bash
pnpm verify                            # astro sync + tsc + astro check + build + guard
                                       #   + assert:budgets + 静态/素材反例
pnpm dev                               # 本地 http://localhost:4321
pnpm preview --port 4321  &  pnpm verify:browser   # 浏览器级验收（需要本机 Chrome）
```

体积与对比度的**测量口径只有一处**：`scripts/budget.mjs`。守卫（`check-site.mjs`）、
CI 里的静态断言（`assert-budgets.mjs`）与它们的反例测试都从那里取 —— 不要在别处再实现一遍。

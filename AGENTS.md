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
- 客户端 JS 保持「一段主题引导 + 一段主题切换」（gzip ≤ 4 KB）。要加交互先在 CSS 里想办法。
- 每页恰好一个 `<h1>`；图片要有 `alt` 与 `width`/`height`；装饰 SVG 一律 `aria-hidden`。
- 现有 `--c-*` 色板与两套主题的对比度是契约 —— 改色之前先看守卫的对比度检查。
- 首页数字条上的数字必须与 `scripts/check-site.mjs` 里的常量一致。

## 三条真实命令

```bash
pnpm verify                            # astro sync + tsc + astro check + build + guard
pnpm dev                               # 本地 http://localhost:4321
pnpm preview --port 4321  &  pnpm verify:browser   # 浏览器级验收（需要本机 Chrome）
```

<div align="center">

# Ashen Witch's Grimoire

**灰烬女巫的魔典** —— 把做过的项目，写成一本可以翻的魔典。

四个自建项目的条目库，部署在 <https://elari39.github.io/>。

[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222222?logo=githubpages&logoColor=white)

</div>

---

## 这个站点是什么

一本静态的「项目魔典」：每个项目是一条**条目**，结构化字段写在 frontmatter，
长文叙述写在正文，构建期渲染成纯静态 HTML。目前收录四条：

| 条目 | 项目 | 形态 | 线上 |
| --- | --- | --- | --- |
| I | **Notes of Ashen** | 前后端分离的个人博客系统（Go + go-zero + MySQL / Redis + React 18） | <https://blog.miku831.fun/> |
| II | **AshenCourier** | 匿名可用的短链服务（Go 1.27 标准库 + PostgreSQL 18 + Redis 8 + Vue 3） | <https://shorten.miku831.fun/> |
| III | **CryptoWitch** | 本地文档保险箱（Go + Wails v3 + Argon2id / AES-256-GCM） | 仅仓库（无 Release） |
| IV | **Ruiqiang Website** | 重庆锐强建筑劳务有限公司官网：纯静态、零后端的 Next.js 企业官网（Next 16 + React 19 + Tailwind 4，自动化测试守合规） | <https://ruiqiang-jianzhu.netlify.app/> |

首页是五段：**序言**（左文字右印记）、**数字条**（四条可核对的事实，其中条目数是
构建期从内容集合算出来的）、**条目**（标签过滤条 + 四张程序化封面的卡片，
每张卡片能就地打开一个「快速预览」抽屉）、**图版**（把各个条目的
截图摊成一条横向走廊）与**三条自我约束**。

站点本身就是个小工程：不引任何第三方运行时资源、客户端脚本只有两段（一段主题引导
+ 一段交互），并且带一套**构建产物守卫**、一条**体积与对比度的静态断言**，以及一套
**浏览器级验收**。下面把这些都写清楚。

## 目录

- [这个站点是什么](#这个站点是什么)
- [技术选型](#技术选型)
- [目录结构](#目录结构)
- [本地开发](#本地开发)
- [质量守卫](#质量守卫)
- [素材流水线](#素材流水线)
- [内容：怎么加一个条目](#内容怎么加一个条目)
- [设计系统](#设计系统)
- [部署](#部署)
- [已知限制](#已知限制)
- [许可](#许可)

## 技术选型

| 层 | 选型 | 为什么 |
| --- | --- | --- |
| 站点框架 | **Astro 7**（`output: static`） | 纯静态输出与 GitHub Pages 的托管模型天然对齐：不需要 SPA 的 404 回退技巧、没有客户端路由、首屏与 SEO 都更好 |
| 内容 | **内容集合 + zod schema** | 每个项目是一份 Markdown；字段不全、亮点少于三条、仓库地址写错都会**构建失败**，而不是上线后才发现 |
| 样式 | **Tailwind CSS 4**（`@theme inline`） | 设计 token 是运行时 CSS 变量，所以每套主题不需要各自一份工具类 |
| 客户端 JS | 一段主题引导脚本 + 一段交互脚本 | 交互脚本由 `BaseLayout` 统一引入（每页恰好两段、逐字节相同）；打包产物须小于 Astro 的 4096 字节内联阈值，否则页面平白多一个请求。内联后 gzip **≤ 4 KB**（实际值以本次守卫输出为准） |
| 安全 | Astro 原生 `security.csp` + 一份手工登记的哈希 | GitHub Pages 不能自定义响应头，只能用 `<meta>` 形式的 CSP |
| 部署 | GitHub Actions + `actions/deploy-pages` | 产物以 artifact 上传，不落 `gh-pages` 分支 |

**已经考虑并否决的方案：**

- **纯 Vite + Vue 3 SPA**：与 AshenCourier / CryptoWitch 的栈一致，但 SPA 在 Pages 上
  需要 `404.html` 回退技巧，首屏与 SEO 都更差，对内容型站点是过度设计。
- **零构建手写 HTML**：省掉依赖，但承受不了条目增长，也拿不到 schema 校验。
- **`astro:assets` / `sharp`**：图片优化很香，但那个原生依赖换机器时最容易装不上。
  这里改用 Pillow 预压 + 原生 `<img>`，代价是素材要手工跑一次脚本（见下）。

## 目录结构

```text
.
├─ .github/workflows/deploy.yml   # verify（检查）→ deploy（发布），两步分开
├─ astro.config.mjs               # site / trailingSlash / CSP / 关闭 Shiki
├─ scripts/
│  ├─ check-site.mjs              # 构建产物守卫：把站点的承诺逐条核对
│  ├─ verify-browser.mjs          # 浏览器级验收：CSP 是否真放行、主题切换是否真生效
│  ├─ prepare-assets.py           # 素材流水线（Pillow + 无头 Chrome）
│  └─ og-template.html            # OG 卡片模板（渲染成 public/og.jpg）
├─ public/
│  ├─ shots/<slug>/*.webp         # 条目图版（复用各项目仓库里已公开发布的截图）
│  ├─ favicon.svg / favicon.ico / apple-touch-icon.png / og.jpg
│  └─ robots.txt
└─ src/
   ├─ content.config.ts           # 条目 schema（zod）
   ├─ content/projects/*.md       # 四个条目
   ├─ data/site.ts                # 站点常量（站名、导航、自我约束）
   ├─ data/plates.ts              # 图版尺寸（生成文件，勿手工编辑）
   ├─ layouts/BaseLayout.astro    # head / SEO / OG / JSON-LD / 主题引导 / 交互脚本入口
   ├─ components/                 # Header / Footer / ProjectCard / Glyph / ThemeMenu
   │                              # + SigilPlate / Attestation / PlateRail / Toc
   ├─ lib/theme.ts                # 主题清单（THEME_IDS，第 0 项即默认）+ 引导脚本
   ├─ lib/tags.ts                 # 首页标签过滤的词汇表（只收被 ≥2 个条目共用的标签）
   ├─ scripts/interactions.ts     # 全站唯一的客户端脚本（主题面板 / 视图过渡 / 标签过滤）
   ├─ pages/                      # index / about / 404 / projects/[slug]
   └─ styles/global.css           # 各套主题的 token 与组件样式
```

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:4321
pnpm build
pnpm preview        # 拿 dist/ 起静态服务器
```

环境要求：Node ≥ 22.12（CI 用 24）、pnpm（版本由 `packageManager` 字段钉住）。
静态验收的素材反例需要 Python + Pillow：`python -m pip install -r scripts/requirements-assets.txt`。
浏览器验收需要 Chrome / Edge，支持 Windows / Linux，并可通过 `CHROME_PATH` 显式指定。
只有重新生成素材才需要相邻项目的公开截图；日常构建与 CI 不依赖相邻仓库。

## 质量守卫

这个仓库的规矩是：**能被检查的承诺才算承诺**。所以对外说的每一句话基本都有一条
检查盯着；CI 里 `verify` 不过就不发布。

```bash
pnpm verify          # 类型检查 + build + guard + 体积/对比度断言 + 静态反例 + 素材反例
pnpm guard           # 只跑构建产物守卫（需要先 build）
pnpm assert:budgets  # 只跑体积与对比度断言（需要先 build）
pnpm verify:browser  # 浏览器级验收（需要先起 pnpm preview）
pnpm verify:browser:local # 自动启动预览、验收同一份 dist、清理自身服务
```

### `pnpm guard` —— 对 `dist/` 的二十一组核对

| 组 | 检查什么 |
| --- | --- |
| 结构 | 该有的页面与文件一个不少（含 `404.html`、`robots.txt`、`sitemap-index.xml`、图标与 OG 图） |
| SEO | 每页都有唯一的 `<title>`、description、canonical、`og:image`，且 canonical 必须等于本站地址 |
| 链接 | 站内链接与本地资源在 `dist/` 里确实存在 —— 图版路径写错会当场暴露；HTML 声明尺寸还须与图片真实像素一致 |
| 锚点 | 每个 `#锚点`（含 `/#entries` 这种跨页写法）都要在目标页里真的存在对应的 `id` —— 详情页目录完全靠它 |
| 唯一 id | 同一页里 `id` 不得重复 —— 重复会让锚点跳到第一个，也会让印记里的 SVG 渐变引用错元素 |
| 图版 | 每个 `<img class="plate">` 都能在 `plates.ts` 里查到尺寸（否则会跳版） |
| CSP | 生产构建里有 CSP；**页面上每个内联脚本的哈希都在策略里**；没有 `unsafe-inline` |
| 零外链 | `img` / `script` / `link` / `iframe` 里不得出现第三方地址 |
| 内联样式 | 页面里不得有 `style="..."` 属性（`style-src` 没有 `unsafe-inline`） |
| 可访问性 | 恰好一个 `<h1>`、`lang="zh-CN"`、有 skip link、图片都有 `alt` |
| 图片尺寸 | 每个 `<img>` 都要声明 `width`/`height` —— 否则图版加载完成前占不住位置，会累计布局偏移 |
| 跳转目标 | 每页都有 `id="main"`，skip link 指的确实是它 |
| 装饰 SVG | 每个 `<svg>` 都要 `aria-hidden="true"` —— 装饰图形不该进可访问性树（需要语义的图形请用 `<img alt>`） |
| 对比度 | 用 `global.css` 里的**真实 token** 算 WCAG 比值，**每一套主题**各 9 对：8 对文字 ≥ 4.5:1，1 对大字号 / 装饰 ≥ 3:1；浏览器另测真实组件背景，另外核对画布色互不相同 |
| 主题清单 | 主题 id 只有一处来源（`src/lib/theme.ts` 的 `THEME_IDS`），守卫与浏览器验收都从那里读；各套主题的 token 键集合必须一致；产物里出现的每个 `data-theme` 值都必须是已知主题；每页的面板都要**给每一套主题**留出预览色块 |
| 标签过滤 | 卡片上的 `data-tags` 与过滤条按钮必须自洽：每个标签至少被两个条目共用、按钮显示的计数等于带该标签的条目数、`data-tags` 已归一化（小写/去重/排序）、过滤条在服务端渲染时**带 `hidden`**（无 JS 时整条不出现）、卡片顺序与条目顺序一致 |
| 预览抽屉 | 每张卡片一个 `<dialog>`、id 唯一、按钮的 `data-preview` 指得到它、按钮有可访问名称与 `aria-haspopup="dialog"`、抽屉里**没有 `<h1>`**、有且只有一个关闭按钮；而且抽屉里的架构图与难点/心得必须**与 frontmatter 逐字一致**（挡的是"抽屉做出来了但里面是占位文字"） |
| 动效契约 | `prefers-reduced-motion: reduce` 下必须有一条**显式**规则关掉视图过渡 —— base 层那条全局兜底只作用于 `*::before` / `*::after`，管不到位于顶层伪元素树的 `::view-transition-*` |
| 体积 | 客户端 JS（gzip，含内联）≤ 4 KB；**没有外链 JS 文件**（打包产物必须仍在 Astro 的 4096 字节内联阈值内）；首页 HTML ≤ 60 KB |
| CSS 预算 | 外链 CSS ≤ 48 KB —— 底纹、动效与装饰都在 `global.css` 里，体积代价得看得见 |
| 反漂移 | 首页数字条上的数字必须与守卫里的常量一致（`4 KB`、`9 组`、`× N 主题`） |

「反漂移」那一条是给首页那块「数字条」上锁的：面板存在的全部意义就是
**它说的和检查的是同一件事**，所以守卫会反过来核对首页 HTML 里的数字，
改了一边没改另一边就会红。

### `pnpm assert:budgets` —— 体积与对比度的静态断言

CI 里那条「超出约束就拦截」的步骤，也是 `pnpm verify` 的一环。它只做两件事，
但报告要能单独在 Actions 的步骤列表里看见：

- 客户端 JS（gzip）、单段内联脚本的 raw 体积、外链 JS 文件数、CSS 与首页 HTML；
- **每一套主题 × 9 对颜色**的 WCAG 比值，并给出最紧的一对与余量倍数。

越界时它会输出 GitHub `::error::` 注解（在 PR 的文件视图上也能看到具体数值）、
把一张 markdown 表格写进 job summary、并以非零退出 —— `deploy` job 依赖 `verify`，
所以线上不会出现超预算的版本。

**为什么不让它自己再算一遍**：体积与对比度的测量口径只有一处 ——
`scripts/budget.mjs`，守卫和这条断言都从那里取。两套测量的下场一定是两套互相矛盾的数字，
而这类检查存在的全部意义就是「它说的和实际检查的是同一件事」。

### `pnpm verify:browser` —— 文件级检查证明不了的事

无头 Chrome + CDP 把页面真跑一遍（Node 自带 `WebSocket` 与 `fetch`，不引客户端依赖）。
CI 会运行同一套验收，失败阻止发布。路由从构建产物发现，覆盖 404；命令或加载超时直接失败。
它回答的是守卫脚本回答不了的问题：

- 内联主题引导脚本在 CSP 之下**确实被执行**了。判据是 `data-themeSource` ——
  它只由那段脚本写、服务端 HTML 里没有：默认主题现在是直接渲染在 `<html>` 上的，
  脚本就算被拦掉属性也照样在，只看 `data-theme` 会变成假守卫；
- **没选过主题时落到默认主题**：脚本清掉 `localStorage` 再刷新，断言
  `data-theme="brutal"` 且来源是 `default`；
- **把脚本整个禁用**（`Emulation.setScriptExecutionDisabled`）后重新加载：`<html>` 上
  仍是服务端渲染的 `data-theme="brutal"`（`data-themeSource` 为空 —— 正好反证了
  它不是脚本写的），画布与**形状**都是粗野主义。这一条才是"默认值写在 HTML 上、
  而不是用 CSS 猜"的真正理由：只把 token 放进 `:root` 的话，无 JS 时会得到
  "粗野主义的颜色 + 上一套的圆角与柔光"这种没人设计过的半成品；
- 页面上**没有 CSP 违规、没有控制台报错、没有资源加载失败**；
- **主题面板真的能用**：触发器是原生 `<summary>`（面板默认收起、点一下展开、再点收起）、
  面板里的选项与 `THEME_IDS` 一一对应且每套都有预览色块；逐个点过五套主题，每一步都断言
  「主题生效 + 记为手动选择 + 写入 `localStorage` + 选中态**唯一** + 面板自动收起」，
  刷新后仍停在最后选的那一套；键盘走一遍 Enter 展开 → Tab 落到第一个选项 → Enter 选中；
  Esc 与点击面板外部都能收起（这两处原生 `<details>` 并不支持，正是脚本补的缺口）。
  这一步同时证明「引导脚本与 `THEME_IDS` 是同步的」—— 两边不一致，刷新就会掉回默认主题；
- **切主题走的是原生视图过渡，而且能降级**：先断言浏览器提供
  `document.startViewTransition`，再包一层计数证明站点**真的调用了它**
  —— 只断言"API 存在"是很容易变成假守卫的写法；然后把 API 从原型上删掉再刷新，
  切换与"记住选择"必须完全一样、且不产生任何控制台或 CSP 错误
  （Safari / Firefox 与旧版 Chrome 走的就是这条路）；
- **标签过滤真的筛得动**：点一个标签后留下的每一张卡片都确实带这个标签（且不是全留也不是全没）、
  两个标签可同时选中（并集只会更宽）、清空后所有卡片回来、状态文字报出筛出的条数、
  键盘 Enter 也能切；**把脚本整个禁用后过滤条保持隐藏** —— 渐进增强的方向是"少了功能"，
  而不是"多了一排点了没反应的按钮"（那一条同时先断言按钮确实渲染出来了，避免空集上的假通过）；
- **就地预览抽屉是原生模态**：`showModal()` 之后 `:modal` 成立、焦点被移进抽屉内部、
  背景遮罩算出来了、**抽屉停在开头且标题可见**（焦点默认落在底部的关闭按钮上时，
  浏览器会为了让按钮可见而下滚抽屉 —— 一打开就错过自己的标题，这一条是看截图才发现的）；
  三条关闭路径 ——「关闭预览」按钮、Esc（原生）、点背景（原生 `<dialog>` 并不会因为点背景而关，
  由脚本补上）—— 各测一次；再换主题断言抽屉的底色 / 文字色 / 圆角跟着变
  （证明它读的是主题变量，而不是写死的颜色）；
- **卡片的触感是纯 CSS 且不抖动**：粗野主义下真按下去，`transform` 必须是 `translate(3px,3px)`、
  `box-shadow` 必须变成 `none`，同时**布局盒尺寸与后一张卡片的位置一动不动**；
  暗色下按下时边缘必须透出一圈**模糊半径 > 0** 的柔光（与粗野主义的"模糊半径恒为 0"形成对照）。
  这一节还顺带踩出一个坑：站点在 `html` 上设了 `scroll-behavior: smooth`，
  `scrollIntoView` 变成一段动画 —— 在动画途中量坐标再派发鼠标事件，指针会落到**另一张卡片**上，
  看起来像"CSS 伪类没生效"；所以滚动用 `behavior: 'instant'`，并当场做一次命中测试；
- 五套主题的 `getComputedStyle` 背景色确实互不相同，**且浅色下 `h1` 回到衬线栈**
  —— 后者挡住了"把 `--font-display` 写进 `:root`、结果所有主题都变粗黑"那类改法；
- **新粗野主义里「token 覆盖不到」的那一半也真的生效**：条目卡与主题按钮的
  `border-radius` 为 0、阴影的模糊半径为 0、`h1` 走粗黑无衬线而不是衬线、页头不再毛玻璃。
  这一条挡的是"只改了变量、忘了形状"这种半生效的改动 —— 也正是它需要在
  `global.css` 末尾那样一个无层级覆盖块的原因；
- **赛博终端与瑞士极简的"个性"由计算值证明**，而不是只看 CSS 里写了什么：
  前者读 `body::after` 的 `background-image` 确认 CRT 扫描线真的被画出来（并与粗野主义的底纹比对，
  证明它没有被沿用）、画布是 `rgb(6, 10, 6)`、`h1` 走等宽字体；
  后者断言两个底纹伪元素都是 `display: none`、卡片阴影被清掉、`h1` 是无衬线**且比粗野主义更大**
  （实测 80px vs 68px）—— "只换颜色不换排版"的假主题过不了这几条；
- 320、390、768、1280、1440px × 五套主题下导航不拆行、图版不放大且没有横向滚动，**且 390px 那一次是在新粗野主义下量的**：
  硬阴影向右下探出，是这套主题唯一真实的溢出风险，只在默认主题下量是量不到它的；
- **滚动进场动画一定收敛到可见终态**：逐个把 `.reveal` 滚进视口，再断言它的 `transform`
  归位、`opacity` 为 1 —— 挡住"动到一半就永久停住"这种只有真跑一遍才看得见的回归
  （所以首屏以下的内容才敢用 `animation-timeline: view()`）；
- **`prefers-reduced-motion: reduce` 下动效整体让位**：每页都没有元素停在位移中间态、
  没有横向滚动、内容照常渲染。注意 base 层那条"把 animation-duration 压到 0.01ms"的
  全局兜底对 scroll-driven 动画**无效**（那类动画不看 duration），所以每条动效都另外包在
  `(prefers-reduced-motion: no-preference)` 里。视图过渡也一样：它位于**独立的顶层伪元素树**，
  那条全局兜底同样管不到，所以 `global.css` 里另有一条显式规则把它关掉，
  并且验收会确认 reduce 下切主题**照样生效、照样记住选择**（让位的只是那一段淡出动画）。

它同时把每页的浅色 / 深色 / 新粗野主义 / 窄屏截图写到 `.assets-raw/verify/`，
外加首页在新粗野主义下四个滚动位置、390px 与「禁用脚本」的一张预览图，供人眼复核。

> 两个脚本的分工值得说明：`guard` 是**快速、离线、每次提交都跑**的契约测试；
> `verify:browser` 是**慢一些、需要浏览器且 CI 必跑**的行为验收。
> 前者挡回归，后者挡「看起来对了但其实没生效」—— 它已经抓到过一次真问题：
> Astro 只为它自己产出的脚本生成哈希，通过 `set:html` 注入的内联主题脚本没有哈希，
> 于是那段脚本在 CSP 下会被直接拦掉。

## 素材流水线

站点仓库之外的项目目录只被**读**，不会被修改。

```bash
pnpm assets           # 重新生成图版、图标与 OG 卡片
pnpm assets:inspect   # 图片体检
```

`prepare-assets.py` 做四件事：

1. **图版**：把项目仓库里已公开发布的截图缩到 1400px 宽
   （**只缩不放**，放大只会变糊），输出 WebP，并写下 `src/data/plates.ts`。
   目前有两个来源：`../AshenCourier/docs/screenshots/` 与
   `../ruiqiang-website/docs/screenshots/`（后者只取它 README 实拍的那三张 ——
   该仓库 `img/` 下的营业执照原图永不发布，本站也不复制）。
   加一个来源只需在 `scripts/prepare-assets.py` 的 `PLATE_SOURCES` 里加一行。
2. **图标**：用 Pillow 画站点印记（深色底 + 余烬菱形 + 琥珀内芯），
   生成 180×180 的 `apple-touch-icon.png` 与多尺寸 `favicon.ico`。
3. **OG 卡片**：用无头 Chrome 渲染 `scripts/og-template.html` → `public/og.jpg`（1200×630）。
   存 JPEG 而不是 PNG：同样是这张扁平渐变卡片，PNG 要 **297 KB**、JPEG q85 只要 **~44 KB**
   （省 85%），而每一次分享预览都要付这份流量；q85 下文字边缘没有可见损失。
4. **体检**：`--inspect` 用灰度均值 / 标准差 / 颜色数给每张图一个可读指纹。

### 为什么线上站点不在这里抓

曾经想让脚本顺手抓 `blog.miku831.fun` 的首页当图版。**实测不可行**：

```text
https://blog.miku831.fun/ 在 Cloudflare 的安全验证之后。
无头浏览器拿到的是「请稍候… 正在进行安全验证」的中间页 ——
DOM 里 <title> 就是这四个字，没有任何文章链接；
截出来的图几乎全白，灰度标准差只有 18。
```

所以线上截图不自动化。需要某个项目的线上截图时：人工截好放进
`public/shots/<slug>/`，先人工确认内容有效，写进条目的 `gallery`，再运行 `pnpm assets` 将手工图纳入尺寸清单，最后 `pnpm assets:inspect`。
正式图片全部通过检查后才替换成品；缺少任何配置源图、损坏图或疑似空白图都会失败并保留旧产物。

> 图片统计只能提示空白/白屏，不能判定内容有效，更不能凭标准差识别 Cloudflare 验证页。
> `--inspect` 只检查正式发布图片，失败返回非零退出码；人工复核仍不可省略。

### 不要带进仓库的东西

四个项目目录里有敏感文件，**一律不复制进本站仓库**：
`.env`、`CryptoWitch/access.yaml`、`notes_of_ashen_backup.sql`、
`CryptoWitch/content/plain/**`（明文资料）、`security-audit/evidence/**`，
以及 `ruiqiang-website` 的 `.env.local`、`img/` 下的营业执照原图与工商登记摘要源文件
（那个仓库的构建闸门按设计拒绝它们）、`_shot/` 与 `_shot2/` 本地抓图草稿。
本站只取了几张截图与图标。

## 内容：怎么加一个条目

在 `src/content/projects/` 下新建一份 `.md`，文件名就是路由片段
（`my-project.md` → `/projects/my-project/`）。frontmatter 的字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` / `tagline` / `summary` | string | 卡片与详情页的三层文字 |
| `status` | `live` \| `wip` \| `archived` | 决定状态标记的颜色与文案 |
| `year` / `role` | number / string | 详情页头部的小标记 |
| `accent` | `coral` \| `teal` \| `amber` | 这条目的强调色，**只能取色板里的名字** |
| `glyph` | `book` \| `link` \| `lock` \| `sigil` \| `github` | 卡片上的内联 SVG 标记 |
| `order` | 正整数，**互不重复** | 首页顺序（守卫会查重复） |
| `stack` | string[] | 技术栈标签 |
| `tags` | string[]，**≥ 2 个** | 首页标签过滤的策展标签：小写短词，且要与别的条目**共用** |
| `highlights` | string[]，**≥ 3 条** | 首页卡片取前三条，详情页全部展开 |
| `preview` | `{ architecture, challenges[≥2], lessons[≥2] }` | 卡片「快速预览」抽屉的三段内容：架构图是等宽 ASCII（正文那张的浓缩版），难点与心得各至少两条 |
| `links.repo` | 必须以 `https://github.com/Elari39/` 开头 | 仓库地址 |
| `links.live` | 可选 | 线上演示 |
| `gallery` | `{ src, alt, caption? }[]` | 图版，`src` 是 `public/` 下的绝对路径 |

正文用普通 Markdown 写。**不要用围栏代码块做语法高亮**：本站关掉了 Shiki，
代码块只会有 `global.css` 里的等宽样式（ASCII 架构图正合适）。

## 设计系统

九套主题，token 只有一处来源：`src/styles/global.css` 的 `--c-*` 变量，
再通过 `@theme inline` 暴露成 `bg-canvas` / `text-ink` 这类工具类。

**默认是新粗野主义**（写在 `:root` 这个基础层上，并由服务端直接渲染到
`<html data-theme="brutal">`）；**另外四套是它之上的覆盖，只能手动选到**。
右上角是一个原生 `<details>` 做的选择面板，五套主题各带一枚色块预览，选择存在
`localStorage`。主题清单只有一处定义（`src/lib/theme.ts` 的 `THEME_IDS`，
**第 0 项就是默认主题**），默认值、引导脚本接受的合法值与面板里的排列顺序都从它生成 ——
守卫与浏览器验收也**从那个文件读**主题清单，而不是各自再抄一份数组。

> 默认主题没有用 `prefers-color-scheme` 去猜。它写在 HTML 上，引导脚本只在
> 访客手动选过之后才覆盖它（sync，早于首屏绘制）——所以脚本没跑、被 CSP 拦掉
> 或属性被谁删掉，看到的都是新粗野主义，而不是某个没人描述过的第六种样子。

| 语义 | 新粗野主义 | 羊皮纸（浅） | 灰烬（深） | 赛博终端 | 瑞士极简 | 水墨宣纸（浅） | 午夜档案馆（深） | 霓虹落日（深） | 孔版印刷（浅） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 画布 | `#fffdf4` | `#faf9f5` | `#121110` | `#060a06` | `#ffffff` | `#ebe8e0` | `#0d1420` | `#170b26` | `#ffe94a` |
| 卡片 | `#ffffff` | `#efe9de` | `#1f1e1b` | `#0b140c` | `#ffffff` | `#f7f5ef` | `#18212e` | `#22143a` | `#fffdf0` |
| 描边 | `#101010` | `#e6dfd8` | `#2e2c28` | `#1d3a20` | `#111111` | `#1c1c1c` | `#2a3646` | `#3a2560` | `#101010` |
| 正文 | `#1a1a1a` | `#3d3d3a` | `#d8d4cb` | `#b6f5c4` | `#1a1a1a` | `#2b2823` | `#cfd6e0` | `#dfc9f2` | `#1c1a12` |
| 标题 | `#0a0a0a` | `#141413` | `#faf9f5` | `#d9ffe0` | `#000000` | `#14120f` | `#f2f4f8` | `#f7eaff` | `#0b0b0b` |
| 主色 | `#f04e14` | `#cc785c` | `#e08d6d` | `#39ff14` | `#d0021b` | `#a3241a` | `#c9a227` | `#ff2e88` | `#1b2ff0` |
| teal / amber | `#0a6169` / `#8a5200` | `#276b5e` / `#8f5a10` | `#5db8a6` / `#e8a55a` | `#2ee6d0` / `#ffb454` | `#0a6169` / `#8a5200` | `#245a55` / `#8a5200` | `#5fbcae` / `#e29a4a` | `#35e0d0` / `#ffb257` | `#0a5f5a` / `#7a4a00` |
| 形状 | 方角 · 粗边 | 圆角 | 圆角 | 方角 | 方角 | 方角 · 发丝边 | 小圆角 | 小圆角 | 方角 · 粗边 · 套印阴影 |
| 标题字体 | 粗黑无衬线 | 衬线 | 衬线 | 等宽 | 无衬线 | 衬线（宋） | 衬线 | 几何无衬线 | 无衬线 |

前三套里，浅色与深色继承自 AshenCourier 的 `DESIGN.md`（暖奶油画布 + 珊瑚主色 +
深色面板），所以这个站点与它展示的项目看起来像同一个作者做的。

**赛博终端（cyber）**：高对比绿黑 + CRT 扫描线。扫描线是**单条**
`repeating-linear-gradient`（画在 `body::after` 上），不引任何图片；
显示字体换成等宽，全方角，标题带一层很淡的磷光辉光。断言里有一条专门读
`getComputedStyle(body, '::after').backgroundImage` —— 证明它真的被画出来了，
而不只是 CSS 里写了这行字。

**瑞士极简（swiss）**：纯白画布、纯黑发丝线、单一红色强调、全方角、无阴影，
靠字号与留白而不是边框建立层级 —— 所以这套主题做的是**减法**：`body::before/after`
两个底纹整块关掉、卡片阴影清零、`h1` 放大约一档（实测 80px vs 粗野主义的 68px）。
对比度余量最小的两处都在这一套（红底白字与强调色分别 5.67:1），改这两个值之前先看守卫。

**后加的四套（水墨宣纸 / 午夜档案馆 / 霓虹落日 / 孔版印刷）**走的是另一条实现路线：
个性全部写成**运行时 token**，而不是像 brutal / swiss 那样在文件末尾另写一份
无层级的逐类覆盖块 —— 那种块一套动辄 400–900 字节，而 CSS 预算只剩两 KB 出头。
每套的"性格"由 `--font-display`（标题字形）、`--r-*` / `--bw`（面板与抽屉的形状）、
`--c-grid`（整页底纹颜色）与 `--c-glow`（暗色系的卡片柔光）这几个 token 承载，
浏览器验收逐条读计算值，所以不会沦为「只换颜色的假主题」：

- **水墨宣纸（ink）**：绢本灰画布、浓墨描边、朱砂主色、花青标记，全方角发丝边。
  标题不另写字体栈 —— 默认衬线栈本来就以宋体兜底，中文拿到的就是宋体衬线。
- **午夜档案馆（archive）**：深靛蓝画布配黄铜强调，小圆角，卡片边缘一圈黄铜柔光。
  与「灰烬」的暖灰褐明确区分开。
- **霓虹落日（sunset）**：深紫罗兰配品红与青，几何无衬线标题带一层很淡的品红辉光。
  与「赛博终端」不同源：那套是纯黑上的磷光绿 + CRT 扫描线。
- **孔版印刷（riso）**：亮黄纸 + 电光蓝，粗黑描边全方角，卡片与按钮带一道**错位套印**
  的青色硬阴影（偏移量比粗野主义的"踩下去"更小 —— 是没对齐，不是按压）。
  亮黄底上的正文必须压到近黑才够 14:1，这是量出来的，不是为了酷。

四套里只有 ink / riso 需要一条显式的「方角」覆盖（既有组件读的是被 `@theme inline`
内联成字面量的圆角，token 管不到它们），sunset 的标题辉光与 riso 的套印阴影也各有一条
—— 见 `global.css` 第 1b 与第 8 节。

### 形状与质感：运行时 token，而不是逐类覆盖

`@theme inline` 会把 token 的**值**内联进工具类（产物里是
`.rounded-card{border-radius:.875rem}` 这样的字面量），所以圆角没法靠改变量覆盖 ——
这也是文件末尾那一整块无层级 `[data-theme='brutal'] .btn { … }` 存在的原因。

新增的组件（主题面板、标签过滤条、预览弹层）不重复那套做法：它们读
`--r-card` / `--r-pill` / `--r-sm` / `--bw` / `--c-glow` 这几个**运行时**变量
（定义在 `:root`，各主题块按需覆盖），于是"粗野主义与瑞士都是方角"只需要在各主题块里
改一行 `--r-pill: 0`。半透明的强调色一律写成 8 位十六进制（`#39ff1455`），
避免用 `color-mix()` —— 产物会为它生成一份 `@supports` 孪生规则，等于每条规则写两遍，
而 CSS 预算是硬的。

### 默认主题：新粗野主义（neo-brutalism）

它换的不只是颜色，还有形状语言：纸白画布、纯黑描边、模糊半径为 0 的硬阴影、全方角、
没有渐变也没有柔光（连页头的毛玻璃都去掉），标题字体从衬线换成粗黑系统栈。

四件值得写下来的事：

- **形状与显示字体不能靠 token 覆盖。** `@theme inline` 会把 token 的值**内联**进工具类
  —— 产物里是 `.rounded-card{border-radius:.875rem}`、
  `.rounded-full{border-radius:2147483647px}`、`.font-display{font-family:<衬线栈>}`，
  没有一个 `var()`。所以这一套的方角、硬阴影与字重写在 `global.css` 末尾一个
  **无层级**（不在任何 `@layer` 里）的覆盖块中：无层级声明优先于所有层，
  而写进 `@layer components` 会被 `@layer utilities` 盖掉。
- **亮青过不了对比度。** 新粗野主义常见的亮青对白底只有约 3:1，够不到 4.5 的门槛，
  所以这里的 teal 是压暗过的 `#0a6169`；同理按钮上是黑字压橙底而不是白字。
  这两处都是守卫的对比度检查挡回来的。
- **默认值只有一个来源。** 这套 token 写在 `:root`（基础层），
  另两套是 `[data-theme='light']` / `[data-theme='dark']` 上的覆盖 ——
  包括显示字体：衬线栈的唯一来源是 `@theme inline` 的 `--font-display`，
  所以浅 / 深什么都不用写就仍是衬线，粗野主义只在一条 `[data-theme='brutal']`
  规则里换成粗黑栈。要是把字体并进 `:root`，就得把衬线栈复制到另外两套里去。
- **整个站点都不再跟随系统偏好。** `prefers-color-scheme` 只剩「浏览器地址栏配色」
  那一条 `<meta>` 还在用；两套浅 / 深是用户自己选的，默认也不是猜出来的。

`--brutal-shadow` / `--brutal-shadow-sm` 与 `--c-hairline-strong` / `--c-grid` /
`--c-ember-soft` 同属**纯装饰 token**：只用于阴影、描边与网格，从不承载文字，
所以不参与守卫的对比度计算。

**几个刻意的取舍：**

- **零 WebFont，用系统字体栈。** 换来的是一点外部请求都没有、没有 FOUT，
  也不用为中文正文背几 MB 的 CJK 字体。代价是标题的衬线字形随系统略有差异。
- **珊瑚底上的文字用近黑而不是白。** 白字对 `#cc785c` 只有 3.3:1，
  过不了 WCAG AA —— 而按钮与跳转链接都是小字号。这条由守卫的对比度检查盯着。
- **主题引导脚本内联、且哈希手工登记。** 晚一步执行就会先画出错误的主题再改回来；
  而 Astro 只为它自己产出的脚本生成哈希，`set:html` 注入的不在其中
  （详见 `src/lib/csp.ts` 的注释）。

### 底纹、动效与装饰 token

背景是两层 `position: fixed` 的纯 CSS 图层（不请求任何图片）：三层 bloom（暖 / 冷 / 暖，
最大的一层锚在视口下方 112% 处，保证滚到任何位置、视口下半部分都留着余温）+ 一层 32px
的方格纸纹理（用 `mask-image` 朝下淡出）。

> 这一版是被实测推着改的：对验收截图逐像素采样发现，旧版只有一个 68rem×34rem 的椭圆、
> 62% 处即透明，于是页面只有顶部约 270px 有颜色，其余部分逐像素等于画布色。
> 现在同一位置（右侧空白列）的通道偏离从 `0` 变成 `8–29`，且 32px 周期正好落在网格线上
> —— 有客观指标，不必凭感觉说"更有质感了"。

三个新 token（`--c-hairline-strong` / `--c-grid` / `--c-ember-soft`）**只用于描边、
网格与封面渐变，从不承载文字**，所以不参与守卫的对比度计算；基础对比度契约仍是原来那 9 对，
一个都没改 —— 新粗野主义也是这 9 对，只是换了一组值（外加同类的两个硬阴影 token）。动效的时间与缓动 token（`--ease-ember` / `--dur-*`）刻意放在 `:root` 而
不放进 `@theme`：放进去会覆盖 Tailwind 内建的 `--ease-out`，改变已有工具类的语义。

动效全部由 CSS 驱动（零客户端 JS），两条硬规矩写在 `global.css` 的 2.5 节里：

- **`.reveal` 只动 `transform`，绝不动 `opacity`。** 文字在任何瞬间都完全可读；更要紧的是，
  `opacity` 从 0 起跑时"滚动时间线不活跃"就等于"内容永久隐身"。
- **`.reveal` 不得加在任何 `position: sticky` 元素的祖先上。** 祖先上的 `transform` 会新建
  包含块，把 sticky 直接废掉（页头与详情页目录都靠它）。

页头投影用 `animation-timeline: scroll(root)`、滚动进场用 `view()`，都包在 `@supports` 里
渐进增强：不支持的浏览器看到的是静态终态，而不是"动不了"的中间态。

## 部署

**约束：仓库名必须是 `Elari39.github.io`。** 用户站点只能由同名仓库提供，
站点根就是 <https://elari39.github.io/>，没有子路径。

发布流程（`.github/workflows/deploy.yml`）：

1. `verify`：main push、面向 main 的 PR 与手动触发都跑：类型检查、一次构建、静态守卫与反例、素材检查、完整浏览器验收。成功后上传该份 `dist` 的 Pages artifact，失败时保留日志与截图。
2. `deploy`：仅 main 上非 PR 事件执行，直接发布已验收的 artifact，不重新安装或构建。

**Pages 的发布源必须是「GitHub Actions」**（Settings → Pages → Source）。
如果发布 job 报找不到 Pages 站点，就是这一项没设：

```bash
gh api -X POST repos/Elari39/Elari39.github.io/pages -f build_type=workflow
```

**与项目站点的区别：** 这个仓库是用户站点，所以 `astro.config.mjs` 里
`site: 'https://elari39.github.io'` 且**不设 `base`**。同账号下的 `shiki-toolbox`
那种项目站点需要 `base: '/<repo>/'` —— 两者不能照抄配置。

## 已知限制

- **挡不住点击劫持。** GitHub Pages 不允许自定义响应头，CSP 只能用 `<meta>` 形式，
  而规范规定 meta 形式会忽略 `frame-ancestors`（Chrome 甚至为它每页打一条控制台错误，
  所以本站干脆不写这条指令）。要真正解决，得挂一层能设响应头的 CDN 或代理。
- **CSP 之外没有响应头。** HSTS、`X-Content-Type-Options`、`Referrer-Policy`
  这些同样需要响应头，本站都没有。
- **半透明装饰需要 `color-mix()`。** Tailwind 管线里的 Lightning CSS 把浏览器目标
  硬编码在 Safari/iOS 16.4、Firefox 128、Chrome 111（没有公开配置入口），而那组
  目标不支持 `color-mix()` 的 lab/oklab 插值 —— 于是每条用到它的声明都会多生成一份
  `@supports` 回退（实测 28 块、约 4.9 KB，占外链 CSS 的 10%）。为此我们把所有
  `color-mix` 装饰声明包进自己的 `@supports (color: color-mix(in lab, red, red))`
  里（原因见 `global.css` 文件头），换回约 3 KB 预算。代价：不支持 `color-mix()` 的
  浏览器（Chrome < 111 / Safari < 16.2 / Firefox < 113）失去页底 bloom、选中底色、
  封面渐变与卡片柔光这类**装饰** —— 承载文字的颜色一律没动，9 对对比度不受影响，
  这些浏览器本来也没有 `animation-timeline` / `::view-transition-*`。
- **无分析、无评论、无搜索、无 i18n。** 都是刻意的：前三个会破坏「没有第三方请求」
  与「仅两段脚本」这两条承诺；i18n 会让正文翻倍。将来要加，也该先想清楚
  它值不值得放弃某条承诺。
- **图版靠人眼。** 自动化只能判断「是不是空白页」，判断不了「好不好看」。
- **默认主题不跟随系统偏好。** 深色系统的访客第一眼看到的也是纸白的新粗野主义 ——
  这是刻意的：默认值写在 HTML 上，不是用 `prefers-color-scheme` 猜的。要跟随系统，
  就得放弃"默认值只有一个来源"这条，或者接受无 JS 时落到另一套外观上。
- **`theme-color` 只跟默认主题。** 浏览器地址栏配色是一条写死的 `<meta>`
  （默认主题的画布色 `#fffdf4`），手动切到浅 / 深时不会跟着走。
  要让它跟着走就得多一段改 meta 的脚本，还得处理"改完会不会闪"——不值得。
- **CryptoWitch 没有 Release**，所以条目只链仓库，没有下载按钮。
- **Ruiqiang Website 的图版里含该公司自己公开的信息**（联系电话、工商登记摘要）。
  本站只收录它 README 已公开发布的那三张实拍，绝不碰 `img/` 下的营业执照原图；
  图上的浏览器窗口外框是那个项目的脚本合成的，右下角的 `Powered by Netlify`
  角标则是真实存在的。
- **那条手机端图版只有 418px 宽。** 详情页通过构建生成的外链 CSS 限制在原始宽度以内；点击图版可打开原图。

## 许可

MIT。本站自身是 MIT；被展示的四个项目各自另有许可 —— `AshenCourier` 与
`ruiqiang-website` 为 MIT，`CryptoWitch` 与 `Notes of Ashen` 未声明许可。


### 守卫自身的反例与验收证据

`pnpm test:guard` 在临时目录复制真实构建后注入故障：404 行内样式、重复标题、非首块 JSON-LD 损坏、伪同源域名、缺资源、非首页 JS 超预算、UTF-8 超预算、图片尺寸不符、CSS 第三方资源及数字说明漂移。每个案例必须断言具体错误，不接受任意异常代替预期失败。原始 dist 不被修改。

`pnpm test:assets` 覆盖缺源、损坏图、空白图、手工图入清单、生成失败保留成品与替换中途失败回滚。测试故障注入仅作用于临时目录，不代表真实 Chrome 已渲染成功。

浏览器除主题面板（每套主题逐个选中、键盘、Esc 与点外部关闭）、视图过渡及其降级、
标签过滤及其无 JS 降级、CSP、无 JS、动画与 reduced-motion 契约外，还检查精确 HTTP 状态、所有阶段的网络和控制台错误、真实组件背景的文字对比度、键盘目录和图版、无效主题值及不可用存储。截图及 `result.json` 位于 `.assets-raw/verify/`（五套主题 × 各页面），预览日志为 `.assets-raw/preview.log`。任何失败阻止发布。

每套主题的截图都是**用 `<html data-theme>` 直接渲染出来的**，不是靠注入脚本 ——
站点的 CSP 只放行登记过哈希的内联脚本，任何临时注入的 `<script>` 都会被静默拦掉，
那样拍出来的五张图会全是默认主题。截图之后还会用众数颜色独立核对每张图的画布色，
证明它真的是那一套主题。

手机页头为品牌与导航两行；小于 1280px 时目录使用原生 `<details>`。这两项与图版原图入口都不增加客户端脚本。

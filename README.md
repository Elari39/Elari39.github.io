<div align="center">

# Ashen Witch's Grimoire

**灰烬女巫的魔典** —— 把做过的项目，写成一本可以翻的魔典。

三个自建项目的条目库，部署在 <https://elari39.github.io/>。

[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222222?logo=githubpages&logoColor=white)

</div>

---

## 这个站点是什么

一本静态的「项目魔典」：每个项目是一条**条目**，结构化字段写在 frontmatter，
长文叙述写在正文，构建期渲染成纯静态 HTML。目前收录三条：

| 条目 | 项目 | 形态 | 线上 |
| --- | --- | --- | --- |
| I | **Notes of Ashen** | 前后端分离的个人博客系统（Go + go-zero + MySQL / Redis + React 18） | <https://blog.miku831.fun/> |
| II | **AshenCourier** | 匿名可用的短链服务（Go 1.27 标准库 + PostgreSQL 18 + Redis 8 + Vue 3） | <https://shorten.miku831.fun/> |
| III | **CryptoWitch** | 本地文档保险箱（Go + Wails v3 + Argon2id / AES-256-GCM） | 仅仓库（无 Release） |

首页是五段：**序言**（左文字右印记）、**数字条**（四条可核对的事实，其中条目数是
构建期从内容集合算出来的）、**条目**（三张程序化封面的卡片）、**图版**（把各个条目的
截图摊成一条横向走廊）与**三条自我约束**。

站点本身就是个小工程：不引任何第三方运行时资源、默认零客户端 JS，并且带一套
**构建产物守卫**与一套**浏览器级验收**。下面把这些都写清楚。

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
| 样式 | **Tailwind CSS 4**（`@theme inline`） | 设计 token 是运行时 CSS 变量，所以三套主题不需要三份工具类 |
| 客户端 JS | 一段主题引导脚本 + 一段切换按钮脚本 | 内联后 gzip **0.42 KB**；守卫脚本盯着这个预算 |
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
│  └─ og-template.html            # OG 卡片模板（渲染成 public/og.png）
├─ public/
│  ├─ shots/ashen-courier/*.webp  # 条目图版（复用项目仓库里的真实截图）
│  ├─ favicon.svg / favicon.ico / apple-touch-icon.png / og.png
│  └─ robots.txt
└─ src/
   ├─ content.config.ts           # 条目 schema（zod）
   ├─ content/projects/*.md       # 三个条目
   ├─ data/site.ts                # 站点常量（站名、导航、自我约束）
   ├─ data/plates.ts              # 图版尺寸（生成文件，勿手工编辑）
   ├─ layouts/BaseLayout.astro    # head / SEO / OG / JSON-LD / 主题引导
   ├─ components/                 # Header / Footer / ProjectCard / Glyph / ThemeToggle
   │                              # + SigilPlate / Attestation / PlateRail / Toc
   ├─ pages/                      # index / about / 404 / projects/[slug]
   └─ styles/global.css           # 三套主题的 token 与组件样式
```

## 本地开发

```bash
pnpm install
pnpm dev            # http://localhost:4321
pnpm build
pnpm preview        # 拿 dist/ 起静态服务器
```

环境要求：Node ≥ 22.12（CI 用 24）、pnpm（版本由 `packageManager` 字段钉住）。
素材流水线额外需要 Python + Pillow 与一个 Chrome / Edge —— 但**只有素材变了才需要**，
日常开发与 CI 都不碰它。

## 质量守卫

这个仓库的规矩是：**能被检查的承诺才算承诺**。所以对外说的每一句话基本都有一条
检查盯着；CI 里 `verify` 不过就不发布。

```bash
pnpm verify          # astro sync + tsc --noEmit + astro check + build + guard
pnpm guard           # 只跑构建产物守卫（需要先 build）
pnpm verify:browser  # 浏览器级验收（需要先起 pnpm preview）
```

### `pnpm guard` —— 对 `dist/` 的十七组核对

| 组 | 检查什么 |
| --- | --- |
| 结构 | 该有的页面与文件一个不少（含 `404.html`、`robots.txt`、`sitemap-index.xml`、图标与 OG 图） |
| SEO | 每页都有唯一的 `<title>`、description、canonical、`og:image`，且 canonical 必须等于本站地址 |
| 链接 | 站内链接与本地资源在 `dist/` 里确实存在 —— 图版路径写错会当场暴露 |
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
| 对比度 | 用 `global.css` 里的**真实 token** 算 WCAG 比值，三套主题各 9 对，正文与标记要求 ≥ 4.5:1；另外核对三套的画布色互不相同 |
| 体积 | 客户端 JS（gzip，含内联）≤ 4 KB；首页 HTML ≤ 60 KB |
| CSS 预算 | 外链 CSS ≤ 48 KB —— 底纹、动效与装饰都在 `global.css` 里，体积代价得看得见 |
| 反漂移 | 首页数字条上的两个数字必须与守卫里的常量一致（`4 KB`、`9 组`） |

最后两条是给首页那块「数字条」上锁的：面板存在的全部意义就是**它说的和检查的是同一件事**，
所以守卫会反过来核对首页 HTML 里的数字，改了一边没改另一边就会红。

### `pnpm verify:browser` —— 文件级检查证明不了的事

无头 Chrome + CDP 把页面真跑一遍（零 npm 依赖：Node 自带 `WebSocket` 与 `fetch`）。
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
- 点击主题切换按钮后按 **新粗野主义 → 羊皮纸 → 灰烬 → 新粗野主义** 循环，
  每一步都翻转 `data-theme`、写入 `localStorage`，**刷新后仍然保持**
  （刷新点停在中间那一套上，回来时再确认循环是闭合的）；
- 三套主题的 `getComputedStyle` 背景色确实互不相同，**且浅色下 `h1` 回到衬线栈**
  —— 后者挡住了"把 `--font-display` 写进 `:root`、结果三套主题都变粗黑"那类改法；
- **新粗野主义里「token 覆盖不到」的那一半也真的生效**：条目卡与切换按钮的
  `border-radius` 为 0、阴影的模糊半径为 0、`h1` 走粗黑无衬线而不是衬线、页头不再毛玻璃。
  这一条挡的是"只改了变量、忘了形状"这种半生效的改动 —— 也正是它需要在
  `global.css` 末尾那样一个无层级覆盖块的原因；
- 1440px 与 390px 下都没有横向滚动，**且 390px 那一次是在新粗野主义下量的**：
  硬阴影向右下探出，是这套主题唯一真实的溢出风险，只在默认主题下量是量不到它的；
- **滚动进场动画一定收敛到可见终态**：逐个把 `.reveal` 滚进视口，再断言它的 `transform`
  归位、`opacity` 为 1 —— 挡住"动到一半就永久停住"这种只有真跑一遍才看得见的回归
  （所以首屏以下的内容才敢用 `animation-timeline: view()`）；
- **`prefers-reduced-motion: reduce` 下动效整体让位**：每页都没有元素停在位移中间态、
  没有横向滚动、内容照常渲染。注意 base 层那条"把 animation-duration 压到 0.01ms"的
  全局兜底对 scroll-driven 动画**无效**（那类动画不看 duration），所以每条动效都另外包在
  `(prefers-reduced-motion: no-preference)` 里。

它同时把每页的浅色 / 深色 / 新粗野主义 / 窄屏截图写到 `.assets-raw/verify/`，
外加首页在新粗野主义下四个滚动位置、390px 与「禁用脚本」的一张预览图，供人眼复核。

> 两个脚本的分工值得说明：`guard` 是**快速、离线、每次提交都跑**的契约测试；
> `verify:browser` 是**慢一些、需要浏览器**的行为验收。
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

1. **图版**：把 `../AshenCourier/docs/screenshots/` 里的真实截图缩到 1400px 宽
   （**只缩不放**，放大只会变糊），输出 WebP，并写下 `src/data/plates.ts`。
2. **图标**：用 Pillow 画站点印记（深色底 + 余烬菱形 + 琥珀内芯），
   生成 180×180 的 `apple-touch-icon.png` 与多尺寸 `favicon.ico`。
3. **OG 卡片**：用无头 Chrome 渲染 `scripts/og-template.html` → `public/og.png`（1200×630）。
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
`public/shots/<slug>/`，先 `pnpm assets:inspect` 确认它不是空白页，再写进条目的 `gallery`。

> 那次失败正是被 `--inspect` 里「标准差 < 3 判为空白页」这条检查发现的。
> 这也正是它存在的理由：流水线产出的图必须被检查过，才算验收。

### 不要带进仓库的东西

三个项目目录里有敏感文件，**一律不复制进本站仓库**：
`.env`、`CryptoWitch/access.yaml`、`notes_of_ashen_backup.sql`、
`CryptoWitch/content/plain/**`（明文资料）、`security-audit/evidence/**`。
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
| `highlights` | string[]，**≥ 3 条** | 首页卡片取前三条，详情页全部展开 |
| `links.repo` | 必须以 `https://github.com/Elari39/` 开头 | 仓库地址 |
| `links.live` | 可选 | 线上演示 |
| `gallery` | `{ src, alt, caption? }[]` | 图版，`src` 是 `public/` 下的绝对路径 |

正文用普通 Markdown 写。**不要用围栏代码块做语法高亮**：本站关掉了 Shiki，
代码块只会有 `global.css` 里的等宽样式（ASCII 架构图正合适）。

## 设计系统

三套主题，token 只有一处来源：`src/styles/global.css` 的 `--c-*` 变量，
再通过 `@theme inline` 暴露成 `bg-canvas` / `text-ink` 这类工具类。

**默认是新粗野主义**（写在 `:root` 这个基础层上，并由服务端直接渲染到
`<html data-theme="brutal">`）；**羊皮纸（浅色）与灰烬（深色）是它之上的覆盖，
只能手动选到**。切换按钮按 **新粗野主义 → 羊皮纸 → 灰烬** 循环，选择存在
`localStorage`。主题清单只有一处定义（`src/lib/theme.ts` 的 `THEME_IDS`，
**第 0 项就是默认主题**），默认值、引导脚本接受的合法值与按钮的循环顺序都从它生成。

> 默认主题没有用 `prefers-color-scheme` 去猜。它写在 HTML 上，引导脚本只在
> 访客手动选过之后才覆盖它（sync，早于首屏绘制）——所以脚本没跑、被 CSP 拦掉
> 或属性被谁删掉，看到的都是新粗野主义，而不是某个没人描述过的第四种样子。

| 语义 | 羊皮纸（浅色） | 灰烬（深色） | 新粗野主义 |
| --- | --- | --- | --- |
| 画布 | `#faf9f5` | `#121110` | `#fffdf4` |
| 卡片 | `#efe9de` | `#1f1e1b` | `#ffffff` |
| 描边 | `#e6dfd8` | `#2e2c28` | `#101010` |
| 正文 | `#3d3d3a` | `#d8d4cb` | `#1a1a1a` |
| 标题 | `#141413` | `#faf9f5` | `#0a0a0a` |
| 主色 | `#cc785c` | `#e08d6d` | `#f04e14` |
| teal / amber 标记 | `#276b5e` / `#8f5a10` | `#5db8a6` / `#e8a55a` | `#0a6169` / `#8a5200` |

前两套色板继承自 AshenCourier 的 `DESIGN.md`（暖奶油画布 + 珊瑚主色 + 深色面板），
所以这个站点与它展示的项目看起来像同一个作者做的。

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
网格与封面渐变，从不承载文字**，所以不参与守卫的对比度计算；正文级颜色仍是原来那 9 对，
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

1. `verify`：任何 push 与 PR 都跑 —— 类型检查、构建、守卫。
2. `deploy`：只有 `main`（或手动触发）才跑，重新构建并以 artifact 上传，
   由 `actions/deploy-pages` 发布。

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
- **无分析、无评论、无搜索、无 i18n。** 都是刻意的：前三个会破坏「没有第三方请求」
  与「零客户端 JS」这两条承诺；i18n 会让正文翻倍。将来要加，也该先想清楚
  它值不值得放弃某条承诺。
- **图版靠人眼。** 自动化只能判断「是不是空白页」，判断不了「好不好看」。
- **默认主题不跟随系统偏好。** 深色系统的访客第一眼看到的也是纸白的新粗野主义 ——
  这是刻意的：默认值写在 HTML 上，不是用 `prefers-color-scheme` 猜的。要跟随系统，
  就得放弃"默认值只有一个来源"这条，或者接受无 JS 时落到另一套外观上。
- **`theme-color` 只跟默认主题。** 浏览器地址栏配色是一条写死的 `<meta>`
  （默认主题的画布色 `#fffdf4`），手动切到浅 / 深时不会跟着走。
  要让它跟着走就得多一段改 meta 的脚本，还得处理"改完会不会闪"——不值得。
- **CryptoWitch 没有 Release**，所以条目只链仓库，没有下载按钮。

## 许可

MIT。三个被展示的项目各有自己的许可（AshenCourier 与 shiki-toolbox 均为 MIT）。

<div align="center">

# Ashen Witch's Grimoire

**灰烬女巫的魔典** —— 把做过的项目，写成一本可以翻的魔典。

[线上网站](https://elari39.github.io/) · [主题图鉴](https://elari39.github.io/grimoire/) · [源码仓库](https://github.com/Elari39/Elari39.github.io)

[![Deploy](https://github.com/Elari39/Elari39.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/Elari39/Elari39.github.io/actions/workflows/deploy.yml)

</div>

## 这个站点是什么

一个由 Astro 构建的静态项目条目库。每个项目使用一份带 schema 校验的 Markdown，记录功能、架构、实现难点与取舍；页面在构建时生成，不依赖数据库或客户端框架运行时。

本站是五个独立仓库中的展示站，其余四个项目各自维护代码和部署流程：

| 项目 | 形态与当前技术栈 | 入口 |
| --- | --- | --- |
| **AshenGrimoire** | Astro 7、Tailwind CSS 4、GitHub Pages | [网站](https://elari39.github.io/) · [仓库](https://github.com/Elari39/Elari39.github.io) |
| **Notes of Ashen** | Go 1.27、go-zero、MySQL / Redis、React 18；个人博客，支持可选搜索、AI 写作和 RAG | [博客](https://blog.miku831.fun/) · [仓库](https://github.com/Elari39/Notes-of-Ashen) · [条目](https://elari39.github.io/projects/notes-of-ashen/) |
| **AshenCourier** | Go 1.27、PostgreSQL 18、Redis 8、Vue 3；匿名短链与异步点击统计 | [短链服务](https://shorten.miku831.fun/) · [仓库](https://github.com/Elari39/AshenCourier) · [条目](https://elari39.github.io/projects/ashen-courier/) |
| **CryptoWitch** | Go 1.25、Wails v3、Vue 3；构建期加密的 Windows 文档保险箱 | [源码与构建说明](https://github.com/Elari39/CryptoWitch) · [条目](https://elari39.github.io/projects/cryptowitch/) |
| **Ruiqiang Website** | Next.js 16、React 19、Tailwind CSS 4；静态生成的企业官网，使用 Next 运行时托管 | [官网](https://ruiqiang-jianzhu.netlify.app/) · [仓库](https://github.com/Elari39/ruiqiang-website) · [条目](https://elari39.github.io/projects/ruiqiang-website/) |

四个项目不是本站的构建依赖。条目是人工维护的工程记录，不会自动跟随相邻仓库版本更新；具体启动命令和最新能力以各项目 README、源码与锁文件为准。

首页包含序言、构建期统计、标签过滤、项目卡片与快速预览、图版走廊和站点约束。详情页提供正文目录、前后条目导航和图版浮悬窗；主题图鉴在同一页展示九套主题样品。

## 目录

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

| 层 | 实现 |
| --- | --- |
| 页面 | Astro 7 静态输出，目录路由统一使用尾斜杠 |
| 内容 | 内容集合、`astro/loaders` 与 Zod；构建期验证 frontmatter |
| 样式 | Tailwind CSS 4、CSS 运行时 token、系统字体栈与内联 SVG |
| 交互 | 同步主题引导 + 共用交互脚本；原生 `<details>`、`<dialog>` 与渐进增强 |
| 图片 | Pillow 预处理为 WebP；原生 `<img>` 声明真实宽高 |
| 安全 | Astro CSP meta；主题引导哈希由同一份脚本文本计算并显式登记 |
| 验收 | 构建产物守卫、预算与对比度断言、故障反例、Chrome / CDP 浏览器契约 |
| 发布 | GitHub Actions 验收并上传同一份 `dist`，`actions/deploy-pages` 发布 |

页面恰好包含两段**可执行脚本**，所有路由的脚本体逐字节相同。JSON-LD 是数据块，不计入可执行脚本数量及 JS 预算。没有客户端路由器、第三方字体、CDN、分析脚本或远程运行时资源。

## 目录结构

```text
.github/workflows/deploy.yml    验收 → 上传 Pages artifact → 发布
astro.config.mjs               正式域名、尾斜杠、外链 CSS、CSP、关闭 Shiki
src/
  content.config.ts            项目 schema
  content/projects/*.md        四个项目条目，文件名决定路由
  data/site.ts                 站名、导航、自我约束与首页数字文案
  data/plates.ts               生成的图版尺寸，勿手工维护
  layouts/BaseLayout.astro     head、SEO、JSON-LD、两个脚本的统一入口
  lib/theme.ts                 THEME_IDS、默认主题、标签与引导脚本
  lib/csp.ts                   CSP 指令与主题引导哈希
  lib/tags.ts                  标签归一化、计数与筛选词表
  lib/entry.ts                 项目视图类型、状态标签与序号
  components/                 卡片、品牌、主题面板、目录、图版等
  pages/                      首页、about、grimoire、404、projects/[slug]
  pages/plate-sizes.css.ts     构建生成图片宽度上限 CSS，避免行内 style
  scripts/interactions.ts     全站共用交互入口
  styles/global.css           主题 token、组件、阅读布局与动效
scripts/
  site-model.mjs              HTML / YAML 解析及文件、路由模型
  check-site.mjs              构建产物守卫入口
  audit-site.mjs              结构化产物检查
  budget.mjs                  体积与对比度的唯一测量口径
  assert-budgets.mjs           独立预算断言与 CI 报告
  verify-browser.mjs          浏览器验收入口
  browser-contracts.mjs       浏览器通用契约
  interaction-contracts.mjs   交互及无 JS 回退
  reading-contracts.mjs       阅读、预览与图版契约
  run-browser.mjs             启动预览、验收、清理自身服务
  prepare-assets.py           图版 / 图标 / OG 素材流水线
  *.test.mjs / test_assets.py 守卫与素材故障反例
public/                       已提交图版、图标、og.jpg、robots.txt
output/                       设计候选与阅读预览记录，不参与 Tailwind 扫描
```

## 本地开发

要求 Node.js **≥ 22.12**（CI 使用 24）、pnpm **12.5.1**（`package.json` 固定）。完整静态验证还需要 Python 和 Pillow；CI 使用 Python 3.13。浏览器验收及 OG 重新生成需要本机 Chrome / Chromium / Edge，可用 `CHROME_PATH` 指定。

```bash
pnpm install --frozen-lockfile
python -m pip install -r scripts/requirements-assets.txt
pnpm dev                  # http://localhost:4321
```

```bash
pnpm build                # 输出 dist/
pnpm preview              # 预览已经构建的 dist/
```

普通开发、构建与 CI 只读取本站已提交素材，不需要克隆另外四个项目。只有运行 `pnpm assets` 重新生成素材时才需要配置的相邻截图来源。

## 质量守卫

[AGENTS.md](AGENTS.md) 将维护规范指向本 README。修改后使用以下入口，不能只凭开发服务器能打开页面就判断生产 CSP 或交互已通过。

```bash
pnpm verify                # astro sync + tsc + astro check + build
                           # + guard + assert:budgets + test:guard + test:assets
pnpm verify:browser:local  # 验收上述 dist；自动用 127.0.0.1:4322 起预览并清理
```

需要分开运行时：

```bash
pnpm check                 # 仅类型与 Astro 检查
pnpm guard                 # 需要先 build
pnpm assert:budgets        # 需要先 build
pnpm test:guard            # 读取真实 dist，在临时副本中注入故障
pnpm test:assets           # Python 素材反例，使用临时目录
pnpm assets:inspect        # 仅检查正式发布图片，不重新生成
```

也可在一个终端运行 `pnpm preview --port 4321`，另一个终端运行 `pnpm verify:browser`。这是两个独立进程；自动管理预览时优先使用 `verify:browser:local`。

### 体积与对比度预算

所有测量和阈值均来自 [scripts/budget.mjs](scripts/budget.mjs)，`guard`、独立断言和反例共用，不在其他脚本重新实现。

| 指标 | 契约 |
| --- | --- |
| 客户端 JS gzip | ≤ 4096 字节；全部外链脚本各计一次 + 各 HTML 页面内联 gzip 的最大值 |
| 单段可执行内联脚本 raw | **< 4096 字节**，等于阈值也失败 |
| 外链 JS | 必须为 0，保证 Astro 仍内联共用交互脚本 |
| CSS raw | `dist` 中所有 CSS 总和 ≤ 48 × 1024 字节 |
| 首页 HTML | UTF-8 字节 ≤ 60 × 1024 |
| 主题对比度 | 每套 9 对颜色：8 对文字 ≥ 4.5:1，1 对大字号 / 装饰 ≥ 3:1 |

不要在文档中维护上次构建的剩余字节数。加交互、主题或装饰前先运行 `pnpm assert:budgets` 看实际余量；首页数字条必须与预算、颜色对数、主题清单及已发布条目数一致。

### 静态产物检查

`check-site.mjs` 与 `audit-site.mjs` 覆盖以下约束，包括 404：

- 页面和资源齐备，title / description / canonical / OG / JSON-LD 合法；站内链接与跨页锚点存在，id 不重复，sitemap 不收录 404。
- 每页一个 `<h1>`，`lang="zh-CN"`，skip link 指向 `#main`；图片有 alt 与真实 width / height，装饰 SVG 带 `aria-hidden="true"`。
- 没有行内 `style` 属性、第三方资源或 CSP `unsafe-inline`；每段可执行内联脚本的哈希都被放行。
- 两段脚本在各页逐字节一致；全部主题 id 合法、token 键集合一致，面板为每套主题提供预览色块。
- 条目 order 唯一、字段完备；标签归一化、共享与计数一致；卡片顺序、详情和预览内容对应 frontmatter。
- 每张卡片一个原生预览 dialog，标题用 `<h2>`、关闭入口唯一；抽屉计数只看 `#entries` / `.entry-card` 子树。
- 有图版的页面恰好一个浮悬窗；触发链接与缩略图匹配，翻页、图片槽、标题与关闭标记齐备。
- `prefers-reduced-motion: reduce` 下显式关闭 `::view-transition-*` 动画；体积、颜色及首页数字通过统一断言。

`test:guard` 在临时构建副本中制造故障，覆盖缺资源、伪同源地址、重复标题、错误锚点 / 图片尺寸、CSP、JSON-LD、非首页 JS 超限、UTF-8 字节边界及浮悬窗结构等。测试需断言预期错误，不能把任意异常当作拦截成功。

### 浏览器行为与证据

无头 Chrome / CDP 验收生产构建，检查真实 HTTP 状态、CSP 执行、全部阶段的网络与控制台错误，以及：

- 默认主题、手动选择、刷新持久化、无效存储值与存储不可用；默认 `brutal` 直接写入 HTML。
- 主题面板的键盘操作、Esc 与点击外部关闭；主题切换的视图过渡及不支持 API 时的回退。
- 标签多选的并集筛选、清空与状态播报；无 JS 时主题入口、标签条、快速预览入口保持隐藏。
- 原生预览和图版模态的标题可见、初始滚动归零、背景锁定、关闭及焦点归还；图版翻页回绕且只缩不放。
- 无 JS 时正文、详情链接与图版原图链接可用；没有图片的页面不渲染空浮悬窗。
- 各主题真实组件背景的对比度、形状和字体；多视口下的导航、阅读目录和横向溢出。
- 滚动进场、阅读进度线及减少动态效果模式下的可见终态。

截图与 `result.json` 写入 `.assets-raw/verify/`，自动预览日志在 `.assets-raw/preview.log`。CI 保留验收证据，任何阶段失败都会阻止发布。

## 素材流水线

```bash
pnpm assets            # 重新生成图版、图标、OG 和尺寸清单
pnpm assets:inspect    # 检查正式发布图片
```

[prepare-assets.py](scripts/prepare-assets.py) 读取 `PLATE_SOURCES` 白名单，目前使用：

- `../AshenCourier/docs/screenshots/` 下的四张既有截图。
- `../ruiqiang-website/docs/screenshots/` 下的 `desktop-home.png`、`pages-grid.png`、`mobile-home.png`。

短链仓库的 `neo-brutalism/` 截图是另一组素材，当前流水线不会自动改用它们。调整来源时应显式修改映射并重新核对条目的 gallery。

图版按最多 1400px 宽缩小为 WebP，禁止放大；输出真实像素到 `src/data/plates.ts`。`plate-sizes.css.ts` 在构建时生成外链 CSS，约束详情图版最大宽度，避免 CSP 禁止的行内样式。

导航、阅读页与页脚使用 `BrandMark.astro` 的月牙书页；标签页图标使用 `public/favicon.svg` 的星轨封印，Pillow 由同一 SVG 轮廓生成 ICO 和 Apple 图标。OG 卡片由无头 Chrome 渲染 `scripts/og-template.html`，输出 1200×630 JPEG。

流水线先生成和检查候选成品，再替换正式文件；缺源、损坏、疑似空白或替换失败都有失败处理与反例。它只读相邻仓库，不修改源截图。

需要新增人工截图时，将确认过内容的图片放入 `public/shots/<slug>/`，登记条目的 `gallery`，运行 `pnpm assets` 纳入尺寸清单，再执行 `pnpm assets:inspect` 和完整验证。该生成命令仍需要所有已配置源图存在。

图片统计只能提示空白或异常，不能识别 Cloudflare 验证页或证明截图内容有效。本站不自动抓取受验证保护的线上博客；不要把验证页当成项目截图。

仅复制已允许公开的素材。`.env`、CryptoWitch 的 `access.yaml` / `generated.go` / `content/plain/**`、数据库备份、审计私有证据及企业证件原图不属于图版来源。锐强截图中的浏览器外框由其截图脚本合成，托管角标来自拍摄时的真实页面。

## 内容：怎么加一个条目

在 `src/content/projects/` 创建 `.md` 文件，如 `my-project.md` 对应 `/projects/my-project/`。schema 的完整规则见 [src/content.config.ts](src/content.config.ts)。

| 字段 | 要求 |
| --- | --- |
| `title` / `tagline` / `summary` | 非空文字，分别用于项目名、一句话介绍和摘要 |
| `status` | `live`、`wip` 或 `archived` |
| `year` / `role` | 2000–2100 的整数年份 / 非空角色描述 |
| `accent` | `coral`、`teal` 或 `amber`，不能直接填色值 |
| `glyph` | `book`、`link`、`lock`、`sigil` 或 `github` |
| `order` | 正整数，已发布条目间不重复 |
| `stack` | 至少一个技术栈标签 |
| `tags` | 至少两个标签，小写短词、无空格，并与其他条目共用 |
| `highlights` | 至少三条亮点；首页展示前三条 |
| `preview.architecture` | 至少 20 字符的等宽架构图 |
| `preview.challenges` / `preview.lessons` | 难点与心得各至少两条，直接用于预览抽屉 |
| `links.repo` | `https://github.com/Elari39/<repo>`，不得含凭据、查询串或片段 |
| `links.live` | 可选 HTTPS 线上地址 |
| `gallery` | 可选数组；每项有 `/shots/` 下的 `src`、非空 `alt` 和可选 `caption` |
| `draft` | 默认 `false`；`true` 时不生成公开条目与卡片 |

正文用普通 Markdown，模板已经提供唯一的 `<h1>`，正文从 `##` 开始。代码围栏可以展示 ASCII 架构图，但本站关闭 Shiki，不提供语法高亮，避免生成行内样式。正文标题生成目录锚点，需避免与模板的 `highlights`、`stack`、`plates` 等 id 冲突。

添加条目后运行 `pnpm verify`；改动交互、布局或素材展示时再运行浏览器验收。条目数由内容集合计算，其他首页承诺数字仍需与守卫一致。

## 设计系统

主题清单唯一来源为 [src/lib/theme.ts](src/lib/theme.ts) 的 `THEME_IDS`，第 0 项即默认主题；标签、面板和验收从这里取值。CSS token 位于 [src/styles/global.css](src/styles/global.css)。

| id | 名称 | 视觉特征 |
| --- | --- | --- |
| `brutal` | 新粗野主义（默认） | 纸白、粗黑边、方角、硬阴影、粗黑无衬线 |
| `light` | 羊皮纸 | 暖纸色、珊瑚强调、圆角、衬线标题 |
| `dark` | 灰烬 | 暖灰褐深底、圆角、柔光 |
| `cyber` | 赛博终端 | 绿黑、等宽标题、CRT 扫描线 |
| `swiss` | 瑞士极简 | 白黑红、无底纹、无阴影、大字号 |
| `ink` | 水墨宣纸 | 宣纸灰、朱砂、方角发丝边、衬线 |
| `archive` | 午夜档案馆 | 深靛蓝、黄铜、小圆角 |
| `sunset` | 霓虹落日 | 紫底、品红与青、小圆角 |
| `riso` | 孔版印刷 | 亮黄、电光蓝、粗边方角、错位硬阴影 |

默认主题由服务端写入 `<html data-theme="brutal">`；同步引导读取 `localStorage` 的 `grimoire-theme`，仅合法手动选择覆盖默认值。系统明暗偏好不决定主题；无 JS 或存储不可用时仍可阅读默认主题。

### token 与组件约束

- 保持每套主题 token 键集合一致。颜色修改先核对每套九对 WCAG 对比度，不能只看默认主题。
- 新组件直接使用 `--r-card`、`--r-pill`、`--r-sm`、`--bw`、`--c-glow` 等运行时变量，不为每套主题另写一套类覆盖。
- 部分既有 `rounded-*` 工具类经 `@theme inline` 编译为字面量，须保留现有逐类形状覆盖；新组件不重复这套历史实现。
- 新增半透明颜色用八位十六进制，避免 `color-mix()` 生成重复回退规则；已有装饰的 `@supports` 外壳保留，变更后检查 CSS 预算。
- 新主题同步更新清单及名称、CSS token、面板预览和首页主题数字；图鉴及验收读取清单，不复制第二份主题数组。
- Tailwind 只扫描 `src/`，README、脚本和设计候选不应生成工具类。

### 动效、阅读与模态

滚动进场、进度余烬线、底纹和跨文档视图过渡由 CSS 渐进增强。不支持相应能力时保留可见静态内容；不要用从零透明度开始的滚动动画隐藏正文，也不要给 sticky 元素祖先添加 `.reveal` 的 transform。

减少动态效果模式下，除普通元素动画外，必须**显式**关闭顶层 `::view-transition-*`；全局 `*::before` / `*::after` 规则覆盖不到这棵伪元素树。滚动时间线使用独立 `animation-timeline` 声明，避免简写合并后失效。

阅读页采用纯色正文底衬与独立目录栏，小于 1280px 时目录使用原生 `<details>`，页首和页尾提供返回条目入口。快速预览使用原生 `<dialog>` + `showModal()`；打开后把 `scrollTop` 归零，标题 / 关闭按钮吸附顶部，源码 / 阅读入口吸附底部，背景滚动由 CSS 锁定。

`PlateViewer.astro` 共用 `.preview*` 样式，静态 HTML 不放图片，打开时才由缩略图填充。它的触发器是始终可用的原图链接 `data-zoom`；`data-preview`、主题面板和标签条则先带 `hidden`，等交互脚本注册完再显示。两者不能混用。图片不放大，不为浮悬窗另写一套主题样式。

## 部署

正式地址为 **[https://elari39.github.io/](https://elari39.github.io/)**。本地目录可叫 `AshenGrimoire`，GitHub 用户站点仓库为 `Elari39/Elari39.github.io`，不设项目子路径 `base`。

GitHub 仓库 Settings → Pages → Source 选择 **GitHub Actions**。工作流为：

1. main push、面向 main 的 PR 和手动触发运行 `verify`：依赖安装、类型检查、构建、静态守卫、反例、独立预算报告、图片体检和浏览器验收。
2. 验收成功后上传这份 `dist` 作为 Pages artifact，保留浏览器证据。
3. `deploy` 仅在 main 上的非 PR 事件运行，直接发布已验收 artifact，不重新构建，也不使用 `gh-pages` 分支。

更换域名时需同步核对 `astro.config.mjs`、`src/data/site.ts`、`public/robots.txt` 及守卫中的正式 origin，重新验证 canonical、sitemap、OG 和内部链接。不能只改 README 地址。

## 已知限制

- GitHub Pages 不提供仓库级自定义响应头，本站通过 meta 设置 CSP，无法用它实现 `frame-ancestors` 点击劫持保护；平台实际响应头不由项目控制。
- 老浏览器可能缺少底纹、滚动动画或视图过渡装饰，正文仍应可读。交互使用原生 dialog，需要浏览器支持。
- `theme-color` 固定为默认主题画布色，手动切主题后地址栏颜色不随之更新。
- 无站内搜索、评论、分析和多语言正文；当前浏览器本地持久化仅用于主题选择。
- 图片质量与内容真实性需要人工检查；截图可能落后于对应项目线上版本。CryptoWitch 条目提供源码入口，桌面程序按其 README 自行构建。

## 许可

本站源码使用 [MIT](LICENSE)。被收录项目独立授权：AshenCourier 与 ruiqiang-website 提供 MIT 许可；CryptoWitch 与 Notes of Ashen 当前未提供项目级 LICENSE。项目素材、企业资料和第三方数据不因被展示而自动获得本站源码许可。

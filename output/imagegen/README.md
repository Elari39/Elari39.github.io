# 导航图标候选

为 **Ashen Witch's Grimoire / 灰烬女巫的魔典** 生成的六款品牌图标候选，均已保存并检查。
用户已选定 **03「月牙书页」作为导航左侧图标**，**06「星轨封印」作为标签页图标**。
03 已在 `src/components/BrandMark.astro` 中按轮廓重绘为内联 SVG，使用主题 token 配色；
06 已在 `public/favicon.svg` 中重绘，并生成多尺寸 ICO 与 Apple touch 图标。

| 编号 | 方向 | 文件 | 设计含义 |
| --- | --- | --- | --- |
| 01 | 余烬魔典 | [原图](01-ember-grimoire.png) | 打开的书与余烬，直接呼应项目魔典 |
| 02 | 女巫帽 | [原图](02-witch-hat.png) | 女巫身份，轮廓有辨识度 |
| 03 | 月牙书页 | [原图](03-crescent-pages.png) | 月夜、阅读与收藏 |
| 04 | 羽笔火焰 | [原图](04-quill-flame.png) | 写作、工程记录与创造 |
| 05 | 字母符印 | [原图](05-aw-sigil.png) | A/W 首字母与炼金符文 |
| 06 | 星轨封印 | [原图](06-orbital-seal.png) | 工程精度与首页魔法阵呼应 |

生成方式：CLI/API 模式，使用用户提供的 `https://rolldek.com/v1` 接口，
请求模型 `gpt-image-2.5`，每个方向独立提示词，请求 1024×1024、high quality，
接口实际返回的六张原图均为 **1254×1254**。
内置 imagegen CLI 仅能保存 Base64，而该接口返回图片 URL；经用户明确同意后，
使用 [兼容脚本](generate-compatible.py) 保存响应、下载并验证原图。
密钥仅用于本次进程环境，不写入项目文件。
完整最终提示词保存在 [prompts.jsonl](prompts.jsonl)。

[六款总览](icon-options.png) 与 [26px 导航排版示意](navigation-previews.png)
由 [make-preview.py](make-preview.py) 生成；为便于比较，预览统一缩放并去除白底，
上述六张原图与候选总览保持生成结果；当前选择为 03 / 06。

右侧魔法阵独立于候选图标，已经在 `src/components/SigilPlate.astro` 中优化：
清晰的实线封缄、主题色余烬核心、四向定位菱形、32 等分刻度，以及压低背景网格的圆形底衬。
保留 CSS 反向旋转与减少动态效果支持。

验收：`pnpm verify` 与 `pnpm verify:browser:local` 均通过。
浏览器验收的点击助手已改为有界等待真实命中，避免主题视图过渡期间提前点击；焦点断言保持不变。
实测客户端 JS gzip 1.50 KB、CSS 47.9 KB、首页 HTML 44.8 KB，九套主题对比度全部通过。
已保存 [魔法阵主题预览](sigil-display.png) 与 [首页截图](home-updated.png)。
选定图标的验收预览：[导航浅色 / 深色截图](navigation-selected.png)、[标签页图标尺寸](favicon-sizes.png)。

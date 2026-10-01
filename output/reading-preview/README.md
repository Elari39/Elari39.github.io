# 阅读与快速预览优化

已在真实浏览器中检查的页面截图：

- [阅读页](reading-desktop.png)：纯色书页、清晰的返回按钮、统一品牌角标与右侧目录。
- [页末与页脚](reading-footer.png)：页末返回入口、月牙书页品牌标记。
- [快速预览桌面](preview-desktop.png)：滚到末尾仍可见标题、关闭按钮和阅读全文入口。
- [快速预览手机](preview-mobile.png)：保留可用的关闭区域，架构图可横向滚动。
- [快速预览深色](preview-dark.png)：全部颜色与形状随主题变化。

`pnpm verify` 与 `pnpm verify:browser:local` 均通过。浏览器回归覆盖四篇阅读页、
四个预览在桌面/手机竖屏/手机横屏下的滚动与焦点行为、九套主题的组件对比度。
客户端 JS gzip 1.50 KB；CSS 45.2 KB；首页 HTML 48.3 KB。
体积和对比度仍使用仓库原有预算与测量口径，没有提高限额。

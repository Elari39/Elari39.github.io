import { getCollection } from 'astro:content';

import { PLATE_SIZES } from '../data/plates';

/**
 * 构建期生成的小样式表（全站已经链接了它，所以不新增任何请求）。
 *
 * 两件事：
 *  1. 图版的固有宽度上限 —— 让「声明尺寸」不必写成行内 style
 *     （行内样式在 style-src 'self' 下无法用哈希放行）。
 *  2. 每个条目的 `view-transition-name` —— 跨文档视图过渡要用同一个名字
 *     把首页卡片上的标题与详情页的 h1 连起来，才能从卡片"飞"进详情页头部。
 *
 * 为什么名字必须在这里生成：名字得**逐条目唯一**（同一页里重名的话浏览器会
 * 整个跳过这次过渡），而条目是内容集合、构建期才知道。写进 global.css 就只能
 * 硬编四份、加一条条目就漏一条；写成 style 属性又会被 CSP 拦掉。所以由构建期
 * 从内容集合生成 —— 与守卫「清单只有一处来源」的取舍一致。
 */
export async function GET() {
  const widths = [
    ...new Set(Object.values(PLATE_SIZES).map((size) => size.width)),
  ];

  const entries = await getCollection('projects', ({ data }) => !data.draft);

  const plateRules = widths.map(
    (width) => `.plate-width-${width}{max-width:${width}px}`,
  );

  const vtRules = entries.map(
    (entry) => `.vt-title-${entry.id}{view-transition-name:entry-title-${entry.id}}`,
  );

  return new Response([...plateRules, ...vtRules].join('\n'), {
    headers: { 'Content-Type': 'text/css; charset=utf-8' },
  });
}

/**
 * 首页标签过滤的词汇表。
 *
 * 规则很简单，但值得写下来，因为首页那几个筛选按钮**完全**由它决定：
 * 只收被两个以上条目共用的标签 —— 只属于一个条目的标签筛出来就是它自己，
 * 点了等于没点。如果一条共用的都没有（比如将来只剩两个条目），
 * 就退化成全部标签，至少让过滤条不是空的。
 *
 * `data-tags` 属性与按钮列表都走这里的归一化（小写、去重、排序），
 * 两处必须一致：否则会出现"按钮筛不出任何东西"这种看起来像 JS 坏了的现象。
 */

export interface TagCount {
  tag: string;
  count: number;
}

/** 归一化：去空白、小写、去重、按码位排序 */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

/** 序列化成 data-tags 属性值。标签本身不允许含空格（空格是分隔符） */
export function tagsAttribute(tags: readonly string[]): string {
  return normalizeTags(tags).join(' ');
}

/** 按出现次数（降序）与名称（升序）排出的词汇表 */
export function tagVocabulary(
  groups: readonly (readonly string[])[],
  { minEntries = 2, limit = 10 }: { minEntries?: number; limit?: number } = {},
): TagCount[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    // 一个条目里重复写同一个标签只算一次，否则计数会与"有多少条条目带这个标签"不符
    for (const tag of normalizeTags(group)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  const all = [...counts].map(([tag, count]) => ({ tag, count }));
  const shared = all.filter((item) => item.count >= minEntries);
  const picked = shared.length >= 2 ? shared : all;

  // 用码位比较而不是 localeCompare：产物要可复现，不该随运行环境的 ICU 版本变顺序
  return picked.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1)).slice(0, limit);
}

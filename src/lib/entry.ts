/**
 * 页面与组件之间的「条目视图」类型。
 *
 * 组件只依赖这个类型，不依赖 astro:content —— 这样内容集合的 API 变化
 * 只影响把 Markdown 映射成视图的那一处，组件本身不用动。
 */

export type ProjectStatus = 'live' | 'wip' | 'archived';

export type GlyphName = 'book' | 'link' | 'lock' | 'sigil' | 'github';

export interface GalleryPlate {
  src: string;
  alt: string;
  caption?: string;
}

export interface ProjectLinks {
  repo: string;
  live?: string;
}

export interface ProjectView {
  /** 路由片段，也就是 Markdown 文件名 */
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  status: ProjectStatus;
  year: number;
  role: string;
  /** 卡片与详情页的强调色，取自同一套设计 token 的色板 */
  accent: string;
  glyph: GlyphName;
  order: number;
  stack: string[];
  highlights: string[];
  links: ProjectLinks;
  gallery: GalleryPlate[];
}

/** 状态的中文标签；未知状态不猜测，原样显示 */
export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'live':
      return '线上运行';
    case 'wip':
      return '开发中';
    case 'archived':
      return '已归档';
    default:
      return status;
  }
}

/** 罗马数字序号：「条目 I / II / III」，纯粹是魔典的编排方式 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function entryNumber(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

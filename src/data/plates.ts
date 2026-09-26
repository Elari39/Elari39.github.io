/**
 * 图版真实像素尺寸。
 *
 * 由 scripts/prepare-assets.py 生成，**不要手工编辑** —— 重新跑一次
 * `pnpm assets` 就会覆盖它。存在的意义是给 <img> 写 width/height，
 * 让图片在加载完成前就占住位置（避免累计布局偏移）。
 */

export const PLATE_SIZES: Record<string, { width: number; height: number }> = {
  "shots/ashen-courier/create-result.webp": { width: 1400, height: 634 },
  "shots/ashen-courier/dashboard.webp": { width: 1400, height: 1551 },
  "shots/ashen-courier/landing.webp": { width: 1400, height: 1923 },
  "shots/ashen-courier/link-detail.webp": { width: 1400, height: 3030 },
};

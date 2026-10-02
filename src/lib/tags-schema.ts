import { z } from 'astro/zod';
import { normalizeTags } from './tags';

/** 先拒绝不可序列化的标签，再归一化并检查不同标签的数量。 */
export const tagsSchema = z
  .array(z.string().trim().min(1).regex(/^\S+$/, '标签内部不能包含空白'))
  .transform(normalizeTags)
  .pipe(z.array(z.string()).min(2, '至少需要两个不同标签'));

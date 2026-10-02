#!/usr/bin/env node
/** CLI 只负责路径、报告与退出码；全部判定在 audit-site.mjs，HTML 统一由 parse5 解析。 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from './audit-site.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = process.argv.indexOf('--dist');
try {
  if (distIndex !== -1 && (!process.argv[distIndex + 1] || process.argv[distIndex + 1].startsWith('--'))) {
    throw new Error('--dist 需要一个构建目录');
  }
  const dist = path.resolve(distIndex === -1 ? path.join(root, 'dist') : process.argv[distIndex + 1]);
  console.log(`Ashen Witch's Grimoire — 构建产物守卫\ndist: ${dist}`);
  const errors = await audit(root, dist);
  if (errors.length) {
    console.error(`${errors.length} 项未通过：\n${errors.map((error) => `  - ${error}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('全部通过。逐项体积与对比度报告：pnpm assert:budgets');
  }
} catch (error) {
  console.error(`守卫无法完成：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

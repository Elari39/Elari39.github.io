import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { entries } from './site-model.mjs';

// 使用已有 TypeScript 编译器加载纯模块，不依赖 Node 新版才默认启用的 TS 支持。
async function moduleUrl(file, imports = {}) {
  let source = await readFile(new URL(file, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(`'${specifier}'`, JSON.stringify(url));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const tagsUrl = await moduleUrl('../src/lib/tags.ts');
const { normalizeTags, tagsAttribute, tagVocabulary } = await import(tagsUrl);
const { tagsSchema } = await import(await moduleUrl('../src/lib/tags-schema.ts', {
  './tags': tagsUrl,
  'astro/zod': import.meta.resolve('astro/zod'),
}));

test('标签归一化、去重与属性序列化保持一致', () => {
  assert.deepEqual(normalizeTags([' Vue ', 'go', 'GO', '']), ['go', 'vue']);
  assert.equal(tagsAttribute([' Vue ', 'go', 'GO']), 'go vue');
  assert.deepEqual(tagsSchema.parse([' Vue ', 'GO', 'go']), ['go', 'vue']);
});

test('schema 拒绝空白、内部空白及归一化后不足两个标签', () => {
  for (const tags of [[], ['go'], ['go', ' GO '], ['go', ' '], ['go', '\t'],
    ['go', 'web app'], ['go', 'web\tapp'], ['go', 'web\napp'], ['go', 'web\u3000app']]) {
    assert.equal(tagsSchema.safeParse(tags).success, false, JSON.stringify(tags));
  }
});

test('零个或一个共用标签时不以独有标签补位', () => {
  assert.deepEqual(tagVocabulary([['a'], ['b']]), []);
  assert.deepEqual(tagVocabulary([['shared', 'a'], ['shared', 'b']]), [{ tag: 'shared', count: 2 }]);
});

test('词汇表按条目计数、次数降序与码位升序排序，并应用上限', () => {
  const groups = [['b', 'a', 'B', 'c'], ['b', 'a', 'c'], ['b']];
  assert.deepEqual(tagVocabulary(groups), [{ tag: 'b', count: 3 }, { tag: 'a', count: 2 }, { tag: 'c', count: 2 }]);
  assert.deepEqual(tagVocabulary(groups, { limit: 2 }), [{ tag: 'b', count: 3 }, { tag: 'a', count: 2 }]);
  assert.deepEqual(tagVocabulary(groups, { minEntries: 3 }), [{ tag: 'b', count: 3 }]);
});

test('已发布内容的 React/Vue 标签对应真实技术栈', async () => {
  const published = (await entries(process.cwd())).filter((entry) => !entry.draft);
  for (const [tag, expected] of [
    ['react', ['notes-of-ashen', 'ruiqiang-website']],
    ['vue', ['ashen-courier', 'cryptowitch']],
  ]) {
    const matches = published.filter((entry) => normalizeTags(entry.tags).includes(tag));
    assert.deepEqual(matches.map((entry) => entry.slug).sort(), expected);
    assert.ok(matches.every((entry) => entry.stack.some((item) => item.toLowerCase().startsWith(tag))));
    assert.equal(tagVocabulary(published.map((entry) => entry.tags)).find((item) => item.tag === tag)?.count, 2);
  }
});

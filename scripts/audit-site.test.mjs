import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { audit } from "./audit-site.mjs";

const root = process.cwd();

/** 只替换第 n 个（从 0 数）匹配，用来精准地改某一张卡片的属性 */
function nthReplace(source, pattern, index, replacement) {
  let seen = -1;
  return source.replace(new RegExp(pattern.source, pattern.flags + "g"), (match) => {
    seen += 1;
    return seen === index ? replacement : match;
  });
}

test("真实构建基线通过", async () =>
  assert.deepEqual(await audit(root, path.join(root, "dist")), []));
const cases = [
  [
    "404 的 OG 图片必须存在",
    "404.html",
    (s) => s.replace(/(property="og:image" content=")[^"]+/, '$1https://elari39.github.io/missing-og.jpg'),
    "og:image 缺失资源",
  ],
  [
    "robots 指向错误的 sitemap",
    "robots.txt",
    (s) => s.replace('sitemap-index.xml', 'wrong.xml'),
    "robots.txt 未指向本站 sitemap",
  ],
  [
    "sitemap 缺少主题图鉴",
    "sitemap-0.xml",
    (s) => s.replace(/<url>\s*<loc>https:\/\/elari39\.github\.io\/grimoire\/<\/loc>[\s\S]*?<\/url>/, ''),
    "sitemap 缺少正常页面",
  ],
  [
    "卡片标签不能与 frontmatter 漂移",
    "index.html",
    (s) => nthReplace(s, /data-tags="[^"]*"/, 0, 'data-tags="go react"'),
    "卡片标签与 frontmatter 不一致",
  ],
  [
    "主题选择器缺少无 JS 降级",
    "about/index.html",
    (s) => s.replace(/(<details\b[^>]*id="theme-menu"[^>]*) hidden(?=[\s>])/, "$1"),
    "主题选择器在服务端渲染时应带 hidden",
  ],
  [
    "预览按钮缺少无 JS 降级",
    "index.html",
    (s) => s.replace(/(<button\b[^>]*data-preview="[^"]+"[^>]*) hidden(?=[\s>])/, "$1"),
    "预览按钮在服务端渲染时应带 hidden",
  ],
  [
    "srcset 第三方资源",
    "index.html",
    (s) =>
      s.replace("<img ", '<img srcset="https://outside.example/a.webp 2x" '),
    "第三方资源",
  ],
  [
    "404 行内样式",
    "404.html",
    (s) => s.replace("</body>", "<div style='color:red'>故障</div></body>"),
    "行内 style",
  ],
  [
    "重复 title",
    "about/index.html",
    (s) => s.replace("</head>", "<title>重复</title></head>"),
    "title 必须唯一",
  ],
  [
    "第二块 JSON-LD 无效",
    "index.html",
    (s) =>
      s.replace(
        "</head>",
        '<script type="application/ld+json">{bad}</script></head>',
      ),
    "JSON-LD 无效",
  ],
  [
    "伪同源域名",
    "about/index.html",
    (s) =>
      s.replace(
        "</body>",
        '<iframe src="https://elari39.github.io.evil.example/"></iframe></body>',
      ),
    "第三方资源",
  ],
  [
    "缺失资源",
    "about/index.html",
    (s) => s.replace("</body>", '<script src="/missing.js"></script></body>'),
    "缺失资源",
  ],
  [
    "非首页超限脚本",
    "about/index.html",
    (s) =>
      s.replace(
        "</body>",
        `<script>/*${randomBytes(9000).toString("hex")}*/</script></body>`,
      ),
    "JS 超出 4 KB",
  ],
  [
    "中文 UTF-8 字节超限",
    "index.html",
    (s) => s.replace("</body>", `<p>${"中".repeat(14000)}</p></body>`),
    "HTML UTF-8 超出",
  ],
  [
    "真实尺寸错误",
    "index.html",
    (s) => s.replace(/(<img\b[^>]*width=")\d+/, "$1999"),
    "图片真实尺寸不符",
  ],
  [
    "CSS 外部请求",
    "plate-sizes.css",
    (s) => s + "\n.bad{background:url(https://outside.example/image.png)}",
    "第三方资源",
  ],
  [
    "说明不同但数字相同",
    "index.html",
    (s) => s.replace("文字 ≥ 4.5:1，装饰 ≥ 3:1", "所有颜色 ≥ 4.5:1"),
    "数字条完整说明",
  ],
  // 主题清单：主题数改了却没同步数字条（这正是「加一套主题」时最容易漏的一步）。
  // 用正则注入而不是替换字面量：首页那句里的主题数是跟着 THEME_IDS 走的，
  // 写死"× 5 主题"的话，加一套主题后这个反例就会**静默失效**（替换不到东西）。
  [
    "数字条主题数漂移",
    "index.html",
    (s) => s.replace(/配色 × \d+ 主题/, "配色 × 3 主题"),
    "数字条完整说明",
  ],
  // 面板色块靠嵌套 data-theme 取各自主题的 token —— 写错 id 不会报错，
  // 只会安静地显示成别的主题色，所以必须有守卫
  [
    "面板色块主题 id 写错",
    "index.html",
    (s) => s.replace('data-theme="cyber"', 'data-theme="nope"'),
    "未知的 data-theme 值",
  ],
  [
    "面板少一套主题的预览",
    "index.html",
    (s) =>
      s.replace(
        '<span class="theme-opt__swatch" data-theme="brutal" aria-hidden="true"></span>',
        "",
      ),
    "色块数",
  ],
  // 标签过滤：按钮、计数、卡片三者必须自洽
  [
    "标签计数与卡片数不符",
    "index.html",
    (s) =>
      s.replace(
        '<span class="tagbar__n">3</span>',
        '<span class="tagbar__n">9</span>',
      ),
    "显示的计数",
  ],
  [
    "过滤条在服务端渲染时未隐藏",
    "index.html",
    (s) => s.replace(' aria-label="按标签筛选条目" hidden>', ' aria-label="按标签筛选条目">'),
    "应带 hidden",
  ],
  [
    "过滤条出现只被一个条目使用的标签",
    "index.html",
    (s) => nthReplace(s, /data-tags="[^"]*"/, 1, 'data-tags="go"'),
    "只被 1 个条目使用",
  ],
  [
    "data-tags 未归一化（顺序）",
    "index.html",
    (s) => nthReplace(s, /data-tags="[^"]*"/, 0, 'data-tags="vue go"'),
    "未排序",
  ],
  [
    "data-tags 未归一化（大小写）",
    "index.html",
    (s) => nthReplace(s, /data-tags="[^"]*"/, 0, 'data-tags="go Vue"'),
    "未小写",
  ],
  [
    "data-tags 有重复标签",
    "index.html",
    (s) => nthReplace(s, /data-tags="[^"]*"/, 0, 'data-tags="go go"'),
    "有重复标签",
  ],
  // 就地预览抽屉：内容必须真的来自 frontmatter，按钮必须指得到抽屉
  [
    "预览按钮指向不存在的抽屉",
    "index.html",
    (s) => nthReplace(s, /data-preview="[^"]*"/, 0, 'data-preview="nope"'),
    "指向的抽屉不存在",
  ],
  [
    "预览按钮缺 aria-haspopup",
    "index.html",
    (s) => nthReplace(s, / aria-haspopup="dialog"/, 0, ""),
    "缺少 aria-haspopup",
  ],
  [
    "预览抽屉里有 h1",
    "index.html",
    // 用正则匹配整个开标签：那个 div 上还有 tabindex / autofocus，
    // 写死成 `<div class="preview__inner">` 会在属性变化后静默失配
    // （失配会被下面那句"反例必须实际改变输入"抓住，但那是夹具过期的报警，不是产品的问题）
    (s) => s.replace(/(<div class="preview__inner"[^>]*>)/, "$1<h1>故障</h1>"),
    "的预览里有 h1",
  ],
  [
    "预览架构图与 frontmatter 不一致",
    "index.html",
    (s) =>
      s.replace(
        /(<pre class="preview__arch"[^>]*>)/,
        "$1被改掉的内容 ",
      ),
    "架构图与 frontmatter 不一致",
  ],
  [
    "预览里少了一条心得",
    "index.html",
    (s) => nthReplace(s, /<li>[^<]{0,40}<\/li>/, 0, "<li>换掉了</li>"),
    "的预览缺少",
  ],
  // 图版浮悬窗：每张图版都要能点开，而且无 JS 时那条回退链接必须指向同一张原图。
  // 这一条挡的是"图能点开了，但没 JS 的人点下去看到的是另一张图 / 404"。
  [
    "图版触发器与缩略图不是同一张",
    "projects/ruiqiang-website/index.html",
    (s) =>
      s.replace(
        'href="/shots/ruiqiang-website/desktop-home.webp" data-zoom',
        'href="/shots/ruiqiang-website/mobile-home.webp" data-zoom',
      ),
    "图版触发器无 JS 时要指向同一张原图",
  ],
  [
    "图版触发器缺 aria-haspopup",
    "projects/ruiqiang-website/index.html",
    (s) =>
      s.replace(
        ' data-zoom="plate-viewer" aria-haspopup="dialog"',
        ' data-zoom="plate-viewer"',
      ),
    "图版触发器缺少 aria-haspopup",
  ],
  [
    "图版浮悬窗缺少关闭按钮",
    "projects/ruiqiang-website/index.html",
    (s) => s.replace(' data-preview-close aria-label="关闭原图"', ' aria-label="关闭原图"'),
    "图版浮悬窗缺少关闭按钮",
  ],
  [
    "图版浮悬窗缺少上一张",
    "projects/ruiqiang-website/index.html",
    (s) => s.replace(' data-zoom-step="-1"', ""),
    "上/下一张不完整",
  ],
];
for (const [name, file, mutate, expected] of cases)
  test(name, async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "grimoire-guard-"));
    try {
      await cp(path.join(root, "dist"), fixture, { recursive: true });
      const target = path.join(fixture, file),
        original = await readFile(target, "utf8"),
        changed = mutate(original);
      assert.notEqual(changed, original, "反例必须实际改变输入");
      await writeFile(target, changed);
      const errors = await audit(root, fixture);
      assert.ok(
        errors.some((e) => e.includes(expected)),
        `${name} 未触发预期失败：${errors.join(";")}`,
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

async function fixtureFor(t, withSource = false) {
  const fixture = await mkdtemp(path.join(tmpdir(), 'grimoire-audit-'));
  t.after(async () => {
    assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
    assert.ok(path.basename(fixture).startsWith('grimoire-audit-'));
    await rm(fixture, { recursive: true, force: true });
  });
  const dist = path.join(fixture, 'dist');
  await cp(path.join(root, 'dist'), dist, { recursive: true });
  if (withSource) await cp(path.join(root, 'src'), path.join(fixture, 'src'), { recursive: true });
  return { root: withSource ? fixture : root, dist };
}

test('合法 HTML 注释不会被 CLI 当作标签或脚本检查', async (t) => {
  const fixture = await fixtureFor(t);
  const home = path.join(fixture.dist, 'index.html');
  await writeFile(home, (await readFile(home, 'utf8')).replace('</body>',
    '<!-- <img src="/missing.png" style="display:none"><h1>示例</h1><script>example()</script> --></body>'));
  assert.deepEqual(await audit(fixture.root, fixture.dist), []);
  const result = spawnSync(process.execPath, ['scripts/check-site.mjs', '--dist', fixture.dist],
    { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const file of ['index.html', '404.html', 'robots.txt', 'sitemap-index.xml',
  'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.jpg', 'grimoire/index.html']) {
  test(`守卫迁移后仍拒绝缺少 ${file}`, async (t) => {
    const fixture = await fixtureFor(t);
    await rm(path.join(fixture.dist, file));
    const errors = await audit(fixture.root, fixture.dist);
    const expected = file === 'grimoire/index.html' ? '缺少页面 /grimoire/' : `缺少必需文件 ${file}`;
    assert.ok(errors.includes(expected), errors.join('\n'));
  });
}

for (const [name, mutate, expected] of [
  ['缺少装饰 token', (s) => s.replace(/--c-glow:[^;]+;/, ''), '主题 token 键集合不一致'],
  ['重复画布色', (s) => s.replace('--c-canvas: #faf9f5;', '--c-canvas: #fffdf4;'), '主题画布色必须互不相同'],
  ['对比度不达标', (s) => s.replace('--c-body: #1a1a1a;', '--c-body: #fffdf4;'), '对比度不达标'],
  ['删除 reduced-motion 视图过渡规则', (s) => s.replace(/::view-transition-(?:group|old|new)\([^)]*\)/g, '.unused-transition'), 'reduce 下必须显式关闭视图过渡'],
]) {
  test(`守卫迁移后仍拒绝${name}`, async (t) => {
    const fixture = await fixtureFor(t, true);
    const file = path.join(fixture.root, 'src/styles/global.css');
    const original = await readFile(file, 'utf8'), changed = mutate(original);
    assert.notEqual(changed, original);
    await writeFile(file, changed);
    const errors = await audit(fixture.root, fixture.dist);
    assert.ok(errors.some((error) => error.includes(expected)), errors.join('\n'));
  });
}

test('每个已发布条目至少有两个共用标签，草稿不能贡献计数', async (t) => {
  const fixture = await fixtureFor(t, true);
  const file = path.join(fixture.root, 'src/content/projects/ruiqiang-website.md');
  const original = await readFile(file, 'utf8');
  await writeFile(file, original.replace('  - "react"', '  - "unique-review-tag"'));
  await writeFile(path.join(fixture.root, 'src/content/projects/review-draft.md'),
    original.replace('draft: false', 'draft: true').replace('  - "react"', '  - "unique-review-tag"'));
  const errors = await audit(fixture.root, fixture.dist);
  assert.ok(errors.includes('ruiqiang-website 至少需要两个共用标签'), errors.join('\n'));
});

test('CLI 缺少 dist 或参数时给出诊断与失败退出码', async (t) => {
  const fixture = await fixtureFor(t);
  const missing = path.join(fixture.dist, 'does-not-exist');
  assert.deepEqual(await audit(root, missing), ['没有 dist/ —— 先跑 pnpm build']);
  for (const [args, expected] of [[['--dist', missing], '先跑 pnpm build'], [['--dist'], '--dist 需要一个构建目录']]) {
    const result = spawnSync(process.execPath, ['scripts/check-site.mjs', ...args],
      { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(expected), result.stderr);
  }
});

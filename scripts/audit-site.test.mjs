import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
        '<pre class="preview__arch">',
        '<pre class="preview__arch">被改掉的内容 ',
      ),
    "架构图与 frontmatter 不一致",
  ],
  [
    "预览里少了一条心得",
    "index.html",
    (s) => nthReplace(s, /<li>[^<]{0,40}<\/li>/, 0, "<li>换掉了</li>"),
    "的预览缺少",
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

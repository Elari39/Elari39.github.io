import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INLINE_SCRIPT_RAW_LIMIT,
  JS_BUDGET_BYTES,
  closesViewTransitionUnderReducedMotion,
  contrastMatrix,
  readThemeIds,
  readThemeTokens,
  reducedMotionBlocks,
  topLevelBlocks,
} from "./budget.mjs";
import { evaluateBudgets, formatAnnotations, formatStepSummary } from "./assert-budgets.mjs";

/**
 * scripts/budget.mjs 与 scripts/assert-budgets.mjs 的反例测试。
 *
 * 为什么单独一组：这一对脚本的职责是「守住体积与对比度两条硬约束」。一条只会
 * 通过的检查等于没有检查 —— 所以下面每个用例都是**故意把输入弄坏**，
 * 断言它确实会红（并断言反例真的改变了输入，否则测的是空气）。
 *
 * 判定逻辑是进程内直接调用的，不走 spawn：既更快，也不必依赖运行环境允许派生进程。
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* --------------------------------------------------------- 主题清单的解析 */

test("从 theme.ts 解析主题清单", async () => {
  const source = await readFile(path.join(ROOT, "src", "lib", "theme.ts"), "utf8");
  const ids = readThemeIds(source);
  assert.ok(ids.length >= 2, `至少两套主题，实际 ${JSON.stringify(ids)}`);
  assert.equal(ids[0], "brutal", "第 0 项就是默认主题");
});

test("主题清单支持三种引号，且不含注释里的干扰", () => {
  const source = [
    "// THEME_IDS 是唯一来源，别在别处再抄一份 =)",
    "export const THEME_IDS: readonly string[] = [`a`, 'b', \"c\"];",
  ].join("\n");
  assert.deepEqual(readThemeIds(source), ["a", "b", "c"]);
});

test("没有声明时返回空数组（而不是抛错或猜一个）", () => {
  assert.deepEqual(readThemeIds("export const OTHER = ['x'];"), []);
});

test("主题清单忽略数组内注释、注释中的假声明与普通字符串", () => {
  const source = [
    "/* export const THEME_IDS = ['retired']; */",
    "const description = \"export const THEME_IDS = ['fake'];\";",
    "export const THEME_IDS: readonly string[] = [",
    "  'brutal', // 'retired-line'",
    "  /* 'retired-block' */ `light`,",
    '  "dark",',
    "] as const;",
  ].join("\n");
  assert.deepEqual(readThemeIds(source), ["brutal", "light", "dark"]);
});

test("主题清单只接受唯一导出的合法字面量数组", () => {
  for (const source of [
    "const THEME_IDS = ['brutal', 'light'];",
    "export const THEME_IDS = makeThemes();",
    "export const THEME_IDS = ['brutal', ...others];",
    "export const THEME_IDS = ['brutal', `theme-${id}`];",
    "export const THEME_IDS = ['brutal', 'brutal'];",
    "export const THEME_IDS = ['brutal', 'bad id'];",
    "export const THEME_IDS = ['brutal']; export const THEME_IDS = ['light'];",
    "export const THEME_IDS = ['brutal'",
  ]) assert.deepEqual(readThemeIds(source), [], source);
});

/* ------------------------------------------------------- CSS 块的提取 */

test("只认顶层块：@layer / @media 里的嵌套主题块不算数", () => {
  const css = `
    :root { --c-canvas: #ffffff; --c-ink: #000000; }
    @layer base {
      [data-theme='light'] { --c-canvas: #abcdef; }
    }
    [data-theme='light'] { --c-canvas: #faf9f5; }
  `;
  const blocks = topLevelBlocks(css);
  const { tokens, problems } = readThemeTokens(css, ["brutal", "light"]);
  assert.equal(problems.length, 0, JSON.stringify(problems));
  // 如果实现按"第一次出现"找块，这里会取到 @layer 里那个 #abcdef
  assert.equal(tokens.get("light").canvas, "#faf9f5");
  assert.equal(tokens.get("brutal").canvas, "#ffffff");
  assert.equal(
    blocks.filter((block) => block.prelude.startsWith("@")).length,
    1,
    "at-rule 块要被识别出来并在取 token 时跳过",
  );
});

test("默认主题的 token 写在 :root 上，允许与 [data-theme] 合并成同一条选择器", () => {
  const css = `:root,\n[data-theme='brutal'] { --c-canvas: #fffdf4; --c-ink: #0a0a0a; }`;
  const { tokens, problems } = readThemeTokens(css, ["brutal"]);
  assert.deepEqual(problems, []);
  assert.equal(tokens.get("brutal").canvas, "#fffdf4");
});

test("取不到 token 块时必须报错，不能静默跳过整段对比度", () => {
  const css = `:root { --c-canvas: #ffffff; --c-ink: #000000; }`;
  const { tokens, problems } = readThemeTokens(css, ["brutal", "nope"]);
  assert.equal(tokens.get("nope") === undefined || Object.keys(tokens.get("nope")).length, 0);
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /nope/);
});

test("只认十六进制字面量：写 color-mix()/oklch() 会被当成缺 token", () => {
  const css = `:root { --c-canvas: oklch(0.9 0 0); --c-ink: #000000; }`;
  const { tokens } = readThemeTokens(css, ["brutal"]);
  assert.equal(tokens.get("brutal").canvas, undefined);
  assert.equal(tokens.get("brutal").ink, "#000000");
});

/* --------------------------------------------- reduce 下关闭视图过渡的规则 */

test("真实样式表：reduce 下确实显式关掉了视图过渡", async () => {
  const css = await readFile(path.join(ROOT, "src", "styles", "global.css"), "utf8");
  assert.equal(
    closesViewTransitionUnderReducedMotion(css),
    true,
    "少了这条规则，开了 reduce 的访客切主题时仍会看到一次全屏交叉淡出",
  );
  assert.ok(reducedMotionBlocks(css).length >= 1);
});

test("把那条规则删掉必须判红（证明它不是永远 true）", () => {
  const withoutRule = `
    ::view-transition-old(root) { animation-duration: 0.32s; }
    @media (prefers-reduced-motion: reduce) {
      .reveal { transform: none; }
    }
  `;
  // .reveal 那条 reduce 规则存在，但不是视图过渡的 —— 不能被当成通过
  assert.equal(closesViewTransitionUnderReducedMotion(withoutRule), false);
  assert.equal(
    closesViewTransitionUnderReducedMotion(
      `@media (prefers-reduced-motion: reduce) {
         ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
       }`,
    ),
    true,
  );
  // 只有动画、没有 reduce 兜底时也算没关
  assert.equal(closesViewTransitionUnderReducedMotion("::view-transition-new(root){animation:none}"), false);
});

test("@layer 里嵌套的 reduce 块不算顶层（否则会在错误的地方找到规则）", () => {
  const css = `@layer base {
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-old(*) { animation: none; }
    }
  }`;
  assert.equal(reducedMotionBlocks(css).length, 0);
});

/* ------------------------------------------------------------ 对比度矩阵 */
test("真实样式表：每套主题的 token 键集合一致，且矩阵全过", async () => {
  const css = await readFile(path.join(ROOT, "src", "styles", "global.css"), "utf8");
  const ids = readThemeIds(await readFile(path.join(ROOT, "src", "lib", "theme.ts"), "utf8"));
  const { tokens, problems } = readThemeTokens(css, ids);
  assert.deepEqual(problems, []);

  const keySets = [...tokens.values()].map((value) => Object.keys(value).sort().join(","));
  assert.equal(new Set(keySets).size, 1, "各套主题的 token 键集合不一致");
  assert.ok(keySets[0].length > 0, "没读到任何 token");

  const matrix = contrastMatrix(tokens);
  assert.equal(matrix.length, ids.length * 9, "应当是每套主题 9 对");
  assert.equal(matrix.filter((row) => !row.ok).length, 0, "真实配色不该有超标项");
});

test("把前景色调浅就必须判红（证明矩阵不是永远 ok）", () => {
  const ok = contrastMatrix(new Map([["t", { canvas: "#ffffff", body: "#1a1a1a" }]]));
  assert.equal(ok.find((row) => row.foreground === "body").ok, true);

  const bad = contrastMatrix(new Map([["t", { canvas: "#ffffff", body: "#eeeeee" }]]));
  const row = bad.find((item) => item.foreground === "body");
  assert.equal(row.ok, false, "近白正文压在白底上必须判不达标");
  assert.ok(row.ratio < 1.5, `比值应当很低，实际 ${row.ratio}`);
});

test("token 缺失时那一对算失败（ratio 为 null），而不是被跳过", () => {
  const rows = contrastMatrix(new Map([["t", { canvas: "#ffffff" }]]));
  assert.equal(rows.length, 9);
  assert.equal(rows.every((row) => row.ok === false && row.ratio === null), true);
});

/* ------------------------------------------------- assert-budgets 的判定与拦截 */

/**
 * 造一个最小 dist：真的跑得起来，而且够快。
 * （不 spawn 子进程：本机环境不允许派生进程，而且进程内调用测的是同一份判定逻辑。）
 */
async function makeDist({ indexHtml = "<html><body><script>1</script></body></html>", js, css } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "grimoire-budget-"));
  await writeFile(path.join(dir, "index.html"), indexHtml, "utf8");
  if (js) {
    await mkdir(path.join(dir, "_astro"), { recursive: true });
    await writeFile(path.join(dir, "_astro", js.name), js.body, "utf8");
  }
  if (css) {
    await mkdir(path.join(dir, "_astro"), { recursive: true });
    await writeFile(path.join(dir, "_astro", css.name), css.body, "utf8");
  }
  return dir;
}

/** 造一个假的站点源码根：只需要 theme.ts 与 global.css */
async function makeSource({ themeSource, css = "" }) {
  const dir = await mkdtemp(path.join(tmpdir(), "grimoire-source-"));
  await mkdir(path.join(dir, "src", "lib"), { recursive: true });
  await mkdir(path.join(dir, "src", "styles"), { recursive: true });
  await writeFile(path.join(dir, "src", "lib", "theme.ts"), themeSource, "utf8");
  // 即使内容为空也要落盘：缺文件会让被测逻辑抛 ENOENT，测出来的就不是"缺 token"
  await writeFile(path.join(dir, "src", "styles", "global.css"), css, "utf8");
  return dir;
}

/** 收集打印出来的行，便于断言"人看到的是什么" */
function collector() {
  const lines = [];
  const print = (line = "") => lines.push(String(line));
  print.lines = lines;
  return print;
}

const REAL_ROOT = ROOT;

async function runEvaluate(options) {
  const print = collector();
  const report = await evaluateBudgets({ print, ...options });
  return { report, lines: print.lines };
}

test("约束内 → ok，退出码 0，并给出一条 notice", async () => {
  const dist = await makeDist();
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, true, JSON.stringify(report.failures));
    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.failures, []);
    assert.match(report.headline, /都在约束内/);
    const annotations = formatAnnotations(report);
    assert.equal(annotations.length, 1);
    assert.match(annotations[0], /^::notice title=/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("缺少 dist → 判失败并给出退出码 1，而不是当成 0 字节通过", async () => {
  const missing = path.join(tmpdir(), `grimoire-missing-${Date.now()}`);
  const { report } = await runEvaluate({ dist: missing });
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].title, "缺少 dist");
  assert.match(formatAnnotations(report)[0], /^::error title=缺少 dist::/);
});

test("出现外链 JS 文件 → 拦截（::error 注解带上文件路径）", async () => {
  const dist = await makeDist({ js: { name: "chunk.js", body: "console.log(1)".repeat(50) } });
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, false);
    assert.equal(report.exitCode, 1);
    assert.match(report.headline, /拦截发布/);
    assert.ok(report.failures.some((failure) => failure.title === "出现外链 JS 文件"));
    const annotation = formatAnnotations(report).find((line) => line.includes("外链 JS 文件"));
    assert.ok(annotation, "应当有一条针对外链 JS 的注解");
    assert.match(annotation, /^::error title=出现外链 JS 文件::/);
    assert.match(annotation, /chunk\.js/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("单段内联脚本超过内联阈值 → 拦截", async () => {
  const big = "var a=1;".repeat(Math.ceil((INLINE_SCRIPT_RAW_LIMIT + 512) / 8));
  assert.ok(Buffer.byteLength(big, "utf8") > INLINE_SCRIPT_RAW_LIMIT, "反例必须真的超阈值");
  const dist = await makeDist({ indexHtml: `<html><body><script>${big}</script></body></html>` });
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.title === "单段内联脚本超出内联阈值"));
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("首页内联脚本的 gzip 超预算 → 拦截", async () => {
  // 随机串压不动：62 进制随机字符约 6 bit/字符，所以要够长才能把 gzip 顶过 4 KB
  const random = Array.from({ length: JS_BUDGET_BYTES * 4 }, () =>
    Math.floor(Math.random() * 62).toString(36),
  ).join("");
  const dist = await makeDist({ indexHtml: `<html><body><script>${random}</script></body></html>` });
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, false);
    assert.ok(
      report.failures.some((failure) => failure.title === "客户端 JS 超出预算"),
      `应当因 gzip 超预算拦截：${JSON.stringify(report.failures)}`,
    );
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("CSS 超预算 → 拦截", async () => {
  const dist = await makeDist({ css: { name: "big.css", body: "/*".padEnd(50 * 1024, "x") } });
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.title === "CSS 超出预算"));
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("首页 HTML 超预算 → 拦截", async () => {
  const dist = await makeDist({ indexHtml: `<html><body>${"x".repeat(61 * 1024)}</body></html>` });
  try {
    const { report } = await runEvaluate({ dist });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.title === "首页 HTML 超出预算"));
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

test("对比度不达标 → 这条门禁真的会拦（不只是打印一行）", async () => {
  const dist = await makeDist();
  // 把 light 主题的次要文字调成近白：正文压在浅底上过不了 4.5
  const broken = await makeSource({
    themeSource: "export const THEME_IDS: readonly string[] = ['brutal', 'light'];",
    css: [
      ":root { --c-canvas: #ffffff; --c-ink: #000000; --c-body: #1a1a1a; --c-muted: #4d4d4d;",
      "  --c-muted-soft: #575757; --c-primary-ink: #b00016; --c-teal: #0a6169; --c-amber: #8a5200;",
      "  --c-primary: #d0021b; --c-on-primary: #ffffff; }",
      "[data-theme='light'] { --c-canvas: #faf9f5; --c-ink: #141413; --c-body: #3d3d3a;",
      "  --c-muted: #f2f2f2; --c-muted-soft: #716f68; --c-primary-ink: #a9583e; --c-teal: #276b5e;",
      "  --c-amber: #8f5a10; --c-primary: #cc785c; --c-on-primary: #1a1512; }",
    ].join("\n"),
  });
  try {
    const { report } = await runEvaluate({ root: broken, dist });
    assert.equal(report.ok, false);
    assert.ok(
      report.failures.some((failure) => failure.title === "light 对比度不达标"),
      `应当拦下 light 主题：${JSON.stringify(report.failures)}`,
    );
    assert.match(formatAnnotations(report).join("\n"), /::error title=light 对比度不达标::/);
  } finally {
    await rm(dist, { recursive: true, force: true });
    await rm(broken, { recursive: true, force: true });
  }
});

test("主题清单读不到时 → 拦截（不能因为'一套都没算'而假绿）", async () => {
  const dist = await makeDist();
  const source = await makeSource({ themeSource: "export const NOT_THEMES = 1;", css: "" });
  try {
    const { report } = await runEvaluate({ root: source, dist });
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((failure) => failure.title === "主题清单不可读"));
  } finally {
    await rm(dist, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  }
});

test("job summary 是可读 markdown，且带上实测值与最紧的一对", async () => {
  const dist = await makeDist();
  try {
    const { report } = await runEvaluate({ root: REAL_ROOT, dist });
    const summary = formatStepSummary(report);
    assert.match(summary, /## 体积与对比度断言/);
    assert.match(summary, /\| 客户端 JS（gzip） \|/);
    assert.match(summary, /\| 外链 JS 文件数 \| 0 \| 0 \|/);
    assert.match(summary, /最紧的一对：/);
    assert.doesNotMatch(summary, /❌/);
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});

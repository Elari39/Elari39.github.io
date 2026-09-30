import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { CSS_BUDGET_BYTES, HOME_HTML_BUDGET_BYTES, INLINE_SCRIPT_RAW_LIMIT, JS_BUDGET_BYTES, measureJs, measureCss, measureHomeHtml } from "./budget.mjs";
import { evaluateBudgets } from "./assert-budgets.mjs";
import { audit } from "./audit-site.mjs";

async function fixture(run) {
  const dist = await mkdtemp(path.join(tmpdir(), "grimoire-measurements-"));
  try {
    await writeFile(path.join(dist, "index.html"), "<script>1</script>");
    await mkdir(path.join(dist, "about"));
    await run(dist);
  } finally { await rm(dist, { recursive: true, force: true }); }
}
const evaluate = (dist) => evaluateBudgets({ dist, print: () => {} });

test("非首页脚本独立触发 gzip 与单段上限门禁", () => fixture(async (dist) => {
  const body = randomBytes(JS_BUDGET_BYTES * 2).toString("hex");
  assert.ok(gzipSync(body).length > JS_BUDGET_BYTES);
  await writeFile(path.join(dist, "about/index.html"), `<script>${body}</script>`);
  const report = await evaluate(dist);
  assert.equal(report.exitCode, 1);
  for (const title of ["客户端 JS 超出预算", "单段内联脚本超出内联阈值"])
    assert.ok(report.failures.some((f) => f.title === title), title);
}));

test("全部外链只计一次，加最大页面内联；JSON-LD 不计入脚本", () => fixture(async (dist) => {
  const body = "你好".repeat(100), external = "console.log('external')";
  await writeFile(path.join(dist, "common.js"), external);
  await writeFile(path.join(dist, "index.html"), '<script src="/common.js"></script><script>1</script>');
  await writeFile(path.join(dist, "about/index.html"), `<script src="/common.js"></script><script>${body}</script><script type="application/ld+json">${" ".repeat(8000)}{}</script>`);
  const measured = await measureJs(dist);
  assert.equal(measured.externalFiles.length, 1);
  assert.equal(measured.inlineRaw, Buffer.byteLength(body));
  assert.equal(measured.inlineMaxRaw, Buffer.byteLength(body));
  assert.equal(measured.totalGzip, gzipSync(external).length + gzipSync(body).length);
  assert.equal(measured.perPage.length, 2);
  assert.equal(measured.perPage.find((p) => p.route === "/about/").inlineRaw, Buffer.byteLength(body));
}));

test("最大 raw 与最大 gzip 可以来自不同页面", () => fixture(async (dist) => {
  const repetitive = "x".repeat(5000), noisy = randomBytes(800).toString("hex");
  await writeFile(path.join(dist, "index.html"), `<script>${repetitive}</script>`);
  await writeFile(path.join(dist, "404.html"), `<script>${noisy}</script>`);
  const measured = await measureJs(dist);
  assert.equal(measured.inlineMaxRaw, 5000);
  assert.equal(measured.inlineGzip, gzipSync(noisy).length);
  assert.equal(measured.inlineRaw, Buffer.byteLength(noisy));
}));

test("脚本测量遵循 HTML 解析：忽略注释但不把 data-src 当作 src", () => fixture(async (dist) => {
  const body = "let x=1;";
  await writeFile(path.join(dist, "index.html"), `<!-- <script>${"x".repeat(9000)}</script> --><script data-src="label">${body}</script>`);
  const measured = await measureJs(dist);
  assert.equal(measured.inlineRaw, Buffer.byteLength(body));
  assert.equal(measured.inlineGzip, gzipSync(body).length);
}));

test("非首页单段阈值按 UTF-8 字节严格小于；4096 字节即失败", () => fixture(async (dist) => {
  for (const offset of [-1, 0, 1]) {
    const bytes = INLINE_SCRIPT_RAW_LIMIT + offset;
    const body = "中".repeat(Math.floor(bytes / 3)) + "x".repeat(bytes % 3);
    assert.equal(Buffer.byteLength(body), bytes);
    await writeFile(path.join(dist, "about/index.html"), `<script>${body}</script>`);
    const report = await evaluate(dist);
    assert.equal(report.failures.some((f) => f.title === "单段内联脚本超出内联阈值"), offset >= 0);
  }
}));

test("CSS 与首页 UTF-8 字节预算允许恰好边界，超出一字节即失败", () => fixture(async (dist) => {
  for (const offset of [0, 1]) {
    await writeFile(path.join(dist, "style.css"), " ".repeat(CSS_BUDGET_BYTES + offset));
    const html = "中".repeat(Math.floor(HOME_HTML_BUDGET_BYTES / 3)) + " ".repeat(HOME_HTML_BUDGET_BYTES % 3 + offset);
    await writeFile(path.join(dist, "index.html"), html);
    assert.equal((await measureCss(dist)).bytes, CSS_BUDGET_BYTES + offset);
    assert.equal(await measureHomeHtml(dist), HOME_HTML_BUDGET_BYTES + offset);
    const report = await evaluate(dist);
    for (const title of ["CSS 超出预算", "首页 HTML 超出预算"])
      assert.equal(report.failures.some((f) => f.title === title), offset === 1);
  }
}));

test("真实构建的守卫与静态断言共享同一份测量结果", async () => {
  const root = process.cwd(), dist = path.join(root, "dist");
  assert.deepEqual(await audit(root, dist), []);
  const report = await evaluate(dist);
  assert.equal(report.ok, true);
  assert.deepEqual(report.measurements.js, await measureJs(dist));
});

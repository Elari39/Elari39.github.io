#!/usr/bin/env node
/**
 * 体积与对比度的**静态断言**：CI 里那条「超出约束就拦截」的步骤。
 *
 * 与 scripts/check-site.mjs 的关系：两者共用 scripts/budget.mjs 的同一份口径，
 * 但回答的问题不同 ——
 *   check-site.mjs     「发布出去的东西是不是我们答应的那个样子」（十七组核对，
 *                       失败时告诉你哪一条承诺没兑现）
 *   assert-budgets.mjs 「体积与对比度这两条硬约束此刻的实测值是多少」（只做这两件事，
 *                       输出可读的报告 + GitHub 注解 + job summary，超限即非零退出）
 *
 * 之所以不直接把 check-site 的结论拿来用：这条断言要能在 Actions 的步骤列表里
 * **单独看见**，并且失败时给出实测数值（::error:: 注解会挂在 PR 的文件视图上）。
 * 但它绝不自己重新实现测量 —— 两套测量的下场一定是两套互相矛盾的数字。
 *
 * 判定逻辑全部在导出的 evaluateBudgets() 里，CLI 只是它的薄包装（打印、写注解、
 * 设退出码）。这样反例测试可以**进程内**直接调用判定逻辑，不需要 spawn 子进程 ——
 * 既更快，也绕开「某些环境不允许派生进程」这种与代码无关的干扰。
 *
 * 退出码：0 = 全部在约束内；1 = 有约束被突破（CI 会因此不发布）。
 * 跑法：pnpm assert:budgets
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  CSS_BUDGET_BYTES,
  HOME_HTML_BUDGET_BYTES,
  INLINE_SCRIPT_RAW_LIMIT,
  JS_BUDGET_BYTES,
  PAIRS,
  contrastMatrix,
  measureCss,
  measureHomeHtml,
  measureJs,
  readThemeIds,
  readThemeSource,
  readThemeTokens,
} from './budget.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

const kb = (bytes, digits = 2) => `${(bytes / 1024).toFixed(digits)} KB`;

/**
 * 跑完全部断言，返回结论（不打印、不退出、不写文件）。
 *
 * 返回：
 *   ok          是否全部在约束内
 *   exitCode    0 / 1
 *   failures    [{ title, message }] —— title 用于 CI 注解，message 给人看
 *   measurements / matrix / tightest / themes —— 供摘要与证据落盘
 */
export async function evaluateBudgets({
  root = DEFAULT_ROOT,
  dist = path.join(DEFAULT_ROOT, 'dist'),
  print = console.log,
} = {}) {
  const failures = [];

  /** 记一条断言结果；失败时收集下来，最后统一决定退出码 */
  const assert = (condition, title, message) => {
    print(condition ? `  ${GREEN}✓${RESET} ${message}` : `  ${RED}✗${RESET} ${message}`);
    if (!condition) failures.push({ title, message });
    return condition;
  };
  const fail = (title, message) => {
    failures.push({ title, message });
    print(`  ${RED}✗${RESET} ${message}`);
  };

  print(`${BOLD}体积与对比度断言${RESET}`);
  print(`${DIM}dist: ${dist}${RESET}`);

  if (!existsSync(dist)) {
    fail('缺少 dist', `没有 dist/ —— 先跑 pnpm build（期望路径 ${dist}）`);
    return {
      ok: false,
      exitCode: 1,
      headline: '1 项超出约束 —— 拦截发布',
      failures,
      measurements: null,
      matrix: [],
      tightest: null,
      themes: [],
    };
  }

  /* --------------------------------------------------------- 体积与请求数 */

  print(`\n${BOLD}客户端体积${RESET}`);

  const js = await measureJs(dist);
  const cssBytes = await measureCss(dist);
  const homeHtml = await measureHomeHtml(dist);

  assert(
    js.totalGzip <= JS_BUDGET_BYTES,
    '客户端 JS 超出预算',
    `客户端 JS（gzip）${kb(js.totalGzip)} ≤ ${kb(JS_BUDGET_BYTES, 0)}（外链 ${kb(js.externalRaw, 1)} + 内联 ${kb(js.inlineRaw)}）`,
  );

  // 打包脚本必须仍在 Astro 的内联阈值内。超过阈值 Astro 会改吐 _astro/*.js，
  // 页面平白多一个请求 —— 而这条契约没有别的地方盯着。
  assert(
    js.externalFiles.length === 0,
    '出现外链 JS 文件',
    `外链 JS 文件 ${js.externalFiles.length} 个（要求 0：打包产物须仍在 ${INLINE_SCRIPT_RAW_LIMIT} 字节的内联阈值内，` +
      '否则页面会多一个请求）' +
      (js.externalFiles.length
        ? `：${js.externalFiles.map((file) => path.relative(dist, file)).join(', ')}`
        : ''),
  );
  assert(
    js.inlineMaxRaw < INLINE_SCRIPT_RAW_LIMIT,
    '单段内联脚本超出内联阈值',
    `单段内联脚本最大 ${kb(js.inlineMaxRaw)} < 阈值 ${kb(INLINE_SCRIPT_RAW_LIMIT, 0)}`,
  );
  assert(
    cssBytes.bytes <= CSS_BUDGET_BYTES,
    'CSS 超出预算',
    `CSS ${kb(cssBytes.bytes, 1)} ≤ ${kb(CSS_BUDGET_BYTES, 0)}（${cssBytes.files.length} 个文件）`,
  );
  assert(
    homeHtml <= HOME_HTML_BUDGET_BYTES,
    '首页 HTML 超出预算',
    `首页 HTML ${kb(homeHtml, 1)} ≤ ${kb(HOME_HTML_BUDGET_BYTES, 0)}`,
  );

  /* ------------------------------------------------------------- 对比度 */

  print(`\n${BOLD}对比度（WCAG，每套主题 ${PAIRS.length} 对）${RESET}`);

  const themeSource = await readThemeSource(root);
  const themeIds = readThemeIds(themeSource);
  assert(
    themeIds.length >= 2,
    '主题清单不可读',
    `主题清单 ${themeIds.length} 套：${themeIds.join(' / ')}`,
  );

  const { tokens, problems } = readThemeTokens(
    await readFile(path.join(root, 'src', 'styles', 'global.css'), 'utf8'),
    themeIds,
  );
  for (const problem of problems) fail('主题 token 缺失', problem);

  const matrix = contrastMatrix(tokens);
  let tightest = null;
  for (const themeId of tokens.keys()) {
    const rows = matrix.filter((row) => row.theme === themeId);
    const worst = rows
      .filter((row) => row.ratio !== null)
      .sort((a, b) => a.ratio / a.minimum - b.ratio / b.minimum)[0];
    if (worst) {
      const margin = worst.ratio / worst.minimum;
      if (!tightest || margin < tightest.margin) {
        tightest = {
          theme: themeId,
          label: worst.label,
          ratio: worst.ratio,
          minimum: worst.minimum,
          margin,
        };
      }
    }
    const broken = rows.filter((row) => !row.ok);
    assert(
      broken.length === 0,
      `${themeId} 对比度不达标`,
      `${themeId}：${rows.length} 对，最紧 ${
        worst ? `${worst.label} ${worst.ratio.toFixed(2)}:1（需 ≥ ${worst.minimum}）` : '—'
      }`,
    );
    for (const row of broken) {
      const detail =
        row.ratio === null
          ? `缺少 ${row.foreground} / ${row.background} token`
          : `${row.foreground} on ${row.background} = ${row.ratio.toFixed(2)}:1，需 ≥ ${row.minimum}`;
      fail(`${themeId} 对比度不达标`, `${themeId} · ${row.label}：${detail}`);
    }
  }

  if (tightest) {
    print('');
    print(
      `  · 最紧的一对：${tightest.theme} · ${tightest.label} ${tightest.ratio.toFixed(2)}:1` +
        `（需 ≥ ${tightest.minimum}，余量 ×${tightest.margin.toFixed(2)}）`,
    );
  }

  // 结论一句话。放在返回值里而不是只写死在 CLI 的打印里 —— 否则测试只能靠
  // 捕获子进程输出来断言它，而这条字符串正是"拦截"这件事对外的说法。
  const headline =
    failures.length === 0
      ? '体积与对比度都在约束内。'
      : `${failures.length} 项超出约束 —— 拦截发布`;

  return {
    ok: failures.length === 0,
    exitCode: failures.length === 0 ? 0 : 1,
    headline,
    failures,
    themes: themeIds,
    matrix,
    tightest,
    measurements: {
      js,
      cssBytes,
      homeHtml,
      contrastCells: matrix.length,
      contrastPassing: matrix.filter((row) => row.ok).length,
    },
  };
}

/* ------------------------------------------------------------ 输出与注解 */

/** GitHub Actions 注解：成功一条 notice，失败逐条 ::error::（会挂在 PR 文件视图上） */
export function formatAnnotations(report) {
  const escape = (text) => text.replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  const { measurements } = report;

  if (report.ok && measurements) {
    return [
      `::notice title=体积与对比度都在约束内::客户端 JS ${kb(measurements.js.totalGzip)}/${kb(JS_BUDGET_BYTES, 0)} · ` +
        `CSS ${kb(measurements.cssBytes.bytes, 1)}/${kb(CSS_BUDGET_BYTES, 0)} · ` +
        `${report.themes.length} 套主题 × ${report.matrix.length / Math.max(report.themes.length, 1)} 对对比度全过`,
    ];
  }

  return report.failures.map(
    (failure) => `::error title=${escape(failure.title)}::${escape(failure.message)}`,
  );
}

/** job summary 的 markdown */
export function formatStepSummary(report) {
  const { measurements } = report;
  const lines = ['## 体积与对比度断言', ''];

  if (!measurements) {
    lines.push('### 未通过', '');
    for (const failure of report.failures) lines.push(`- **${failure.title}** — ${failure.message}`);
    return lines.join('\n');
  }

  const { js, cssBytes, homeHtml } = measurements;
  const mark = (ok) => (ok ? '✅' : '❌');
  lines.push(
    '| 约束 | 实测 | 上限 | 结论 |',
    '| --- | --- | --- | --- |',
    `| 客户端 JS（gzip） | ${kb(js.totalGzip)} | ${kb(JS_BUDGET_BYTES, 0)} | ${mark(js.totalGzip <= JS_BUDGET_BYTES)} |`,
    `| 单段内联脚本（raw） | ${kb(js.inlineMaxRaw)} | < ${kb(INLINE_SCRIPT_RAW_LIMIT, 0)} | ${mark(js.inlineMaxRaw < INLINE_SCRIPT_RAW_LIMIT)} |`,
    `| 外链 JS 文件数 | ${js.externalFiles.length} | 0 | ${mark(js.externalFiles.length === 0)} |`,
    `| CSS（raw） | ${kb(cssBytes.bytes, 1)} | ${kb(CSS_BUDGET_BYTES, 0)} | ${mark(cssBytes.bytes <= CSS_BUDGET_BYTES)} |`,
    `| 首页 HTML | ${kb(homeHtml, 1)} | ${kb(HOME_HTML_BUDGET_BYTES, 0)} | ${mark(homeHtml <= HOME_HTML_BUDGET_BYTES)} |`,
    `| 对比度（${report.themes.length} 套 × ${measurements.contrastCells / Math.max(report.themes.length, 1)} 对） | ` +
      `${measurements.contrastPassing}/${measurements.contrastCells} 达标 | 全部达标 | ` +
      `${mark(measurements.contrastPassing === measurements.contrastCells)} |`,
    '',
  );

  if (report.tightest) {
    lines.push(
      `最紧的一对：\`${report.tightest.theme}\` · ${report.tightest.label} = ` +
        `${report.tightest.ratio.toFixed(2)}:1（需 ≥ ${report.tightest.minimum}）`,
      '',
    );
  }

  if (report.failures.length) {
    lines.push('### 未通过', '');
    for (const failure of report.failures) lines.push(`- **${failure.title}** — ${failure.message}`);
    lines.push('');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ CLI */

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const dist = path.resolve(
    process.argv.includes('--dist')
      ? process.argv[process.argv.indexOf('--dist') + 1]
      : path.join(DEFAULT_ROOT, 'dist'),
  );

  const report = await evaluateBudgets({ dist });

  // 证据落到 .assets-raw/（已被 gitignore，CI 会把它整个作为 artifact 上传）
  try {
    const evidenceDir = path.join(DEFAULT_ROOT, '.assets-raw');
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(evidenceDir, 'budget-report.json'),
      `${JSON.stringify(
        {
          dist: path.relative(DEFAULT_ROOT, dist) || '.',
          ok: report.ok,
          budgets: {
            jsGzip: JS_BUDGET_BYTES,
            css: CSS_BUDGET_BYTES,
            homeHtml: HOME_HTML_BUDGET_BYTES,
            inlineScriptRaw: INLINE_SCRIPT_RAW_LIMIT,
          },
          themes: report.themes,
          contrastPairs: PAIRS.length,
          measurements: report.measurements,
          tightest: report.tightest,
          failures: report.failures,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  } catch (error) {
    console.log(`  ${DIM}· 证据文件写入失败（不影响结论）：${String(error)}${RESET}`);
  }

  console.log('');
  for (const annotation of formatAnnotations(report)) console.log(annotation);

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      await writeFile(summaryFile, `${formatStepSummary(report)}\n`, { encoding: 'utf8', flag: 'a' });
    } catch (error) {
      console.log(`  ${DIM}· 写 job summary 失败（不影响结论）：${String(error)}${RESET}`);
    }
  }

  if (!report.ok) {
    console.log(`\n${RED}${BOLD}${report.headline}${RESET}`);
  } else {
    console.log(`\n${GREEN}${BOLD}${report.headline}${RESET}`);
  }

  process.exitCode = report.exitCode;
}

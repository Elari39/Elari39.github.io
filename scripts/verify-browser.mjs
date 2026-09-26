#!/usr/bin/env node
/**
 * 浏览器级验收。
 *
 * 守卫脚本（check-site.mjs）看的是**文件**，它证明不了这些东西真的能跑：
 *   · 内联主题引导脚本在 CSP 之下**确实被执行**了（否则又会闪一下错误的主题）
 *   · 页面没有任何 CSP 违规或 JS 报错
 *   · 主题切换按钮点下去，data-theme 会翻转并写进 localStorage
 *   · 两套主题的 CSS 变量真的生效（读 computedStyle，不是看源码）
 *   · 窄屏（390px）不会出现横向滚动
 *
 * 所以这里用无头 Chrome + CDP 把页面真跑一遍。零 npm 依赖：Node 24 自带
 * WebSocket 与 fetch，CDP 就是一个 JSON-RPC over WebSocket。
 *
 * 跑法：
 *   1) 另开一个终端：pnpm preview --port 4321
 *   2) node scripts/verify-browser.mjs [--base http://127.0.0.1:4321]
 *
 * 截图输出到 .assets-raw/verify/（已被 .gitignore 忽略）——它们是给人看的，
 * 不是构建产物。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, '.assets-raw', 'verify');

const baseIndex = process.argv.indexOf('--base');
const BASE = baseIndex !== -1 ? process.argv[baseIndex + 1] : 'http://127.0.0.1:4321';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/about/', name: 'about' },
  { path: '/projects/notes-of-ashen/', name: 'notes-of-ashen' },
  { path: '/projects/ashen-courier/', name: 'ashen-courier' },
  { path: '/projects/cryptowitch/', name: 'cryptowitch' },
  { path: '/definitely-not-a-page/', name: '404', expectNotFound: true },
];

const problems = [];
const report = [];

function pass(message) {
  console.log(`  \u001b[32m✓\u001b[0m ${message}`);
}

function fail(message) {
  problems.push(message);
  console.log(`  \u001b[31m✗\u001b[0m ${message}`);
}

function check(condition, message, detail) {
  if (condition) pass(message);
  else fail(detail ? `${message}\n      ${detail}` : message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ----------------------------------------------------------------- CDP 客户端 */

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(listener) {
    this.listeners.add(listener);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'evaluate 失败');
    }
    return result.result?.value;
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(file, Buffer.from(data, 'base64'));
  }

  close() {
    this.socket.close();
  }
}

/* ------------------------------------------------------------------- 启动流程 */

async function launchChrome() {
  const executable = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('找不到 Chrome / Edge');

  const profile = path.join(tmpdir(), `grimoire-verify-${Date.now()}`);
  await mkdir(profile, { recursive: true });

  const child = spawn(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  );

  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (existsSync(portFile)) {
      const [port] = (await readFile(portFile, 'utf8')).split('\n');
      if (port) return { child, profile, port: port.trim() };
    }
    await sleep(250);
  }
  throw new Error('Chrome 没有在 15 秒内写出 DevToolsActivePort');
}

async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('没有可用的页面 target');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true });
  });
  return new Cdp(socket);
}

/** 等一次 load 事件（或超时——超时也要继续，页面通常已经能测了） */
function waitForLoad(cdp, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cdp.listeners.delete(listener);
      resolve(false);
    }, timeout);
    function listener(message) {
      if (message.method !== 'Page.loadEventFired') return;
      clearTimeout(timer);
      cdp.listeners.delete(listener);
      resolve(true);
    }
    cdp.listeners.add(listener);
  });
}

/* --------------------------------------------------------------------- 主流程 */

console.log('\u001b[1m浏览器级验收\u001b[0m');
console.log(`base: ${BASE}`);

const { child, profile, port } = await launchChrome();
console.log(`Chrome 调试端口: ${port}\n`);

await rm(SHOTS, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });

const cdp = await connect(port);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Network.enable');

/** 页面级问题收集：CSP 违规会以 Log.entryAdded 的形式出现 */
let pageIssues = [];
cdp.on((message) => {
  if (message.method === 'Log.entryAdded') {
    const entry = message.params.entry;
    if (entry.level === 'error' || entry.level === 'warning') {
      pageIssues.push(`[${entry.source}] ${entry.text}`);
    }
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    pageIssues.push(`[exception] ${details.exception?.description ?? details.text}`);
  }
});

/** 请求失败也要可见（例如图版路径写错） */
const failedRequests = [];
cdp.on((message) => {
  if (message.method === 'Network.loadingFailed') {
    failedRequests.push(message.params.errorText);
  }
});

await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

for (const route of ROUTES) {
  console.log(`\u001b[1m${route.path}\u001b[0m`);
  pageIssues = [];
  failedRequests.length = 0;

  await cdp.send('Page.navigate', { url: `${BASE}${route.path}` });
  await waitForLoad(cdp);
  await sleep(350); // 让主题脚本与字体布局落定

  // 先滚到底再测：图版是 loading="lazy" 的，不滚下去它们根本不会开始加载
  await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(600);
  await cdp.evaluate(`window.scrollTo(0, 0)`);
  await sleep(150);

  const state = await cdp.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme ?? null,
    source: document.documentElement.dataset.themeSource ?? null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    h1Font: getComputedStyle(document.querySelector('h1')).fontFamily,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    toggle: Boolean(document.getElementById('theme-toggle')),
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    images: [...document.images].map((image) => ({
      src: image.getAttribute('src'),
      ok: image.complete && image.naturalWidth > 0,
    })),
    plates: document.querySelectorAll('img.plate').length,
  }))()`);

  // 主题引导脚本是否真的在 CSP 下跑起来了 —— 这是文件级检查证明不了的一条
  check(
    state.theme === 'light' || state.theme === 'dark',
    `${route.path} 主题引导脚本已执行（data-theme=${state.theme}，来源 ${state.source}）`,
  );
  check(state.toggle, `${route.path} 主题切换按钮存在`);
  check(!state.overflowX, `${route.path} 桌面宽度无横向滚动`);
  check(Boolean(state.h1), `${route.path} 有 h1：「${state.h1}」`);
  check(
    /serif/i.test(state.h1Font),
    `${route.path} h1 走的是衬线显示字体`,
  );

  const cspViolations = pageIssues.filter((issue) => /Content Security Policy|CSP/i.test(issue));
  check(cspViolations.length === 0, `${route.path} 没有 CSP 违规`, cspViolations.join('\n      '));

  // 404 页面的文档本身就返回 404，浏览器必然会记一条资源错误 —— 预期之内，不算问题
  const noise = route.expectNotFound ? [/404/, /Not Found/i] : [];
  const isNoise = (issue) => noise.some((pattern) => pattern.test(issue));
  const otherErrors = pageIssues.filter(
    (issue) => !/Content Security Policy|CSP/i.test(issue) && !isNoise(issue),
  );
  check(
    otherErrors.length === 0,
    `${route.path} 没有控制台报错`,
    otherErrors.slice(0, 3).join('\n      '),
  );
  check(failedRequests.length === 0, `${route.path} 没有资源加载失败`, failedRequests.join(', '));

  // 图片真的解码出来了么 —— 这条能挡住"WebP 生成了但浏览器读不了"这类问题
  const brokenImages = state.images.filter((image) => !image.ok);
  check(
    brokenImages.length === 0,
    `${route.path} 图片都成功解码（共 ${state.images.length} 张，其中图版 ${state.plates} 张）`,
    brokenImages.map((image) => image.src).join(', '),
  );

  // 浅色截图
  await cdp.evaluate(`document.documentElement.dataset.theme='light'`);
  await sleep(120);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-light.png`));

  // 深色截图：直接改 data-theme，等价于用户点过一次切换
  await cdp.evaluate(`document.documentElement.dataset.theme='dark'`);
  await sleep(120);
  const dark = await cdp.evaluate(`(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
  }))()`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-dark.png`));

  // 变量真的生效了么？浅色与深色的 body 背景必须不同
  check(
    dark.bg !== state.bodyBg,
    `${route.path} 深浅主题的背景色确实不同（${state.bodyBg} → ${dark.bg}）`,
  );

  // 窄屏
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(250);
  const mobile = await cdp.evaluate(
    `document.documentElement.scrollWidth > window.innerWidth + 1`,
  );
  check(!mobile, `${route.path} 390px 窄屏无横向滚动`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-mobile.png`));

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  report.push({ route: route.path, ...state, darkBackground: dark.bg });
}

/* --------------------------------------------------- 切换按钮：真的点一下 */

console.log('\u001b[1m主题切换按钮\u001b[0m');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);

const before = await cdp.evaluate(`document.documentElement.dataset.theme`);
await cdp.evaluate(`document.getElementById('theme-toggle').click()`);
await sleep(200);
const after = await cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
  stored: (() => { try { return localStorage.getItem('grimoire-theme'); } catch { return null; } })(),
}))()`);

check(after.theme !== before, `点击后主题翻转（${before} → ${after.theme}）`);
check(after.source === 'manual', `点击后标记为手动选择（source=${after.source}）`);
check(after.stored === after.theme, `选择已写入 localStorage（${after.stored}）`);

// 刷新一次，验证选择被记住（这才是"刷新后保持"）
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);
const persisted = await cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
}))()`);
check(
  persisted.theme === after.theme && persisted.source === 'manual',
  `刷新后仍是手动选择的主题（${persisted.theme}）`,
);

await writeFile(
  path.join(SHOTS, 'report.json'),
  JSON.stringify({ base: BASE, routes: report }, null, 2),
  'utf8',
);

cdp.close();
child.kill();

console.log(`\n截图与报告：${path.relative(ROOT, SHOTS)}`);

if (problems.length > 0) {
  console.log(`\n\u001b[31m\u001b[1m${problems.length} 项未通过\u001b[0m`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

console.log('\n\u001b[32m\u001b[1m浏览器级验收全部通过。\u001b[0m');

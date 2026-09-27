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
 *   · 滚动进场动画一定收敛到可见终态（不会「动到一半就永久停住」）
 *   · prefers-reduced-motion: reduce 下动效整体让位，内容照样完整可读
 *
 * 所以这里用无头 Chrome + CDP 把页面真跑一遍。零 npm 依赖：Node 24 自带
 * WebSocket 与 fetch，CDP 就是一个 JSON-RPC over WebSocket。
 *
 * 跑法：
 *   1) 另开一个终端：pnpm preview --port 4321
 *   2) node scripts/verify-browser.mjs [--base http://127.0.0.1:4321]
 *      （不给 --base 时会自动在 127.0.0.1 与 localhost 之间挑一个连得上的）
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
let BASE = baseIndex !== -1 ? process.argv[baseIndex + 1] : null;

/**
 * 没给 --base 时自动挑一个连得上的本地地址。
 *
 * 起因：Astro 的 preview 在有些机器上只监听 ::1，于是写死的 127.0.0.1
 * 会被"目标计算机积极拒绝"，而文档承诺的是「起了 pnpm preview 就能跑
 * pnpm verify:browser」。两个候选都试一遍，成本是一次 fetch。
 */
if (!BASE) {
  const candidates = ['http://127.0.0.1:4321', 'http://localhost:4321'];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        BASE = candidate;
        break;
      }
    } catch {
      /* 连不上就试下一个 */
    }
  }
  BASE ??= candidates[0];
}

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

  // 横向走廊里的图版同样是 lazy 的，但纵向滚动永远不会让它们进入视口 ——
  // 不把它滚到底，右边的图根本不会开始加载，下面「图片都成功解码」就会误报。
  // 顺手也验证了走廊真的能横向滚动。
  await cdp.evaluate(`(async () => {
    for (const rail of document.querySelectorAll('.rail')) {
      rail.scrollLeft = rail.scrollWidth;
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 220)));
      rail.scrollLeft = 0;
    }
  })()`);

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

/* ------------------------- 动效契约：进场动画必须收敛到可见终态 */

console.log('\u001b[1m动效契约（滚动进场）\u001b[0m');
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);

const revealed = await cdp.evaluate(`(async () => {
  const elements = [...document.querySelectorAll('.reveal')];
  for (const element of elements) {
    element.scrollIntoView({ block: 'center' });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 80)));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  const stuck = [];
  for (const element of elements) {
    const style = getComputedStyle(element);
    const moved = style.transform !== 'none' && style.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    if (moved || Number.parseFloat(style.opacity) < 0.99) {
      stuck.push(element.className + ' transform=' + style.transform + ' opacity=' + style.opacity);
    }
  }
  return { count: elements.length, stuck };
})()`);

// 空集上的检查是假守卫（这份脚本的头部注释里就吐槽过这件事），所以先断言非空
check(revealed.count >= 3, `首页有 ${revealed.count} 个 .reveal 元素（检查不能是空集）`);
check(
  revealed.stuck.length === 0,
  '每个 .reveal 都收敛到可见终态（transform 归位、完全不透明）',
  revealed.stuck.slice(0, 3).join('\n      '),
);

/* ------------------------- reduced motion：动效整体让位，内容照旧可读 */

console.log('\u001b[1mprefers-reduced-motion: reduce\u001b[0m');
await cdp.send('Emulation.setEmulatedMedia', {
  media: '',
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});

for (const route of ROUTES) {
  await cdp.send('Page.navigate', { url: `${BASE}${route.path}` });
  await waitForLoad(cdp);
  await sleep(250);

  const state = await cdp.evaluate(`(() => {
    const elements = [...document.querySelectorAll('.reveal')];
    const moved = elements.filter((element) => {
      const transform = getComputedStyle(element).transform;
      return transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    });
    return {
      count: elements.length,
      moved: moved.length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    };
  })()`);

  check(state.moved === 0, `${route.path} reduce 下没有元素停在位移中间态`);
  check(!state.overflowX, `${route.path} reduce 下无横向滚动`);
  check(Boolean(state.h1), `${route.path} reduce 下内容照常渲染（h1 在）`);
  if (route.path === '/') {
    check(
      state.count >= 3,
      `reduce 下首页仍有 ${state.count} 个 .reveal 元素（说明检查不是空集）`,
    );
  }
}

// 收尾：撤掉媒体模拟
await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });

await writeFile(
  path.join(SHOTS, 'report.json'),
  JSON.stringify({ base: BASE, routes: report }, null, 2),
  'utf8',
);

cdp.close();
child.kill();
// 临时 profile 用完就删（失败也不影响验收结论）
await rm(profile, { recursive: true, force: true }).catch(() => {});

console.log(`\n截图与报告：${path.relative(ROOT, SHOTS)}`);

if (problems.length > 0) {
  console.log(`\n\u001b[31m\u001b[1m${problems.length} 项未通过\u001b[0m`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

console.log('\n\u001b[32m\u001b[1m浏览器级验收全部通过。\u001b[0m');

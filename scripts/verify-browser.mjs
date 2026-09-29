#!/usr/bin/env node
/**
 * 浏览器级验收。
 *
 * 守卫脚本（check-site.mjs）看的是**文件**，它证明不了这些东西真的能跑：
 *   · 内联主题引导脚本在 CSP 之下**确实被执行**了（否则又会闪一下错误的主题）
 *   · 页面没有任何 CSP 违规或 JS 报错
 *   · 没选过主题时落到默认主题（新粗野主义），data-themeSource 是脚本写上去的 ——
 *     这条同时证明引导脚本真的在 CSP 之下执行了
 *   · 主题切换按钮点下去，data-theme 会按 新粗野主义 → 羊皮纸 → 灰烬 循环并写进
 *     localStorage
 *   · 三套主题的 CSS 变量真的生效（读 computedStyle，不是看源码）
 *   · 新粗野主义那一半"token 覆盖不到"的改动也真的生效：方角、硬阴影、字重、
 *     以及页头不再毛玻璃 —— 这些 @theme inline 编译成了字面量，只改变量是没用的
 *   · 窄屏（390px）不会出现横向滚动（含硬阴影最容易撑破的那一档）
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

/** 三套主题的 id；与 src/lib/theme.ts 的 THEME_IDS 一致 */
const THEMES = ['brutal', 'light', 'dark'];

/** 默认主题（src/lib/theme.ts 的 DEFAULT_THEME，也就是 THEME_IDS[0]） */
const DEFAULT_THEME = 'brutal';

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/about/', name: 'about' },
  { path: '/projects/notes-of-ashen/', name: 'notes-of-ashen' },
  { path: '/projects/ashen-courier/', name: 'ashen-courier' },
  { path: '/projects/cryptowitch/', name: 'cryptowitch' },
  { path: '/projects/ruiqiang-website/', name: 'ruiqiang-website' },
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

/**
 * 判断一个 computed box-shadow 是不是"硬阴影"：有阴影、模糊半径为 0，
 * 且两个方向都至少偏了 3px。
 *
 * 只要"有阴影"是不够的 —— 浅色主题的卡片本来就有一条 `0 1px 0` 的极淡投影，
 * 模糊半径同样是 0。所以这里还要求偏移量够大，才是新粗野主义那种"错开的实心块"。
 * computed 形式形如 `rgb(16, 16, 16) 5px 5px 0px 0px`。
 */
function isHardShadow(value) {
  if (!value || value === 'none') return false;
  const parts = value
    .replace(/^[a-z]+\([^)]*\)\s*/i, '')
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));
  if (parts.length < 3) return false;
  const [offsetX, offsetY, blur] = parts;
  return blur === 0 && Math.abs(offsetX) >= 3 && Math.abs(offsetY) >= 3;
}

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
    h1Weight: Number(getComputedStyle(document.querySelector('h1')).fontWeight) || 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    toggle: Boolean(document.getElementById('theme-toggle')),
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    images: [...document.images].map((image) => ({
      src: image.getAttribute('src'),
      ok: image.complete && image.naturalWidth > 0,
    })),
    plates: document.querySelectorAll('img.plate').length,
  }))()`);

  // 主题引导脚本是否真的在 CSP 下跑起来了 —— 这是文件级检查证明不了的一条。
  // 判据是 data-themeSource：它只由那段脚本写，服务端渲染的 HTML 里没有。
  // （只看 data-theme 已经不够了：默认主题现在是直接写在 <html> 上的，
  //   脚本就算被 CSP 拦掉，属性也照样在那儿 —— 那就成了假守卫。）
  check(
    THEMES.includes(state.theme) && ['default', 'manual'].includes(state.source),
    `${route.path} 主题引导脚本已执行（data-theme=${state.theme}，来源 ${state.source}）`,
  );
  // 首次访问（这个临时 profile 里 localStorage 是空的）必须落到默认主题
  check(
    state.theme === DEFAULT_THEME && state.source === 'default',
    `${route.path} 首次访问默认就是新粗野主义（${state.theme} / ${state.source}）`,
  );
  check(state.toggle, `${route.path} 主题切换按钮存在`);
  check(!state.overflowX, `${route.path} 桌面宽度无横向滚动`);
  check(Boolean(state.h1), `${route.path} 有 h1：「${state.h1}」`);
  // 默认主题下标题走粗黑无衬线。这里刻意**不**写 /serif/i —— 'sans-serif' 里也含
  // 'serif'，那种断言对任何无衬线栈都会假通过。衬线那条留给下面的浅色主题。
  check(
    !/Iowan|Georgia|Palatino/i.test(state.h1Font) && state.h1Weight >= 700,
    `${route.path} 默认主题下 h1 是粗黑无衬线（weight=${state.h1Weight}）`,
    state.h1Font,
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

  // 浅色截图：显式设主题，不再依赖"默认是什么"（默认已经不是浅色了）。
  // 等 300ms：卡片那条 240ms 的 box-shadow 过渡走完再量 / 再拍。
  await cdp.evaluate(`document.documentElement.dataset.theme='light'`);
  await sleep(300);
  const light = await cdp.evaluate(`(() => {
    const h1 = document.querySelector('h1');
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      h1Font: h1 ? getComputedStyle(h1).fontFamily : '',
    };
  })()`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-light.png`));

  // 显示字体换的是不是只有粗野主义那一套：浅色必须回到衬线栈。
  // 这条同时挡住了"把 --font-display 写进 :root、结果三套主题都变粗黑"那类改法。
  check(
    /Iowan|Georgia|Palatino/i.test(light.h1Font),
    `${route.path} 浅色主题下 h1 回到衬线显示字体`,
    light.h1Font,
  );

  // 深色截图：直接改 data-theme，等价于用户点过一次切换
  await cdp.evaluate(`document.documentElement.dataset.theme='dark'`);
  await sleep(300);
  const dark = await cdp.evaluate(`(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
  }))()`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-dark.png`));

  // 第三套主题：新粗野主义。它有一半的改动是 token 覆盖不了的（方角、硬阴影、
  // 字重、去掉毛玻璃），所以这里不满足于"背景色变了"，而是直接读那些计算值。
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  // 等够 .entry-card 那条 240ms 的 box-shadow 过渡再量。等太短就会读到
  // "从浅色的柔阴影过渡到粗野主义硬阴影"的中间帧 —— 实测量到过
  // 3px/3.4px、颜色还带着 alpha 的值，看起来像断言太严，其实是量早了。
  await sleep(400);
  const brutal = await cdp.evaluate(`(() => {
    const card = document.querySelector('.entry-card');
    const button = document.querySelector('.btn');
    const toggle = document.getElementById('theme-toggle');
    const h1 = document.querySelector('h1');
    const header = document.querySelector('.site-header');
    const style = (element) => (element ? getComputedStyle(element) : null);
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      h1Font: style(h1).fontFamily,
      h1Weight: Number(style(h1).fontWeight) || 0,
      toggleRadius: style(toggle).borderRadius,
      toggleShadow: style(toggle).boxShadow,
      headerBlur: style(header).backdropFilter,
      cardCount: document.querySelectorAll('.entry-card').length,
      cardRadius: card ? style(card).borderRadius : null,
      cardShadow: card ? style(card).boxShadow : null,
      buttonShadow: button ? style(button).boxShadow : null,
    };
  })()`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-brutal.png`));

  check(
    new Set([light.bg, dark.bg, brutal.bg]).size === 3,
    `${route.path} 三套主题的背景色互不相同（${light.bg} / ${dark.bg} / ${brutal.bg}）`,
  );
  // 页头在粗野主义下必须是实底：不读这一条，backdrop-blur-md 会被悄悄留着
  check(brutal.headerBlur === 'none', `${route.path} 粗野主义下页头没有毛玻璃（${brutal.headerBlur}）`);
  // h1 的字体与字重：这里刻意不用 /serif/i —— 'sans-serif' 里也含 'serif'，
  // 那种断言对无衬线栈会假通过。改为盯住衬线字体名与字重下限。
  check(
    !/Iowan|Georgia|Palatino/i.test(brutal.h1Font) && brutal.h1Weight >= 700,
    `${route.path} 粗野主义下 h1 是粗黑无衬线（weight=${brutal.h1Weight}）`,
    brutal.h1Font,
  );
  // #theme-toggle 每页都有，所以这两条不会是空集上的假守卫
  check(brutal.toggleRadius === '0px', `${route.path} 粗野主义下按钮是方角（${brutal.toggleRadius}）`);
  check(
    isHardShadow(brutal.toggleShadow),
    `${route.path} 粗野主义下按钮是硬阴影（${brutal.toggleShadow}）`,
  );
  // 卡片只在首页出现，所以先断言它真的存在，再断言形状 —— 空集不算通过
  if (route.path === '/') {
    check(brutal.cardCount > 0, `首页确实有 ${brutal.cardCount} 张条目卡`);
    check(brutal.cardRadius === '0px', `首页条目卡是方角（${brutal.cardRadius}）`);
    check(isHardShadow(brutal.cardShadow), `首页条目卡是硬阴影（${brutal.cardShadow}）`);
    check(isHardShadow(brutal.buttonShadow), `首页按钮是硬阴影（${brutal.buttonShadow}）`);
  }

  // 窄屏
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(250);

  // 先在粗野主义下量一次横向滚动：硬阴影向右下探出，是这套主题唯一真实的
  // 溢出风险，而只在默认主题下量是量不到它的。
  const brutalMobile = await cdp.evaluate(
    `document.documentElement.scrollWidth > window.innerWidth + 1`,
  );
  check(!brutalMobile, `${route.path} 390px 窄屏 · 粗野主义下无横向滚动`);
  await cdp.screenshot(path.join(SHOTS, `${route.name}-brutal-mobile.png`));

  // 再把主题设回深色，让既有的 -mobile.png 保持原来的语义
  await cdp.evaluate(`document.documentElement.dataset.theme='dark'`);
  await sleep(150);
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

  report.push({
    route: route.path,
    ...state,
    lightBackground: light.bg,
    darkBackground: dark.bg,
    brutalBackground: brutal.bg,
  });
}

/* ------------------------------------------- 切换按钮：三态循环 + 刷新后保持 */

console.log('\u001b[1m主题切换按钮（新粗野主义 → 羊皮纸 → 灰烬 → 新粗野主义）\u001b[0m');

// 先验证「没选过 = 默认主题」这条路：清掉存储再刷新，引导脚本该落到 brutal。
// 这是这次改动的核心承诺，所以从最干净的状态开始测，而不是从一个手写的值开始。
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);
await cdp.evaluate(`localStorage.removeItem('grimoire-theme')`);
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);
const fresh = await cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
}))()`);
check(
  fresh.theme === DEFAULT_THEME && fresh.source === 'default',
  `没选过时落到默认主题（${fresh.theme} / ${fresh.source}）`,
);

/** 点一下切换按钮，返回点完之后的完整状态 */
async function clickToggle() {
  await cdp.evaluate(`document.getElementById('theme-toggle').click()`);
  await sleep(180);
  return cdp.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    source: document.documentElement.dataset.themeSource,
    stored: (() => { try { return localStorage.getItem('grimoire-theme'); } catch { return null; } })(),
  }))()`);
}

const first = await clickToggle();
check(first.theme === 'light', `第一次点击 → 羊皮纸（实际 ${first.theme}）`);
check(first.source === 'manual', `第一次点击后标记为手动选择（source=${first.source}）`);
check(first.stored === 'light', `第一次点击已写入 localStorage（${first.stored}）`);

// 第二次点击进入深色。这一步顺带证明「引导脚本与 THEME_IDS 是同步的」：
// 只要两边不一致，下面那次刷新就会掉回默认主题。
const second = await clickToggle();
check(second.theme === 'dark', `第二次点击 → 灰烬（实际 ${second.theme}）`);
check(second.stored === 'dark', `第二次点击已写入 localStorage（${second.stored}）`);

// 刷新一次，验证选择被记住（这才是"刷新后保持"）
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);
const persisted = await cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
}))()`);
check(
  persisted.theme === 'dark' && persisted.source === 'manual',
  `刷新后仍是手动选择的灰烬（${persisted.theme} / ${persisted.source}）`,
);

// 第三次点击回到默认：循环是闭合的，而不是"点着点着卡在某一套上"
const third = await clickToggle();
check(third.theme === DEFAULT_THEME, `第三次点击回到新粗野主义（实际 ${third.theme}）`);

// 收尾复位：清掉存储 = 回到默认主题，后面的动效与 reduce 阶段不受这次实验影响
await cdp.evaluate(
  `localStorage.removeItem('grimoire-theme'); document.documentElement.dataset.theme='brutal';`,
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

/* ---------------------- 新粗野主义：给人复核的预览截图 ---------------------- */

// 这一节不做断言，只产出人眼复核用的图。放在最后是因为它要先把所有 .reveal
// 滚进视口让进场动画收敛，再逐段截图 —— 否则截到的是动到一半的卡片，
// 拿去做设计复核会误导。做法与上面的「动效契约」一致。
console.log('\u001b[1m新粗野主义主题：预览截图\u001b[0m');

await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(300);
await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
await cdp.evaluate(`(async () => {
  for (const element of document.querySelectorAll('.reveal')) {
    element.scrollIntoView({ block: 'center' });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 80)));
  }
})()`);
await sleep(300);

/** 滚到指定位置、等一拍，再截图（这一步是给人看的，稳定比快重要） */
async function captureAt(file, scrollExpression) {
  await cdp.evaluate(scrollExpression);
  await sleep(450);
  await cdp.screenshot(path.join(SHOTS, file));
}

const previews = [
  ['home-brutal-1.png', `window.scrollTo(0, 0)`],
  [
    'home-brutal-2.png',
    `(() => { const el = document.getElementById('entries'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); })()`,
  ],
  [
    'home-brutal-3.png',
    `(() => { const el = document.querySelector('[aria-label="图版"]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); })()`,
  ],
  ['home-brutal-4.png', `window.scrollTo(0, document.body.scrollHeight)`],
];
for (const [file, expression] of previews) await captureAt(file, expression);

// 窄屏再来一张：硬阴影在 390px 下的表现是这次改动最需要人眼确认的地方
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await sleep(250);
await captureAt('home-brutal-mobile.png', `window.scrollTo(0, 0)`);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

// 另外两个页型各一张：条目页有详情头部与水印，关于页有卡片网格与正文排版
for (const route of [
  { path: '/about/', name: 'about' },
  { path: '/projects/notes-of-ashen/', name: 'notes-of-ashen' },
]) {
  await cdp.send('Page.navigate', { url: `${BASE}${route.path}` });
  await waitForLoad(cdp);
  await sleep(300);
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await captureAt(`${route.name}-brutal-preview.png`, `window.scrollTo(0, 0)`);
}

/* ------------- 禁用脚本时：默认主题照样成立（这正是把默认写在 HTML 上的理由） ------------- */

console.log('\u001b[1m禁用脚本时的默认主题\u001b[0m');
await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
await cdp.send('Page.navigate', { url: `${BASE}/` });
await waitForLoad(cdp);
await sleep(500);

const noJs = await cdp.evaluate(`(() => {
  const toggle = document.getElementById('theme-toggle');
  const card = document.querySelector('.entry-card');
  return {
    theme: document.documentElement.dataset.theme ?? null,
    source: document.documentElement.dataset.themeSource ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
    toggleRadius: toggle ? getComputedStyle(toggle).borderRadius : null,
    cardShadow: card ? getComputedStyle(card).boxShadow : null,
  };
})()`);
await cdp.screenshot(path.join(SHOTS, 'home-nojs.png'));

// source 必须是 null：那说明 data-theme 是服务端渲染的，不是脚本写的
check(
  noJs.theme === DEFAULT_THEME && noJs.source === null,
  `禁用脚本时 <html> 上仍是服务端渲染的默认主题（data-theme=${noJs.theme}，来源 ${noJs.source}）`,
);
check(noJs.bg === 'rgb(255, 253, 244)', `禁用脚本时画布是粗野主义的纸白（${noJs.bg}）`);
// 这一条才是把默认写进 HTML 的真正理由：形状覆盖是按 [data-theme='brutal'] 选的，
// 所以属性必须在 HTML 里 —— 只把 token 放进 :root 的话，无 JS 时会得到
// "粗野主义的颜色 + 上一套的圆角与柔光" 这种没人设计过的半成品。
check(
  noJs.toggleRadius === '0px' && isHardShadow(noJs.cardShadow),
  `禁用脚本时形状也是粗野主义（圆角 ${noJs.toggleRadius}，卡片阴影 ${noJs.cardShadow}）`,
);

await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });

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

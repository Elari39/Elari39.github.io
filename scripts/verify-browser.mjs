#!/usr/bin/env node
/**
 * 浏览器级验收。
 *
 * 守卫脚本（check-site.mjs）看的是**文件**，它证明不了这些东西真的能跑：
 *   · 内联主题引导脚本在 CSP 之下**确实被执行**了（否则又会闪一下错误的主题）
 *   · 页面没有任何 CSP 违规或 JS 报错
 *   · 没选过主题时落到默认主题（新粗野主义），data-themeSource 是脚本写上去的 ——
 *     这条同时证明引导脚本真的在 CSP 之下执行了
 *   · 主题面板：原生 <details> 真的能开能合、所有选项各自生效并写进 localStorage、
 *     选中态唯一、键盘可达（Enter 展开 / Tab 落到选项 / Enter 选中）、
 *     Esc 与点外部能收起（这两处原生不支持，是脚本补的）
 *   · 视图过渡真的被调用过（而不只是 API 存在），且把 API 删掉后切换照样生效
 *   · 每套主题的 CSS 变量真的生效（读 computedStyle，不是看源码）
 *   · 每套主题"token 覆盖不到"的那一半也真的生效：粗野主义的方角/硬阴影/字重/去毛玻璃、
 *     赛博终端的 CRT 扫描线（读 ::after 的 background-image）与等宽显示字体、
 *     瑞士极简的关底纹/去阴影/加大字号
 *   · 标签过滤：按钮筛选真的留下带该标签的卡片、多选是并集、清空能恢复、
 *     键盘可用，而且**禁用脚本时过滤条整条不出现**（渐进增强的方向）
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

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { componentContrast } from "./browser-contracts.mjs";
import { verifyInteractionContracts } from "./interaction-contracts.mjs";
import { readThemeIds, readThemeSource } from "./budget.mjs";
import { files, entries, routeFor } from "./site-model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 主题清单**不在这里另抄一份**：从 src/lib/theme.ts 的 THEME_IDS 读。
 * 抄一份数组的下场是「加了一套主题，但浏览器验收仍然只测三套」——
 * 而且它不会报错，只会安静地少测一半。
 */
const THEMES = readThemeIds(await readThemeSource(ROOT));

/** 默认主题 = THEME_IDS[0]（服务端渲染在 <html> 上的那一套） */
const DEFAULT_THEME = THEMES[0];

if (THEMES.length < 2) {
  throw new Error(`没能从 src/lib/theme.ts 解析出主题清单：${JSON.stringify(THEMES)}`);
}

const SHOTS = path.join(ROOT, ".assets-raw", "verify");

const baseIndex = process.argv.indexOf("--base");
let BASE = baseIndex !== -1 ? process.argv[baseIndex + 1] : null;

/**
 * 没给 --base 时自动挑一个连得上的本地地址。
 *
 * 起因：Astro 的 preview 在有些机器上只监听 ::1，于是写死的 127.0.0.1
 * 会被"目标计算机积极拒绝"，而文档承诺的是「起了 pnpm preview 就能跑
 * pnpm verify:browser」。两个候选都试一遍，成本是一次 fetch。
 */
if (!BASE) {
  const candidates = ["http://127.0.0.1:4321", "http://localhost:4321"];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        signal: AbortSignal.timeout(2000),
      });
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
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

/** 全部主题的 id —— 从 src/lib/theme.ts 的 THEME_IDS 读，见上面的说明。
 *  条数由 THEME_IDS 决定，别在文案或断言里写死数字。 */
const DIST = path.join(ROOT, "dist");
const ROUTES = (await files(DIST))
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const route = routeFor(f, DIST);
    return route === "/404.html"
      ? { path: "/definitely-not-a-page/", name: "404", expectNotFound: true }
      : {
          path: route,
          name:
            route === "/" ? "home" : route.split("/").filter(Boolean).join("-"),
        };
  });
for (const expected of [
  "/",
  "/about/",
  ...(await entries(ROOT))
    .filter((p) => !p.draft)
    .map((p) => `/projects/${p.slug}/`),
]) {
  if (!ROUTES.some((r) => r.path === expected))
    throw new Error(`构建缺少验收页面 ${expected}`);
}

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
  if (!value || value === "none") return false;
  const parts = value
    .replace(/^[a-z]+\([^)]*\)\s*/i, "")
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

    socket.addEventListener("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("CDP 连接关闭"));
      }
      this.pending.clear();
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(timer);
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(listener) {
    this.listeners.add(listener);
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "evaluate 失败");
    }
    return result.result?.value;
  }

  async screenshot(file) {
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(file, Buffer.from(data, "base64"));
  }

  close() {
    this.socket.close();
  }
}

/* ------------------------------------------------------------------- 启动流程 */

async function launchChrome() {
  if (process.env.CHROME_PATH && !existsSync(process.env.CHROME_PATH)) {
    throw new Error(`CHROME_PATH 不存在：${process.env.CHROME_PATH}`);
  }
  const executable = CHROME_CANDIDATES.find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!executable) throw new Error("找不到 Chrome / Edge");

  const profile = path.join(tmpdir(), `grimoire-verify-${Date.now()}`);
  await mkdir(profile, { recursive: true });

  const child = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: false, windowsHide: true },
  );

  let launchError;
  child.once("error", (error) => {
    launchError = error;
  });

  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (launchError || child.exitCode !== null) break;
    if (existsSync(portFile)) {
      const [port] = (await readFile(portFile, "utf8")).split("\n");
      if (port) return { child, profile, port: port.trim() };
    }
    await sleep(250);
  }
  child.kill();
  await rm(profile, { recursive: true, force: true });
  throw (
    launchError ?? new Error("Chrome 没有在 15 秒内写出 DevToolsActivePort")
  );
}

async function connect(port) {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(10000),
    })
  ).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("没有可用的页面 target");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket 连接超时"));
    }, 10000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("WebSocket 连接失败"));
      },
      { once: true },
    );
  });
  return new Cdp(socket);
}

/** 导航前订阅 load；超时属于失败，不能继续读取旧页面。 */
function waitForLoad(cdp, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cdp.listeners.delete(listener);
      reject(new Error("页面加载超时"));
    }, timeout);
    function listener(message) {
      if (message.method !== "Page.loadEventFired") return;
      clearTimeout(timer);
      cdp.listeners.delete(listener);
      resolve(true);
    }
    cdp.listeners.add(listener);
  });
}

/* --------------------------------------------------------------------- 主流程 */

console.log("\u001b[1m浏览器级验收\u001b[0m");
console.log(`base: ${BASE}`);

let child, profile, cdp;
try {
  const launched = await launchChrome();
  ({ child, profile } = launched);
  const { port } = launched;
  console.log(`Chrome 调试端口: ${port}\n`);

  // Keep previous evidence until each screenshot is successfully replaced.
  await mkdir(SHOTS, { recursive: true });

  cdp = await connect(port);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  let activeURL = "";
  let documentStatus = null;
  const allIssues = [];
  async function navigate(url) {
    activeURL = url;
    documentStatus = null;
    const loaded = waitForLoad(cdp);
    await Promise.all([loaded, cdp.send("Page.navigate", { url })]);
    const expected = url.endsWith("/definitely-not-a-page/") ? 404 : 200;
    check(
      documentStatus === expected,
      `${url} 主文档状态 ${documentStatus}（期望 ${expected}）`,
    );
  }
  cdp.on((message) => {
    if (message.method === "Network.responseReceived") {
      const { response, type } = message.params;
      if (type === "Document" && response.url === activeURL)
        documentStatus = response.status;
      if (
        response.status >= 400 &&
        !(
          type === "Document" &&
          response.url === activeURL &&
          activeURL.endsWith("/definitely-not-a-page/") &&
          response.status === 404
        )
      )
        allIssues.push(`${activeURL}: HTTP ${response.status} ${response.url}`);
    }
    if (message.method === "Network.requestWillBeSent") {
      const url = message.params.request.url;
      if (
        !url.startsWith("data:") &&
        new URL(url).origin !== new URL(BASE).origin
      )
        allIssues.push(`${activeURL}: 第三方请求 ${url}`);
    }
  });
  /** 页面级问题收集：CSP 违规会以 Log.entryAdded 的形式出现 */
  let pageIssues = [];
  cdp.on((message) => {
    if (message.method === "Log.entryAdded") {
      const entry = message.params.entry;
      if (entry.level === "error" || entry.level === "warning") {
        if (!(
          entry.source === "network" &&
          entry.url === activeURL &&
          activeURL.endsWith("/definitely-not-a-page/") &&
          /404/.test(entry.text)
        )) {
          const issue = `[${entry.source}] ${entry.text}`;
          pageIssues.push(issue);
          allIssues.push(`${activeURL}: ${issue}`);
        }
      }
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      const issue = `[exception] ${details.exception?.description ?? details.text}`;
      pageIssues.push(issue);
      allIssues.push(`${activeURL}: ${issue}`);
    }
    if (
      message.method === "Runtime.consoleAPICalled" &&
      ["error", "warning", "assert"].includes(message.params.type)
    ) {
      const issue = `[console.${message.params.type}] ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`;
      pageIssues.push(issue);
      allIssues.push(`${activeURL}: ${issue}`);
    }
  });

  /** 请求失败也要可见（例如图版路径写错） */
  const failedRequests = [];
  cdp.on((message) => {
    if (message.method === "Network.loadingFailed") {
      failedRequests.push(message.params.errorText);
      allIssues.push(`${activeURL}: ${message.params.errorText}`);
    }
  });

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const route of ROUTES) {
    console.log(`\u001b[1m${route.path}\u001b[0m`);
    pageIssues = [];
    failedRequests.length = 0;

    await navigate(`${BASE}${route.path}`);
    await sleep(350); // 让主题脚本与字体布局落定

    await cdp.evaluate(`(async () => {
    for (const image of document.images) {
      image.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
      await Promise.race([image.decode(), new Promise((_,reject)=>setTimeout(()=>reject(new Error('图片解码超时: '+image.src)),10000))]);
    }
    window.scrollTo({top:0,behavior:'instant'});
  })()`);

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
      THEMES.includes(state.theme) &&
        ["default", "manual"].includes(state.source),
      `${route.path} 主题引导脚本已执行（data-theme=${state.theme}，来源 ${state.source}）`,
    );
    // 首次访问（这个临时 profile 里 localStorage 是空的）必须落到默认主题
    check(
      state.theme === DEFAULT_THEME && state.source === "default",
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

    const cspViolations = pageIssues.filter((issue) =>
      /Content Security Policy|CSP/i.test(issue),
    );
    check(
      cspViolations.length === 0,
      `${route.path} 没有 CSP 违规`,
      cspViolations.join("\n      "),
    );

    // 404 页面的文档本身就返回 404，浏览器必然会记一条资源错误 —— 预期之内，不算问题
    const noise = []; // Only the exact expected main-document 404 is filtered in the event listener.
    const isNoise = (issue) => noise.some((pattern) => pattern.test(issue));
    const otherErrors = pageIssues.filter(
      (issue) => !/Content Security Policy|CSP/i.test(issue) && !isNoise(issue),
    );
    check(
      otherErrors.length === 0,
      `${route.path} 没有控制台报错`,
      otherErrors.slice(0, 3).join("\n      "),
    );
    check(
      failedRequests.length === 0,
      `${route.path} 没有资源加载失败`,
      failedRequests.join(", "),
    );

    // 图片真的解码出来了么 —— 这条能挡住"WebP 生成了但浏览器读不了"这类问题
    const brokenImages = state.images.filter((image) => !image.ok);
    check(
      brokenImages.length === 0,
      `${route.path} 图片都成功解码（共 ${state.images.length} 张，其中图版 ${state.plates} 张）`,
      brokenImages.map((image) => image.src).join(", "),
    );

    /* 逐套主题的计算样式。
       不满足于"背景色变了"：主题里有一半东西是 token 覆盖不到的（方角、硬阴影、
       字重、去掉毛玻璃、CRT 扫描线、大字号），只能读计算值才看得见。
       每套主题都等够 .entry-card 那条 240ms 的 box-shadow 过渡 —— 等太短会读到
       "从上一套过渡到这一套"的中间帧，看起来像断言太严，其实是量早了。 */
    const facts = {};
    for (const theme of THEMES) {
      await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await sleep(400);
      facts[theme] = await cdp.evaluate(`(() => {
    const style = (element) => (element ? getComputedStyle(element) : null);
    const card = document.querySelector('.entry-card');
    const h1 = document.querySelector('h1');
    const pseudo = (name) => getComputedStyle(document.body, name);
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      h1Font: style(h1)?.fontFamily ?? '',
      h1Weight: Number(style(h1)?.fontWeight) || 0,
      h1Size: parseFloat(style(h1)?.fontSize) || 0,
      toggleRadius: style(document.getElementById('theme-toggle'))?.borderRadius ?? null,
      toggleShadow: style(document.getElementById('theme-toggle'))?.boxShadow ?? null,
      headerBlur: style(document.querySelector('.site-header'))?.backdropFilter ?? null,
      cardCount: document.querySelectorAll('.entry-card').length,
      cardRadius: card ? style(card).borderRadius : null,
      cardShadow: card ? style(card).boxShadow : null,
      buttonShadow: style(document.querySelector('.btn'))?.boxShadow ?? null,
      // 底纹画在 body 的两个伪元素上：cyber 的 CRT 扫描线就在 ::after
      gridDisplay: pseudo('::after').display,
      grid: pseudo('::after').backgroundImage,
      bloomDisplay: pseudo('::before').display,
    };
  })()`);
      await cdp.screenshot(path.join(SHOTS, `${route.name}-${theme}.png`));
    }

    const backgrounds = THEMES.map((theme) => facts[theme].bg);
    check(
      new Set(backgrounds).size === THEMES.length,
      `${route.path} ${THEMES.length} 套主题的背景色互不相同（${backgrounds.join(" / ")}）`,
    );

    // 显示字体换的是不是只有粗野主义那一套：浅色必须回到衬线栈。
    // 这条同时挡住了"把 --font-display 写进 :root、结果所有主题都变粗黑"那类改法。
    check(
      /Iowan|Georgia|Palatino/i.test(facts.light.h1Font),
      `${route.path} 浅色主题下 h1 回到衬线显示字体`,
      facts.light.h1Font,
    );

    // 第三套主题：新粗野主义。
    const brutal = facts.brutal;
    // 页头在粗野主义下必须是实底：不读这一条，backdrop-blur-md 会被悄悄留着
    check(
      brutal.headerBlur === "none",
      `${route.path} 粗野主义下页头没有毛玻璃（${brutal.headerBlur}）`,
    );
    // h1 的字体与字重：这里刻意不用 /serif/i —— 'sans-serif' 里也含 'serif'，
    // 那种断言对无衬线栈会假通过。改为盯住衬线字体名与字重下限。
    check(
      !/Iowan|Georgia|Palatino/i.test(brutal.h1Font) && brutal.h1Weight >= 700,
      `${route.path} 粗野主义下 h1 是粗黑无衬线（weight=${brutal.h1Weight}）`,
      brutal.h1Font,
    );
    // #theme-toggle 每页都有，所以这两条不会是空集上的假守卫
    check(
      brutal.toggleRadius === "0px",
      `${route.path} 粗野主义下按钮是方角（${brutal.toggleRadius}）`,
    );
    check(
      isHardShadow(brutal.toggleShadow),
      `${route.path} 粗野主义下按钮是硬阴影（${brutal.toggleShadow}）`,
    );
    // 卡片只在首页出现，所以先断言它真的存在，再断言形状 —— 空集不算通过
    if (route.path === "/") {
      check(brutal.cardCount > 0, `首页确实有 ${brutal.cardCount} 张条目卡`);
      check(
        brutal.cardRadius === "0px",
        `首页条目卡是方角（${brutal.cardRadius}）`,
      );
      check(
        isHardShadow(brutal.cardShadow),
        `首页条目卡是硬阴影（${brutal.cardShadow}）`,
      );
      check(
        isHardShadow(brutal.buttonShadow),
        `首页按钮是硬阴影（${brutal.buttonShadow}）`,
      );
    }

    // 赛博终端：底纹换成了扫描线、显示字体换成等宽、方角、近黑画布。
    // 断言扫描线"真的被画出来"（读 ::after 的 background-image），
    // 而不是只信 CSS 里写了 repeating-linear-gradient。
    const cyber = facts.cyber;
    check(
      cyber.gridDisplay !== "none" && /repeating-linear-gradient/.test(cyber.grid),
      `${route.path} 赛博终端画出了 CRT 扫描线`,
      cyber.grid.slice(0, 90),
    );
    check(
      cyber.grid !== brutal.grid,
      `${route.path} 赛博终端的底纹与粗野主义不同（不是照抄一份）`,
    );
    check(
      cyber.bloomDisplay === "none",
      `${route.path} 赛博终端关掉了径向柔光（${cyber.bloomDisplay}）`,
    );
    check(
      cyber.bg === "rgb(6, 10, 6)",
      `${route.path} 赛博终端的画布是近黑（${cyber.bg}）`,
    );
    check(
      /mono/i.test(cyber.h1Font),
      `${route.path} 赛博终端的显示字体是等宽`,
      cyber.h1Font.slice(0, 60),
    );
    check(
      cyber.toggleRadius === "0px",
      `${route.path} 赛博终端下按钮是方角（${cyber.toggleRadius}）`,
    );

    // 瑞士极简：关掉底纹与阴影、全方角、字号更大 —— 这套主题做的是"减法"，
    // 所以断言的重点是"少了什么"和"字大了多少"。
    const swiss = facts.swiss;
    check(
      swiss.gridDisplay === "none" && swiss.bloomDisplay === "none",
      `${route.path} 瑞士极简关掉了所有底纹（${swiss.gridDisplay} / ${swiss.bloomDisplay}）`,
    );
    check(
      swiss.toggleRadius === "0px",
      `${route.path} 瑞士极简下按钮是方角（${swiss.toggleRadius}）`,
    );
    check(
      !swiss.cardShadow || swiss.cardShadow === "none",
      `${route.path} 瑞士极简去掉了卡片阴影（${swiss.cardShadow}）`,
    );
    check(
      !/Iowan|Georgia|Palatino/i.test(swiss.h1Font),
      `${route.path} 瑞士极简的 h1 是无衬线`,
      swiss.h1Font,
    );
    check(
      swiss.h1Size > brutal.h1Size,
      `${route.path} 瑞士极简的 h1 比粗野主义更大（${swiss.h1Size} > ${brutal.h1Size}）`,
    );

    /* 后加的四套主题（水墨宣纸 / 午夜档案馆 / 霓虹落日 / 孔版印刷）。
       它们的个性全部走**运行时 token**（标题字体栈、方角/圆角、错位套印），
       而不是像 brutal / swiss 那样另写一份无层级的逐类覆盖块 —— 那是为了把产物体积
       压进 48 KB 预算（见 global.css 第 1b 与第 8 节的说明）。所以这里同样只能读计算值：
       只换颜色的"假主题"会在这几条上红。 */
    const { ink, archive, sunset, riso } = facts;
    const SERIF = /Iowan|Georgia|Palatino|Songti/i;

    for (const [name, f] of [
      ["水墨宣纸", ink],
      ["孔版印刷", riso],
    ]) {
      /* `--r-pill` 归零只对读运行时 token 的组件生效（面板触发器每页都在）；
         既有组件读的是被 @theme inline 内联的字面量，所以卡片方角靠 global.css
         第 8 节那条覆盖 —— 卡片只在首页出现，先确认它真的在再量（空集不算通过）。 */
      check(
        f.toggleRadius === "0px",
        `${route.path} ${name}下按钮是方角（${f.toggleRadius}）`,
      );
      if (route.path === "/") {
        check(f.cardCount > 0, `首页确实有 ${f.cardCount} 张条目卡`);
        check(
          f.cardRadius === "0px",
          `${route.path} ${name}的卡片是方角（${f.cardRadius}）`,
        );
      }
    }

    for (const [name, f] of [
      ["午夜档案馆", archive],
      ["霓虹落日", sunset],
    ]) {
      check(
        Number.parseFloat(f.toggleRadius) > 0,
        `${route.path} ${name}保留圆角（${f.toggleRadius}）`,
      );
    }

    // 字体：ink / archive 走默认衬线栈（中文落到宋体），sunset / riso 各有一套无衬线栈
    check(
      SERIF.test(ink.h1Font) && SERIF.test(archive.h1Font),
      `${route.path} 水墨宣纸与午夜档案馆的 h1 是衬线`,
      `${ink.h1Font} | ${archive.h1Font}`,
    );
    check(
      !SERIF.test(sunset.h1Font) && !SERIF.test(riso.h1Font),
      `${route.path} 霓虹落日与孔版印刷的 h1 是无衬线`,
      `${sunset.h1Font} | ${riso.h1Font}`,
    );
    check(
      sunset.h1Font !== riso.h1Font,
      `${route.path} 两套无衬线主题用的是不同的字体栈`,
      `${sunset.h1Font} | ${riso.h1Font}`,
    );

    /* 孔版印刷的"错位套印"：也是硬阴影，但与粗野主义的区别在**阴影颜色** ——
       粗野主义用描边色（黑），孔版印刷用第二色（青）。只断言 isHardShadow 是分不开的。
       卡片只在首页出现，所以先确认它真的在，再量（空集不算通过）。 */
    if (route.path === "/") {
      check(riso.cardCount > 0, `首页确实有 ${riso.cardCount} 张条目卡`);
      check(
        isHardShadow(riso.cardShadow) &&
          /rgb\(10,\s*95,\s*90\)/.test(riso.cardShadow ?? ""),
        `${route.path} 孔版印刷的卡片是青色的错位套印（${riso.cardShadow}）`,
      );
      check(
        riso.cardShadow !== brutal.cardShadow,
        `${route.path} 孔版印刷的套印与粗野主义的硬阴影不是同一种`,
      );
    }

    // 窄屏
    await cdp.send("Emulation.setDeviceMetricsOverride", {
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

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    report.push({
      route: route.path,
      ...state,
      // 每套主题的背景色都留档：人复核 report.json 时能一眼看出"每套确实不同"
      themeBackgrounds: Object.fromEntries(
        THEMES.map((theme) => [theme, facts[theme].bg]),
      ),
    });
  }

  /* --------------------------------- 主题选择面板：5 套主题逐个选中 + 刷新后保持 */

  console.log('\u001b[1m主题选择面板\u001b[0m');

  // 先验证「没选过 = 默认主题」这条路：清掉存储再刷新，引导脚本该落到默认主题。
  // 从最干净的状态开始测，而不是从一个手写的值开始。
  await navigate(`${BASE}/`);
  await sleep(300);
  await cdp.evaluate(`localStorage.removeItem('grimoire-theme')`);
  await navigate(`${BASE}/`);
  await sleep(300);
  const fresh = await cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
}))()`);
  check(
    fresh.theme === DEFAULT_THEME && fresh.source === "default",
    `没选过时落到默认主题（${fresh.theme} / ${fresh.source}）`,
  );

  // 面板结构：触发器是 <summary>、面板默认收起、选项与 THEME_IDS 一一对应。
  // 这几条同时也是"面板不是摆设"的前提 —— 下面点选项时得真的有那些按钮。
  const panel = await cdp.evaluate(`(() => {
  const trigger = document.getElementById('theme-toggle');
  const menu = trigger?.closest('details');
  return {
    tag: trigger?.tagName ?? null,
    menuOpen: menu?.open ?? null,
    hasMenu: Boolean(menu),
    options: [...document.querySelectorAll('[data-theme-opt]')].map((button) => button.dataset.themeOpt),
    swatches: [...document.querySelectorAll('.theme-opt__swatch')].map((span) => span.dataset.theme),
    pressed: [...document.querySelectorAll('[data-theme-opt][aria-pressed="true"]')].map((button) => button.dataset.themeOpt),
    label: trigger?.getAttribute('aria-label') ?? null,
    panelInsideMenu: menu ? menu.contains(document.querySelector('.theme-menu__panel')) : false,
  };
})()`);
  check(panel.hasMenu, "触发器在 <details> 里面（开合交给原生行为）");
  check(panel.tag === "SUMMARY", `触发控件是 <summary>（实际 ${panel.tag}）`);
  check(panel.menuOpen === false, "面板默认是收起的");
  check(
    JSON.stringify(panel.options) === JSON.stringify(THEMES),
    `面板选项与 THEME_IDS 一致（${panel.options.join(" / ")}）`,
  );
  check(
    JSON.stringify(panel.swatches) === JSON.stringify(THEMES),
    `每套主题都有对应的预览色块（${panel.swatches.join(" / ")}）`,
  );
  check(
    panel.pressed.length === 1 && panel.pressed[0] === DEFAULT_THEME,
    `初始选中态是默认主题（${panel.pressed.join(",") || "无"}）`,
  );
  check(Boolean(panel.label), `触发器有可访问名称（${panel.label}）`);
  check(panel.panelInsideMenu, "面板在 <details> 内部");

  /** 读当前主题状态（面板相关的都从这里取，避免各写一份） */
  const readThemeState = () =>
    cdp.evaluate(`(() => ({
  theme: document.documentElement.dataset.theme,
  source: document.documentElement.dataset.themeSource,
  stored: (() => { try { return localStorage.getItem('grimoire-theme'); } catch { return null; } })(),
  pressed: [...document.querySelectorAll('[data-theme-opt][aria-pressed="true"]')].map((button) => button.dataset.themeOpt),
  open: document.getElementById('theme-menu').open,
  bg: getComputedStyle(document.body).backgroundColor,
}))()`);

  /** 走真实交互路径选主题：需要时点开面板，再点那个选项 */
  async function selectTheme(theme) {
    await cdp.evaluate(`(() => {
    if (!document.getElementById('theme-menu').open) document.getElementById('theme-toggle').click();
    document.querySelector('[data-theme-opt="${theme}"]').click();
  })()`);
    await sleep(400);
    return readThemeState();
  }

  /** 真的点 <summary> 来开合，而不是直接写 .open */
  async function toggleMenu() {
    await cdp.evaluate(`document.getElementById('theme-toggle').click()`);
    await sleep(150);
    return cdp.evaluate(`document.getElementById('theme-menu').open`);
  }

  check((await toggleMenu()) === true, "点一下展开面板");
  const exposed = await cdp.evaluate(`(() => {
  const button = document.querySelector('[data-theme-opt]');
  const rect = button.getBoundingClientRect();
  return { width: Math.round(rect.width), height: Math.round(rect.height), visibility: getComputedStyle(button).visibility };
})()`);
  check(
    exposed.width > 20 && exposed.height > 10 && exposed.visibility === "visible",
    `展开后选项真的可见可点（${exposed.width}×${exposed.height}，${exposed.visibility}）`,
  );
  check((await toggleMenu()) === false, "再点一下收起面板");

  // 逐个选中：每一步都断言"主题生效 + 记为手动 + 写入存储 + 选中态唯一 + 面板自动收起"
  const seenBackgrounds = new Map();
  for (const theme of THEMES) {
    const state = await selectTheme(theme);
    check(state.theme === theme, `选中「${theme}」后 data-theme 生效（实际 ${state.theme}）`);
    check(
      state.source === "manual" && state.stored === theme,
      `选中「${theme}」被记为手动选择并写入 localStorage（${state.source} / ${state.stored}）`,
    );
    check(
      state.pressed.length === 1 && state.pressed[0] === theme,
      `选中态唯一且指向「${theme}」（${state.pressed.join(",") || "无"}）`,
    );
    check(state.open === false, `选中「${theme}」后面板自动收起`);
    seenBackgrounds.set(theme, state.bg);
  }
  check(
    new Set(seenBackgrounds.values()).size === THEMES.length,
    `${THEMES.length} 套主题的背景色互不相同（${[...seenBackgrounds.values()].join(" / ")}）`,
  );

  // 刷新后保持。这一步顺带证明「引导脚本与 THEME_IDS 是同步的」：
  // 只要两边不一致，下面那次刷新就会掉回默认主题。
  await navigate(`${BASE}/`);
  await sleep(300);
  const persisted = await readThemeState();
  check(
    persisted.theme === THEMES[THEMES.length - 1] && persisted.source === "manual",
    `刷新后仍是最后手动选择的那一套（${persisted.theme} / ${persisted.source}）`,
  );

  // 键盘可达：Enter 展开 → Tab 落到第一个选项 → Enter 选中。
  // 复用站内既有的键入手势写法（见详情页目录那一节）。
  const pressKey = async (key, code, keyCode) => {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      // Enter 必须带上 text：不带的话页面只收到一个"没有字符的按键"，
      // <button> / <summary> 的默认激活行为不会触发（Tab / Esc 不需要 text）。
      ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
    });
  };

  await cdp.evaluate(`document.getElementById('theme-menu').open = false`);
  await cdp.evaluate(`document.getElementById('theme-toggle').focus()`);
  await pressKey("Enter", "Enter", 13);
  await sleep(250);
  check(
    (await cdp.evaluate(`document.getElementById('theme-menu').open`)) === true,
    "键盘 Enter 能展开面板",
  );
  await pressKey("Tab", "Tab", 9);
  await sleep(150);
  const focused = await cdp.evaluate(
    `document.activeElement?.getAttribute('data-theme-opt') ?? null`,
  );
  check(focused === THEMES[0], `Tab 落到第一个选项（${focused}）`);
  await pressKey("Enter", "Enter", 13);
  await sleep(400);
  const byKeyboard = await readThemeState();
  check(
    byKeyboard.theme === THEMES[0] &&
      byKeyboard.source === "manual" &&
      byKeyboard.stored === THEMES[0],
    `键盘选中生效并被记住（${byKeyboard.theme} / ${byKeyboard.source} / ${byKeyboard.stored}）`,
  );

  // Esc 关闭：<details> **原生不支持**这个，正是脚本要补的两处缺口之一
  await cdp.evaluate(`document.getElementById('theme-menu').open = true`);
  await pressKey("Escape", "Escape", 27);
  await sleep(200);
  check(
    (await cdp.evaluate(`document.getElementById('theme-menu').open`)) === false,
    "Esc 能收起面板（原生 <details> 不会）",
  );

  // 点面板外部关闭：另一处原生缺口。点在 h1 上（不是链接，不会导航走）
  await cdp.evaluate(`document.getElementById('theme-menu').open = true`);
  const outside = await cdp.evaluate(`(() => {
  const rect = document.querySelector('h1').getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
})()`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: outside.x,
    y: outside.y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: outside.x,
    y: outside.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(250);
  check(
    (await cdp.evaluate(`document.getElementById('theme-menu').open`)) === false,
    "点面板外部会收起面板",
  );

  await verifyInteractionContracts({ cdp, check, navigate, base: BASE, themes: THEMES, routes: ROUTES, shots: SHOTS });

  /* ------------------------------------------- 主题切换的视图过渡（含降级） */

  console.log("\u001b[1m主题切换的视图过渡\u001b[0m");

  // 先证明这个浏览器确实提供了 API。少了这一步，下面的降级测试会退化成
  // 「本来就走的降级分支」—— 两条断言都通过，但什么都没测到。
  check(
    await cdp.evaluate(`typeof document.startViewTransition === 'function'`),
    "浏览器提供 document.startViewTransition（否则降级分支无从对照）",
  );

  // 不只看 API 在不在，要看站点**真的调了它**：包一层计数（原样转发参数、
  // 立刻还原），再走一次真实的"选主题"路径。只断言"API 存在"是很容易变成假守卫的写法。
  // 这里刻意挑一个**与当前不同**的主题：选当前那套不会产生状态变化，
  // 那样"主题换了"这条断言会退化成在测一个恒等变换。
  const transition = await cdp.evaluate(`(async () => {
  const original = Document.prototype.startViewTransition;
  let calls = 0;
  Document.prototype.startViewTransition = function (...args) {
    calls += 1;
    return original.apply(this, args);
  };
  try {
    const before = document.documentElement.dataset.theme;
    const other = ${JSON.stringify(THEMES)}.find((id) => id !== before);
    document.getElementById('theme-toggle').click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    document.querySelector('[data-theme-opt="' + other + '"]').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { calls, before, after: document.documentElement.dataset.theme, other };
  } finally {
    Document.prototype.startViewTransition = original;
  }
})()`);
  check(
    transition.calls >= 1,
    `切换主题真的走了一次视图过渡（startViewTransition 被调用 ${transition.calls} 次）`,
  );
  check(
    transition.after !== transition.before && transition.after === transition.other,
    `视图过渡之后主题确实换成了选中的那一套（${transition.before} → ${transition.after}）`,
  );

  // 降级：把 API 从原型上删掉再刷新。Safari / Firefox 与旧版 Chrome 就是这条路 ——
  // 它们只该少一段动画，主题切换与"记住选择"必须完全一样，而且不能报错
  // （任何控制台 / CSP 错误都会在最后的汇总断言里被抓住）。
  const noTransition = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "delete Document.prototype.startViewTransition;",
  });
  try {
    await navigate(`${BASE}/`);
    await sleep(300);
    const supported = await cdp.evaluate(`typeof document.startViewTransition`);
    const fallbackBefore = await readThemeState();
    // 同样挑一个与当前不同的主题：选当前那套不会产生状态变化，
    // 断言就退化成在测一个恒等变换
    const fallbackTarget = THEMES.find((id) => id !== fallbackBefore.theme);
    const fallback = await selectTheme(fallbackTarget);
    check(
      supported === "undefined",
      `降级分支确实生效（typeof startViewTransition = ${supported}）`,
    );
    check(
      fallback.theme === fallbackTarget &&
        fallback.theme !== fallbackBefore.theme &&
        fallback.source === "manual" &&
        fallback.stored === fallbackTarget,
      `没有视图过渡时切换照样生效并记住选择（${fallbackBefore.theme} → ${fallback.theme} / ${fallback.source} / ${fallback.stored}）`,
    );
  } finally {
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: noTransition.identifier,
    });
  }

  /* ------------------------------- 标签过滤：纯静态列表 + 只切 hidden 的脚本 */

  console.log("\u001b[1m标签过滤\u001b[0m");

  await navigate(`${BASE}/`);
  await sleep(300);
  await cdp.evaluate(`localStorage.removeItem('grimoire-theme')`);
  await navigate(`${BASE}/`);
  await sleep(300);

  const filter = await cdp.evaluate(`(() => {
  const bar = document.getElementById('tagbar');
  const buttons = [...document.querySelectorAll('[data-tag]')];
  const cards = [...document.querySelectorAll('[data-tags]')];
  return {
    barHidden: bar?.hasAttribute('hidden') ?? null,
    barDisplay: bar ? getComputedStyle(bar).display : null,
    buttons: buttons.length,
    pressed: buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').length,
    visibleCards: cards.filter((card) => !card.hasAttribute('hidden')).length,
    cards: cards.length,
    status: document.getElementById('tag-status')?.textContent ?? null,
  };
})()`);
  check(filter.barHidden === false, "脚本跑起来后过滤条不再带 hidden");
  check(
    filter.barDisplay !== "none",
    `过滤条真的可见（display=${filter.barDisplay}）`,
  );
  check(filter.buttons >= 2, `过滤条有 ${filter.buttons} 个标签按钮（至少两个才有筛选意义）`);
  check(filter.pressed === 0, "初始没有任何标签处于选中态");
  check(
    filter.visibleCards === filter.cards && filter.cards > 0,
    `初始所有 ${filter.cards} 张卡片都可见`,
  );

  /** 点一个标签按钮（走真实点击），返回过滤后的状态 */
  async function clickTag(selector) {
    const box = await cdp.evaluate(`(() => {
    const element = document.querySelector('${selector}');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
    if (!box) return null;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
    await sleep(200);
    return cdp.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-tags]')];
    return {
      visible: cards.filter((card) => !card.hasAttribute('hidden')).length,
      total: cards.length,
      pressed: [...document.querySelectorAll('[data-tag][aria-pressed="true"]')].map((button) => button.getAttribute('data-tag')),
      clearHidden: document.querySelector('[data-tag-clear]')?.hasAttribute('hidden') ?? null,
      status: document.getElementById('tag-status')?.textContent ?? null,
      firstVisible: cards.filter((card) => !card.hasAttribute('hidden')).map((card) => card.getAttribute('data-tags')),
    };
  })()`);
  }

  // 挑一个最少见的标签来筛（词汇表按出现次数降序排，所以最后一个最"窄"）
  const narrowTag = await cdp.evaluate(
    `[...document.querySelectorAll('[data-tag]')].at(-1)?.getAttribute('data-tag') ?? null`,
  );
  const filtered = await clickTag(`[data-tag="${narrowTag}"]`);
  check(Boolean(filtered), `能点到标签按钮「${narrowTag}」`);
  check(
    filtered.pressed.length === 1 && filtered.pressed[0] === narrowTag,
    `点过之后该标签是选中的（${filtered.pressed.join(",") || "无"}）`,
  );
  check(
    filtered.visible < filtered.total && filtered.visible > 0,
    `筛出 ${filtered.visible}/${filtered.total} 张卡片（既不是全留也不是全没）`,
  );
  check(
    filtered.firstVisible.every((tags) => (tags ?? "").split(" ").includes(narrowTag)),
    "留下来的每一张卡片都真的带这个标签",
  );
  check(filtered.clearHidden === false, "有筛选时「清空筛选」按钮出现");
  check(
    (filtered.status ?? "").includes(String(filtered.visible)),
    `状态文字报出筛出的条数（${filtered.status}）`,
  );

  // 多选：并集
  const secondTag = await cdp.evaluate(
    `[...document.querySelectorAll('[data-tag]')].at(-2)?.getAttribute('data-tag') ?? null`,
  );
  const union = await clickTag(`[data-tag="${secondTag}"]`);
  check(
    union.pressed.length === 2,
    `两个标签可以同时选中（${union.pressed.join(",")}）`,
  );
  check(
    union.visible >= filtered.visible,
    `多选是并集：${union.visible} ≥ 单选时的 ${filtered.visible}`,
  );

  // 一键清空
  const cleared = await clickTag("[data-tag-clear]");
  check(
    cleared.visible === cleared.total,
    `清空后所有 ${cleared.total} 张卡片都回来（实际 ${cleared.visible}）`,
  );
  check(cleared.pressed.length === 0, "清空后没有任何标签处于选中态");
  check(cleared.clearHidden === true, "没有筛选时「清空筛选」按钮收起");

  // 键盘可用：Tab 到标签按钮后按 Enter
  await cdp.evaluate(`document.querySelector('[data-tag]').focus()`);
  await pressKey("Enter", "Enter", 13);
  await sleep(200);
  check(
    (await cdp.evaluate(
      `document.querySelector('[data-tag]').getAttribute('aria-pressed')`,
    )) === "true",
    "键盘 Enter 也能切换标签",
  );
  await clickTag("[data-tag-clear]");

  // 复位，后面的阶段从干净状态开始
  await cdp.evaluate(
    `localStorage.removeItem('grimoire-theme'); document.documentElement.dataset.theme='brutal';`,
  );

  /* --------------------------------- 就地预览抽屉：原生 <dialog> + showModal() */

  console.log("\u001b[1m就地预览抽屉（<dialog>）\u001b[0m");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(`${BASE}/`);
  await sleep(350);

  const dialogs = await cdp.evaluate(`(() => {
  const buttons = [...document.querySelectorAll('[data-preview]')];
  const all = [...document.querySelectorAll('dialog.preview')];
  const first = buttons.length ? document.getElementById(buttons[0].getAttribute('data-preview')) : null;
  return {
    buttons: buttons.length,
    dialogs: all.length,
    openBefore: all.filter((dialog) => dialog.open).length,
    reachesDialog: Boolean(first),
    labelled: first ? first.getAttribute('aria-labelledby') === (first.id + '-title') : false,
    archChars: first?.querySelector('.preview__arch')?.textContent?.trim().length ?? 0,
    items: first?.querySelectorAll('.preview__list li').length ?? 0,
    titleChars: first?.querySelector('h2')?.textContent?.trim().length ?? 0,
    h1Inside: all.reduce((sum, dialog) => sum + dialog.querySelectorAll('h1').length, 0),
    cards: document.querySelectorAll('.entry-card').length,
  };
})()`);
  check(
    dialogs.buttons === 4 && dialogs.dialogs === 4 && dialogs.buttons === dialogs.cards,
    `卡片各有一个预览按钮与抽屉（按钮 ${dialogs.buttons} / 抽屉 ${dialogs.dialogs} / 卡片 ${dialogs.cards}）`,
  );
  check(dialogs.reachesDialog, "预览按钮的 data-preview 指得到抽屉");
  check(dialogs.openBefore === 0, "抽屉默认全是关着的");
  check(dialogs.labelled, "抽屉用 aria-labelledby 指向自己的标题");
  check(dialogs.archChars >= 40, `架构图有内容（${dialogs.archChars} 字）`);
  check(dialogs.items >= 4, `难点与心得共 ${dialogs.items} 条（每类至少两条）`);
  check(dialogs.titleChars > 0, "抽屉里有标题");
  check(dialogs.h1Inside === 0, "抽屉里没有 h1（每页只能有一个）");

  // 打开
  await cdp.evaluate(`document.querySelector('[data-preview]').click()`);
  await sleep(350);
  const opened = await cdp.evaluate(`(() => {
  const dialog = document.querySelector('dialog.preview[open]');
  if (!dialog) return { open: false };
  const style = getComputedStyle(dialog);
  const backdrop = getComputedStyle(dialog, '::backdrop');
  const rect = dialog.getBoundingClientRect();
  const title = dialog.querySelector('.preview__title');
  return {
    open: dialog.open,
    modal: dialog.matches(':modal'),
    focusInside: dialog.contains(document.activeElement),
    bg: style.backgroundColor,
    color: style.color,
    radius: style.borderRadius,
    backdrop: backdrop.backgroundColor,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    inViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    // 抽屉是否停在开头：焦点若落在底部的关闭按钮上，浏览器会把它滚进视口，
    // 于是标题被滚出可见区（这一条是截图发现的，断言里原本没有）
    scrollTop: dialog.scrollTop,
    titleVisible: title ? title.getBoundingClientRect().top >= rect.top - 1 : false,
  };
})()`);
  check(opened.open === true, "点「快速预览」会打开抽屉");
  check(opened.modal === true, "抽屉是**模态**对话框（showModal：背景 inert + 焦点陷阱）");
  check(opened.focusInside === true, "打开后焦点被移进抽屉内部");
  check(
    opened.backdrop !== "rgba(0, 0, 0, 0)" && opened.backdrop !== "transparent",
    `抽屉带半透明背景遮罩（${opened.backdrop}）`,
  );
  check(
    opened.width > 200 && opened.height > 100 && opened.inViewport && !opened.overflowX,
    `抽屉尺寸合理且在视口内（${opened.width}×${opened.height}，无横向滚动）`,
  );
  // 抽屉必须停在开头：焦点若给了底部的关闭按钮，浏览器会为了让它可见而把内容下滚，
  // 于是抽屉一打开就错过了自己的标题（这条是看截图才发现的）
  check(
    opened.scrollTop === 0 && opened.titleVisible,
    `抽屉打开时停在开头、标题可见（scrollTop=${opened.scrollTop}）`,
  );

  // 视觉继承主题变量：换主题，抽屉的底色/文字色必须跟着变（而不是写死的颜色）
  const dialogThemeFacts = {};
  for (const theme of ["brutal", "cyber"]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await sleep(250);
    dialogThemeFacts[theme] = await cdp.evaluate(`(() => {
    const dialog = document.querySelector('dialog.preview[open]');
    const style = getComputedStyle(dialog);
    return { bg: style.backgroundColor, color: style.color, radius: style.borderRadius };
  })()`);
  }
  check(
    dialogThemeFacts.brutal.bg !== dialogThemeFacts.cyber.bg &&
      dialogThemeFacts.brutal.color !== dialogThemeFacts.cyber.color,
    `抽屉的底色与文字色跟随主题变量（${dialogThemeFacts.brutal.bg} vs ${dialogThemeFacts.cyber.bg}）`,
  );
  check(
    dialogThemeFacts.brutal.radius === "0px" && dialogThemeFacts.cyber.radius === "0px",
    `方角主题下抽屉也是方角（${dialogThemeFacts.brutal.radius} / ${dialogThemeFacts.cyber.radius}）`,
  );
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await sleep(200);

  // 三条关闭路径：关闭按钮、Esc（原生）、点背景（原生的缺口，由脚本补）
  await cdp.evaluate(
    `document.querySelector('dialog.preview[open] [data-preview-close]').click()`,
  );
  await sleep(250);
  check(
    await cdp.evaluate(`document.querySelectorAll('dialog.preview[open]').length === 0`),
    "「关闭预览」按钮能关掉抽屉",
  );

  await cdp.evaluate(`document.querySelector('[data-preview]').click()`);
  await sleep(300);
  check(
    await cdp.evaluate(`Boolean(document.querySelector('dialog.preview[open]'))`),
    "第二次打开仍然有效（不是只能开一次）",
  );
  await pressKey("Escape", "Escape", 27);
  await sleep(300);
  check(
    await cdp.evaluate(`document.querySelectorAll('dialog.preview[open]').length === 0`),
    "Esc 能关掉抽屉（原生行为）",
  );

  await cdp.evaluate(`document.querySelector('[data-preview]').click()`);
  await sleep(300);
  // 先做个命中测试：确认那个点真的落在抽屉外面（落在遮罩上）。
  // 命中测试的结果直接进断言消息，失败时不用猜。
  const backdropProbe = await cdp.evaluate(`(() => {
  const dialog = document.querySelector('dialog.preview[open]');
  const rect = dialog.getBoundingClientRect();
  const x = Math.max(4, Math.round(rect.left - 20));
  const y = Math.round(rect.top + rect.height / 2);
  const hit = document.elementFromPoint(x, y);
  return {
    x, y,
    rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)].join(','),
    viewport: window.innerWidth + 'x' + window.innerHeight,
    hitTag: hit ? hit.tagName : null,
    hitIsDialog: hit === dialog,
  };
})()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: backdropProbe.x,
      y: backdropProbe.y,
      button: "left",
      clickCount: 1,
    });
  }
  await sleep(300);
  check(
    await cdp.evaluate(`document.querySelectorAll('dialog.preview[open]').length === 0`),
    "点抽屉外面（背景遮罩）也能关掉（原生 <dialog> 并不会因为点背景而关）",
    `点击点 (${backdropProbe.x}, ${backdropProbe.y})，抽屉 rect=${backdropProbe.rect}，` +
      `视口 ${backdropProbe.viewport}，命中 ${backdropProbe.hitTag}（是抽屉本身：${backdropProbe.hitIsDialog}）`,
  );

  /* -------------------------- 卡片触感：按下与柔光（纯 CSS，不产生布局抖动） */

  console.log("\u001b[1m卡片触感（按下 / 柔光）\u001b[0m");

  /** 取所有 box-shadow 图层的模糊半径。Chrome 的计算值把颜色放在最前面，
      而 rgba(...) 里含有逗号 —— 所以颜色部分要整体匹配，不能按逗号切。 */
  const shadowBlurs = (shadow) =>
    [...shadow.matchAll(/(?:rgba?\([^)]*\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map(
      (match) => Number(match[3]),
    );

  /**
   * 设好主题 → 移到卡片上（触发 :hover）→ 按下不放，量三组值：
   * 计算样式、**布局盒**、以及"后面的兄弟有没有被挤走"。
   * transform 会改变 getBoundingClientRect（它包含变换），所以"没有布局抖动"
   * 不能拿 rect 比 —— 要比 offsetWidth/Height 与兄弟的位置。
   */
  async function pressCard(theme) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await sleep(400);
    // 必须用 behavior:'instant' 并当场做命中测试：站点在 html 上设了
    // `scroll-behavior: smooth`，所以 scrollIntoView 是一段 300ms+ 的动画 ——
    // 在动画途中量坐标、再派发鼠标事件，指针会落到**另一张卡片**上
    // （实测命中 LI、而 .entry-card 的 :hover 为 false，看着像"CSS 伪类没生效"，
    //   其实是我们的指针站错了地方）。
    const point = await cdp.evaluate(`(() => {
    const card = document.querySelector('.entry-card');
    const top =
      card.getBoundingClientRect().top +
      window.scrollY -
      Math.max(0, (window.innerHeight - card.offsetHeight) / 2);
    window.scrollTo({ top, behavior: 'instant' });
    const rect = card.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + 30);
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      inViewport: rect.top >= 0 && y <= window.innerHeight,
      onCard: Boolean(hit) && card.contains(hit),
    };
  })()`);
    check(
      point.inViewport && point.onCard,
      `卡片滚进视口且指针真的落在它上面（x=${point.x} y=${point.y}）`,
    );
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await sleep(250);
    const hover = await cdp.evaluate(
      `getComputedStyle(document.querySelector('.entry-card')).boxShadow`,
    );
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await sleep(350);
    const pressed = await cdp.evaluate(`(() => {
    const card = document.querySelector('.entry-card');
    const next = card.parentElement.nextElementSibling;
    const style = getComputedStyle(card);
    const hit = document.elementFromPoint(${point.x}, ${point.y});
    return {
      transform: style.transform,
      shadow: style.boxShadow,
      hovered: card.matches(':hover'),
      active: card.matches(':active'),
      hitTag: hit ? hit.tagName + '.' + String(hit.className || '') : null,
      layoutWidth: card.offsetWidth,
      layoutHeight: card.offsetHeight,
      nextTop: next ? Math.round(next.getBoundingClientRect().top) : null,
      docHeight: document.documentElement.scrollHeight,
    };
  })()`);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    // 把指针移开，避免残留的 :hover 影响后面的阶段
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    await sleep(300);
    const rest = await cdp.evaluate(`(() => {
    const card = document.querySelector('.entry-card');
    const next = card.parentElement.nextElementSibling;
    return {
      layoutWidth: card.offsetWidth,
      layoutHeight: card.offsetHeight,
      nextTop: next ? Math.round(next.getBoundingClientRect().top) : null,
      docHeight: document.documentElement.scrollHeight,
    };
  })()`);
    return { hover, pressed, rest };
  }

  const brutalPress = await pressCard("brutal");
  check(
    isHardShadow(brutalPress.hover),
    `粗野主义下卡片悬停仍是硬阴影（${brutalPress.hover}）`,
  );
  check(
    brutalPress.pressed.transform === "matrix(1, 0, 0, 1, 3, 3)",
    `粗野主义下按下卡片会被"踩"下去 3px（${brutalPress.pressed.transform}）`,
    `:hover=${brutalPress.pressed.hovered} :active=${brutalPress.pressed.active} 命中 ${brutalPress.pressed.hitTag}`,
  );
  check(
    brutalPress.pressed.shadow === "none",
    `粗野主义下按下时阴影被踩平（${brutalPress.pressed.shadow}）`,
  );
  check(
    brutalPress.pressed.layoutWidth === brutalPress.rest.layoutWidth &&
      brutalPress.pressed.layoutHeight === brutalPress.rest.layoutHeight &&
      brutalPress.pressed.nextTop === brutalPress.rest.nextTop &&
      brutalPress.pressed.docHeight === brutalPress.rest.docHeight,
    `按下只动 transform，布局没变（盒 ${brutalPress.pressed.layoutWidth}×${brutalPress.pressed.layoutHeight}，` +
      `后一张卡 top ${brutalPress.pressed.nextTop}，文档高 ${brutalPress.pressed.docHeight}）`,
  );

  /* 三套暗色主题（灰烬 / 午夜档案馆 / 霓虹落日）共用同一套"边缘柔光"触感，
     颜色由各自的 --c-glow 决定 —— 所以这里逐套量模糊半径，而不是只量灰烬那一套。 */
  for (const theme of ["dark", "archive", "sunset"]) {
    const press = await pressCard(theme);
    check(
      shadowBlurs(press.pressed.shadow).some((blur) => blur > 0),
      `${theme} 下按下时卡片边缘透出一圈柔光（${press.pressed.shadow}）`,
    );
    check(
      press.pressed.layoutWidth === press.rest.layoutWidth &&
        press.pressed.nextTop === press.rest.nextTop &&
        press.pressed.docHeight === press.rest.docHeight,
      `${theme} 的柔光同样不改变布局`,
    );
  }
  check(
    shadowBlurs(brutalPress.pressed.shadow).length === 0,
    "粗野主义按下时完全没有模糊（与暗色的柔光形成对照）",
  );

  // 复位，后面的阶段从干净状态开始
  await cdp.evaluate(
    `localStorage.removeItem('grimoire-theme'); document.documentElement.dataset.theme='brutal';`,
  );

  /* ------------------------- 动效契约：进场动画必须收敛到可见终态 */

  console.log("\u001b[1m动效契约（滚动进场）\u001b[0m");
  await navigate(`${BASE}/`);
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
  check(
    revealed.count >= 3,
    `首页有 ${revealed.count} 个 .reveal 元素（检查不能是空集）`,
  );
  check(
    revealed.stuck.length === 0,
    "每个 .reveal 都收敛到可见终态（transform 归位、完全不透明）",
    revealed.stuck.slice(0, 3).join("\n      "),
  );

  /* ------------------------- reduced motion：动效整体让位，内容照旧可读 */

  console.log("\u001b[1mprefers-reduced-motion: reduce\u001b[0m");
  await cdp.send("Emulation.setEmulatedMedia", {
    media: "",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  for (const route of ROUTES) {
    await navigate(`${BASE}${route.path}`);
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
    if (route.path === "/") {
      check(
        state.count >= 3,
        `reduce 下首页仍有 ${state.count} 个 .reveal 元素（说明检查不是空集）`,
      );
    }
  }

  // reduce 不只影响 CSS 动效，也影响主题切换：切肤那一下的交叉淡出必须让位，
  // 但"换成哪套主题、并记住它"半分不能少。这里就把这件事测出来。
  await navigate(`${BASE}/`);
  await sleep(250);
  await cdp.evaluate(`localStorage.removeItem('grimoire-theme')`);
  const reduceBefore = await readThemeState();
  const reduceAfter = await selectTheme(THEMES[1]);
  const reduceOverflow = await cdp.evaluate(
    `document.documentElement.scrollWidth > window.innerWidth + 1`,
  );
  check(
    reduceAfter.theme === THEMES[1] &&
      reduceAfter.theme !== reduceBefore.theme &&
      reduceAfter.source === "manual" &&
      reduceAfter.stored === THEMES[1],
    `reduce 下主题切换照常生效并记住选择（${reduceBefore.theme} → ${reduceAfter.theme} / ${reduceAfter.source}）`,
  );
  check(!reduceOverflow, "reduce 下切换主题不会撑出横向滚动");
  await cdp.evaluate(`localStorage.removeItem('grimoire-theme')`);

  // 收尾：撤掉媒体模拟
  await cdp.send("Emulation.setEmulatedMedia", { media: "", features: [] });

  /* ---------------------- 新粗野主义：给人复核的预览截图 ---------------------- */

  // 这一节不做断言，只产出人眼复核用的图。放在最后是因为它要先把所有 .reveal
  // 滚进视口让进场动画收敛，再逐段截图 —— 否则截到的是动到一半的卡片，
  // 拿去做设计复核会误导。做法与上面的「动效契约」一致。
  console.log("\u001b[1m新粗野主义主题：预览截图\u001b[0m");

  await navigate(`${BASE}/`);
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
    ["home-brutal-1.png", `window.scrollTo(0, 0)`],
    [
      "home-brutal-2.png",
      `(() => { const el = document.getElementById('entries'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); })()`,
    ],
    [
      "home-brutal-3.png",
      `(() => { const el = document.querySelector('[aria-label="图版"]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); })()`,
    ],
    ["home-brutal-4.png", `window.scrollTo(0, document.body.scrollHeight)`],
  ];
  for (const [file, expression] of previews) await captureAt(file, expression);

  // 窄屏再来一张：硬阴影在 390px 下的表现是这次改动最需要人眼确认的地方
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(250);
  await captureAt("home-brutal-mobile.png", `window.scrollTo(0, 0)`);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 另外两个页型各一张：条目页有详情头部与水印，关于页有卡片网格与正文排版
  for (const route of [
    { path: "/about/", name: "about" },
    { path: "/projects/notes-of-ashen/", name: "notes-of-ashen" },
  ]) {
    await navigate(`${BASE}${route.path}`);
    await sleep(300);
    await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
    await captureAt(
      `${route.name}-brutal-preview.png`,
      `window.scrollTo(0, 0)`,
    );
  }

  /* ------------- 禁用脚本时：默认主题照样成立（这正是把默认写在 HTML 上的理由） ------------- */

  console.log("\u001b[1m禁用脚本时的默认主题\u001b[0m");
  await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate(`${BASE}/`);
  await sleep(500);

  const noJs = await cdp.evaluate(`(() => {
  const toggle = document.getElementById('theme-toggle');
  const card = document.querySelector('.entry-card');
  const bars = [...document.querySelectorAll('.tagbar__tag')];
  return {
    theme: document.documentElement.dataset.theme ?? null,
    source: document.documentElement.dataset.themeSource ?? null,
    bg: getComputedStyle(document.body).backgroundColor,
    toggleRadius: toggle ? getComputedStyle(toggle).borderRadius : null,
    cardShadow: card ? getComputedStyle(card).boxShadow : null,
    barHidden: document.getElementById('tagbar')?.hasAttribute('hidden') ?? null,
    // 注意用 checkVisibility() 而不是读按钮自己的 display ——
    // display:none 的祖先不会改变子元素的计算 display（读出来仍是 inline-flex），
    // 那样写会得到"5 个按钮都可见"的假结论。
    tagButtonsVisible: bars.filter((button) => button.checkVisibility()).length,
    tagSlots: bars.length,
  };
})()`);
  await cdp.screenshot(path.join(SHOTS, "home-nojs.png"));

  // source 必须是 null：那说明 data-theme 是服务端渲染的，不是脚本写的
  check(
    noJs.theme === DEFAULT_THEME && noJs.source === null,
    `禁用脚本时 <html> 上仍是服务端渲染的默认主题（data-theme=${noJs.theme}，来源 ${noJs.source}）`,
  );
  check(
    noJs.bg === "rgb(255, 253, 244)",
    `禁用脚本时画布是粗野主义的纸白（${noJs.bg}）`,
  );
  // 这一条才是把默认写进 HTML 的真正理由：形状覆盖是按 [data-theme='brutal'] 选的，
  // 所以属性必须在 HTML 里 —— 只把 token 放进 :root 的话，无 JS 时会得到
  // "粗野主义的颜色 + 上一套的圆角与柔光" 这种没人设计过的半成品。
  check(
    noJs.toggleRadius === "0px" && isHardShadow(noJs.cardShadow),
    `禁用脚本时形状也是粗野主义（圆角 ${noJs.toggleRadius}，卡片阴影 ${noJs.cardShadow}）`,
  );
  // 渐进增强的方向必须是"少了功能"而不是"多了一堆坏掉的东西"：
  // 过滤条在服务端渲染时就带 hidden，所以无 JS 时它整条不出现。
  // 先断言这些按钮真的存在（否则"都不可见"是空集上的假通过），再断言它们被藏住。
  check(
    noJs.tagSlots >= 2,
    `禁用脚本时过滤条仍渲染出 ${noJs.tagSlots} 个标签按钮（下面那条不是空集断言）`,
  );
  check(
    noJs.barHidden === true && noJs.tagButtonsVisible === 0,
    `禁用脚本时过滤条保持隐藏（hidden=${noJs.barHidden}，可见按钮 ${noJs.tagButtonsVisible} 个）`,
  );

  await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });

  /* Full responsive/theme matrix, real keyboard actions, and storage failure contracts. */
  for (const route of ROUTES) {
    await navigate(`${BASE}${route.path}`);
    for (const width of [320, 390, 768, 1280, 1440]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      for (const theme of THEMES) {
        await cdp.evaluate(
          `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
        );
        await sleep(350);
        const layout = await cdp.evaluate(`(() => {
        const header=document.querySelector('.site-header');
        const nav=[...document.querySelectorAll('.site-nav a')].filter(e=>e.getClientRects().length);
        return { overflow:document.documentElement.scrollWidth>innerWidth+1,
          wrapped:nav.filter(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length>1;}).map(e=>e.textContent.trim()),
          navCount:nav.length, headerHeight:header.getBoundingClientRect().height,
          smallImages:[...document.querySelectorAll('.plate-figure img')].filter(e=>e.getBoundingClientRect().width>Number(e.getAttribute('width'))+1).length };
      })()`);
        check(
          !layout.overflow &&
            layout.navCount >= 2 &&
            !layout.wrapped.length &&
            !layout.smallImages,
          `${route.path} ${width}px ${theme}: 导航完整、无溢出、图版不放大`,
          JSON.stringify(layout),
        );
        const contrast = await cdp.evaluate(
          `(${componentContrast.toString()})()`,
        );
        check(
          contrast.count > 0 && !contrast.problems.length,
          `${route.path} ${width}px ${theme}: 组件真实背景对比度`,
          contrast.problems.join("; "),
        );
      }
    }
    if (route.path.startsWith("/projects/")) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await cdp.evaluate(
        `document.querySelector('.mobile-toc summary').focus()`,
      );
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
        unmodifiedText: "\r",
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await sleep(150);
      check(
        await cdp.evaluate(`document.querySelector('.mobile-toc').open`),
        `${route.path} 键盘展开目录`,
      );
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Tab",
        code: "Tab",
        windowsVirtualKeyCode: 9,
      });
      check(
        await cdp.evaluate(`document.activeElement.matches('.mobile-toc a')`),
        `${route.path} Tab 可到达目录链接`,
      );
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });

      await sleep(600);
      check(
        await cdp.evaluate(
          `document.getElementById('highlights').getBoundingClientRect().top >= document.querySelector('.site-header').getBoundingClientRect().bottom`,
        ),
        `${route.path} 目录锚点不被页头遮挡`,
      );
    }
  }
  await navigate(`${BASE}/projects/ruiqiang-website/`);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.evaluate(
    `document.querySelector('.mobile-toc summary').scrollIntoView({block:'center',behavior:'instant'});document.querySelector('.mobile-toc summary').focus()`,
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    text: "\r",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await sleep(150);
  await cdp.screenshot(path.join(SHOTS, "mobile-directory.png"));
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.evaluate(
    `(async () => {
      const image = document.querySelector('img[src$="mobile-home.webp"]');
      image.scrollIntoView({block:'center',behavior:'instant'});
      await image.decode();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`,
  );
  await cdp.screenshot(path.join(SHOTS, "intrinsic-image.png"));
  await navigate(`${BASE}/`);
  await cdp.evaluate(
    `document.querySelector('.rail').focus();document.querySelector('.rail').scrollLeft=0`,
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(500);
  check(
    await cdp.evaluate(`document.querySelector('.rail').scrollLeft>0`),
    "图版走廊支持键盘横向滚动",
  );
  await cdp.evaluate(`localStorage.setItem('grimoire-theme','invalid')`);
  await navigate(`${BASE}/`);
  check(
    await cdp.evaluate(
      `document.documentElement.dataset.theme==='brutal' && document.documentElement.dataset.themeSource==='default'`,
    ),
    "非法存储主题回到默认",
  );
  const denied = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError')}})`,
  });
  await navigate(`${BASE}/`);
  check(
    await cdp.evaluate(
      `document.documentElement.dataset.theme==='brutal' && document.documentElement.dataset.themeSource==='default'`,
    ),
    "存储不可用时引导正常",
  );
  const temporary = await selectTheme("light");
  check(
    temporary.theme === "light" && temporary.stored === null,
    "存储不可用时仍可切换主题",
  );
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: denied.identifier,
  });

  await writeFile(
    path.join(SHOTS, "report.json"),
    JSON.stringify({ base: BASE, routes: report }, null, 2),
    "utf8",
  );

  check(
    allIssues.length === 0,
    "所有验收阶段无网络/CSP/控制台错误",
    allIssues.join("\n"),
  );
  console.log(`\n截图与报告：${path.relative(ROOT, SHOTS)}`);

  if (problems.length > 0) {
    console.log(`\n\u001b[31m\u001b[1m${problems.length} 项未通过\u001b[0m`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
  }

  if (!problems.length) console.log("浏览器级验收全部通过。");
} catch (error) {
  fail(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await mkdir(SHOTS, { recursive: true });
  await writeFile(
    path.join(SHOTS, "result.json"),
    JSON.stringify({ base: BASE, problems, report }, null, 2),
  );
  cdp?.close();
  if (child) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await Promise.race([exited, sleep(3000)]);
  }
  if (
    profile &&
    path.dirname(profile) === tmpdir() &&
    path.basename(profile).startsWith("grimoire-verify-")
  )
    await rm(profile, { recursive: true, force: true }).catch((error) =>
      console.warn("临时目录清理失败:", error.message),
    );
}

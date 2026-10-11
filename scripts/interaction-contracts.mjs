import path from "node:path";

/** Real input regressions; fixture setup may select a theme, assertions never repair the DOM. */
export async function verifyInteractionContracts({ cdp, check, navigate, base, themes, routes, shots }) {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));
  async function key(key, code, windowsVirtualKeyCode) {
    for (const type of ["keyDown", "keyUp"]) {
      await cdp.send("Input.dispatchKeyEvent", {
        type, key, code, windowsVirtualKeyCode,
        ...(type === "keyDown" && key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
      });
    }
  }
  async function click(selector) {
    const locate = () => cdp.evaluate(`(() => {
      const el=document.querySelector(${JSON.stringify(selector)});
      const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
      return {x,y,hit:x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y))};
    })()`);
    // Snapshot capture can outlast the fixed 400ms settle window. Wait for a real
    // hit instead of clicking the view-transition overlay; never repair the DOM.
    let point = await locate();
    for (let attempt = 0; !point.hit && attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      point = await locate();
    }
    check(point.hit, `真实点击目标可命中：${selector}`, JSON.stringify(point));
    if (!point.hit) return;
    for (const type of ["mousePressed", "mouseReleased"])
      await cdp.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
    await settle();
  }
  const state = () => cdp.evaluate(`({
    theme:document.documentElement.dataset.theme,
    stored:localStorage.getItem('grimoire-theme'),
    open:document.getElementById('theme-menu').open,
    focused:document.activeElement?.id,
    pressed:[...document.querySelectorAll('[data-theme-opt][aria-pressed="true"]')].map(e=>e.dataset.themeOpt)
  })`);
  const focusedOption = () => cdp.evaluate(`document.activeElement?.getAttribute('data-theme-opt')`);
  const last = themes.at(-1);
  const lastSelector = `[data-theme-opt="${last}"]`;

  await navigate(`${base}/`);
  await cdp.evaluate(`window.scrollTo({top:0,behavior:'instant'});document.getElementById('theme-toggle').focus()`);
  await key("Enter", "Enter", 13);
  await key("Tab", "Tab", 9);
  check(await focusedOption() === themes[0], "回归：键盘先进入主题选项");
  await key("Enter", "Enter", 13);
  await settle();
  const selected = await state();
  check(!selected.open && selected.focused === "theme-toggle", "回归：Enter 选择后焦点回到主题触发器", JSON.stringify(selected));

  await click("#theme-toggle");
  await key("Tab", "Tab", 9);
  check(await focusedOption() === themes[0], "回归：Esc 前焦点位于面板内部");
  await key("Escape", "Escape", 27);
  await settle();
  const escaped = await state();
  check(!escaped.open && escaped.focused === "theme-toggle", "回归：Esc 关闭后焦点回到主题触发器", JSON.stringify(escaped));

  // An outside control with its own action must retain focus and execute that action.
  await click("#theme-toggle");
  await cdp.evaluate(`document.querySelector('[data-tag]').scrollIntoView({block:'center',behavior:'instant'})`);
  await click("[data-tag]");
  const outside = await cdp.evaluate(`({open:document.getElementById('theme-menu').open,
    focused:document.activeElement?.hasAttribute('data-tag'),pressed:document.activeElement?.getAttribute('aria-pressed')})`);
  check(!outside.open && outside.focused && outside.pressed === "true", "回归：点击面板外控件关闭菜单、保留焦点并执行筛选", JSON.stringify(outside));

  for (const [width, height] of [[667, 375], [568, 320]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    for (const theme of themes) {
      await navigate(`${base}/`);
      await cdp.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};window.scrollTo({top:0,behavior:'instant'})`);
      await click("#theme-toggle");
      const label = `回归：${width}×${height} ${theme}`;
      const bounds = await cdp.evaluate(`(() => {
        const p=document.querySelector('.theme-menu__panel'), r=p.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollable:p.scrollHeight>p.clientHeight,overflow:getComputedStyle(p).overflowY};
      })()`);
      check(bounds.top >= 0 && bounds.bottom <= height && bounds.left >= 0 && bounds.right <= width,
        `${label} 展开面板不越出视口`, JSON.stringify(bounds));
      check(/auto|scroll/.test(bounds.overflow), `${label} 长菜单可内部滚动`, JSON.stringify(bounds));
      if (theme === themes[0]) await cdp.screenshot(path.join(shots, `theme-${width}x${height}-open.png`));

      // Wheel input, not scrollTop assignment or an out-of-viewport element.click().
      // 主题只有三套时面板在窄屏也放得下、本来就不该滚动；只有内容真的溢出
      // （scrollable）时才要求滚轮滚得动 —— 面板仍然必须是可滚容器。
      if (bounds.scrollable) {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseWheel", x: (bounds.left + bounds.right) / 2,
          y: Math.min(bounds.bottom - 5, height - 5), deltaX: 0, deltaY: 800,
        });
        await settle();
        const scrolled = await cdp.evaluate(`document.querySelector('.theme-menu__panel').scrollTop`);
        check(scrolled > 0, `${label} 滚轮实际滚动菜单`, String(scrolled));
      }
      await click(lastSelector);
      const clicked = await state();
      check(!clicked.open && clicked.theme === last && clicked.stored === last && clicked.pressed.length === 1 && clicked.pressed[0] === last,
        `${label} 滚动后能点击末项并记住选择`, JSON.stringify(clicked));

      // Start afresh so wheel scrolling cannot make the keyboard check pass accidentally.
      await navigate(`${base}/`);
      await cdp.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.getElementById('theme-toggle').focus()`);
      await key("Enter", "Enter", 13);
      for (let i = 0; i < themes.length; i++) await key("Tab", "Tab", 9);
      await settle();
      const keyboard = await cdp.evaluate(`(() => {
        const p=document.querySelector('.theme-menu__panel'), e=document.activeElement;
        const r=e.getBoundingClientRect(), pr=p.getBoundingClientRect();
        return {theme:e.getAttribute('data-theme-opt'),scroll:p.scrollTop,scrollable:p.scrollHeight>p.clientHeight,visible:r.top>=pr.top&&r.bottom<=pr.bottom&&r.top>=0&&r.bottom<=innerHeight};
      })()`);
      check(keyboard.theme === last && (!keyboard.scrollable || keyboard.scroll > 0) && keyboard.visible,
        `${label} Tab 移到末项并完整显示（必要时自动滚动）`, JSON.stringify(keyboard));
      if (theme === themes[0]) await cdp.screenshot(path.join(shots, `theme-${width}x${height}-last.png`));
      await key("Enter", "Enter", 13);
      await settle();
      const entered = await state();
      check(!entered.open && entered.theme === last && entered.stored === last && entered.focused === "theme-toggle",
        `${label} 键盘选择末项并归还焦点`, JSON.stringify(entered));
    }
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // Verify nonempty controls before checking their no-JS visibility on every route.
  for (const route of routes) {
    await navigate(`${base}${route.path}`);
    const enabled = await cdp.evaluate(`({trigger:document.getElementById('theme-toggle').checkVisibility(),
      previews:[...document.querySelectorAll('[data-preview]')].map(e=>e.checkVisibility()),
      zooms:[...document.querySelectorAll('[data-zoom]')].map(e=>({visible:e.checkVisibility(),href:e.getAttribute('href'),src:e.querySelector('img')?.getAttribute('src')}))})`);
    check(enabled.trigger && enabled.previews.every(Boolean) && (route.path !== "/" || enabled.previews.length > 0),
      `回归：${route.path} 脚本启用后控件真实可见`, JSON.stringify(enabled));
    // 图版触发器不是"脚本启用后才出现"的控件：它就是个指向原图的链接，
    // href 必须与缩略图同源 —— 这就是没有 JS 时的回退路径。
    check(enabled.zooms.every((zoom) => zoom.visible && zoom.href === zoom.src),
      `回归：${route.path} 图版入口在脚本启用后可见且指向同一张原图`, JSON.stringify(enabled.zooms));
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    try {
      await navigate(`${base}${route.path}`);
      const disabled = await cdp.evaluate(`({
        theme:document.documentElement.dataset.theme,source:document.documentElement.dataset.themeSource??null,
        menuHidden:document.getElementById('theme-menu').hidden,
        triggerVisible:document.getElementById('theme-toggle').checkVisibility(),
        previews:[...document.querySelectorAll('[data-preview]')].map(e=>({hidden:e.hidden,visible:e.checkVisibility()})),
        zooms:[...document.querySelectorAll('[data-zoom]')].map(e=>({visible:e.checkVisibility(),href:e.getAttribute('href'),src:e.querySelector('img')?.getAttribute('src')})),
        viewerOpen:document.getElementById('plate-viewer')?.open??null,
        heading:!!document.querySelector('h1')?.textContent.trim(),
        links:[...document.querySelectorAll('.entry-card a.btn-primary')].map(e=>({visible:e.checkVisibility(),href:e.getAttribute('href')}))
      })`);
      check(disabled.menuHidden && !disabled.triggerVisible && disabled.previews.length === enabled.previews.length && disabled.previews.every(e=>e.hidden&&!e.visible),
        `回归：${route.path} 禁用脚本时主题与预览控件存在但隐藏`, JSON.stringify(disabled));
      // 少了脚本，图版仍然是"能点开的"（跳到原图），只是没有那个浮悬窗；
      // 没有图版的页面连浮悬窗都不渲染，所以这里只要求它"没有自己开着"。
      check(disabled.zooms.length === enabled.zooms.length &&
        disabled.zooms.every((zoom) => zoom.visible && zoom.href === zoom.src) &&
        disabled.viewerOpen !== true,
        `回归：${route.path} 无 JS 时图版入口仍可用、浮悬窗不开`, JSON.stringify({ zooms: disabled.zooms.length, viewerOpen: disabled.viewerOpen }));
      check(disabled.theme === themes[0] && disabled.source === null && disabled.heading && (route.path !== "/" ||
        (disabled.links.length === enabled.previews.length && disabled.links.every(e=>e.visible&&e.href.startsWith('/projects/')))),
        `回归：${route.path} 无 JS 默认主题、正文和详情入口保留`, JSON.stringify(disabled));
      if (route.path === "/") await cdp.screenshot(path.join(shots, "regression-nojs.png"));
    } finally {
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    }
  }
  await navigate(`${base}/`);
  await verifyZoomLinks({ cdp, check, navigate, base, shots });
}

/** Exercise native link defaults with real input, including newly opened tabs. */
export async function verifyZoomLinks({ cdp, check, navigate, base, shots }) {
  const storageKey = "grimoire-verify-link";
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: path.join(shots, "link-downloads") });
  try {
    for (const activation of [
      { label: "普通左键", button: "left", modifiers: 0, modal: true },
      { label: "Ctrl 点击", button: "left", modifiers: 2, newTab: true },
      { label: "Meta 点击", button: "left", modifiers: 4, newTab: true },
      { label: "Shift 点击", button: "left", modifiers: 8, newTab: true },
      { label: "Alt 点击", button: "left", modifiers: 1 },
      { label: "中键", button: "middle", modifiers: 0, newTab: true },
    ]) {
      await navigate(`${base}/`);
      await cdp.evaluate(`document.activeViewTransition?.finished`);
      await new Promise(resolve => setTimeout(resolve, 400));
      const before = new Set((await cdp.send("Target.getTargets")).targetInfos.map(t => t.targetId));
      const point = await cdp.evaluate(`(() => {
        const a=document.querySelector('[data-zoom]');
        // Non-Mac Meta has no native new-tab meaning. Use a target fixture so
        // real Meta input still opens the same image URL, without navigating
        // this document into Chromium's generated image-viewer document (whose
        // internal view-transition promise rejects when opt-in disappears).
        if (${activation.modifiers}===4 && !/Mac/.test(navigator.platform)) a.target='_blank';
        a.scrollIntoView({block:'center',behavior:'instant'});
        localStorage.removeItem('${storageKey}');
        document.addEventListener('${activation.button === 'middle' ? 'auxclick' : 'click'}', event => {
          if (!event.target.closest('[data-zoom]')) return;
          // Persist before the default navigation; no test listener cancels it.
          localStorage.setItem('${storageKey}',JSON.stringify({
            prevented:event.defaultPrevented,modal:document.getElementById('plate-viewer').open,
            button:event.button,ctrl:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey,alt:event.altKey,
          }));
        },{once:true});
        const r=a.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        return {x,y,href:a.href,hit:a.contains(document.elementFromPoint(x,y))};
      })()`);
      check(point.hit, `${activation.label} 原图入口可命中`, JSON.stringify(point));
      if (!point.hit) continue;
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y,
          button: activation.button, modifiers: activation.modifiers, clickCount: 1 });
      await new Promise(resolve => setTimeout(resolve, 300));
      const state = await cdp.evaluate(`JSON.parse(localStorage.getItem('${storageKey}'))`);
      check(state && state.prevented === Boolean(activation.modal) && state.modal === Boolean(activation.modal) &&
        state.button === (activation.button === "middle" ? 1 : 0) &&
        state.ctrl === Boolean(activation.modifiers & 2) && state.meta === Boolean(activation.modifiers & 4) &&
        state.shift === Boolean(activation.modifiers & 8) && state.alt === Boolean(activation.modifiers & 1),
        `${activation.label} ${activation.modal ? '打开原生模态' : '保留浏览器默认行为、不开模态'}`, JSON.stringify(state));
      let added = [];
      for (let attempt = 0; attempt < (activation.newTab ? 20 : 1); attempt++) {
        added = (await cdp.send("Target.getTargets")).targetInfos.filter(t => !before.has(t.targetId));
        if (added.some(t => t.type === "page" && t.url === point.href)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (activation.newTab)
        check(added.some(t => t.type === "page" && t.url === point.href),
          `${activation.label} 浏览器实际在新页面打开原图`, JSON.stringify(added.map(t => t.url)));
      for (const target of added.filter(t => t.type === "page" && t.url === point.href))
        await cdp.send("Target.closeTarget", { targetId: target.targetId });
    }
    await navigate(`${base}/`);
    await cdp.evaluate(`localStorage.removeItem('${storageKey}');document.querySelector('[data-tag="vue"]').click()`);
    const vue = await cdp.evaluate(`[...document.querySelectorAll('.entry-card')].filter(c=>!c.closest('[data-tags]').hidden).map(c=>c.querySelector('h2').textContent.trim())`);
    check(vue.length === 2 && !vue.includes("Notes of Ashen"), "Vue 筛选只包含实际使用 Vue 的两条项目", JSON.stringify(vue));
    await cdp.evaluate(`document.querySelector('[data-tag-clear]').click();document.querySelector('[data-tag="typescript"]').click()`);
    const typescript = await cdp.evaluate(`({titles:[...document.querySelectorAll('.entry-card')].filter(c=>!c.closest('[data-tags]').hidden).map(c=>c.querySelector('h2').textContent.trim()),count:document.querySelector('[data-tag="typescript"] .tagbar__n').textContent.trim()})`);
    check(typescript.titles.length === 3 && typescript.titles.includes("Notes of Ashen") && typescript.count === "3",
      "TypeScript 筛选包含 Notes of Ashen，计数同步为三条", JSON.stringify(typescript));
  } finally {
    await cdp.send("Browser.setDownloadBehavior", { behavior: "default" });
    await navigate(`${base}/`);
  }
}

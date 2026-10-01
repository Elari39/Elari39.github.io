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
      check(bounds.scrollable && /auto|scroll/.test(bounds.overflow), `${label} 长菜单可内部滚动`, JSON.stringify(bounds));
      if (theme === themes[0]) await cdp.screenshot(path.join(shots, `theme-${width}x${height}-open.png`));

      // Wheel input, not scrollTop assignment or an out-of-viewport element.click().
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: (bounds.left + bounds.right) / 2,
        y: Math.min(bounds.bottom - 5, height - 5), deltaX: 0, deltaY: 800,
      });
      await settle();
      const scrolled = await cdp.evaluate(`document.querySelector('.theme-menu__panel').scrollTop`);
      check(scrolled > 0, `${label} 滚轮实际滚动菜单`, String(scrolled));
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
        return {theme:e.getAttribute('data-theme-opt'),scroll:p.scrollTop,visible:r.top>=pr.top&&r.bottom<=pr.bottom&&r.top>=0&&r.bottom<=innerHeight};
      })()`);
      check(keyboard.theme === last && keyboard.scroll > 0 && keyboard.visible,
        `${label} Tab 自动滚动并完整显示末项`, JSON.stringify(keyboard));
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
      previews:[...document.querySelectorAll('[data-preview]')].map(e=>e.checkVisibility())})`);
    check(enabled.trigger && enabled.previews.every(Boolean) && (route.path !== "/" || enabled.previews.length > 0),
      `回归：${route.path} 脚本启用后控件真实可见`, JSON.stringify(enabled));
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    try {
      await navigate(`${base}${route.path}`);
      const disabled = await cdp.evaluate(`({
        theme:document.documentElement.dataset.theme,source:document.documentElement.dataset.themeSource??null,
        menuHidden:document.getElementById('theme-menu').hidden,
        triggerVisible:document.getElementById('theme-toggle').checkVisibility(),
        previews:[...document.querySelectorAll('[data-preview]')].map(e=>({hidden:e.hidden,visible:e.checkVisibility()})),
        heading:!!document.querySelector('h1')?.textContent.trim(),
        links:[...document.querySelectorAll('.entry-card a.btn-primary')].map(e=>({visible:e.checkVisibility(),href:e.getAttribute('href')}))
      })`);
      check(disabled.menuHidden && !disabled.triggerVisible && disabled.previews.length === enabled.previews.length && disabled.previews.every(e=>e.hidden&&!e.visible),
        `回归：${route.path} 禁用脚本时主题与预览控件存在但隐藏`, JSON.stringify(disabled));
      check(disabled.theme === themes[0] && disabled.source === null && disabled.heading && (route.path !== "/" ||
        (disabled.links.length === enabled.previews.length && disabled.links.every(e=>e.visible&&e.href.startsWith('/projects/')))),
        `回归：${route.path} 无 JS 默认主题、正文和详情入口保留`, JSON.stringify(disabled));
      if (route.path === "/") await cdp.screenshot(path.join(shots, "regression-nojs.png"));
    } finally {
      await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    }
  }
  await navigate(`${base}/`);
}

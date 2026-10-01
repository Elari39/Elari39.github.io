import path from "node:path";
import { componentContrast } from "./browser-contracts.mjs";

/** Reading surfaces and modal controls must remain usable after scrolling. */
export async function verifyReadingContracts({ cdp, check, navigate, base, themes, routes, shots }) {
  const settle = () => cdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const viewport = (width, height) => cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await viewport(1440, 900);
  for (const route of routes.filter(route => route.path.startsWith("/projects/"))) {
    await navigate(`${base}${route.path}`);
    await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
    await settle();
    const reading = await cdp.evaluate(`(() => {
      const sheet=document.querySelector('.reading-sheet');
      const actions=[...document.querySelectorAll('.reading-back')];
      return {brand:!!document.querySelector('.entry-header [data-brand-mark]')&&!!document.querySelector('footer [data-brand-mark]'),
        oldMark:!!document.querySelector('.rune-corner'),
        back:actions.length===2&&actions.every(a=>a.getAttribute('href')==='/#entries'&&a.getBoundingClientRect().height>=44),
        paper:sheet&&getComputedStyle(sheet).backgroundColor!=='rgba(0, 0, 0, 0)',
        overflow:document.documentElement.scrollWidth>innerWidth+1};
    })()`);
    check(reading.brand && !reading.oldMark, `${route.path} 阅读页与页脚统一新品牌图标`, JSON.stringify(reading));
    check(reading.back && reading.paper && !reading.overflow, `${route.path} 页首/页末返回入口与纯色书页可用`, JSON.stringify(reading));
    if (route.path.includes("notes-of-ashen")) {
      await cdp.screenshot(path.join(shots, "reading-desktop.png"));
      await cdp.evaluate(`window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
      await settle();
      await cdp.screenshot(path.join(shots, "reading-footer.png"));
    }
  }

  for (const [width, height] of [[1440, 900], [390, 844], [568, 320]]) {
    await viewport(width, height);
    await navigate(`${base}/`);
    await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
    const ids = await cdp.evaluate(`[...document.querySelectorAll('[data-preview]')].map(b=>b.dataset.preview)`);
    for (const id of ids) {
      const open = () => cdp.evaluate(`(() => {
        const button=document.querySelector('[data-preview="${id}"]');
        button.scrollIntoView({block:'center',behavior:'instant'});button.focus();button.click();
        return scrollY;
      })()`);
      const scrollBefore = await open();
      await settle();
      check(await cdp.evaluate(`document.getElementById('${id}').scrollTop===0`), `${width}px ${id} 从开头打开`);
      if (id === "preview-ashen-courier" && width !== 568) await cdp.screenshot(path.join(shots, `preview-${width}-start.png`));
      await cdp.evaluate(`document.getElementById('${id}').scrollTop=100000`);
      await settle();
      const controls = await cdp.evaluate(`(() => {
        const d=document.getElementById('${id}'),r=d.getBoundingClientRect();
        const b=d.querySelector('[data-preview-close]'),c=b.getBoundingClientRect();
        const h=d.querySelector('.preview__title').getBoundingClientRect();
        const a=d.querySelector('.preview__read'),f=a.getBoundingClientRect();
        const x=c.x+c.width/2,y=c.y+c.height/2;
        return {x,y,atEnd:Math.abs(d.scrollHeight-d.clientHeight-d.scrollTop)<=1,title:h.top>=r.top&&h.bottom<=r.bottom,
          close:c.top>=r.top&&c.bottom<=r.bottom&&b.contains(document.elementFromPoint(x,y)),
          full:f.top>=r.top&&f.bottom<=r.bottom&&a.getAttribute('href').startsWith('/projects/'),
          inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,
          lock:getComputedStyle(document.documentElement).overflowY==='hidden'};
      })()`);
      check(controls.atEnd && controls.title && controls.close && controls.full && controls.inside && controls.lock,
        `${width}px ${id} 滚到末尾仍可看标题、关闭与阅读全文`, JSON.stringify(controls));
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 4, y: Math.round(height / 2), deltaX: 0, deltaY: 300 });
      await settle();
      check(await cdp.evaluate(`scrollY===${scrollBefore}`), `${width}px ${id} 预览期间背景不滚动`);
      if (id === "preview-ashen-courier") await cdp.screenshot(path.join(shots, `preview-${width}-end.png`));
      if (controls.close) {
        for (const type of ["mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type, x: controls.x, y: controls.y, button: "left", clickCount: 1 });
      }
      await settle();
      check(await cdp.evaluate(`!document.getElementById('${id}').open&&document.activeElement?.dataset.preview==='${id}'&&getComputedStyle(document.documentElement).overflowY!=='hidden'`),
        `${width}px ${id} 顶部关闭按钮可点击并归还焦点、解除滚动锁`);
      await open();
      check(await cdp.evaluate(`document.getElementById('${id}').scrollTop===0`), `${width}px ${id} 重新打开归零`);
      for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await settle();
      check(await cdp.evaluate(`!document.getElementById('${id}').open`), `${width}px ${id} Esc 关闭`);
    }
  }

  await viewport(1440, 900);
  await navigate(`${base}/`);
  await cdp.evaluate(`document.querySelector('[data-preview]').click()`);
  for (const theme of themes) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    // Match the existing theme contract: measure final colors after CSS transitions.
    await new Promise(resolve => setTimeout(resolve, 400));
    const contrast = await cdp.evaluate(`(${componentContrast.toString()})()`);
    check(contrast.count > 0 && contrast.problems.length === 0, `${theme} 预览正文与操作按钮对比度`, contrast.problems.join("; "));
    if (theme === "dark") await cdp.screenshot(path.join(shots, "preview-dark.png"));
  }
  await cdp.evaluate(`document.querySelector('dialog[open]').close()`);
  await viewport(390, 844);
  await navigate(`${base}/projects/notes-of-ashen/`);
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await settle();
  await cdp.screenshot(path.join(shots, "reading-mobile.png"));
  await viewport(1440, 900);
}

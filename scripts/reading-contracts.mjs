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

    /* 进度余烬线：它由滚动时间线驱动，所以只能真滚一遍再读计算值 ——
       "CSS 里写了 animation-timeline"并不等于它真的动了（那正是这条契约的意义）。 */
    const progressAt = () => cdp.evaluate(`(() => {
      const bar=document.querySelector('.reading-progress');
      return bar?getComputedStyle(bar).transform:null;
    })()`);
    const progressTop = await progressAt();
    await cdp.evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
    await settle();
    const progressStart = await progressAt();
    await cdp.evaluate(`window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
    await settle();
    const progressEnd = await progressAt();
    await cdp.evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
    await settle();
    check(
      Boolean(progressTop) && progressTop !== progressEnd,
      `${route.path} 进度线随滚动推进（${progressStart} → ${progressEnd}）`,
      `first=${progressTop}`,
    );
    if (route.path.includes("notes-of-ashen")) {
      await cdp.screenshot(path.join(shots, "reading-desktop.png"));
      await cdp.evaluate(`window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
      await settle();
      await cdp.screenshot(path.join(shots, "reading-footer.png"));
    }
  }

  /* 封面纹样：三种强调色必须真的是三种图案，而不是"三种颜色的同一张封面"。
     读的是 .cover **元素自己**的计算背景图 —— 纹样画在元素上，所以这里断言的是
     "每个封面确实带上了自己那套纹样，且三套互不相同"。只断言"CSS 里写了三行"
     等于什么都没断言：纹样这次就是靠这条查出 `background` 被压成简写后整条失效的。
     卡片数与强调色种类数不相等（四张卡只有三套强调色），所以按**图案去重后**计数。 */
  await navigate(`${base}/`);
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await settle();
  const motifs = await cdp.evaluate(`(() => {
    const covers=[...document.querySelectorAll('.entry-card .cover')];
    const motif=el=>getComputedStyle(el).getPropertyValue('--cover-motif').trim();
    const image=el=>getComputedStyle(el).backgroundImage;
    const gradients=el=>image(el).split('gradient(').length-1;
    return {count:covers.length,
      classes:covers.map(c=>c.className),
      motifs:covers.map(motif),
      gradients:covers.map(gradients),
      images:covers.map(image)};
  })()`);
  const distinct = new Set(motifs.motifs);
  check(
    motifs.count >= 3 &&
      distinct.size >= 3 &&
      [...distinct].every((value) => value.includes('gradient')) &&
      motifs.gradients.every((count) => count >= 1) &&
      new Set(motifs.images).size === distinct.size,
    `首页 ${motifs.count} 张卡片有 ${distinct.size} 种封面纹样，且各自真的画在封面上`,
    JSON.stringify({ classes: motifs.classes, gradients: motifs.gradients }),
  );

  /* 主题图鉴：九套主题各有一格，且每一格的样品块用的确实是**它自己**那套 token
     （读 data-theme 子树的背景，而不是页面当前主题的背景）。 */
  await navigate(`${base}/grimoire/`);
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await settle();
  const atlas = await cdp.evaluate(`(() => {
    const cells=[...document.querySelectorAll('.theme-atlas__cell')];
    const swatches=[...document.querySelectorAll('.theme-atlas__swatch')];
    return {
      cells:cells.length,
      ids:swatches.map(s=>s.getAttribute('data-theme')),
      images:swatches.map(s=>getComputedStyle(s).backgroundImage),
      h1:document.querySelectorAll('h1').length,
      panel:[...document.querySelectorAll('[data-theme-opt]')].length,
    };
  })()`);
  check(
    atlas.cells === themes.length && atlas.ids.length === themes.length && themes.every((id) => atlas.ids.includes(id)),
    `/grimoire/ 图鉴覆盖全部 ${themes.length} 套主题`,
    JSON.stringify(atlas.ids),
  );
  check(
    new Set(atlas.images).size === themes.length && atlas.images.every((image) => image !== 'none'),
    '/grimoire/ 每格样品块读的是各自主题的 token（背景互不相同）',
    JSON.stringify(atlas.images.map((image) => image.slice(0, 40))),
  );
  check(
    atlas.h1 === 1 && atlas.panel === themes.length,
    `/grimoire/ 恰好一个 h1、主题面板的 ${themes.length} 个选项仍在`,
    JSON.stringify({ h1: atlas.h1, panel: atlas.panel }),
  );

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

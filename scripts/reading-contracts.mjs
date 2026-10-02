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

  /* ------------------------------------ 图版浮悬窗：点图就地放大，带关闭与翻页 ----
     浮悬窗自己不存图片（打开那一刻才由被点的缩略图填进去），所以"结构对不对"
     由 scripts/audit-site.mjs 管；这里管行为：装进去的确实是点的那张、翻页真的换图
     与回绕、三条关闭路径都回家、背景不滚动、换主题跟着换皮。
     无 JS 那条回退路径（href 指向同一张原图）在 interaction-contracts.mjs 里验收。 */
  console.log("\u001b[1m图版浮悬窗（<dialog>）\u001b[0m");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const plateRoutes = [
    ...routes.filter((route) => route.path.startsWith("/projects/")).map((route) => route.path),
    "/",
  ];

  const pressKey = async (key, code, windowsVirtualKeyCode) => {
    for (const type of ["keyDown", "keyUp"])
      await cdp.send("Input.dispatchKeyEvent", {
        type, key, code, windowsVirtualKeyCode,
        ...(type === "keyDown" && key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
      });
  };

  /** 聚焦第一张图版再按 Enter —— 与键盘访客走的是同一条路 */
  const openPlateViewer = async () => {
    await cdp.evaluate(`(() => {
      const trigger=document.querySelector('[data-zoom]');
      trigger.scrollIntoView({block:'center',behavior:'instant'});
      trigger.focus();
    })()`);
    await settle();
    await pressKey("Enter", "Enter", 13);
    await sleep(200);
  };

  const viewerState = () => cdp.evaluate(`(() => {
    const dialog=document.getElementById('plate-viewer'),image=dialog.querySelector('img');
    const rect=dialog.getBoundingClientRect();
    return {open:dialog.open,modal:dialog.matches(':modal'),focusInside:dialog.contains(document.activeElement),
      scrollTop:dialog.scrollTop,title:dialog.querySelector('.preview__title').textContent.trim(),
      src:image?image.getAttribute('src'):null,alt:image?image.alt:null,
      loaded:Boolean(image)&&image.complete&&image.naturalWidth>0,
      natural:image?image.naturalWidth:0,
      drawn:image?Math.round(image.getBoundingClientRect().width):0,
      declared:image?Number(image.getAttribute('width')):0,
      counter:document.getElementById('plate-viewer-n').textContent.trim(),
      inside:rect.left>=0&&rect.right<=innerWidth+1&&rect.top>=0&&rect.bottom<=innerHeight+1,
      lock:getComputedStyle(document.documentElement).overflowY==='hidden'};
  })()`);

  for (const [width, height] of [[1440, 900], [390, 844], [568, 320]]) {
    await viewport(width, height);
    for (const routePath of plateRoutes) {
      await navigate(`${base}${routePath}`);
      await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
      await settle();

      const inventory = await cdp.evaluate(`({
        triggers:document.querySelectorAll('[data-zoom]').length,
        viewers:document.querySelectorAll('dialog.plate-viewer').length,
        plates:document.querySelectorAll('img.plate').length})`);
      if (inventory.triggers === 0) {
        // 没有图版的页面也不该凭空多出一个浮悬窗
        check(
          inventory.viewers === 0 && inventory.plates === 0,
          `${width}px ${routePath} 没有图版就没有浮悬窗`,
          JSON.stringify(inventory),
        );
        continue;
      }
      check(
        inventory.viewers === 1 && inventory.triggers === inventory.plates,
        `${width}px ${routePath} 每张图版都有浮悬窗入口（触发器 ${inventory.triggers} / 图版 ${inventory.plates}）`,
        JSON.stringify(inventory),
      );

      const expected = await cdp.evaluate(
        `[...document.querySelectorAll('[data-zoom]')].map(a=>({src:a.getAttribute('href'),alt:a.querySelector('img').alt}))`,
      );

      await openPlateViewer();
      const opened = await viewerState();
      check(
        opened.open && opened.modal && opened.focusInside && opened.scrollTop === 0,
        `${width}px ${routePath} 点图即弹出原生模态、焦点进窗、停在开头`,
        JSON.stringify(opened),
      );
      check(
        opened.src === expected[0].src && opened.title === expected[0].alt && opened.alt === expected[0].alt,
        `${width}px ${routePath} 窗里就是点的那张（${opened.title}）`,
        JSON.stringify({ src: opened.src, title: opened.title }),
      );
      check(
        opened.loaded && opened.drawn > 0 && opened.declared === opened.natural && opened.drawn <= opened.declared + 1,
        `${width}px ${routePath} 原图真的解码、声明尺寸就是原图像素、且只缩不放（${opened.drawn} ≤ ${opened.declared} / natural ${opened.natural}）`,
        JSON.stringify(opened),
      );
      check(
        opened.inside && opened.lock && opened.counter === `1 / ${expected.length}`,
        `${width}px ${routePath} 窗口不出视口、背景锁定、计数 ${opened.counter}`,
        JSON.stringify(opened),
      );
      if (width === 390 && routePath === "/") await cdp.screenshot(path.join(shots, "plate-viewer-390.png"));

      if (width === 1440 && expected.length > 1) {
        // 下一张 / 上一张真的换图，并在两端回绕
        await cdp.evaluate(`document.querySelector('[data-zoom-step="1"]').click()`);
        await settle();
        const next = await viewerState();
        check(
          next.src === expected[1].src && next.title === expected[1].alt && next.counter === `2 / ${expected.length}`,
          `${routePath} 「下一张」换成第二张并更新标题与计数`,
          JSON.stringify({ src: next.src, counter: next.counter }),
        );

        await cdp.evaluate(`document.querySelector('[data-zoom-step="-1"]').click()`);
        await settle();
        const back = await viewerState();
        check(back.src === expected[0].src, `${routePath} 「上一张」回到第一张`, back.src);

        await cdp.evaluate(`document.querySelector('[data-zoom-step="-1"]').click()`);
        await settle();
        const wrapped = await viewerState();
        check(
          wrapped.src === expected[expected.length - 1].src && wrapped.counter === `${expected.length} / ${expected.length}`,
          `${routePath} 从第一张「上一张」回绕到最后一张`,
          JSON.stringify({ src: wrapped.src, counter: wrapped.counter }),
        );

        await pressKey("ArrowRight", "ArrowRight", 39);
        await sleep(200);
        const arrowed = await viewerState();
        check(
          arrowed.src === expected[0].src && arrowed.counter === `1 / ${expected.length}`,
          `${routePath} 右方向键翻页并在末尾回绕（${arrowed.counter}）`,
          JSON.stringify({ src: arrowed.src, counter: arrowed.counter }),
        );
      }

      // 三条关闭路径：关闭按钮、Esc（原生）、点窗外背景（原生缺口，由脚本补）
      const closeProbe = await cdp.evaluate(`(() => {
        const button=document.getElementById('plate-viewer').querySelector('[data-preview-close]');
        const rect=button.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
        return {x,y,hit:button.contains(document.elementFromPoint(x,y))};
      })()`);
      check(closeProbe.hit, `${width}px ${routePath} 关闭按钮在窗口内可命中`, JSON.stringify(closeProbe));
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", { type, x: closeProbe.x, y: closeProbe.y, button: "left", clickCount: 1 });
      await sleep(250);
      check(
        await cdp.evaluate(`!document.getElementById('plate-viewer').open&&document.activeElement?.hasAttribute('data-zoom')`),
        `${width}px ${routePath} 关闭按钮能关，并把焦点还给点的那张图`,
      );

      await openPlateViewer();
      await pressKey("Escape", "Escape", 27);
      await sleep(250);
      check(!(await viewerState()).open, `${width}px ${routePath} Esc 能关掉浮悬窗（原生行为）`);

      await openPlateViewer();
      // 命中测试直接进断言消息：确认那个点真的落在窗外（遮罩上）。
      const backdropProbe = await cdp.evaluate(`(() => {
        const dialog=document.getElementById('plate-viewer'),rect=dialog.getBoundingClientRect();
        const x=Math.max(4,Math.round(rect.left-8)),y=Math.round(rect.top+rect.height/2);
        return {x,y,hitIsDialog:document.elementFromPoint(x,y)===dialog};
      })()`);
      check(backdropProbe.hitIsDialog, `${width}px ${routePath} 窗外那一点确实落在遮罩上`, JSON.stringify(backdropProbe));
      for (const type of ["mousePressed", "mouseReleased"])
        await cdp.send("Input.dispatchMouseEvent", { type, x: backdropProbe.x, y: backdropProbe.y, button: "left", clickCount: 1 });
      await sleep(250);
      check(!(await viewerState()).open, `${width}px ${routePath} 点窗外背景也能关掉`);
    }
  }

  // 换主题跟着换皮：读的是窗口自己的计算值，不是 CSS 里写了什么
  await viewport(1440, 900);
  await navigate(`${base}/`);
  await openPlateViewer();
  const viewerThemeFacts = {};
  for (const theme of ["brutal", "cyber"]) {
    await cdp.evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await sleep(400);
    viewerThemeFacts[theme] = await cdp.evaluate(`(() => {
      const dialog=document.getElementById('plate-viewer'),style=getComputedStyle(dialog);
      return {bg:style.backgroundColor,color:style.color,radius:style.borderRadius,
        backdrop:getComputedStyle(dialog,'::backdrop').backgroundColor};
    })()`);
    if (theme === "brutal") await cdp.screenshot(path.join(shots, "plate-viewer-brutal.png"));
    if (theme === "cyber") await cdp.screenshot(path.join(shots, "plate-viewer-dark.png"));
  }
  check(
    viewerThemeFacts.brutal.bg !== viewerThemeFacts.cyber.bg &&
      viewerThemeFacts.brutal.color !== viewerThemeFacts.cyber.color &&
      viewerThemeFacts.brutal.radius === "0px",
    `浮悬窗的底色 / 文字色 / 方角跟随主题变量（${viewerThemeFacts.brutal.bg} vs ${viewerThemeFacts.cyber.bg}）`,
  );

  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await sleep(300);
  const viewerContrast = await cdp.evaluate(`(${componentContrast.toString()})()`);
  check(
    viewerContrast.count > 0 && viewerContrast.problems.length === 0,
    "浮悬窗里的标题与按钮对比度",
    viewerContrast.problems.join("; "),
  );
  await cdp.evaluate(`document.getElementById('plate-viewer').close()`);

  await viewport(390, 844);
  await navigate(`${base}/projects/notes-of-ashen/`);
  await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
  await settle();
  await cdp.screenshot(path.join(shots, "reading-mobile.png"));
  await viewport(1440, 900);
}

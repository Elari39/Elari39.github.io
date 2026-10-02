/** 使用真实鼠标输入检查链接默认行为和 dialog 的内外边界。 */
export async function verifyModalContracts({ cdp, check, navigate, base }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function click(point, button = 'left', modifiers = 0) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button, modifiers, clickCount: 1 });
    }
    await sleep(150);
  }
  async function locate(selector) {
    const point = await cdp.evaluate(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'center',behavior:'instant'});
      const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      return {x,y,hit:e.contains(document.elementFromPoint(x,y)),href:e.href};
    })()`);
    check(point.hit, `鼠标能命中 ${selector}`, JSON.stringify(point));
    return point;
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [name, button, modifiers] of [['Ctrl', 'left', 2], ['Shift', 'left', 8], ['中键', 'middle', 0]]) {
    await navigate(`${base}/`);
    const point = await locate('[data-zoom]');
    const before = new Set((await cdp.send('Target.getTargets')).targetInfos.map((target) => target.targetId));
    let opened = [];
    try {
      await click(point, button, modifiers);
      for (let attempt = 0; attempt < 20; attempt++) {
        opened = (await cdp.send('Target.getTargets')).targetInfos.filter((target) => target.type === 'page' && !before.has(target.targetId));
        if (opened.some((target) => target.url === point.href)) break;
        await sleep(100);
      }
      check(opened.some((target) => target.url === point.href) &&
        await cdp.evaluate(`!document.getElementById('plate-viewer').open`),
      `${name} 点击图版保留原生新标签页/窗口行为`, JSON.stringify(opened.map((target) => target.url)));
    } finally {
      for (const target of opened) await cdp.send('Target.closeTarget', { targetId: target.targetId });
    }
  }

  // Meta 的原生行为随平台变化，Alt 可能下载。只在站点监听之后记录取消状态，
  // 再由探针阻止导航/下载；不修改站点处理器或弹窗状态。
  for (const [name, modifiers] of [['Meta', 4], ['Alt', 1]]) {
    await navigate(`${base}/`);
    await cdp.evaluate(`window.addEventListener('click', event => {
      window.__modalProbe={prevented:event.defaultPrevented,open:document.getElementById('plate-viewer').open};
      event.preventDefault();
    }, {once:true})`);
    await click(await locate('[data-zoom]'), 'left', modifiers);
    const probe = await cdp.evaluate('window.__modalProbe');
    check(probe && !probe.prevented && !probe.open, `${name} 点击图版未被站点拦截`, JSON.stringify(probe));
  }

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const selector of ['[data-preview]', '[data-zoom]']) {
      await navigate(`${base}/`);
      await cdp.evaluate(`document.documentElement.dataset.theme='brutal'`);
      const opener = await locate(selector);
      await click(opener);
      check(await cdp.evaluate(`!!document.querySelector('dialog:modal')`), `${width}px ${selector} 普通点击打开模态窗口`);
      for (const area of ['border', 'gutter']) {
        const point = await cdp.evaluate(`(() => {
          const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();
          const border=parseFloat(getComputedStyle(d).borderRightWidth);
          const gutter=d.offsetWidth-d.clientWidth-2*border;
          const x=${JSON.stringify(area)}==='border'?r.left+0.5:r.right-border-gutter/2,y=r.top+r.height/2;
          return {x,y,gutter,hit:document.elementFromPoint(x,y)===d};
        })()`);
        check(point.hit && (area !== 'gutter' || point.gutter > 0), `${width}px ${selector} ${area} 位于窗口内部且命中 dialog`, JSON.stringify(point));
        await click(point);
        check(await cdp.evaluate(`!!document.querySelector('dialog:modal')`), `${width}px ${selector} 点击 ${area} 保持窗口打开`);
      }
      const outside = await cdp.evaluate(`(() => {
        const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect(),x=r.left/2,y=r.top+r.height/2;
        return {x,y,hit:document.elementFromPoint(x,y)===d};
      })()`);
      check(outside.hit, `${width}px ${selector} 背景命中 dialog`);
      await click(outside);
      check(await cdp.evaluate(`!document.querySelector('dialog[open]')&&document.activeElement===document.querySelector(${JSON.stringify(selector)})`),
        `${width}px ${selector} 真正背景点击关闭并归还焦点`);
    }
  }

  await navigate(`${base}/`);
  for (const [tag, expected] of [
    ['react', ['notes-of-ashen', 'ruiqiang-website']],
    ['vue', ['ashen-courier', 'cryptowitch']],
  ]) {
    await click(await locate(`[data-tag="${tag}"]`));
    const visible = await cdp.evaluate(`[...document.querySelectorAll('[data-tags]:not([hidden]) [data-preview]')].map(e=>e.dataset.preview.replace('preview-','')).sort()`);
    check(JSON.stringify(visible) === JSON.stringify(expected), `${tag} 筛选匹配真实技术栈`, JSON.stringify(visible));
    await click(await locate('[data-tag-clear]'));
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}

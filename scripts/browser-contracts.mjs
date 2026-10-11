/** Runs in the page. Composite actual ancestor paints, including gradient stops. */
export function componentContrast() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) =>
      i === 3 ? v / 255 : v,
    );
  };
  const blend = (fg, bg) => {
    const alpha = fg[3] + bg[3] * (1 - fg[3]);
    return fg.slice(0, 3).map((v, i) =>
      alpha ? (v * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / alpha : 0,
    ).concat(alpha);
  };
  const luminance = (c) =>
    c
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  function backgrounds(s) {
    const base = [rgba(s.backgroundColor)];
    if (s.backgroundImage === "none") return base;
    const colors =
      s.backgroundImage.match(
        /(?:oklab|oklch|rgba?|color)\([^)]*\)|#[\da-f]{3,8}/gi,
      ) ?? [];
    return colors.length
      ? colors.flatMap((color) => base.map((c) => blend(rgba(color), c)))
      : base;
  }
  // Opacity applies to the entire element group, including its background and
  // children. Composite two pixels (with/without text) from the leaf outwards;
  // multiplying only the text alpha would miss translucent ancestor groups.
  function pixels(el, foreground) {
    let pairs = [{ ink: foreground, paper: [0, 0, 0, 0] }];
    for (let node = el; node; node = node.parentElement) {
      const s = getComputedStyle(node), opacity = Number(s.opacity);
      pairs = pairs.flatMap(pair => backgrounds(s).map(bg => {
        const ink = blend(pair.ink, bg), paper = blend(pair.paper, bg);
        ink[3] *= opacity;
        paper[3] *= opacity;
        return { ink, paper };
      }));
    }
    return pairs.map(({ ink, paper }) => ({
      ink: blend(ink, [255, 255, 255, 1]),
      paper: blend(paper, [255, 255, 255, 1]),
    }));
  }
  const problems = [];
  let count = 0;
  for (const el of document.querySelectorAll(
    ".badge,.chip,.attest-caption,.btn,.nav-link,.toc-link,.tagbar__tag,.tagbar__n,.tagbar__clear,.theme-opt,.text-muted,.text-muted-soft,.prose-grimoire a,.reading-action,.preview__summary,.preview__title,.preview__h,.preview__list",
  )) {
    if (
      !el.checkVisibility({
        visibilityProperty: true,
        contentVisibilityAuto: true,
      }) ||
      el.closest('[aria-hidden="true"]')
    )
      continue;
    const s = getComputedStyle(el),
      foreground = rgba(s.color);
    const ratio = Math.min(
      ...pixels(el, foreground).map(({ ink, paper }) => {
        const a = luminance(ink),
          b = luminance(paper);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }),
    );
    count++;
    if (ratio < 4.5)
      problems.push(
        `${el.textContent.trim().slice(0, 35)}: ${ratio.toFixed(2)}:1 (${s.color})`,
      );
  }
  return { count, problems };
}

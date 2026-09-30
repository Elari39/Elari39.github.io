import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { imageSize } from "image-size";
import { readThemeIds } from "./budget.mjs";
import {
  SITE,
  files,
  document,
  attr,
  text,
  hasClass,
  entries,
  routeFor,
  localFile,
} from "./site-model.mjs";

/** Independent artifact checks. Tests pass isolated copies of dist, never edit production files. */
export async function audit(root, dist) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const inventory = await files(dist);
  const pages = new Map(
    await Promise.all(
      inventory
        .filter((f) => f.endsWith(".html"))
        .map(async (file) => {
          const html = await readFile(file, "utf8");
          return [routeFor(file, dist), { html, nodes: document(html) }];
        }),
    ),
  );
  const content = await entries(root);
  const published = content
    .filter((p) => !p.draft)
    .sort((a, b) => a.order - b.order);
  const expected = [
    "/",
    "/about/",
    ...published.map((p) => `/projects/${p.slug}/`),
  ];
  for (const route of [...expected, "/404.html"])
    check(pages.has(route), `缺少页面 ${route}`);
  check(published.length >= 3, "至少3个条目");
  check(
    published.every((p) => Number.isInteger(p.order) && p.order > 0),
    "order 正整数",
  );
  check(
    new Set(published.map((p) => p.order)).size === published.length,
    "order 重复",
  );
  for (const p of content) {
    check(
      Array.isArray(p.highlights) && p.highlights.length >= 3,
      `${p.slug} 亮点不足`,
    );
    check(
      p.draft
        ? !pages.has(`/projects/${p.slug}/`)
        : pages.has(`/projects/${p.slug}/`),
      `${p.slug} 草稿/产出不一致`,
    );
    const repo = new URL(p.links.repo);
    check(
      repo.origin === "https://github.com" &&
        /^\/Elari39\/[^/]+\/?$/.test(repo.pathname),
      `${p.slug} 仓库地址错误`,
    );
    if (!p.draft)
      check(
        pages
          .get(`/projects/${p.slug}/`)
          ?.nodes.some(
            (n) => n.tagName === "a" && attr(n, "href") === p.links.repo,
          ),
        `${p.slug} 仓库链接缺失`,
      );
  }
  const declared = new Map(
    [
      ...(
        await readFile(path.join(root, "src/data/plates.ts"), "utf8")
      ).matchAll(/"([^"]+)":\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/g),
    ].map((m) => [m[1], [+m[2], +m[3]]]),
  );
  const scripts = new Map(),
    titles = new Set(),
    referencedScripts = new Set();
  async function resource(raw, base, label) {
    try {
      const url = new URL(raw, base);
      if (/^data:image\//i.test(raw)) return;
      check(url.origin === SITE, `${label} 第三方资源 ${raw}`);
      if (url.origin === SITE)
        check(existsSync(localFile(url, dist)), `${label} 缺失资源 ${raw}`);
    } catch {
      check(false, `${label} 无效资源 ${raw}`);
    }
  }
  for (const [route, { html, nodes }] of pages) {
    const base = new URL(route, SITE),
      select = (tag) => nodes.filter((n) => n.tagName === tag);
    const metas = (name) =>
      select("meta").filter((n) => attr(n, "name") === name);
    const ts = select("title");
    check(
      ts.length === 1 && text(ts[0]).trim(),
      `${route} title 必须唯一且非空`,
    );
    check(!titles.has(text(ts[0])), `${route} title 跨页重复`);
    titles.add(text(ts[0]));
    check(
      metas("description").length === 1 &&
        (attr(metas("description")[0], "content") ?? "").length >= 20,
      `${route} description 必须唯一且至少20字符`,
    );
    const canonical = select("link").filter(
      (n) => attr(n, "rel") === "canonical",
    );
    check(
      canonical.length === 1 && attr(canonical[0], "href") === base.href,
      `${route} canonical 错误`,
    );
    check(
      select("meta").some(
        (n) =>
          attr(n, "property") === "og:image" &&
          attr(n, "content") === SITE + "/og.png",
      ),
      `${route} og:image 错误`,
    );
    check(select("h1").length === 1, `${route} 恰好一个 h1`);
    check(attr(select("html")[0], "lang") === "zh-CN", `${route} lang 错误`);
    const ids = nodes.map((n) => attr(n, "id")).filter((v) => v !== undefined);
    check(new Set(ids).size === ids.length, `${route} id 重复`);
    check(
      ids.includes("main") &&
        select("a").some(
          (n) => hasClass(n, "skip-link") && attr(n, "href") === "#main",
        ),
      `${route} skip link 错误`,
    );
    check(
      !nodes.some((n) => attr(n, "style") !== undefined),
      `${route} 行内 style`,
    );
    check(select("style").length === 0, `${route} 样式必须使用外链文件`);
    check(
      !nodes.some((n) => n.attrs.some((a) => /^on/i.test(a.name))),
      `${route} 行内事件脚本`,
    );
    check(
      select("svg").every((n) => attr(n, "aria-hidden") === "true"),
      `${route} 装饰 SVG 缺少 aria-hidden`,
    );
    for (const a of select("a")) {
      const raw = attr(a, "href");
      if (!raw) continue;
      try {
        const url = new URL(raw, base);
        check(
          ["https:", "http:", "mailto:", "tel:"].includes(url.protocol),
          `${route} 链接协议错误 ${raw}`,
        );
        if (url.origin !== SITE) continue;
        check(existsSync(localFile(url, dist)), `${route} 站内链接缺失 ${raw}`);
        if (url.hash)
          check(
            pages
              .get(url.pathname)
              ?.nodes.some(
                (n) => attr(n, "id") === decodeURIComponent(url.hash.slice(1)),
              ),
            `${route} 锚点缺失 ${raw}`,
          );
      } catch {
        check(false, `${route} 无效链接 ${raw}`);
      }
    }
    for (const n of nodes) {
      if (
        [
          "img",
          "script",
          "iframe",
          "source",
          "video",
          "audio",
          "embed",
          "object",
        ].includes(n.tagName)
      ) {
        for (const key of ["src", "poster", "data"])
          if (attr(n, key)) await resource(attr(n, key), base, route);
        // This site only publishes local srcset candidates; data URLs aren't valid gallery sources.
        if (attr(n, "srcset"))
          for (const part of attr(n, "srcset").split(","))
            await resource(part.trim().split(/\s+/)[0], base, route);
      }
      if (
        n.tagName === "link" &&
        !["canonical", "alternate"].includes(attr(n, "rel"))
      )
        await resource(attr(n, "href") ?? "", base, route);
    }
    for (const img of select("img")) {
      check(attr(img, "alt") !== undefined, `${route} 图片缺少 alt`);
      const width = Number(attr(img, "width")),
        height = Number(attr(img, "height"));
      check(width > 0 && height > 0, `${route} 图片缺少有效尺寸`);
      try {
        const url = new URL(attr(img, "src"), base);
        if (url.origin === SITE) {
          const actual = imageSize(await readFile(localFile(url, dist)));
          check(
            width === actual.width && height === actual.height,
            `${route} 图片真实尺寸不符 ${url.pathname}`,
          );
          if (hasClass(img, "plate"))
            check(
              JSON.stringify(declared.get(url.pathname.slice(1))) ===
                JSON.stringify([width, height]),
              `${route} 图版清单尺寸不符`,
            );
        }
      } catch {
        check(false, `${route} 图片无法解码 ${attr(img, "src")}`);
      }
    }
    const policies = select("meta").filter(
      (n) => attr(n, "http-equiv")?.toLowerCase() === "content-security-policy",
    );
    const csp = attr(policies[0], "content") ?? "";
    check(
      policies.length === 1 &&
        csp.includes("default-src 'self'") &&
        csp.includes("object-src 'none'") &&
        !csp.includes("unsafe-inline"),
      `${route} CSP 无效`,
    );
    const executable = [];
    for (const script of select("script")) {
      if (attr(script, "type") === "application/ld+json") {
        try {
          JSON.parse(text(script));
        } catch {
          check(false, `${route} JSON-LD 无效`);
        }
        continue;
      }
      let body = text(script);
      if (attr(script, "src")) {
        try {
          const file = localFile(new URL(attr(script, "src"), base), dist);
          referencedScripts.add(file);
          body = await readFile(file, "utf8");
        } catch {
          check(false, `${route} 缺失脚本`);
        }
      } else
        check(
          csp.includes(
            `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
          ),
          `${route} CSP 脚本哈希缺失`,
        );
      executable.push(body);
    }
    check(executable.length === 2, `${route} 仅允许两段主题脚本`);
    scripts.set(route, executable);
    check(
      executable.reduce((sum, s) => sum + gzipSync(s).length, 0) <= 4096,
      `${route} JS 超出 4 KB`,
    );
    if (route === "/404.html")
      check(
        attr(metas("robots")[0], "content")?.includes("noindex"),
        "404 必须 noindex",
      );
  }
  const home = pages.get("/");
  if (!home) return errors;
  for (const [route, bodies] of scripts)
    check(
      JSON.stringify(bodies) === JSON.stringify(scripts.get("/")),
      `${route} 非主题脚本/脚本不一致`,
    );
  let externalSize = 0;
  for (const file of inventory.filter((f) => /\.(?:js|mjs|cjs)$/.test(f))) {
    externalSize += gzipSync(await readFile(file)).length;
    check(referencedScripts.has(file), `未许可脚本文件 ${file}`);
  }
  // External files are counted once, plus the largest page's inline payload.
  const inlineSize = Math.max(
    ...[...pages.values()].map((p) =>
      p.nodes
        .filter(
          (n) =>
            n.tagName === "script" &&
            !attr(n, "src") &&
            attr(n, "type") !== "application/ld+json",
        )
        .reduce((n, s) => n + gzipSync(text(s)).length, 0),
    ),
  );
  check(externalSize + inlineSize <= 4096, "全部 JS 超出 4 KB");
  let cssBytes = 0;
  for (const file of inventory.filter((f) => f.endsWith(".css"))) {
    const css = await readFile(file, "utf8");
    cssBytes += Buffer.byteLength(css);
    const urls = [],
      parsed = postcss.parse(css);
    parsed.walkDecls((d) =>
      valueParser(d.value).walk((n) => {
        if (n.type === "function" && n.value === "url")
          urls.push(valueParser.stringify(n.nodes).replace(/^['"]|['"]$/g, ""));
      }),
    );
    parsed.walkAtRules("import", (r) => {
      const n = valueParser(r.params).nodes[0];
      if (n?.type === "string") urls.push(n.value);
      else if (n?.type === "function")
        urls.push(valueParser.stringify(n.nodes).replace(/^['"]|['"]$/g, ""));
    });
    for (const url of urls)
      await resource(
        url,
        new URL("/" + path.relative(dist, file).replaceAll("\\", "/"), SITE),
        file,
      );
  }
  check(cssBytes <= 48 * 1024, "CSS 超出 48 KB");
  check(
    Buffer.byteLength(home.html) <= 60 * 1024,
    "首页 HTML UTF-8 超出 60 KB",
  );
  const cards = home.nodes.filter((n) => hasClass(n, "entry-card"));
  check(cards.length === published.length, "首页条目数不符");
  published.forEach((p, i) =>
    check(text(cards[i]).includes(p.title), "首页条目顺序不符"),
  );
  const attest = home.nodes
    .filter((n) => hasClass(n, "attest-item"))
    .map((n) =>
      (n.childNodes ?? [])
        .filter(
          (c) => hasClass(c, "attest-value") || hasClass(c, "attest-caption"),
        )
        .map((c) => text(c).trim())
        .join(" "),
    );
  const captions = [
    `${published.length} 条已发布条目 · 全部通过 schema 校验`,
    "0 次第三方请求 · 字体与图标都是自己的",
    "≤ 4 KB 客户端 JS（gzip）· 守卫盯着上限",
    "9 组 配色 × 5 主题 · 文字 ≥ 4.5:1，装饰 ≥ 3:1",
  ];
  check(
    attest.length === 4 && attest.every((v, i) => v === captions[i]),
    "数字条完整说明不符",
  );

  /* 主题：产物里每个 data-theme 值都必须是已知主题，且每套主题在面板里都有色块。
     面板的色块靠**嵌在页面里的** data-theme="<id>" 去取各自主题的 token ——
     那是最省事、也最容易写错 id 的地方：写错了不会报错，只会安静地显示成别的主题色。
     所以这里不只看"值合法"，还看"清单里每一套都真的有预览"。 */
  const themeIds = readThemeIds(await readFile(path.join(root, "src/lib/theme.ts"), "utf8"));
  check(themeIds.length >= 2, "主题清单读取失败");
  for (const [route, page] of pages) {
    for (const node of page.nodes) {
      const value = attr(node, "data-theme");
      check(
        value === undefined || themeIds.includes(value),
        `${route} 出现未知的 data-theme 值：${value}`,
      );
    }
    const swatches = page.nodes
      .filter((node) => hasClass(node, "theme-opt__swatch"))
      .map((node) => attr(node, "data-theme"));
    check(
      swatches.length === themeIds.length,
      `${route} 主题面板的色块数 ${swatches.length} ≠ 主题数 ${themeIds.length}`,
    );
    check(
      themeIds.every((id) => swatches.includes(id)),
      `${route} 主题面板缺少某套主题的预览色块`,
    );
  }

  /* 标签过滤：卡片上的 data-tags 与过滤条按钮必须彼此自洽。
     这里刻意**不**重算"该显示哪些标签"（那条规则在 src/lib/tags.ts），
     只核对渲染结果本身的性质 —— 规则改了不会让这里误报，但
     "按钮筛不出任何东西""计数对不上""没有 JS 时也少了东西"一定会红。 */
  const tagged = home.nodes.filter(
    (node) => hasClass(node, "reveal") && attr(node, "data-tags") !== undefined,
  );
  check(tagged.length === published.length, "首页带标签的卡片数与已发布条目数不符");
  published.forEach((entry, index) =>
    check(
      text(tagged[index]).includes(entry.title),
      `首页带标签的卡片顺序与条目顺序不符（第 ${index + 1} 张）`,
    ),
  );
  const cardTags = tagged.map((node) => {
    const raw = attr(node, "data-tags") ?? "";
    const parts = raw.split(/\s+/).filter(Boolean);
    check(parts.length >= 2, `data-tags="${raw}" 的标签少于两个`);
    check(parts.length === new Set(parts).size, `data-tags="${raw}" 有重复标签`);
    check(
      parts.join(" ") === [...parts].sort().join(" "),
      `data-tags="${raw}" 未排序（应与 src/lib/tags.ts 的归一化一致）`,
    );
    check(
      parts.every((tag) => tag === tag.trim().toLowerCase()),
      `data-tags="${raw}" 未小写或含空白`,
    );
    return new Set(parts);
  });
  const tagButtons = home.nodes.filter((node) => hasClass(node, "tagbar__tag"));
  check(tagButtons.length > 0, "首页没有标签过滤按钮");
  for (const button of tagButtons) {
    const tag = attr(button, "data-tag");
    check(Boolean(tag), "标签按钮缺少 data-tag");
    if (!tag) continue;
    check(text(button).includes(tag), `标签按钮的文字里没有 ${tag}`);
    check(
      attr(button, "aria-pressed") === "false",
      `标签按钮 ${tag} 的初始 aria-pressed 应为 false`,
    );
    const shared = cardTags.filter((set) => set.has(tag)).length;
    // 只被一个条目用的标签筛出来就是它自己，不该出现在过滤条里
    check(shared >= 2, `标签 ${tag} 只被 ${shared} 个条目使用，不该出现在过滤条里`);
    const countNode = (button.childNodes ?? []).find((child) =>
      hasClass(child, "tagbar__n"),
    );
    check(
      text(countNode).trim() === String(shared),
      `标签 ${tag} 显示的计数 ${text(countNode).trim()} 与带它的条目数 ${shared} 不符`,
    );
  }
  // 过滤条在服务端渲染时必须是隐藏的：没有 JS 的访客不该看到一排点了没反应的按钮
  const bar = home.nodes.find((node) => attr(node, "id") === "tagbar");
  check(Boolean(bar), "首页缺少标签过滤条");
  check(attr(bar, "hidden") !== undefined, "标签过滤条在服务端渲染时应带 hidden");

  const locs = [];
  for (const file of inventory.filter((f) => /sitemap.*\.xml$/.test(f)))
    locs.push(
      ...[
        ...(await readFile(file, "utf8")).matchAll(/<loc>([^<]+)<\/loc>/g),
      ].map((m) => m[1]),
    );
  check(
    expected.every((r) => locs.includes(SITE + r)),
    "sitemap 缺少正常页面",
  );
  check(
    locs.every((u) => new URL(u).origin === SITE && !u.includes("/404")),
    "sitemap 域名或404错误",
  );
  return errors;
}

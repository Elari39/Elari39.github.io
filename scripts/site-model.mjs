import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { parse as yaml } from "yaml";

export const SITE = "https://elari39.github.io";
export async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(file)));
    else result.push(file);
  }
  return result.sort();
}
export function document(html) {
  const nodes = [];
  function visit(node) {
    if (node.tagName) nodes.push(node);
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(parse(html));
  return nodes;
}
export const attr = (node, key) =>
  node?.attrs?.find((a) => a.name === key)?.value;
export const text = (node) =>
  node?.nodeName === "#text"
    ? node.value
    : (node?.childNodes ?? []).map(text).join("");
export const hasClass = (node, name) =>
  (attr(node, "class") ?? "").split(/\s+/).includes(name);
export function routeFor(file, dist) {
  const name = path.relative(dist, file).replaceAll("\\", "/");
  return "/" + name.replace(/(^|\/)index\.html$/, "$1");
}
export function localFile(url, dist) {
  const name = decodeURIComponent(url.pathname);
  const result = path.resolve(
    dist,
    "." + name,
    name.endsWith("/") ? "index.html" : "",
  );
  if (!result.startsWith(path.resolve(dist) + path.sep))
    throw new Error("资源路径越界");
  return result;
}
export async function entries(root) {
  const base = path.join(root, "src/content/projects");
  return Promise.all(
    (await files(base))
      .filter((f) => f.endsWith(".md"))
      .map(async (file) => {
        const raw = await readFile(file, "utf8");
        const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        if (!front) throw new Error(`缺少 frontmatter: ${file}`);
        return {
          slug: path
            .relative(base, file)
            .replaceAll("\\", "/")
            .replace(/\.md$/, ""),
          ...yaml(front[1]),
        };
      }),
  );
}

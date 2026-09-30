import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * 「条目」内容集合。
 *
 * 每个项目就是 src/content/projects/ 下的一份 Markdown：结构化字段写在
 * frontmatter（由下面的 schema 校验），长文叙述写在正文里。
 *
 * schema 的职责是**让错误的条目构建不过**，而不是写文档：
 *   - 强调色只能是色板里已有的三种 —— 因为颜色要靠 CSS 类实现
 *     （行内 style 属性在 style-src 'self' 下会被 CSP 拦掉）
 *   - 仓库地址必须指向 github.com/Elari39/ —— 避免把别处的链接当成本项目
 *   - 至少三条亮点 —— 首页卡片按前三条渲染，少于三条会空一块
 */
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "链接必须以 https:// 开头",
  });

const repoUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      const url = new URL(value);
      return (
        url.origin === "https://github.com" &&
        /^\/Elari39\/[^/]+\/?$/.test(url.pathname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    },
    {
      message: "repo 必须指向 https://github.com/Elari39/ 下的仓库",
    },
  );

const galleryPlate = z.object({
  /** public/ 下的绝对路径，例如 /shots/ashen-courier/landing.webp */
  src: z
    .string()
    .refine(
      (value) =>
        value.startsWith("/shots/") &&
        !value.includes("..") &&
        !value.includes("\\") &&
        !/[?#]/.test(value),
      {
        message: "截图路径必须以 / 开头（相对 public/）",
      },
    ),
  alt: z.string().min(1),
  caption: z.string().optional(),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(1),
    tagline: z.string().min(1),
    summary: z.string().min(1),
    status: z.enum(["live", "wip", "archived"]),
    year: z.number().int().min(2000).max(2100),
    role: z.string().min(1),
    /** 色板里的名字，不是十六进制 —— 见 src/styles/global.css 的 .accent-* */
    accent: z.enum(["coral", "teal", "amber"]),
    glyph: z.enum(["book", "link", "lock", "sigil", "github"]),
    /** 首页排序，必须唯一（check-site.mjs 会检查） */
    order: z.number().int().positive(),
    stack: z.array(z.string().min(1)).min(1),
    highlights: z.array(z.string().min(1)).min(3),
    links: z.object({
      repo: repoUrl,
      live: httpsUrl.optional(),
    }),
    gallery: z.array(galleryPlate).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };

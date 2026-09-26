/**
 * 站点级常量。
 *
 * 只有「与具体某个项目无关」的东西放在这里；项目自身的叙述属于内容集合
 * （src/content/projects/*.md），这样新增一个条目不需要改这个文件。
 */

export const SITE = {
  /** 站点标题，同时用于 <title> 后缀、OG 与页眉 */
  title: "Ashen Witch's Grimoire",
  /** 中文副题，出现在页眉站名下方与关于页 */
  subtitle: '灰烬女巫的魔典',
  /** 一句站点定位，用于首页 hero 与 meta description */
  description:
    '灰烬女巫的魔典：三个自建项目的条目库——个人博客系统 Notes of Ashen、短链服务 AshenCourier，以及本地文档保险箱 CryptoWitch。',
  /** 默认 OG/描述用语的简短版本 */
  tagline: '把做过的项目，写成一本可以翻的魔典。',

  /** 必须是用户站点的最终地址；canonical、sitemap 与 OG 都依赖它 */
  url: 'https://elari39.github.io',
  lang: 'zh-CN',

  author: {
    /** GitHub 账号名 */
    handle: 'Elari39',
    /** 页脚署名 */
    name: '灰烬女巫',
    github: 'https://github.com/Elari39',
  },

  /** 导航；href 以 / 结尾的规则由 scripts/check-site.mjs 守卫 */
  nav: [
    { href: '/#entries', label: '条目' },
    { href: '/about/', label: '关于本站' },
  ],

  /** 「关于本站」里如实列出的构建方式，避免写成营销话术 */
  builtWith: [
    'Astro 7（纯静态输出，零客户端框架运行时）',
    'Tailwind CSS 4（设计 token 走 @theme inline）',
    '内容集合 + zod schema（每个项目就是一个 Markdown 条目）',
    'GitHub Actions + actions/deploy-pages 发布到 GitHub Pages',
  ],

  /** 站点的三条自我约束，既是说明也是可以被守卫脚本检查的承诺 */
  principles: [
    {
      title: '没有第三方请求',
      body: '字体用系统字体栈、图标是内联 SVG、不引任何 CDN 与分析脚本——打开这一页不会顺带通知别的服务器。',
    },
    {
      title: '默认零客户端 JS',
      body: '除了 <head> 里一段用于解析主题的内联脚本，页面交互全部是 CSS。脚本体积有守卫脚本盯着上限。',
    },
    {
      title: '内容是文件，不是数据库',
      body: '每个项目是一份带 schema 校验的 Markdown 条目；新增一个项目就是新增一个文件，改完提交即发布。',
    },
  ],
} as const;

/** 页脚里的年份来源，构建期求值（静态站点，一年重建一次即可） */
export const BUILD_YEAR = new Date().getFullYear();

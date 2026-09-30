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
    '灰烬女巫的魔典：自建项目的条目库——个人博客系统 Notes of Ashen、短链服务 AshenCourier、本地文档保险箱 CryptoWitch，以及重庆锐强建筑劳务有限公司官网 Ruiqiang Website。',
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
      title: '两段脚本',
      body: '主题引导与主题面板/标签过滤共两段脚本，无客户端框架运行时；动效与形状都由 CSS 完成，脚本 gzip 总量不超过 4 KB。',
    },
    {
      title: '内容是文件，不是数据库',
      body: '每个项目是一份带 schema 校验的 Markdown 条目；新增一个项目就是新增一个文件，改完提交即发布。',
    },
  ],

  /**
   * 首页「序言 · 已验证」里的三个数字（第四个是条目数，构建期算出来）。
   *
   * 规矩：这里只写**守卫脚本真的在核对**的事实，而且数值必须与
   * scripts/check-site.mjs 里的预算常量一致 —— 那三条一致性由守卫的反漂移
   * 检查盯着：改了 JS 预算、配色组数或主题数而没改这里，pnpm guard 就会失败。
   * 所以面板上永远不会出现"说说而已"的数字。
   */
  attestations: [
    { value: '0', caption: '次第三方请求 · 字体与图标都是自己的' },
    { value: '≤ 4 KB', caption: '客户端 JS（gzip）· 守卫盯着上限' },
    { value: '9 组', caption: '配色 × 5 主题 · 文字 ≥ 4.5:1，装饰 ≥ 3:1' },
  ],
} as const;

/** 页脚里的年份来源，构建期求值（静态站点，一年重建一次即可） */
export const BUILD_YEAR = new Date().getFullYear();

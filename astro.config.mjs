// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import { CSP_DIRECTIVES, THEME_BOOT_HASH } from './src/lib/csp.ts';

// https://astro.build/config
export default defineConfig({
  /**
   * 用户站点的最终地址。canonical、sitemap 与 OG 的绝对链接都依赖它，
   * 必须是 https://elari39.github.io，且**没有**子路径 —— 所以不设 base。
   */
  site: 'https://elari39.github.io',

  /** 目录格式输出 + 统一带尾斜杠，canonical 才不会有两种写法 */
  trailingSlash: 'always',

  build: {
    /**
     * 让 CSS 走外链文件。生产环境的 CSP 里因此只需要 style-src 'self'，
     * 不必为内联样式开 'unsafe-inline'。
     */
    inlineStylesheets: 'never',
  },

  security: {
    /**
     * Astro 会在构建期为页面里的内联脚本与样式生成 sha256，并写出
     * <meta http-equiv="content-security-policy">；script-src / style-src
     * 由它负责，我们只补其余指令。
     *
     * 注意：这个转换只在构建产物里生效，`astro dev` 不受影响 ——
     * 否则 HMR 注入的样式会被自己的策略拦掉。
     */
    csp: {
      directives: [...CSP_DIRECTIVES],
      /**
       * 主题引导脚本是我们自己注入的 is:inline 脚本，Astro 不会为它生成哈希，
       * 所以显式登记一份（详见 src/lib/csp.ts 的注释）。
       */
      scriptDirective: {
        hashes: [THEME_BOOT_HASH],
      },
    },
  },

  markdown: {
    /**
     * 颜色一旦由 Shiki 写成行内 style 属性，就没有哈希能放行它
     * （哈希只对 <style> 元素有效，不适用于 style 属性），
     * 于是只能给 style-src 开 'unsafe-inline'。本站条目里的代码块只有 ASCII
     * 架构图，用 global.css 里自己的 pre/code 样式更干净，主题切换也跟着走。
     */
    syntaxHighlight: false,
  },

  integrations: [sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },
});

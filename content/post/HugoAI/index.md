---
title: "在 Hugo 博客中部署 OpenAI 格式的 AI 助手"
date: 2026-02-16T19:17:00+08:00
draft: false
tags: ["Hugo", "AI", "Cloudflare Workers", "Gemini", "OpenAI"]
categories: ["技术教程"]
description: "本文记录了如何利用 Cloudflare Workers 作为中转，在 Hugo 静态博客中实现一个支持流式响应、Markdown 渲染和上下文记忆的 AI 聊天助手。"
---

在这个 AI 普及的时代，给自己的个人博客添加一个 AI 助手似乎成了一种新的“标配”。不仅可以增加互动性，还能让访客快速了解博客内容或进行闲聊。

本文将详细介绍如何在 Hugo 博客中，利用 Cloudflare Workers 部署一个兼容 OpenAI 接口格式（后端实际可对接 Gemini 等模型）的 AI 聊天插件。

## 整体架构

由于 Hugo 是静态网站生成器，无法直接在前端安全地调用需要 API Key 的 AI 接口。因此我们需要一个后端服务来中转请求、隐藏 Key 以及处理跨域（CORS）问题。

*   **前端**：嵌入在 Hugo 模板中的 HTML/JS，负责 UI 展示、Markdown 渲染和流式数据接收。
*   **后端**：Cloudflare Workers，负责接收前端请求，转发给 AI 提供商（如 Google Gemini），并将结果流式返回。

## 第一步：部署 Cloudflare Workers

我们使用 Cloudflare Workers 作为 API 网关。它免费、速度快，且支持 Edge Runtime。

### Worker 代码

创建一个新的 Worker，并写入以下代码。这段代码主要做了三件事：
1.  处理 `OPTIONS` 预检请求，解决跨域问题。
2.  接收前端的 `messages` 数组，并可以注入 System Prompt（人设）。
3.  将请求转发给上游 API（如 Gemini 的 OpenAI 兼容接口），并将响应流（Stream）原样透传回前端。

```javascript
export default {
  async fetch(request, env) {
    // 允许的来源域名，建议生产环境修改为具体域名
    const ALLOWED_ORIGIN = "*"; 
    
    // 1. 处理浏览器的预检请求 (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      
      // 2. 注入 System Prompt (可选)
      // 可以在这里给 AI 设定一个身份，比如“博客助手”
      if (body.messages && Array.isArray(body.messages)) {
        const hasSystem = body.messages.some(m => m.role === 'system');
        if (!hasSystem) {
          body.messages.unshift({
            role: "system",
            content: "你是一个运行在 Elari39 博客上的 AI 助手。请用幽默、可爱的语气回答访客的问题。回复请尽量简短。"
          });
        }
      }

      body.stream = true; // 强制开启流式

      // 从环境变量获取 API 地址和 Key
      const API_URL = env.GEMINI_API_URL;
      const API_KEY = env.GEMINI_API_KEY;

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
      });

      // 3. 将流直接转发，并强制带上跨域头
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN 
        }
      });
    }
  }
};
```

记得在 Cloudflare 后台配置环境变量 `GEMINI_API_URL` 和 `GEMINI_API_KEY`。

## 第二步：前端实现 (Hugo Partial)

在 Hugo 主题的 `layouts/partials/` 目录下创建一个 `chat.html` 文件。

### 1. 核心功能

*   **UI 悬浮窗**：平时是一个圆形图标，点击展开聊天窗口。
*   **Markdown 渲染**：引入 `marked.js`，让 AI 的回复支持代码高亮、列表等格式。
*   **上下文记忆**：在前端维护一个 `chatHistory` 数组，发送消息时带上之前的对话记录。
*   **流式读取**：使用 `fetch` + `TextDecoder` 读取 SSE (Server-Sent Events) 流，实现打字机效果。

### 2. 代码实现

以下是关键的 JavaScript 逻辑片段：

```javascript
// 聊天上下文历史
let chatHistory = [];
const MAX_HISTORY = 10; // 保留最近 10 轮对话

async function sendMessage() {
    // ... 获取输入 ...
    
    // 记录用户消息
    chatHistory.push({ role: "user", content: message });
    if (chatHistory.length > MAX_HISTORY * 2) chatHistory.shift();

    try {
        const response = await fetch("YOUR_WORKER_URL", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gemini-3-flash-preview", // 或其他模型名称
                messages: chatHistory, // 发送完整历史，实现多轮对话
                stream: true
            })
        });

        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            // ... 解析 SSE 格式 (data: {...}) ...
            // ... 使用 marked.parse(fullText) 实时渲染 Markdown ...
        }
        
        // 记录 AI 回复
        if (fullText) {
            chatHistory.push({ role: "assistant", content: fullText });
        }

    } catch (err) {
        console.error("Chat Error:", err);
    }
}
```

### 3. 样式适配

为了让聊天窗口融入博客主题，我们在 CSS 中使用了 CSS 变量（Variables），例如 `var(--red-1)` 和 `var(--color-wrap)`。这样无论是明亮模式还是暗黑模式，聊天窗口都能自动适应配色。

```css
#ai-chat-window {
    background: var(--color-wrap, white);
    border: 1px solid var(--color-border, #e5e7eb);
    box-shadow: var(--shadow-card-hover);
    /* ... */
}
```

## 第三步：集成到页面

最后，在 Hugo 的基础模板（如 `layouts/_default/baseof.html`）或页脚模板（`layouts/partials/footer.html`）中引入这个 partial 即可：

```html
{{ partial "chat.html" . }}
```

## 效果展示

部署完成后，博客右下角会出现一个悬浮按钮。点击后即可与 AI 进行对话。支持：
*   **多轮对话**：AI 记得你之前说的话。
*   **Markdown**：代码块、加粗、列表渲染完美。
*   **清空历史**：提供了一键清空对话的功能，方便开启新话题。
*   **流式响应**：回复像打字一样逐字显示，体验流畅。

通过这种方式，我们以极低的成本（Cloudflare Workers 免费额度通常够用）为静态博客赋予了动态的 AI 能力。

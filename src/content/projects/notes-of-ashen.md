---
title: "Notes of Ashen"
tagline: "前后端分离的个人博客系统：把内容、搜索与问答都握在自己手里。"
summary: "从注册登录到 Markdown 渲染、从媒体库到 RAG 问答，一套自己维护的博客栈。默认只启动 Web、API、MySQL 与 Redis 四个容器；搜索、消息队列与向量检索各自按 Compose profile 与能力开关按需启用，关掉时后端自动回退。"
status: "live"
year: 2026
role: "独立设计与开发"
accent: "coral"
glyph: "book"
order: 1
# 首页标签过滤的筛选维度（不写实现细节，写"一个人会用它来找东西"的词）
tags:
  - "go"
  - "vue"
  - "全栈"
  - "后端"
  - "搜索"
stack:
  - "Go 1.25"
  - "go-zero REST"
  - "MySQL 8.4"
  - "Redis 7.4"
  - "React 18"
  - "TypeScript"
  - "Vite 5"
  - "Tailwind CSS 4"
  - "Docker Compose"
highlights:
  - "可选能力全部 profile 化：Meilisearch 搜索、Qdrant + DashScope 的 RAG 问答、RabbitMQ 异步日志各自独立启停，搜索关闭时后端自动回退 MySQL 查询。"
  - "三级角色（user / editor / admin）配完整内容工作流：草稿、定时发布、版本查看与恢复、Markdown 导入导出、SEO 字段、置顶与显示优先级。"
  - "媒体库按内容 SHA-256 去重，内容寻址静态服务配长期缓存，同一张图重复上传不再多占一份空间。"
  - "站点能力齐备：RSS、Sitemap、PWA、深色模式、自定义主题强调色、中英双语界面、PV / UV 与来源统计。"
  - "运维面一并做进产品：口令加密备份与整站恢复、依赖健康探测、操作日志、非 root 容器、CSP 安全头与可信反向代理链校验。"
links:
  repo: "https://github.com/Elari39/Notes-of-Ashen"
  live: "https://blog.miku831.fun/"
gallery: []
draft: false
---

## 这是什么

一套完整的前后端分离博客系统。后端用 Go 与 go-zero 风格组织代码，前端用 React 18 + TypeScript + Vite + Tailwind CSS 4 构建，部署侧提供 Docker Compose、Nginx 与 1Panel 友好的运行方案。它同时是**公开博客**与**管理后台**——文章、分类、标签、媒体库、用户、站点设置、流量统计都在同一个系统里，不依赖任何外部内容平台。

它承载作者的独立博客；当前项目聚合站则由 Astro 构建，并独立部署于 GitHub Pages。

## 设计取舍

**默认只要四个容器。** 默认启动 Web、API、MySQL 与 Redis。RabbitMQ（异步日志）、Meilisearch（全文搜索）与 Qdrant（RAG 向量检索）分别属于 `messaging`、`search`、`rag` 三个独立的 Compose profile，必须同时打开对应能力开关才会被拉起。一台 2 GB 内存的小机器也能跑完整形态的下限。

**关掉就回退，而不是报错。** 搜索能力关闭时后端自动回退 MySQL 查询；RAG 与消息队列同理。功能开关不该变成「没配好就整站不可用」。

**内容工作流是产品的一部分。** 草稿、定时发布、版本查看与恢复、Markdown 导入导出、SEO 字段、置顶与显示优先级——写文章时真正要用的东西都在后台里，而不是留给外部工具或手动改库。

**运维面也做进产品。** 口令加密备份与整站恢复、依赖健康探测、操作日志、非 root 容器运行、CSP 安全头与可信反向代理链校验。这些通常被留给运维脚本的事情，被收进了应用自身。

**统一响应体。** 接口成功时返回 `{ "code": 0, "message": "success", "data": ... }`，失败路径同样有稳定的形状——前端只需要处理一套解析逻辑。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Go 1.25、go-zero REST、MySQL 8.4、Redis 7.4、JWT + bcrypt |
| 前端 | React 18、TypeScript、Vite 5、Tailwind CSS 4、Zustand、Axios、Framer Motion、ECharts |
| 内容渲染 | react-markdown、KaTeX、Mermaid、GFM 表格、代码高亮（按语言懒加载）、图片灯箱 |
| 可选能力 | Meilisearch 1.13、Qdrant 1.16 + DashScope、RabbitMQ 4 |
| 部署 | Docker Compose（镜像 digest 锁定）、Nginx、1Panel |

## 架构

```text
浏览器 / 1Panel 反向代理
        │  127.0.0.1:1270  ← 唯一暴露的宿主机端口
        ▼
   web（Nginx :8080）
        │  /api 反代
        ▼
   api（Go :19000，Prometheus :9101）
        ├── MySQL 8.4（内容、用户、日志）
        ├── Redis 7.4（缓存与限流）
        ├── RabbitMQ   ── profile: messaging（异步操作日志）
        ├── Meilisearch ─ profile: search（全文搜索）
        └── Qdrant      ─ profile: rag（公开文章的向量索引）
```

数据库结构由**不可变编号迁移**统一管理（`deploy/mysql/migrations`，编译期内嵌），修复只能新增前向迁移、不能改历史文件——这样任何一次部署的库结构都是可复现的。

---
title: "Golang 学习与项目实战"
date: 2026-02-26T12:00:00+08:00
draft: false
description: "我的 Golang 学习与就业冲刺计划，包含学习路线、每日任务与实战项目。"
tags: ["Golang", "学习计划"]
categories: ["GolangStudy"]
---

# Golang 学习与项目实战目录

本专栏用于记录 Golang 学习过程中的代码、笔记与项目源码。

## 目录内容

- **[学习路线图 (Roadmap)](Roadmap.md)**: 总规划，包含基础、Web、中间件、分布式四个阶段。
- **[每日任务打卡 (Daily Tasks)](DailyTasks.md)**: 记录每日的学习进度与算法刷题情况。

## 文件夹结构 (源码)

以下目录包含了我的实战代码 (位于本目录下):

- **01_Basics**: Go 语言基础语法练习
- **02_Algorithm**: 算法刷题 (LeetCode / 代码随想录)
- **03_Projects**: 实战项目
  - `GopherAI`: 基于 Eino + Gin 的 AI 应用
  - `KamaCache`: 分布式缓存系统
  - `KamaChat`: 分布式聊天室

## 如何开始

1. 查看 `Roadmap.md` 了解整体规划。
2. 每日在 `DailyTasks.md` 中记录进度。
3. 在对应文件夹中编写代码。
4. 定期提交代码到 GitHub (建议每日提交)。

## 常用命令

```bash
# 运行 Go 代码
go run main.go

# 初始化模块
go mod init <module-name>

# 下载依赖
go mod tidy
```

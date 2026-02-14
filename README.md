# Elari 的 Hugo 博客项目指南

这份文档详细记录了如何管理和发布你的 Hugo 博客。

## 📋 准备工作

确保你的电脑上已经安装了以下工具（你应该已经安装好了）：
- **Hugo**: 用于生成静态网站
- **Git**: 用于版本控制和部署

## 📂 目录结构简介

- `content/post/`: 存放你的博客文章（Markdown 文件）
- `static/images/`: 存放文章中引用的图片
- `hugo.toml`: 网站的主配置文件
- `archetypes/`: 文章模板

---

## 🚀 写作与发布流程

### 第一步：创建新文章

打开终端，运行以下命令来创建一篇新文章。请将 `my-new-post` 替换为你想要的英文文件名。

```bash
hugo new post/my-new-post.md
```

### 第二步：编辑内容

找到 `content/post/my-new-post.md` 文件并打开。

#### 1. 修改头部信息 (Front Matter)
你会看到文件开头有类似下面的内容：

```toml
+++
date = '2026-02-14T14:00:00+08:00'
draft = true
title = 'My New Post'
+++
```

- **title**: 文章标题（可以写中文）。
- **draft**: 草稿状态。**发布前必须改为 `false`**，否则网站上看不到。
- **date**: 发布时间。

#### 2. 撰写正文
在 `+++` 下方使用 Markdown 语法撰写文章内容。

### 第三步：添加图片（可选）

如果你需要在文章中插入图片：

1. 将图片文件（例如 `cat.jpg`）复制到项目的 `static/images/` 文件夹中。
2. 在 Markdown 文章中这样引用：

```markdown
![图片描述](/images/cat.jpg)
```

> **注意**：引用路径以 `/` 开头，不需要包含 `static`。

### 第四步：本地预览

在发布之前，建议先在本地查看效果：

```bash
hugo server
```

终端会显示一个链接（通常是 `http://localhost:1313/`）。按住 `Ctrl` 点击链接，或在浏览器中输入该地址即可预览。

预览无误后，在终端按 `Ctrl + C` 停止服务。

### 第五步：发布到网站

确认文章没有问题且 `draft = false` 后，执行以下命令将更改推送到 GitHub，网站会自动更新。

```bash
git add .
git commit -m "新增文章：你的文章标题"
git push
```

推送成功后，GitHub Actions 会自动构建部署。等待约 1-2 分钟，访问你的博客地址即可看到更新：
👉 [https://Elari39.github.io/](https://Elari39.github.io/)

---

## ❓ 常见问题

- **文章没显示？**
  - 检查文章头部的 `draft` 是否为 `false`。
  - 检查 Git 是否成功 push。
  - 检查 GitHub 仓库的 Actions 页面是否有报错。

- **图片没显示？**
  - 确保图片放在 `static` 目录下。
  - 确保引用路径以 `/` 开头，例如 `/images/xxx.jpg`。

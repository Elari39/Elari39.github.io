---
title: "Hugo博客配置"
date: 2026-02-14T12:00:00+08:00
weight: -1
draft: false
cover: /images/saber-bg.jpg
categories:
  - Hugo
tags:
  - Hugo
  - Blog
---
## 按照必要环境
1. Go环境：[All releases - The Go Programming Language](https://go.dev/dl/)
2. Hugo插件：[Releases · gohugoio/hugo](https://github.com/gohugoio/hugo/releases)
3. Git插件：[Git - Install for Windows](https://git-scm.com/install/windows)
## 初始化
1. 初始化博客
```git
hugo new site myblog
cd myblog
```
2. 初始化模块
```
hugo mod init myblog
```
3. 安装主题并启动服务： 
> 创建`config/_default/module.toml`,并在其中输入选择好的主题`(从[Hugo Themes](https://themes.gohugo.io/)从选择)`：
```toml
[[imports]]
path = "github.com/D-Sketon/hugo-theme-reimu"
```
> 运行`hugo server`，自动安装主题并启动服务，`http://localhost:1313/`
## 配置文件
1. 下载[D-Sketon/hugo-theme-reimu: 一款博丽灵梦风格的Hugo主题 | A Hakurei Reimu style Hugo theme. 💘Touhou💘](https://github.com/D-Sketon/hugo-theme-reimu)
2. 将主题内的 `config/_default/params.yml` 复制到 `config/_default` 文件夹下，此文件作为主题配置文件，可在此文件中修改主题配置
3. 将主题内的 `config/data/` 文件夹内的所有文件复制到外层 `data` 文件夹下，此文件夹内的文件用于配置主题内的数据：
	- `covers.yml` 用于配置随机封面图片
	- `friends.yml` 用于配置友链
	- `vendor.yml` 用于配置第三方库的 CDN 源
## 构建与部署
1. 创建`.gitignore`，忽略不需要上传的文件：
```git
# Hugo default
/public/
/resources/_gen/
.hugo_build.lock
/hugo_stats.json

# System Files
.DS_Store
Thumbs.db

# IDE & Editors
.vscode/
.idea/
*.swp
*.swo
*~
*.orig
.history/
```
2. 创建 GitHub Actions 部署脚本 `.github/workflows/deploy.yml`：
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-22.04
    concurrency:
      group: ${{ github.workflow }}-${{ github.ref }}
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          fetch-depth: 0

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.21'

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: 'latest'
          extended: true

      - name: Build
        run: hugo --minify --buildFuture

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v4
        if: github.ref == 'refs/heads/main'
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```
3. 将整个项目上传至 GitHub 仓库（建议仓库名为 `your_name.github.io`）。
4. 在 GitHub 仓库的 Settings -> Pages 中，将 Source 设置为 `Deploy from a branch`，Branch 选择 `gh-pages`。
5. （可选）创建自动同步脚本 `sync.ps1`，用于快速提交并推送代码：
```powershell
# 自动同步脚本
# 功能：拉取最新代码 -> 添加所有更改 -> 提交 -> 推送

# 设置控制台输出编码为 UTF-8，防止乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "正在拉取最新代码..." -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Error "拉取失败，请检查冲突或网络连接。"
    exit $LASTEXITCODE
}

Write-Host "正在添加更改..." -ForegroundColor Cyan
git add .

$hasChanges = git status --porcelain
if (-not $hasChanges) {
    Write-Host "没有检测到更改。" -ForegroundColor Yellow
    exit 0
}

$commitMessage = Read-Host "请输入提交信息 (默认为 'Update blog content')"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update blog content"
}

Write-Host "正在提交更改..." -ForegroundColor Cyan
git commit -m "$commitMessage"

Write-Host "正在推送到远程仓库..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "同步完成，GitHub Actions 将自动开始构建和部署。" -ForegroundColor Green
} else {
    Write-Error "推送失败，请检查网络连接或权限。"
}
```
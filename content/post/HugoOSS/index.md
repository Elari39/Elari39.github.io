---
title: "在 Hugo 博客中使用阿里云 OSS 托管图片（含自动化迁移脚本）"
date: 2026-02-16T20:00:00+08:00
draft: false
tags: ["Hugo", "OSS", "Python", "Automation"]
categories: ["Hugo", "技术教程"]
cover: https://elari39.oss-cn-chengdu.aliyuncs.com/blog/images/banner.webp
description: "详细介绍如何配置阿里云 OSS，并使用 Python 脚本将本地 Hugo 博客的图片自动迁移到云端，实现全球加速和 Markdown 链接的自动替换。"
---

随着博客文章的增多，本地图片的管理和加载速度逐渐成为瓶颈。将图片托管到对象存储（如阿里云 OSS）不仅可以提升访问速度，还能减轻 Git 仓库的体积压力。

本文将详细介绍如何配置阿里云 OSS，并分享一个自动化脚本，帮助你一键迁移现有图片。

## 为什么要用 OSS？

1.  **访问速度快**：配合 CDN，可以实现全球加速。
2.  **节省流量**：Git 仓库不再臃肿，克隆速度更快。
3.  **管理方便**：统一的云端管理，支持防盗链、水印等功能。

## 第一步：阿里云 OSS 配置

### 1. 创建 Bucket
登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com/)，点击“创建 Bucket”。
*   **区域**：选择离你（或你的受众）最近的区域。
*   **存储类型**：标准存储。
*   **读写权限**：**公共读**（必须，否则访客无法看到图片）。

### 2. 获取 AccessKey
为了让脚本能自动上传图片，我们需要创建一个 AccessKey。
1.  进入 [RAM 访问控制](https://ram.console.aliyun.com/)。
2.  创建一个新用户，勾选“OpenAPI 调用访问”。
3.  给该用户授权 `AliyunOSSFullAccess`（或者更精细的 `AliyunOSSWriteAccess`）。
4.  记录下 `AccessKey ID` 和 `AccessKey Secret`。

## 第二步：自动化迁移脚本

为了避免手动一张张上传和替换链接的繁琐，我编写了一个 Python 脚本。它会自动扫描 `content` 目录下的所有 Markdown 文件，识别本地图片引用，上传到 OSS，并替换为云端链接。

### 1. 准备环境
在博客根目录下创建 `.env` 文件，填入你的密钥（**注意不要提交到 Git**）：

```ini
OSS_ACCESS_KEY_ID=你的AccessKeyID
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
```

确保 `.gitignore` 中包含 `.env`。

### 2. 脚本代码
在根目录下创建 `migrate_to_oss.py`：

```python
import os
import re
import urllib.parse
import sys
from dotenv import load_dotenv

# 尝试导入 oss2
try:
    import oss2
except ImportError:
    print("错误: 未检测到 'oss2' 库。")
    print("请运行以下命令安装: pip install oss2 python-dotenv")
    sys.exit(1)

# 加载 .env 文件
load_dotenv()

# ================= 配置区域 =================
# 从环境变量读取 AccessKey
ACCESS_KEY_ID = os.getenv('OSS_ACCESS_KEY_ID')
ACCESS_KEY_SECRET = os.getenv('OSS_ACCESS_KEY_SECRET')

if not ACCESS_KEY_ID or not ACCESS_KEY_SECRET:
    print("错误: 未找到 OSS 密钥配置。")
    sys.exit(1)

# OSS 配置
ENDPOINT = 'oss-cn-chengdu.aliyuncs.com' # 请修改为你的 Endpoint
BUCKET_NAME = 'elari39'                   # 请修改为你的 Bucket 名称
OSS_PREFIX = 'blog/'                      # 上传到 OSS 的路径前缀
OSS_DOMAIN = f'https://{BUCKET_NAME}.{ENDPOINT}'

# 本地项目路径配置
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
CONTENT_DIR = os.path.join(PROJECT_ROOT, 'content')
STATIC_DIR = os.path.join(PROJECT_ROOT, 'static')

# ... (后续逻辑包含 get_local_file_path, upload_to_oss, process_file 等函数)
```

> 完整脚本逻辑包括：
> *   解析 Markdown 图片语法 `![]()` 和 Front Matter 中的 `cover:`。
> *   智能识别 `static/images` 和 `content/post` 下的本地图片。
> *   上传后自动替换链接。

### 3. 运行迁移
安装依赖：
```bash
pip install oss2 python-dotenv
```

运行脚本：
```bash
python migrate_to_oss.py
```

脚本会输出处理日志，告诉你哪些文件被修改了，哪些图片被上传了。

## 第三步：后续写作流程

迁移完成后，你的旧文章图片都已经上云了。对于新文章，你可以：
1.  继续像以前一样把图片放在本地（方便写作预览）。
2.  写完后，再次运行 `python migrate_to_oss.py`。
3.  脚本会自动识别新图片并上传替换。

这样既保留了本地写作的流畅体验，又享受了云端存储的优势。

## 常见问题

**Q: 本地图片还需要保留吗？**
A: 脚本只负责上传和替换链接，不会删除本地文件。建议在确认迁移无误后，手动清理 `static/images` 下不再使用的图片，以减小项目体积。

**Q: 如何防止 OSS 被盗刷？**
A: 建议在 OSS 控制台开启**防盗链**（Referer 白名单）。
*   **生产环境**：添加你的博客域名（如 `elari39.com`）。
*   **本地调试**：为了让 `hugo server` 能正常加载图片，必须添加 `localhost:1313` 或 `127.0.0.1:1313`。
*   **允许空 Referer**：如果希望图片能直接在浏览器打开或被 RSS 阅读器加载，请勾选“允许空 Referer”。

---

希望这篇文章能帮到你！如有疑问，欢迎在评论区留言。

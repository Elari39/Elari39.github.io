---
title: "腾讯云1Panel安装OpenClaw配置QQ机器人"
date: 2026-03-07T13:00:00+08:00
draft: false
tags: ["OpenClaw", "QQ", "1Panel", "安装配置", "腾讯云"]
categories: ["OpenClaw", "QQ", "1Panel"]
math: false
description: "OpenClaw QQ 1Panel 安装配置"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260305230526137.png"
---

## 创建qq机器人

1. 打开[OpenClaw QQ 机器人登录页面](https://q.qq.com/qqbot/openclaw/login.html)

2. 使用QQ进行扫码登录

3. 登录成功后，点击创建机器人

![创建机器人](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307130300449.png)

4. 将原生接入流程中的命令保存下来，尤其是id和token

- 可以先`扫码聊天`添加机器人

## 使用腾讯云安装1Panel

1. 点击[腾讯云服务器](https://console.cloud.tencent.com/lighthouse/instance)，选择`使用模版应用`使用`1Panel Linux面板`创建服务器

![安装1Panel](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307130713012.png)

2. 点击`防火墙`，添加规则，允许`TCP`端口`18789`和`8090`，分别为openclaw和1Panel的端口

![添加防火墙规则](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307131138787.png)

3. 点击`应用管理`，复制`sudo /opt/1panel/get-1panel-info.sh`再点击`登录`,获取默认账号和密码登录1Panel
![登录1Panel](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307131408995.png)

## 安装OpenClaw
1. 登录1Panel后，点击`应用商店`，点击`全部`->`OpenClaw`，点击`安装`

2. 将模型提供商改成`模型提供商`，模型改成`deepseek/deepseek-chat`，然后输入`api密钥`后点击确认，等待安装完成

- 可以选择`高级设置`-`外部端口访问`

![安装OpenClaw](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307131704234.png)

## 配置OpenClaw

1. 点击`系统`->`文件` ，找到并打开`data/config/openclaw.json`

2. 复制其中的token字段

```json
"auth": {
      "mode": "token",
      "token": "ciallo"
    }
```

![复制token](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307132604912.png)

3. 为openclaw添加令牌：点击`应用商店`->`已安装`->`OpenClaw`->`参数`->`编辑`->`令牌`->`输入 token`->`点击确认`

![添加令牌](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307132747033.png)

- 后续可以通过`http://服务器IP:18789?token=ciallo`进行访问面板

## 配置QQ机器人

1. 点击终端 先输入docker ps获取openclaw容器名称

2. 输入`docker exec -it openclaw-container-name sh`进入容器

![进入容器](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307133511039.png)

3. 输入创建qq机器人时的命令

```sh
openclaw plugins install @sliverp/qqbot@latest

openclaw channels add --channel qqbot --token "id:token"

openclaw gateway restart
```

4. 重启即可开始聊天

![开始聊天](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260307133630409.png)

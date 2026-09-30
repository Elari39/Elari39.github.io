---
title: "AshenCourier"
tagline: "把长链接，收成一条短链——跳转路径零数据库写入。"
summary: "匿名即可建短链，登录后可集中管理，点击统计跟手。跳转只碰 Redis（GET + INCR + XADD），缓存未命中才回源一次 PostgreSQL；统计走有界队列与 Redis Stream 异步落库，宁可少记一次点击，也不让 302 慢 1 毫秒。"
status: "live"
year: 2026
role: "独立设计与开发"
accent: "teal"
glyph: "link"
order: 2
tags:
  - "go"
  - "vue"
  - "全栈"
  - "后端"
  - "redis"
stack:
  - "Go 1.27"
  - "net/http ServeMux"
  - "PostgreSQL 18"
  - "pgx v5"
  - "Redis 8"
  - "Vue 3"
  - "TypeScript"
  - "Tailwind CSS v4"
  - "Docker Compose + nginx"
highlights:
  - "跳转不落库：GET /{code} 只做 Redis 的 GET + INCR + XADD，缓存未命中才回源一次 PostgreSQL，同一短码的并发未命中由 singleflight 合并成一次回源。"
  - "统计不阻塞跳转：点击写入有界队列（默认 4096），队满直接丢弃并计数——丢弃数在 /healthz/details 的 dropped_clicks 里可见。"
  - "计数两口径一致：详情页与列表页的「总点击」都是 PG 基线 + Redis 待同步增量，列表页一次 MGET 批量读，worker 每 2 秒回刷，正常偏差小于 2 秒。"
  - "匿名也能管理：一次性管理密钥只在创建响应里出现一次，数据库只存它的 SHA-256，登录后可以把它认领到账号下。"
  - "降级而不是熔断：Redis 限流不可用时全量放行并累计降级次数；PostgreSQL 不可用时按 SQLSTATE 分类，只对连接类与资源类失败返回 503 + Retry-After。"
  - "契约与隐私：/api 统一错误体覆盖到 net/http 内建的 404 与 405；点击明细的 IP 只回掩码网段（IPv4 /24、IPv6 /64）；CDN 前置时用 real_ip 还原访客地址。"
links:
  repo: "https://github.com/Elari39/AshenCourier"
  live: "https://shorten.miku831.fun/"
gallery:
  - src: "/shots/ashen-courier/landing.webp"
    alt: "AshenCourier 落地页：粘贴长链接即得短链"
    caption: "落地页：粘贴即得短链（截图取自真实运行的实例）"
  - src: "/shots/ashen-courier/dashboard.webp"
    alt: "AshenCourier 链接看板：标签筛选、搜索与列表"
    caption: "链接看板：标签筛选、搜索，窄屏自动换成卡片列表"
  - src: "/shots/ashen-courier/link-detail.webp"
    alt: "AshenCourier 链接详情：二维码、按天趋势与来源分布"
    caption: "链接详情：二维码、按天趋势与来源 / 设备 / 浏览器分布"
  - src: "/shots/ashen-courier/create-result.webp"
    alt: "AshenCourier 创建成功的结果卡，一次性管理密钥默认打码"
    caption: "创建成功：一次性管理密钥默认打码，需要时手动显示"
draft: false
---

## 这是什么

一个匿名可用的短链服务。不注册就能建短链，创建时返回一把**一次性管理密钥**；登录后可以把链接认领到自己账号下并集中管理。前端是 Vue 3 + TypeScript + Tailwind CSS v4，后端是 Go 1.27 标准库配 PostgreSQL 18 与 Redis 8，整套用 Docker Compose 一键起来。

它想解决的问题很具体：**跳转是热路径，不该被统计拖累。**

## 三条关键设计

**一、跳转不落库。** `GET /{code}` 只做 Redis 的 `GET`、`INCR` 与 `XADD`，全程没有任何 PostgreSQL 写入；缓存未命中才回源一次，并把结果回填。同一短码的并发未命中由 `singleflight` 合并成**一次**回源——负缓存只能挡住「已确认不存在」，挡不住「刚出现的热点」。结果是：数据库挂了，已缓存的短链跳转完全不受影响。

**二、统计不阻塞跳转。** 点击事件写入一个有界队列（默认 4096），队满直接丢弃并计数。宁可少记一次点击，也不让 302 慢 1 毫秒。

**三、计数最终一致。** 详情页与列表页的「总点击」都是 `links.click_count`（PG 基线）+ `clicks:cnt:{code}`（Redis 待同步增量），**两个口径一致**，不会出现「详情有数、列表没数」。worker 每 2 秒回刷一次；回刷是补偿式的——增量只读不删、写库成功后才结算，所以进程崩溃最多让基线重复累加一批，不会丢计数。

## 降级而不是熔断

| 故障 | 行为 |
| --- | --- |
| Redis 读缓存失败 | 当作未命中处理，回源 PostgreSQL；跳转仍可用 |
| Redis 写统计失败 | 记 warn 日志并丢弃该次统计，**不影响 302** |
| Redis 限流不可用 | 全量放行并累计降级次数，绝不因为限流组件故障把整站打成 5xx |
| PostgreSQL 不可用 | 按 SQLSTATE 分类：连接类（`08xxx`）、资源类（`53xxx`，含连接数打满）与 `57P01`/`57P02`/`57P03` 归为「依赖不可用」，返回 503 + `Retry-After`；业务类错误仍是 4xx/500，因为库是健康的、重试无用 |

## 契约与隐私

`/api` 下的失败响应统一为 `{ "error": { "code": ..., "message": ..., "field": ..., "request_id": ... } }`。这条契约覆盖**整个命名空间**——包括由 `net/http` 内建产生的 404 与 405：它们默认是 `text/plain`，会在响应侧被改写成统一错误体。请求体里的未知字段也会被拒绝，字段名拼错不会「成功但没生效」。

点击明细里的 IP **只回掩码网段**（IPv4 `/24`、IPv6 `/64`）——明细页要定位到「哪个网段」就够了，而 API 响应会经浏览器缓存、截图与共享看板流转，原始地址只留在库里供风控与排障。

CDN 前置部署时会遇到另一类问题：若不做处理，`$remote_addr` 会变成边缘节点的地址，于是**按 IP 的限流配额被同一边缘节点下的所有访客共享**，点击明细里的 IP 与 GeoIP 国家分布也全错。仓库里的 nginx 配置用 `real_ip` 从 `CF-Connecting-IP` 还原访客地址，并用测试把这段配置钉住——删掉它，`go test ./...` 就会红。

## 技术栈

| 层 | 选型 | 为什么 |
| --- | --- | --- |
| HTTP | Go 1.27 标准库 `net/http` ServeMux | 需要的方法感知路由 1.22 就有了，不引框架 |
| JSON | `encoding/json/v2` | 默认拒绝非法 UTF-8 与重复键 |
| 数据库 | PostgreSQL 18 + pgx v5 | 手写 SQL，唯一的视图是 `link_click_totals` |
| 缓存 / 队列 | Redis 8 | 缓存、计数增量、Stream 与限流四类用法封装在同一层 |
| 前端 | Vue 3 + TypeScript + Vite | 不引 Pinia：composable + localStorage 就够 |
| 图表 | 手写 SVG | 只需要「面积 + 折线 + 稀疏刻度」，不值得引几百 KB |

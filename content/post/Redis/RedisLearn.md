---
title: "Redis x Go ：从核心数据结构到验证码服务"
date: 2026-03-03T22:00:00+08:00
draft: false
tags: ["Redis", "Golang", "go-redis", "后端开发", "分布式缓存", "实战教程"]
categories: ["Go 语言进阶", "分布式技术"]
math: false
description: "解析 Redis 核心数据结构在 Go 中的应用，涵盖 Pipeline、事务、发布订阅等高级特性，并手把手实现一个基于 Redis 的简单验证码存储方案。"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260303220038858.png"
---

## 1. Redis 核心特点与应用场景

- **高性能**：数据存于内存，支持 RDB 快照 + AOF 日志持久化。
- **丰富的数据结构**：不仅支持 String，还原生支持 Hash、List、Set、Sorted Set、Stream、JSON、Bitmap 等。
- **典型应用场景**：
  - 缓存（Session、页面缓存）
  - 分布式锁（Redlock）
  - 消息队列（List / Stream）
  - 排行榜（Sorted Set）
  - 实时计数、限流（INCR + 过期时间）
  - 地理位置计算（Geo）

---

## 2. 环境准备

### 2.1 安装 Redis
使用 Docker 快速启动一个 Redis 容器：
```bash
docker run -d --name redis -p 6379:6379 redis:8.0-alpine
```

### 2.2 Go 项目配置

**安装 Redis 客户端库**
```bash
go get github.com/redis/go-redis/v9
```

**建立连接**
```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

func main() {
	// 创建客户端（内置连接池）
	rdb := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379", // Redis 地址
		Password: "",               // 密码（无则留空）
		DB:       0,                // 默认数据库
		PoolSize: 10,               // 连接池大小
	})
	defer rdb.Close()

	// 测试连通性
	pong, err := rdb.Ping(ctx).Result()
	if err != nil {
		panic(err)
	}
	fmt.Println("Redis 连接成功:", pong) // 输出: PONG
}
```

**使用 URL 字符串连接**
```go
opt, _ := redis.ParseURL("redis://:password@localhost:6379/0")
rdb := redis.NewClient(opt)
```

---

## 3. 核心数据类型详解

### 3.1 String (字符串)
最基础的类型，可存储字符串、整数或二进制数据（最大 512MB）。

```go
// SET / GET 基础操作
err := rdb.Set(ctx, "username", "elari39", 10*time.Minute).Err() 
if err != nil {
	panic(err)
}

val, err := rdb.Get(ctx, "username").Result()
if err == redis.Nil {
	fmt.Println("key 不存在")
} else if err != nil {
	panic(err)
} else {
	fmt.Println("username =", val)
}

// 原子递增（计数器、限流）
rdb.Incr(ctx, "page_views")     // +1
rdb.IncrBy(ctx, "likes", 5)     // +5
rdb.DecrBy(ctx, "stock", 1)     // 库存扣减
```

### 3.2 Hash (哈希)
适合存储对象（如用户信息、商品详情）。

```go
// HSET：一次存入多个字段
bike := map[string]interface{}{
	"model": "Deimos",
	"brand": "Ergonom",
	"price": 4972,
}
rdb.HSet(ctx, "bike:1", bike)

// HGET：读取单个字段
price, _ := rdb.HGet(ctx, "bike:1", "price").Int()
fmt.Println("价格:", price)

// HGETALL：读取全部并 Scan 到结构体
type Bike struct {
	Model string `redis:"model"`
	Brand string `redis:"brand"`
	Price int    `redis:"price"`
}
var b Bike
rdb.HGetAll(ctx, "bike:1").Scan(&b)
fmt.Printf("%+v\n", b)
```

### 3.3 List (列表)
双向链表实现，常用于消息队列或时间线。

```go
// LPUSH / RPUSH：左插与右插
rdb.LPush(ctx, "tasks", "task1", "task2")
rdb.RPush(ctx, "tasks", "task3")

// LRANGE：取出指定范围的元素
tasks, _ := rdb.LRange(ctx, "tasks", 0, -1).Result()
fmt.Println(tasks) // [task2 task1 task3]

// BRPOP：阻塞弹出（简单消息队列实现）
result, _ := rdb.BRPop(ctx, 0, "tasks").Result() // 0 表示永久阻塞
fmt.Println("消费到任务:", result)
```

### 3.4 Set (集合)
无序且不重复的集合，适用于去重、共同好友、抽奖等场景。

```go
rdb.SAdd(ctx, "users:online", "user1", "user2", "user3")
rdb.SAdd(ctx, "users:premium", "user2", "user4")

// SINTER：计算交集
common, _ := rdb.SInter(ctx, "users:online", "users:premium").Result()
fmt.Println("同时在线的付费用户:", common)

// SPOP：随机弹出一个成员（常用于抽奖）
lucky, _ := rdb.SPop(ctx, "users:online").Result()
```

### 3.5 Sorted Set (有序集合)
每个成员关联一个分数（Score），按分数排序。

```go
// ZADD：添加带分数的成员
rdb.ZAdd(ctx, "ranking", &redis.Z{Score: 100, Member: "张三"})
rdb.ZAdd(ctx, "ranking", &redis.Z{Score: 95, Member: "李四"})

// ZINCRBY：增加分数
rdb.ZIncrBy(ctx, "ranking", 10, "张三")

// ZREVRANGE：取分数最高的前 3 名
top3, _ := rdb.ZRevRangeWithScores(ctx, "ranking", 0, 2).Result()
for _, z := range top3 {
	fmt.Printf("%s 分数: %.0f\n", z.Member, z.Score)
}
```

---

## 4. 高级特性

### 4.1 Pipeline (管道)
通过一次性发送多条命令，减少网络 RTT，性能通常可提升 5-10 倍。

```go
pipe := rdb.Pipeline()

pipe.Set(ctx, "k1", "v1", 0)
pipe.Incr(ctx, "counter")
pipe.HSet(ctx, "user:1", "name", "grok")

cmds, _ := pipe.Exec(ctx) // 一次性执行并返回所有结果
```

### 4.2 Transaction (事务)
利用 `MULTI/EXEC` 保证一系列操作的原子性。

```go
tx := rdb.TxPipeline()
tx.Incr(ctx, "tx:counter")
tx.Set(ctx, "tx:key", "txvalue", 0)

_, err := tx.Exec(ctx) // 底层执行 WATCH + MULTI + EXEC
```

### 4.3 Pub/Sub (发布/订阅)
实现简单的异步消息通信。

```go
// 订阅端
pubsub := rdb.Subscribe(ctx, "chat")
ch := pubsub.Channel()
go func() {
	for msg := range ch {
		fmt.Println("收到消息:", msg.Payload)
	}
}()

// 发布端
rdb.Publish(ctx, "chat", "Hello from Go!")
```

### 4.4 集群与高可用

**集群模式 (Cluster)**
```go
rdb := redis.NewClusterClient(&redis.ClusterOptions{
	Addrs: []string{"127.0.0.1:7000", "127.0.0.1:7001", "127.0.0.1:7002"},
})
```

**哨兵模式 (Sentinel)**
```go
rdb := redis.NewFailoverClient(&redis.FailoverOptions{
	MasterName:    "mymaster",
	SentinelAddrs: []string{"127.0.0.1:26379"},
})
```

---

## 5. 实战案例：验证码服务

以下是一个完整的简单示例，演示如何使用 Redis 存储并读取带过期时间的验证码。

```go
package main

import (
	"context"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

func main() {
	rdb := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "123456",
		DB:       0,
	})
	defer rdb.Close()

	type User struct {
		Name string
		Code string
	}
	user := &User{Name: "Elari39"}

	// 1. 生成 6 位随机验证码
	user.Code = fmt.Sprintf("%06d", rand.IntN(1000000))
	fmt.Println("生成的验证码:", user.Code)

	// 2. 存入 Redis，设置 5 分钟有效期
	key := fmt.Sprintf("User:%s", user.Name)
	err := rdb.Set(ctx, key, user.Code, 5*time.Minute).Err()
	if err != nil {
		panic(err)
	}

	// 3. 模拟读取验证码
	redisCode, _ := rdb.Get(ctx, key).Result()
	fmt.Println("从 Redis 获取的验证码:", redisCode)
}
```

**执行结果：**
```bash
生成的验证码: 615806
从 Redis 获取的验证码: 615806
```

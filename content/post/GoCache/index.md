---
title: 'GoCache 学习建议'
date: 2026-02-14T21:57:00+08:00
weight: 100
cover: https://elari39.oss-cn-chengdu.aliyuncs.com/blog/post/GoCache/gocache.jpg
categories:
  - Go
tags:
  - Go
  - Cache
---

# 学习建议

**完成项目指导时间**  
- 如果具备【基础要求】里的基础，每天 6 小时，约 7 天完成。  
- 如果边学边做，每天 6~8 小时，约 15 天完成。  

**代码量**  
2000 行左右（除去测试代码）

---

## 基础要求
- **Go 语言基础**：goroutine、channel、接口等核心概念  
- **缓存原理**：缓存淘汰策略（LRU、LFU 等）  
- **网络编程**：gRPC 基础、HTTP 协议、TCP/IP  

---

## 循序渐进的学习顺序
1. **从单机缓存开始**  
   - 先理解 `ByteView`、`lruCache` 等核心数据结构  
   - 熟悉 `Cache` 和基本的缓存操作  

2. **理解分组缓存**  
   - 学习 `Group` 结构及其工作原理  
   - 掌握缓存加载、过期策略等机制  

3. **研究分布式扩展**  
   - 一致性哈希算法实现  
   - 节点间通信协议  
   - 服务注册与发现  

4. **深入高级特性**  
   - 缓存击穿防护  
   - 分段锁与高并发优化  
   - 优雅关闭与资源管理  

---

## 代码阅读方式
1. **绘制组件关系图**  
   - 梳理核心接口和实现类  
   - 理清组件间的调用关系  

2. **断点调试关键流程**  
   - `Set/Get` 操作的完整链路  
   - 分布式场景下的数据同步  

3. **编写单元测试**  
   - 为关键组件编写测试用例  
   - 使用基准测试验证性能优化  

4. **模拟故障场景**  
   - 节点宕机时的系统行为  
   - 网络分区下的一致性保证  

---

## 什么是缓存
缓存是将高频访问的数据暂存到内存中，是加速数据访问的存储，降低延迟，提高吞吐率的利器。

## 为什么要实现缓存系统
因缓存的使用相关需求，通过牺牲一部分服务器内存，减少对磁盘或者数据库资源进行直接读写，可换取更快响应速度，尤其是处理高并发的场景，负责存储经常访问的数据，通过设计合理的缓存机制提高资源的访问效率。由于服务器的内存是有限的，我们不能把所有数据都存放在内存中，因此需要一种机制来决定当使用内存超过一定标准时，应该删除哪些数据，这就涉及到缓存淘汰策略的选择。

---

## 在什么地方加缓存
> 参考文章：[https://blog.csdn.net/chongfa2008/article/details/121956961](https://blog.csdn.net/chongfa2008/article/details/121956961)

缓存对于每个开发者来说是相当熟悉了，为了提高程序的性能我们会去加缓存，但是在什么地方加缓存，如何加缓存呢？

举个例子：假设一个网站需要提高性能，缓存可以放在浏览器、反向代理服务器、应用程序进程内，还可以放在分布式缓存系统中。

![缓存位置示意图](https://elari39.oss-cn-chengdu.aliyuncs.com/blog/post/GoCache/cache-location.png)

从用户请求数据到数据返回，数据经过了浏览器、CDN、代理服务器、应用服务器以及数据库各个环节。每个环节都可以运用缓存技术。从浏览器/客户端开始请求数据，通过 HTTP 配合 CDN 获取数据的变更情况，到达代理服务器（Nginx）可以通过反向代理获取静态资源。再往下来到应用服务器可以通过进程内（堆内）缓存、分布式缓存等方式获取数据。如果以上所有缓存都没有命中数据，才会回源到数据库。

**缓存的顺序**：  
用户请求 → HTTP 缓存 → CDN 缓存 → 代理服务器缓存 → 进程内缓存 → 分布式缓存 → 数据库

距离用户越近，缓存能够发挥的效果越好。而根据缓存的存储方式和应用的耦合度，缓存可以分为**本地缓存**（Local Cache）和**分布式缓存**（Distributed Cache）。本地缓存更注重访问速度，而分布式缓存则关注数据一致性和扩展性。

---

## 本地缓存（Local Cache）
本地缓存是直接存储在应用进程内存中的缓存，应用程序与缓存共存于同一进程，无需网络通信即可访问数据，访问速度极快。

### 优势
1. **访问速度极快**：数据存储在应用进程内存，避免了网络延迟，读取性能远超分布式缓存。
2. **无额外性能开销**：直接在进程内操作内存，无需远程调用，不消耗额外的网络带宽和计算资源。
3. **适用于高频小数据缓存**：对于高频访问、较小体积的数据（如配置参数、Token、用户会话信息），本地缓存是最佳选择。

### 劣势
1. **数据一致性问题**  
   - 由于缓存数据存储在应用本地，不同服务器之间的缓存内容可能不一致。  
   - 例如：用户第一次请求命中服务器 A，有缓存；第二次命中服务器 B，没有缓存，导致重复查询数据库。  
   - **解决方案**：  
     - 基于 Redis 的发布/订阅（Pub/Sub）机制进行缓存变更通知，实现跨节点数据同步。  
     - 使用消息队列（Kafka/RabbitMQ）实现异步数据同步，确保所有应用节点缓存数据一致。

2. **缓存容量受限**  
   - 由于缓存存储在应用进程的内存空间，其大小受 JVM（Java）/进程内存（Go、Python）限制，无法存储大规模数据。  
   - **解决方案**：  
     - 使用 LRU 策略，自动淘汰不常访问的数据。  
     - 采用“本地+分布式”结合的两级缓存机制，本地缓存仅存储热点数据。

3. **应用进程重启，缓存丢失**  
   - 本地缓存存储在应用进程内存中，当应用重启时，缓存数据会丢失，需要重新加载。  
   - **解决方案**：  
     - 使用持久化存储（如 Redis AOF/RDB 持久化，或者数据库存储）。  
     - 应用启动时自动预热缓存（从数据库或 Redis 预加载热点数据到本地缓存）。

### 本地缓存的适用场景
- 只在单个应用实例内部访问的缓存（如进程级别的数据缓存）。  
- 高频小数据（如配置信息、短期计算结果、用户会话信息）。  
- 对数据一致性要求不高，或可通过同步机制（如 Pub/Sub）解决一致性问题。

---

## 分布式缓存（Distributed Cache）
分布式缓存是一种独立部署的缓存服务，与应用进程分离，多个应用实例共享同一份缓存数据，典型实现包括 Redis、Memcached、etcd。

### 优势
1. **支持大规模存储**  
   - 缓存数据分布在多个服务器上，不受单机内存限制，可扩展存储空间。  
   - 例如：Redis Cluster 支持横向扩展，通过分片技术存储 TB 级数据。

2. **数据一致性更高**  
   - 所有应用节点共享同一份缓存数据，不同服务器间的缓存一致性更容易保证。  
   - 例如：所有服务器都访问 Redis，数据变更时只需更新 Redis 即可同步到所有应用实例。

3. **高可用性**  
   - Redis Sentinel 或主从复制方案可提供缓存高可用性，即使某个缓存节点宕机，仍可快速切换到备用节点，避免单点故障。  
   - 持久化机制（AOF/RDB）使 Redis 在服务器重启后仍能恢复数据，保证缓存数据不会丢失。

4. **适用于分布式系统**  
   - 现代应用通常采用多实例部署（如 Kubernetes 微服务架构），本地缓存难以满足数据共享需求，而分布式缓存天然适用于多实例环境。

### 劣势
1. **访问速度比本地缓存慢**  
   - 由于数据需要网络传输，访问延迟比本地缓存高 1~2 个数量级（本地缓存纳秒级，Redis 微秒级）。  
   - **解决方案**：  
     - 使用连接池，减少 TCP 连接开销。  
     - 启用 Redis Pipeline，批量处理请求，减少 RTT（Round Trip Time）。

2. **运维成本高**  
   - 需要部署、管理 Redis/Memcached 集群，涉及节点扩展、故障切换、性能优化。  
   - **解决方案**：  
     - 使用 Redis Cloud（云托管），降低运维成本。  
     - 采用 Kubernetes Operator，自动管理 Redis 集群。

3. **可能存在数据同步延迟**  
   - 在主从复制模式下，主节点的数据同步到从节点存在网络和 CPU 延迟，导致短时间内数据可能不一致。  
   - **解决方案**：  
     - 开启强一致性模式（`WAIT` 命令），保证写操作完成后再返回成功。  
     - 使用分布式事务（如 Redlock 算法），提高一致性。

### 分布式缓存的适用场景
- 多实例应用共享缓存（如微服务架构）。  
- 大规模数据缓存（如海量用户会话、热点文章缓存）。  
- 高可用场景（如 Redis 作为数据库前置缓存，减少数据库压力）。

---

## 多级缓存（Two-Level Cache）
为了兼顾本地缓存的高性能和分布式缓存的数据一致性，可以采用**多级缓存**设计：
- **本地缓存（一级缓存）**：存储热点数据，避免高频访问 Redis，提升访问速度。  
- **分布式缓存（二级缓存）**：作为主缓存存储，确保数据一致性和可扩展性。

### 多级缓存的工作流程
1. **查询本地缓存**  
   - 若命中，直接返回数据（最快）。  
   - 若未命中，继续查询分布式缓存。

2. **查询分布式缓存**  
   - 若命中，更新本地缓存，并返回数据。  
   - 若仍未命中，查询数据库。

3. **查询数据库**  
   - 从数据库获取数据后，更新分布式缓存，同时更新本地缓存，返回数据。

### 多级缓存一致性挑战
- 需要保证本地缓存和分布式缓存的一致性：  
  - **主动失效策略**：数据变更时清除所有缓存。  
  - **异步消息同步**：如 Kafka/Redis Pub/Sub 实现变更通知。  
  - **TTL 机制**：本地缓存设置短 TTL，确保数据不长期失效。

---

## 做完本项目你的收获

- **Go 语言能力**  
  - 掌握 goroutine、channel 等并发编程模型  
  - 理解分段锁、原子操作、无锁优化的工程实践  
  - 熟悉 gRPC 通信、etcd 服务发现、SingleFlight 请求合并  

- **缓存核心机制**  
  - 实现多种淘汰策略（LRU、LFU、ARC），理解各自优缺点  
  - 设计两级缓存（本地 + 分布式），兼顾速度与一致性  
  - 应对缓存穿透、击穿、雪崩三大问题  

- **分布式系统实践**  
  - Raft/一致性哈希保证节点数据分布均衡  
  - etcd 支撑动态节点管理与健康检查  
  - 高并发下的热点 key 防护与缓存预热  

- **工程化与性能优化**  
  - 细粒度锁 + 内存预分配，减少 GC 压力  
  - 日志监控与优雅关闭，确保系统可观测性与稳定性  
  - 命中率、吞吐量、延迟等指标驱动的性能调优  

---

# 2. 项目背景介绍

GoCache 是一个分布式缓存，但也可以直接当作本地缓存使用。它借鉴了开源项目 `groupcache` 的实现思路，在此基础上做了拓展优化：

1. 将单独 LRU 算法改成多种算法插件式选择  
2. 将 HTTP 通信改为 RPC 通信，提高网络通信效率  
3. 细化锁的粒度来提高并发性能  
4. 实现热点互备来避免 hot key 频繁请求网络影响性能  
5. 加入 etcd 进行分布式节点的监测，实现节点的动态管理  
6. 加入缓存过期机制，自动清理超时缓存  

---

## 整体架构

```
┌────────────┐    ┌────────────┐    ┌────────────┐
│  Client    │    │  Client    │    │  Client    │
└─────┬──────┘    └─────┬──────┘    └─────┬──────┘
      │                 │                 │
      │    请求分发     │                 │
      ▼                 ▼                 ▼
┌────────────┐    ┌────────────┐    ┌────────────┐
│ LCache节点 │◄──►│ LCache节点 │◄──►│ LCache节点 │
└─────┬──────┘    └─────┬──────┘    └─────┬──────┘
      │                 │                 │
      └────────┬────────┘────────┬───────┘
               │                 │
               ▼                 ▼
        ┌──────────────┐  ┌─────────────┐
        │  数据源/DB   │  │    etcd     │
        └──────────────┘  └─────────────┘
```

- **Client**：通过 gRPC 与缓存节点通信的客户端  
- **LCache节点**：缓存服务节点，负责存储和管理缓存数据  
- **etcd**：用于服务注册发现和节点协调  
- **数据源/DB**：当缓存未命中时的数据来源  

---

## 核心组件及其关系

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Application                      │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
                ▼                                 ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│         Local Cache           │   │      Distributed Cache        │
│                               │   │                               │
│  ┌───────────────────────┐    │   │  ┌───────────────────────┐    │
│  │                       │    │   │  │                       │    │
│  │        Group          │◄───┼───┼──┤      ClientPicker     │    │
│  │  - name               │    │   │  │  - selfAddr           │    │
│  │  - getter             │    │   │  │  - svcName            │    │
│  │  - mainCache          │◄───┼───┼──┤  - consistentHash     │    │
│  │  - peers              │    │   │  │  - clients            │    │
│  │  - loader             │    │   │  │                       │    │
│  │  - expiration         │    │   │  └───────────┬───────────┘    │
│  │                       │    │   │              │                 │
│  └───────────┬───────────┘    │   │              │                 │
│              │                │   │              ▼                 │
│              ▼                │   │  ┌───────────────────────┐    │
│  ┌───────────────────────┐    │   │  │                       │    │
│  │                       │    │   │  │        Client         │    │
│  │        Cache          │    │   │  │  - addr               │    │
│  │  - store              │    │   │  │  - client             │    │
│  │  - opts               │    │   │  │                       │    │
│  │  - hits/misses        │    │   │  └───────────────────────┘    │
│  │                       │    │   │                               │
│  └───────────┬───────────┘    │   └───────────────────────────────┘
│              │                │
│              ▼                │                    ┌───────────────┐
│  ┌───────────────────────┐    │                    │               │
│  │                       │    │                    │     etcd      │
│  │       ByteView        │    │                    │   Registry    │
│  │  - b []byte           │    │                    │               │
│  │                       │    │                    └───────┬───────┘
│  └───────────────────────┘    │                            │
│                               │                            │
└───────────────────────────────┘                            │
                │                                            │
                ▼                                            ▼
┌───────────────────────────────┐            ┌───────────────────────────┐
│         store Package         │            │          Server           │
│                               │            │  - addr                   │
│  ┌───────────────────────┐    │            │  - svcName                │
│  │                       │    │            │  - groups                 │
│  │         Store         │    │            │  - grpcServer             │
│  │       Interface       │    │            │  - etcdCli                │
│  │                       │    │            │                           │
│  └───────────┬───────────┘    │            └───────────────────────────┘
│              │                │
│              ▼                │             ┌──────────────────────────┐
│  ┌───────────────────────┐    │             │                          │
│  │      Store Impls      │    │             │       Protobuf API       │
│  │  ┌─────────┐ ┌──────┐ │    │             │  - LCacheServer          │
│  │  │  LRU2   │ │  LRU │ │    │             │  - Request/Response      │
│  │  └─────────┘ └──────┘ │    │             │                          │
│  └───────────────────────┘    │             └──────────────────────────┘
│                               │
└───────────────────────────────┘
    ┌───────────────────────────────┐
    │       Helper Components       │
    │                               │
    │  ┌─────────────────────────┐  │
    │  │     consistenthash      │  │
    │  │  - Map                  │  │
    │  │  - LoadBalancing        │  │
    │  └─────────────────────────┘  │
    │                               │
    │  ┌─────────────────────────┐  │
    │  │      singleflight       │  │
    │  │  - Group                │  │
    │  │  - call                 │  │
    │  └─────────────────────────┘  │
    │                               │
    └───────────────────────────────┘
```

---

### 数据存储层

#### ByteView
`ByteView` 是缓存值的不可变视图，用于防止缓存数据被外部修改。

```go
type ByteView struct {
    b []byte  // 存储的实际数据
}

// 返回数据副本，而不是直接返回原始切片
func (b ByteView) ByteSlice() []byte {
    return cloneBytes(b.b)
}
```

#### Store 接口
定义了缓存存储的抽象接口，支持多种缓存实现。

```go
type Store interface {
    Get(key string) (Value, bool)
    Set(key string, value Value) error
    SetWithExpiration(key string, value Value, expiration time.Duration) error
    Delete(key string) bool
    Clear()
    Len() int
    Close()
}
```

#### LRU
传统的 LRU 算法实现，基于标准库 `container/list` 实现双向链表。

```go
type lruCache struct {
    mu              sync.RWMutex
    list            *list.List               // 双向链表，用于维护 LRU 顺序
    items           map[string]*list.Element // 键到链表节点的映射
    expires         map[string]time.Time     // 过期时间映射
    maxBytes        int64                    // 最大允许字节数
    usedBytes       int64                    // 当前使用的字节数
    onEvicted       func(key string, value Value)
    cleanupInterval time.Duration
    cleanupTicker   *time.Ticker
    closeCh         chan struct{}            // 用于优雅关闭清理协程
}
```

#### LRU2
两级 LRU 缓存实现，将数据分散到多个桶中，提高并发性能。

```go
type lru2Store struct {
    locks       []sync.Mutex  // 分段锁
    caches      [][2]*cache   // 两级缓存：[桶索引][级别]
    onEvicted   func(key string, value Value)
    cleanupTick *time.Ticker
    mask        int32         // 哈希掩码，用于快速定位桶
}
```

**主要特点**：
- 分段锁提高并发性能  
- 两级缓存结构，提高缓存命中率  
- 自定义双向链表实现，减少内存分配  
- 高效的哈希函数和桶映射  

---

### 缓存核心层

#### Cache
`Cache` 是底层缓存存储的封装，管理底层存储实现。

```go
type Cache struct {
    mu          sync.RWMutex
    store       store.Store   // 底层存储实现
    opts        CacheOptions  // 缓存配置选项
    hits        int64         // 缓存命中次数
    misses      int64         // 缓存未命中次数
    initialized int32         // 原子变量，标记缓存是否已初始化
    closed      int32         // 原子变量，标记缓存是否已关闭
}
```

#### Group
`Group` 是缓存的命名空间，提供对特定数据集合的缓存管理。

```go
type Group struct {
    name       string
    getter     Getter           // 数据加载接口
    mainCache  *Cache           // 本地缓存
    peers      PeerPicker       // 节点选择器
    loader     *singleflight.Group // 请求合并
    expiration time.Duration    // 缓存过期时间
    closed     int32            // 标记组是否已关闭
    stats      groupStats       // 统计信息
}
```

**核心功能**：
- 缓存未命中时从数据源加载  
- 防止缓存穿透和缓存击穿  
- 支持分布式节点间数据同步  
- 详细的统计信息收集  

---

### 分布式协调层

#### 一致性哈希
基于一致性哈希算法的节点选择实现。

```go
type Map struct {
    mu sync.RWMutex
    config       *Config
    keys         []int          // 哈希环
    hashMap      map[int]string // 哈希环到节点的映射
    nodeReplicas map[string]int // 节点到虚拟节点数量的映射
    nodeCounts   map[string]int64 // 节点负载统计
    totalRequests int64         // 总请求数
}
```

**特点**：
- 支持动态添加/删除节点  
- 自动负载均衡  
- 虚拟节点机制减少数据倾斜  

#### SingleFlight
防止缓存击穿的请求合并机制。

```go
type Group struct {
    m sync.Map // 使用 sync.Map 优化并发性能
}

// 针对相同的 key，保证多次调用 Do() 都只会调用一次 fn
func (g *Group) Do(key string, fn func() (interface{}, error)) (interface{}, error) {
    // ... 实现代码
}
```

**核心思想**：对于同一个 key 的并发请求，只执行一次实际的加载操作，其他请求共享结果。

#### 服务注册与发现
基于 etcd 的服务注册与发现。

---

### 网络通信层

- **gRPC 客户端**  
- **gRPC 服务端**

---

## 设计模式与最佳实践

### 使用的设计模式
- **单例模式**：全局缓存组注册表  
- **工厂方法**：创建不同类型的缓存存储  
- **策略模式**：不同的缓存淘汰算法  
- **代理模式**：客户端代理远程缓存操作  
- **组合模式**：缓存组织结构  

### 性能优化技巧
- **预分配内存**：减少动态内存分配  
- **批量操作**：减少系统调用  
- **分段锁**：减少锁竞争  
- **异步处理**：非关键路径使用异步操作  
- **惰性删除**：标记删除而非立即物理删除  

### 扩展性设计
- **接口抽象**：`Store`、`Getter`、`PeerPicker` 等接口  
- **选项模式**：使用函数选项模式配置组件  
- **中间件思想**：可插拔的组件设计  

---

# 2.1 项目部署和运行

本地缓存一般运行于服务器上，因此需要使用 Linux 系统或 macOS 系统运行本项目。也可使用虚拟机或 Windows 的 WSL 来模拟环境。  
项目依赖于 etcd 作为注册中心，因此需要提前启动 etcd 并设置好端口和地址。为避免复杂性，建议直接用 Docker 启动 etcd。

## 1. 安装

```bash
go get github.com/youngyangyang04/GoCache-Go
```

## 2. 启动 etcd

```bash
# 使用 Docker 启动 etcd
docker run -d --name etcd \
  -p 2379:2379 \
  quay.io/coreos/etcd:v3.5.0 \
  etcd --advertise-client-urls http://0.0.0.0:2379 \
       --listen-client-urls http://0.0.0.0:2379
```

## 3. 运行示例

```go
package main

log.Printf("[节点%s] 启动，地址: %s", *nodeID, addr)

// 创建节点
node, err := lcache.NewServer(addr, "kama-cache",
    lcache.WithEtcdEndpoints([]string{"localhost:2379"}),
    lcache.WithDialTimeout(5*time.Second),
)
if err != nil {
    log.Fatal("创建节点失败:", err)
}

// 创建节点选择器
picker, err := lcache.NewClientPicker(addr)
if err != nil {
    log.Fatal("创建节点选择器失败:", err)
}

// 创建缓存组
group := lcache.NewGroup("test", 2<<20, lcache.GetterFunc(
    func(ctx context.Context, key string) ([]byte, error) {
        log.Printf("[节点%s] 触发数据源加载: key=%s", *nodeID, key)
        return []byte(fmt.Sprintf("节点%s的数据源值", *nodeID)), nil
    }),
)

// 注册节点选择器
group.RegisterPeers(picker)

// 启动节点
go func() {
    log.Printf("[节点%s] 开始启动服务...", *nodeID)
    if err := node.Start(); err != nil {
        log.Fatal("启动节点失败:", err)
    }
}()

// 等待节点注册完成
log.Printf("[节点%s] 等待节点注册...", *nodeID)
time.Sleep(5 * time.Second)

ctx := context.Background()

// 设置本节点的特定键值对
localKey := fmt.Sprintf("key_%s", *nodeID)
localValue := []byte(fmt.Sprintf("这是节点%s的数据", *nodeID))

fmt.Printf("\n=== 节点%s：设置本地数据 ===\n", *nodeID)
err = group.Set(ctx, localKey, localValue)
if err != nil {
    log.Fatal("设置本地数据失败:", err)
}
fmt.Printf("节点%s: 设置键 %s 成功\n", *nodeID, localKey)

// 等待其他节点也完成设置
log.Printf("[节点%s] 等待其他节点准备就绪...", *nodeID)
time.Sleep(30 * time.Second)

// 打印当前已发现的节点
picker.PrintPeers()

// 测试获取本地数据
fmt.Printf("\n=== 节点%s：获取本地数据 ===\n", *nodeID)
fmt.Printf("直接查询本地缓存...\n")

// 打印缓存统计信息
stats := group.Stats()
fmt.Printf("缓存统计: %+v\n", stats)

if val, err := group.Get(ctx, localKey); err == nil {
    fmt.Printf("节点%s: 获取本地键 %s 成功: %s\n", *nodeID, localKey, val.String())
} else {
    fmt.Printf("节点%s: 获取本地键失败: %v\n", *nodeID, err)
}

// 测试获取其他节点的数据
otherKeys := []string{"key_A", "key_B", "key_C"}
for _, key := range otherKeys {
    if key == localKey {
        continue // 跳过本节点的键
    }
    fmt.Printf("\n=== 节点%s：尝试获取远程数据 %s ===\n", *nodeID, key)
    log.Printf("[节点%s] 开始查找键 %s 的远程节点", *nodeID, key)
    if val, err := group.Get(ctx, key); err == nil {
        fmt.Printf("节点%s: 获取远程键 %s 成功: %s\n", *nodeID, key, val.String())
    } else {
        fmt.Printf("节点%s: 获取远程键失败: %v\n", *nodeID, err)
    }
}

// 保持程序运行
select {}
```

### 4. 多节点部署

```bash
# 启动节点 A
go run example/test.go -port 8001 -node A

# 启动节点 B
go run example/test.go -port 8002 -node B

# 启动节点 C
go run example/test.go -port 8003 -node C
```

---

# 3. 缓存组

缓存组是一个命名空间，管理特定类别数据的缓存，提供了数据的获取、设置、删除等基本操作，同时负责缓存未命中时的数据加载和分布式节点间的数据同步。

该模块将缓存、分布式通信和数据加载策略融为一体，通过单飞（`singleflight`）机制防止缓存击穿，通过分布式协议保持数据一致性，通过统计指标监控缓存效率，是整个 LCache 系统的中枢组件。

---

## 核心结构设计

### 全局缓存组管理

```go
var (
    groupsMu sync.RWMutex
    groups   = make(map[string]*Group)
)
```

使用全局映射表管理所有缓存组，通过读写锁保证并发安全：
- `groups`：名称到缓存组的映射  
- `groupsMu`：保护映射的读写锁  

### 数据加载接口

```go
// Getter 加载键值的回调函数接口
type Getter interface {
    Get(ctx context.Context, key string) ([]byte, error)
}

// GetterFunc 函数类型实现 Getter 接口
type GetterFunc func(ctx context.Context, key string) ([]byte, error)

// Get 实现 Getter 接口
func (f GetterFunc) Get(ctx context.Context, key string) ([]byte, error) {
    return f(ctx, key)
}
```

`Getter` 接口定义了缓存未命中时从数据源加载数据的方法：
- 接受上下文和键作为输入  
- 返回字节切片和可能的错误  

### 缓存组结构

```go
// Group 是一个缓存命名空间
type Group struct {
    name       string
    getter     Getter
    mainCache  *Cache
    peers      PeerPicker
    loader     *singleflight.Group
    expiration time.Duration // 缓存过期时间，0表示永不过期
    closed     int32         // 原子变量，标记组是否已关闭
    stats      groupStats    // 统计信息
}

// groupStats 保存组的统计信息
type groupStats struct {
    loads        int64 // 加载次数
    localHits    int64 // 本地缓存命中次数
    localMisses  int64 // 本地缓存未命中次数
    peerHits     int64 // 从对等节点获取成功次数
    peerMisses   int64 // 从对等节点获取失败次数
    loaderHits   int64 // 从加载器获取成功次数
    loaderErrors int64 // 从加载器获取失败次数
    loadDuration int64 // 加载总耗时（纳秒）
}
```

`Group` 结构体是整个缓存系统的核心，包含以下关键字段：
- `name`：缓存组名称，唯一标识  
- `getter`：数据加载回调，缓存未命中时调用  
- `mainCache`：本地缓存实例  
- `peers`：分布式节点选择器  
- `loader`：单飞组，防止缓存击穿  
- `expiration`：缓存过期时间  
- `closed`：组是否已关闭标志  
- `stats`：统计信息  

---

## 核心功能实现

### 数据获取

```go
// Get 从缓存获取数据
func (g *Group) Get(ctx context.Context, key string) (ByteView, error) {
    // 检查组是否已关闭
    if atomic.LoadInt32(&g.closed) == 1 {
        return ByteView{}, ErrGroupClosed
    }

    if key == "" {
        return ByteView{}, ErrKeyRequired
    }

    // 从本地缓存获取
    view, ok := g.mainCache.Get(ctx, key)
    if ok {
        atomic.AddInt64(&g.stats.localHits, 1)
        return view, nil
    }

    atomic.AddInt64(&g.stats.localMisses, 1)

    // 尝试从其他节点获取或加载
    return g.load(ctx, key)
}
```

**数据获取流程**：
1. 状态检查：验证组是否处于活跃状态  
2. 参数验证：确保键不为空  
3. 本地缓存：尝试从本地缓存获取数据  
4. 统计更新：记录本地命中或未命中  
5. 加载数据：缓存未命中时加载数据  

这个流程体现了缓存的基本思想：先查本地，未命中则加载。同时通过原子操作安全地更新统计数据。

### 数据加载

```go
// load 加载数据
func (g *Group) load(ctx context.Context, key string) (value ByteView, err error) {
    // 使用 singleflight 确保并发请求只加载一次
    startTime := time.Now()
    viewi, err := g.loader.Do(key, func() (interface{}, error) {
        return g.loadData(ctx, key)
    })

    // 记录加载时间
    loadDuration := time.Since(startTime).Nanoseconds()
    atomic.AddInt64(&g.stats.loadDuration, loadDuration)
    atomic.AddInt64(&g.stats.loads, 1)

    if err != nil {
        atomic.AddInt64(&g.stats.loaderErrors, 1)
        return ByteView{}, err
    }

    view := viewi.(ByteView)

    // 设置到本地缓存
    if g.expiration > 0 {
        g.mainCache.AddWithExpiration(key, view, time.Now().Add(g.expiration))
    } else {
        g.mainCache.Add(key, view)
    }

    return view, nil
}

// loadData 实际加载数据的方法
func (g *Group) loadData(ctx context.Context, key string) (value ByteView, err error) {
    // 尝试从远程节点获取
    if g.peers != nil {
        peer, ok, isSelf := g.peers.PickPeer(key)
        if ok && !isSelf {
            value, err := g.getFromPeer(ctx, peer, key)
            if err == nil {
                atomic.AddInt64(&g.stats.peerHits, 1)
                return value, nil
            }

            atomic.AddInt64(&g.stats.peerMisses, 1)
            logrus.Warnf("[LCache] failed to get from peer: %v", err)
        }
    }

    // 从数据源加载
    bytes, err := g.getter.Get(ctx, key)
    if err != nil {
        return ByteView{}, fmt.Errorf("failed to get data: %w", err)
    }

    atomic.AddInt64(&g.stats.loaderHits, 1)
    return ByteView{b: cloneBytes(bytes)}, nil
}

// getFromPeer 从其他节点获取数据
func (g *Group) getFromPeer(ctx context.Context, peer Peer, key string) (ByteView, error) {
    bytes, err := peer.Get(g.name, key)
    if err != nil {
        return ByteView{}, fmt.Errorf("failed to get from peer: %w", err)
    }
    return ByteView{b: bytes}, nil
}
```

**数据加载的多层次流程**：
1. **单飞机制**：使用 `singleflight` 防止缓存击穿  
2. **性能监控**：记录加载时间和次数  
3. **分布式查询**：先尝试从其他节点获取  
4. **源数据加载**：如果分布式查询失败，从数据源加载  
5. **结果缓存**：将加载的数据设置到本地缓存  
6. **统计更新**：记录各类加载结果的统计信息  

这个设计充分体现了分布式缓存的优势：利用整个集群的缓存能力，减轻单个节点的负担，同时降低对原始数据源的访问压力。

### 数据设置

```go
// Set 设置缓存值
func (g *Group) Set(ctx context.Context, key string, value []byte) error {
    // 检查组是否已关闭
    if atomic.LoadInt32(&g.closed) == 1 {
        return ErrGroupClosed
    }

    if key == "" {
        return ErrKeyRequired
    }
    if len(value) == 0 {
        return ErrValueRequired
    }

    // 检查是否是从其他节点同步过来的请求
    isPeerRequest := ctx.Value("from_peer") != nil

    // 创建缓存视图
    view := ByteView{b: cloneBytes(value)}

    // 设置到本地缓存
    if g.expiration > 0 {
        g.mainCache.AddWithExpiration(key, view, time.Now().Add(g.expiration))
    } else {
        g.mainCache.Add(key, view)
    }

    // 如果不是从其他节点同步过来的请求，且启用了分布式模式，同步到其他节点
    if !isPeerRequest && g.peers != nil {
        go g.syncToPeers(ctx, "set", key, value)
    }

    return nil
}
```

**数据设置流程**：
1. 状态检查：验证组是否已关闭  
2. 参数验证：确保键和值都有效  
3. 请求来源检查：区分本地请求和远程同步请求  
4. 本地缓存更新：设置到本地缓存  
5. 分布式同步：本地请求时异步同步到其他节点  

请求来源区分很重要，它防止了缓存操作的无限循环传播，确保每个更新只在集群中同步一次。

### 分布式操作同步

```go
// syncToPeers 同步操作到其他节点
func (g *Group) syncToPeers(ctx context.Context, op string, key string, value []byte) {
    if g.peers == nil {
        return
    }

    // 选择对等节点
    peer, ok, isSelf := g.peers.PickPeer(key)
    if !ok || isSelf {
        return
    }

    // 创建同步请求上下文
    syncCtx := context.WithValue(context.Background(), "from_peer", true)

    var err error
    switch op {
    case "set":
        err = peer.Set(syncCtx, g.name, key, value)
    case "delete":
        _, err = peer.Delete(g.name, key)
    }

    if err != nil {
        logrus.Errorf("[LCache] failed to sync %s to peer: %v", op, err)
    }
}
```

**分布式同步的关键流程**：
1. 节点选择：使用一致性哈希选择目标节点  
2. 标记来源：在上下文中标记这是一个同步请求  
3. 操作分发：根据操作类型调用相应的远程方法  
4. 错误处理：记录同步失败的日志  

通过标记同步请求的来源，解决了分布式系统中的环形传播问题，确保每个操作只在集群中传播一次。

---

## 功能特定分析

### 多级缓存架构

GoCache 实现了典型的多级缓存架构：
1. **本地缓存**：最快，但容量有限  
2. **远程节点缓存**：次快，扩大了有效缓存容量  
3. **数据源**：最慢，但提供完整数据  

这种架构类似于 CPU 的缓存层次结构，通过空间换时间的策略提高数据访问速度。当数据在本地缓存中找不到时，会尝试从远程节点获取，进一步降低对原始数据源的访问频率。

### 防止击穿

缓存击穿是指热点数据过期瞬间，大量请求同时涌入数据源的现象。LCache 通过 `singleflight` 机制有效防止了这个问题：

```go
viewi, err := g.loader.Do(key, func() (interface{}, error) {
    return g.loadData(ctx, key)
})
```

`singleflight` 确保对同一个键的并发请求只执行一次加载操作，其他请求等待并共享结果，这样可以：
1. 减轻数据源负担  
2. 避免重复计算  
3. 提高响应速度  
4. 减少资源消耗  

---

# 4. 缓存淘汰与实现

## 最近最少使用（LRU）

### 算法原理
LRU 认为最近使用的数据在未来仍可能被访问，因此它会淘汰最久未被使用的数据。

### 实现方式
1. 使用双向链表维护数据，新插入的数据放在链表头部。  
2. 每次访问数据，将该数据移到链表头部，表示它是最近使用的数据。  
3. 当缓存满时，淘汰链表尾部的数据（即最近最少使用的数据）。  
4. 使用哈希表存储 key 和链表节点的映射，提高访问效率。

### 优缺点
**优点**  
- 充分利用数据的时间局部性，能较好适应大多数缓存场景。  
- 实现相对简单，查询效率高（O(1)）。

**缺点**  
- 在批量操作场景下，可能导致缓存污染，如周期性批量任务可能清空缓存，导致缓存命中率下降。

---

### GoCache 的实现

#### 数据结构设计

```go
type lruCache struct {
    mu              sync.RWMutex           // 读写锁，保证并发安全
    list            *list.List            // 双向链表，用于维护 LRU 顺序
    items           map[string]*list.Element // 键到链表节点的映射
    expires         map[string]time.Time  // 过期时间映射
    maxBytes        int64                 // 最大允许字节数
    usedBytes       int64                 // 当前使用的字节数
    onEvicted       func(key string, value Value) // 淘汰回调
    cleanupInterval time.Duration         // 清理间隔
    cleanupTicker   *time.Ticker          // 定时器
    closeCh         chan struct{}         // 关闭通道
}
```

**关键设计点**：
- 双向链表 + 哈希表：结合 Go 标准库的 `container/list` 和内置 map 实现 O(1) 的查找和更新操作  
- 读写锁：区分读写操作使用 `sync.RWMutex`，提高并发性能  
- 过期时间映射：独立的 `expires` 映射，用于快速判断和管理项目过期  
- 内存追踪：通过 `maxBytes` 和 `usedBytes` 限制和追踪内存使用  
- 资源回收：通过 `onEvicted` 回调在删除缓存项时执行自定义逻辑  
- 自动清理：使用 goroutine 和定时器实现后台自动清理  

#### 获取缓存项

```go
func (c *lruCache) Get(key string) (Value, bool) {
    c.mu.RLock()
    elem, ok := c.items[key]
    if !ok {
        c.mu.RUnlock()
        return nil, false
    }

    // 检查是否过期
    if expTime, hasExp := c.expires[key]; hasExp && time.Now().After(expTime) {
        c.mu.RUnlock()
        // 异步删除过期项，避免在读锁内操作
        go c.Delete(key)
        return nil, false
    }

    // 获取值并释放读锁
    entry := elem.Value.(*lruEntry)
    value := entry.value
    c.mu.RUnlock()

    // 更新 LRU 位置需要写锁
    c.mu.Lock()
    // 再次检查元素是否仍然存在
    if _, ok := c.items[key]; ok {
        c.list.MoveToBack(elem)
    }
    c.mu.Unlock()

    return value, true
}
```

**实现要点**：
1. 先使用读锁检查项目是否存在和过期  
2. 如果过期，异步删除该项（避免在读锁中修改数据）  
3. 使用写锁更新 LRU 顺序（将访问的项移到链表尾部）  
4. 使用二段锁定策略，减少锁的持有时间  

#### 设置缓存项

```go
func (c *lruCache) Set(key string, value Value) error {
    return c.SetWithExpiration(key, value, 0)
}

func (c *lruCache) SetWithExpiration(key string, value Value, expiration time.Duration) error {
    if value == nil {
        c.Delete(key)
        return nil
    }

    c.mu.Lock()
    defer c.mu.Unlock()

    // 计算过期时间
    var expTime time.Time
    if expiration > 0 {
        expTime = time.Now().Add(expiration)
        c.expires[key] = expTime
    } else {
        delete(c.expires, key)
    }

    // 如果键已存在，更新值
    if elem, ok := c.items[key]; ok {
        oldEntry := elem.Value.(*lruEntry)
        c.usedBytes += int64(value.Len() - oldEntry.value.Len())
        oldEntry.value = value
        c.list.MoveToBack(elem)
        return nil
    }

    // 添加新项
    entry := &lruEntry{key: key, value: value}
    elem := c.list.PushBack(entry)
    c.items[key] = elem
    c.usedBytes += int64(len(key) + value.Len())

    // 检查是否需要淘汰旧项
    c.evict()

    return nil
}
```

**实现要点**：
- 支持可选的过期时间设置  
- 对于已存在的项，更新值并调整内存使用计数  
- 添加新项时，更新映射和链表  
- 每次添加后触发 `evict` 检查是否需要淘汰  

#### 淘汰策略

```go
func (c *lruCache) removeElement(elem *list.Element) {
    entry := elem.Value.(*lruEntry)
    c.list.Remove(elem)
    delete(c.items, entry.key)
    delete(c.expires, entry.key)
    c.usedBytes -= int64(len(entry.key) + entry.value.Len())

    if c.onEvicted != nil {
        c.onEvicted(entry.key, entry.value)
    }
}

func (c *lruCache) evict() {
    // 先清理过期项
    now := time.Now()
    for key, expTime := range c.expires {
        if now.After(expTime) {
            if elem, ok := c.items[key]; ok {
                c.removeElement(elem)
            }
        }
    }

    // 再根据内存限制清理最久未使用的项
    for c.maxBytes > 0 && c.usedBytes > c.maxBytes && c.list.Len() > 0 {
        elem := c.list.Front() // 获取最久未使用的项（链表头部）
        if elem != nil {
            c.removeElement(elem)
        }
    }
}
```

**淘汰策略分两步**：
1. 清理所有已过期的项  
2. 如果设置了内存限制，且当前使用的内存超过限制，从链表头部开始淘汰（最久未使用的项）

---

## LRU-K（Least Recently Used K）

### 算法原理
LRU-K 通过维护访问历史，只有当数据被访问 K 次后，才将其放入缓存，以减少缓存污染。

### 实现方式
1. 所有数据首次访问时，进入历史访问队列。  
2. 如果数据访问次数达到 K 次，才放入 LRU 缓存队列。  
3. 当缓存满时，淘汰“倒数第 K 次访问距离当前时间最长的数据”。

### 优缺点
**优点**  
- 减少缓存污染，更适用于数据访问模式复杂的场景。  
**缺点**  
- 需要维护额外的历史访问队列，占用更多内存。

---

## LRU-2（Least Recently Used 2）

### 算法原理
LRU-2 是 LRU-K 算法的特例（K=2），即只有当某个数据被访问至少两次后，才可能被缓存。相比传统 LRU 更能抵抗缓存污染，适用于访问模式中存在临时热点的情况。

### 实现方式
1. 首次访问的数据被记录在历史访问队列（非缓存队列）中。  
2. 当同一数据被第二次访问时，将其移入实际的 LRU 缓存队列。  
3. LRU 缓存队列按最近访问顺序维护，最久未使用的数据靠前。  
4. 缓存满时，淘汰 LRU 缓存队列中最久未访问的数据。

### 优缺点
**优点**  
- 能有效过滤一次性访问数据，减少缓存污染。  
- 相比 LRU-K 更易实现，性能开销较小。  

**缺点**  
- 与 LRU 相比，仍需维护一个额外的历史访问队列。  
- 如果访问频率极低，则可能长时间无法进入缓存，影响命中率。

---

### GoCache 的实现

#### 核心设计理念
- **两级 LRU 策略**：解决传统 LRU 的“缓存污染”问题  
- **分桶并发**：通过水平分片减少锁竞争  
- **内存预分配**：避免运行时内存分配，减少 GC 压力  
- **索引化双向链表**：使用数组索引代替指针，提升缓存局部性  
- **自定义时钟**：减少系统调用，提升时间获取性能  
- **主动+被动过期**：确保过期数据及时清理  

#### 节点结构（node）

```go
type node struct {
    k        string // 键
    v        Value  // 值
    expireAt int64  // 过期时间戳，expireAt = 0 表示已删除
}
```

- 最小化内存占用：只包含必要的三个字段  
- 过期标记复用：使用 `expireAt = 0` 表示节点已删除，避免额外的标记字段  
- 类型抽象：`Value` 是接口类型，支持存储任意类型的值  

#### 缓存结构

```go
type cache struct {
    dlnk [][2]uint16       // 双向链表，0 表示前驱，1 表示后继
    m    []node            // 预分配内存存储节点
    hmap map[string]uint16 // 键到节点索引的映射
    last uint16            // 最后一个节点元素的索引
}
```

1. **索引化双向链表（`dlnk`）**  
   - 不使用传统指针链表，而是用索引数组  
   - `dlnk[i][0]` 存储节点 i 的前驱索引  
   - `dlnk[i][1]` 存储节点 i 的后继索引  
   - `dlnk[0]` 作为哨兵节点，`dlnk[0][0]` 存储尾节点索引，`dlnk[0][1]` 存储头节点索引  

2. **预分配内存池（`m`）**  
   - 启动时预分配固定大小的节点数组  
   - 避免运行时动态分配内存  
   - 通过索引复用节点，减少 GC 压力  

3. **快速查找映射（`hmap`）**  
   - 从键直接映射到节点索引  
   - 实现 O(1) 的查找复杂度  

4. **内存管理（`last`）**  
   - 跟踪已分配的节点数量  
   - 用于判断是否需要驱逐老数据  

**内存布局示例**：
```
dlnk 数组布局:
[0]: [尾索引, 头索引]  // 哨兵节点
[1]: [前驱, 后继]     // 节点1的链表关系
[2]: [前驱, 后继]     // 节点2的链表关系
...

m 数组布局:
[0]: {key1, value1, expireAt1}  // 对应 dlnk[1]
[1]: {key2, value2, expireAt2}  // 对应 dlnk[2]
...
```

#### 主缓存结构

```go
type lru2Store struct {
    locks       []sync.Mutex                    // 每个桶的独立锁
    caches      [][2]*cache                    // 每个桶包含两级缓存
    onEvicted   func(key string, value Value)  // 驱逐回调函数
    cleanupTick *time.Ticker                   // 定期清理定时器
    mask        int32                          // 用于哈希取模的掩码
}
```

1. **分桶并发控制（`locks` + `caches`）**  
   - 将数据分散到多个桶中，每个桶独立加锁  
   - 减少锁竞争，提升并发性能  
   - 桶数量为 2 的幂，便于使用位运算快速定位  

2. **两级缓存架构（`caches[][2]*cache`）**  
   - `caches[i][0]`：第 i 个桶的一级缓存（频次过滤器）  
   - `caches[i][1]`：第 i 个桶的二级缓存（热点数据）  
   - 新数据进入一级缓存，二次访问才进入二级缓存  

3. **事件通知机制（`onEvicted`）**  
   - 当数据被驱逐时触发回调  
   - 支持应用层进行额外的清理操作  

---

## 最少使用频率（LFU）

### 算法原理
LFU 通过统计数据的访问次数来决定淘汰策略，使用次数最少的数据将被淘汰。

### 实现方式
1. 新数据插入缓存时，设置其访问计数为 1，并放入队列。  
2. 每次访问缓存中的数据，该数据的访问计数加 1，并重新调整队列排序，使得访问次数较少的数据靠后。  
3. 当缓存满时，淘汰访问次数最少的数据（即队列末尾数据）。  
4. 为了优化查询速度，可以使用哈希表存储数据，结合优先队列（heap）或平衡二叉搜索树进行访问频率排序。

### 优缺点
**优点**  
- 对高频访问的数据有较好优化，能提升热点数据的命中率。  
- 适用于访问频率稳定的场景，如 AI 训练数据缓存、热点文章推荐系统等。  

**缺点**  
- 实现复杂度较高，需要额外的存储来维护访问频率。  
- 无法应对短期热点数据，如果某个数据短时间内访问次数较多，但随后不再访问，可能会导致缓存污染（Cold Start 问题）。

---

# 5. 缓存并发

当系统面临突发流量时，缓存层可能成为性能瓶颈：

## 缓存击穿（Cache Breakdown）
- **现象**：热点 key 过期瞬间，大量请求穿透缓存直达数据库  
- **后果**：数据库瞬时压力陡增（案例：电商大促期间因秒杀商品 key 失效导致 DB 过载）

## 缓存雪崩（Cache Avalanche）
- **现象**：大量 key 集中过期或缓存集群宕机  
- **后果**：请求洪峰压垮后端系统（案例：社交平台定时批量刷新缓存引发服务中断）

## 缓存穿透（Cache Penetration）
- **现象**：恶意请求不存在的数据（如负向 ID 查询）  
- **后果**：缓存完全失效，持续冲击数据库（案例：金融系统遭恶意爬虫攻击）

---

为了应对突发性的缓存失效导致大量请求直接打到数据库，GoCache 采用了 **SingleFlight** 机制。

## SingleFlight

- **请求折叠**：将并发请求合并为单个实际调用  
- **零等待优化**：首个请求完成后立即释放等待协程  
- **无锁架构**：基于 `sync.Map` 实现无锁并发控制  

### 核心数据结构

```go
type call struct {
    wg  sync.WaitGroup // 协程同步器
    val interface{}    // 执行结果容器
    err error          // 错误信息容器
}

type Group struct {
    m sync.Map // 并发安全存储（key:string → value:*call）
}
```

### 实现

```go
func (g *Group) Do(key string, fn func() (interface{}, error)) (interface{}, error) {
    // 存在性检查（无锁快速路径）
    if existing, ok := g.m.Load(key); ok {
        c := existing.(*call)
        c.wg.Wait() // 等待正在进行的请求
        return c.val, c.err
    }

    // 慢速路径（初始化请求）
    c := new(call)
    c.wg.Add(1)
    g.m.Store(key, c)

    // 执行实际函数
    c.val, c.err = fn()
    c.wg.Done()

    // 异步清理（避免阻塞返回）
    go func() {
        g.m.Delete(key)
    }()

    return c.val, c.err
}
```

**实现要点**：
- **双重检查锁模式**：`Load` 检查 → `Store` 写入，减少锁竞争  
- **异步清理策略**：立即返回结果后清理映射表  
- **零内存分配**：`call` 对象复用（可配合对象池优化）

---

# 6. 分布式算法之一致性哈希

在分布式缓存系统中，**一致性哈希**（Consistent Hashing）是一种常用的负载均衡策略，用于解决缓存节点的动态扩展和缩容问题。它可以减少缓存失效率，提高缓存命中率，从而提高系统的可扩展性和稳定性。

## 为什么需要一致性哈希？
在分布式缓存系统中，多个服务器（缓存节点）存储不同的缓存数据，客户端需要决定将某个 key 存储在哪个缓存节点。最简单的方式是使用**取模（Modulo）分片**：

```go
// 传统哈希分片示例
func getShard(key string, nodeCount int) int {
    hash := crc32.ChecksumIEEE([]byte(key))
    return int(hash) % nodeCount
}
```

### 节点数量变化了怎么办？
这种方式存在以下问题：
- 当节点数量变更时，大量 key 的缓存映射会发生变化，导致缓存命中率大幅下降。  
- 数据迁移成本高，每次增加或删除节点，都需要重新计算所有 key 的存储位置。  

简单求取 Hash 值解决了缓存性能的问题，但是没有考虑节点数量变化的场景。假设移除了其中一台节点，只剩下 9 个，那么之前 `hash(key) % 10` 变成了 `hash(key) % 9`，也就意味着几乎缓存值对应的节点都发生了改变，即几乎所有的缓存值都失效了。节点在接收到对应的请求时，均需要重新去数据源获取数据，容易引起**缓存雪崩**。

一致性哈希算法可以解决这个问题。

---

### 算法原理
一致性哈希使用一个虚拟的哈希环（0~2³²），所有缓存节点和 key 通过哈希函数（如 MurmurHash、FNV-1a）映射到环上的某个位置。

- **节点映射**：将缓存节点的 IP 或名称进行哈希计算，并映射到哈希环上。  
- **数据映射**：将 key 计算哈希值，并找到顺时针方向最近的节点，作为 key 的存储位置。

### 步骤
一致性哈希算法将 key 映射到 2^32 的空间中，将这个数字首尾相连，形成一个环。

1. 计算节点（通常使用节点的名称、编号和 IP 地址）的哈希值，放置在环上。  
2. 计算 key 的哈希值，放置在环上，顺时针寻找到的第一个节点，就是应选取的节点/机器。

![一致性哈希示意图](https://cdn.nlark.com/yuque/0/2025/png/12925030/1742216420294-93d9e2f7-aaa1-4234-bbe7-f1b274b64aaf.png)

环上有 peer2、peer4、peer6 三个节点，key11、key2、key27 均映射到 peer2，key23 映射到 peer4。此时，如果新增节点 peer8，假设它新增位置如图所示，那么只有 key27 从 peer2 调整到 peer8，其余的映射均没有发生改变。

也就是说，一致性哈希算法在新增/删除节点时，只需要重新定位该节点附近的一小部分数据，而不需要重新定位所有的节点。

---

### 数据倾斜问题
如果服务器的节点过少，容易引起 key 的倾斜。例如上面例子中的 peer2、peer4、peer6 分布在环的上半部分，下半部分是空的。那么映射到环下半部分的 key 都会被分配给 peer2，key 过度向 peer2 倾斜，缓存节点间负载不均。

为了解决这个问题，引入了**虚拟节点**的概念，一个真实节点对应多个虚拟节点。

假设 1 个真实节点对应 3 个虚拟节点，那么 peer1 对应的虚拟节点是 peer1-1、peer1-2、peer1-3（通常以添加编号的方式实现），其余节点也以相同的方式操作。

- 第一步，计算虚拟节点的 Hash 值，放置在环上。  
- 第二步，计算 key 的 Hash 值，在环上顺时针寻找到应选取的虚拟节点，例如是 peer2-1，那么就对应真实节点 peer2。

虚拟节点扩充了节点的数量，解决了节点较少的情况下数据容易倾斜的问题，且代价非常小，只需要增加一个字典维护真实节点与虚拟节点的映射关系即可。

---

## GoCache 实现

#### 核心数据结构

```go
type Map struct {
    mu sync.RWMutex           // 读写锁，保证并发安全
    config *Config           // 配置信息
    keys []int               // 哈希环上的所有虚拟节点位置，按顺序排列
    hashMap map[int]string   // 从哈希值到实际节点名称的映射
    nodeReplicas map[string]int // 每个实际节点对应的虚拟节点数量
    nodeCounts map[string]int64 // 记录每个节点处理的请求数
    totalRequests int64       // 记录总请求数，用于负载均衡计算
}
```

- `mu`: 读写互斥锁，允许多个读操作并发执行，写操作独占锁。  
- `config`: 存储配置信息，包含哈希函数、默认虚拟节点数等。  
- `keys`: 有序整数数组，存储所有虚拟节点的哈希位置，按升序排列以便二分查找。  
- `hashMap`: 将哈希环上的位置映射到实际节点名称。  
- `nodeReplicas`: 记录每个实际节点当前拥有的虚拟节点数量，用于负载均衡调整。  
- `nodeCounts`: 统计每个节点处理的请求数量，作为负载均衡的依据。  
- `totalRequests`: 记录总请求数，用于计算平均负载。

#### 节点管理

```go
func (m *Map) Add(nodes ...string) error {
    if len(nodes) == 0 {
        return errors.New("no nodes provided")
    }

    m.mu.Lock()
    defer m.mu.Unlock()

    for _, node := range nodes {
        if node == "" {
            continue
        }

        // 为节点添加虚拟节点
        m.addNode(node, m.config.DefaultReplicas)
    }

    // 重新排序
    sort.Ints(m.keys)
    return nil
}

func (m *Map) addNode(node string, replicas int) {
    for i := 0; i < replicas; i++ {
        hash := int(m.config.HashFunc([]byte(fmt.Sprintf("%s-%d", node, i))))
        m.keys = append(m.keys, hash)
        m.hashMap[hash] = node
    }
    m.nodeReplicas[node] = replicas
}

func (m *Map) Remove(node string) error {
    if node == "" {
        return errors.New("invalid node")
    }

    m.mu.Lock()
    defer m.mu.Unlock()

    replicas := m.nodeReplicas[node]
    if replicas == 0 {
        return fmt.Errorf("node %s not found", node)
    }

    // 移除节点的所有虚拟节点
    for i := 0; i < replicas; i++ {
        hash := int(m.config.HashFunc([]byte(fmt.Sprintf("%s-%d", node, i))))
        delete(m.hashMap, hash)
        for j := 0; j < len(m.keys); j++ {
            if m.keys[j] == hash {
                m.keys = append(m.keys[:j], m.keys[j+1:]...)
                break
            }
        }
    }

    delete(m.nodeReplicas, node)
    delete(m.nodeCounts, node)
    return nil
}
```

#### 请求路由

```go
func (m *Map) Get(key string) string {
    if key == "" {
        return ""
    }

    m.mu.RLock()
    defer m.mu.RUnlock()

    if len(m.keys) == 0 {
        return ""
    }

    hash := int(m.config.HashFunc([]byte(key)))
    // 二分查找
    idx := sort.Search(len(m.keys), func(i int) bool {
        return m.keys[i] >= hash
    })

    // 处理边界情况
    if idx == len(m.keys) {
        idx = 0
    }

    node := m.hashMap[m.keys[idx]]
    count := m.nodeCounts[node]
    m.nodeCounts[node] = count + 1
    atomic.AddInt64(&m.totalRequests, 1)

    return node
}
```

**路由查找的详细过程**：
1. 参数校验：确保键不为空  
2. 加读锁：允许多个查找操作并发进行  
3. 检查哈希环是否为空  
4. 使用相同的哈希函数计算键的哈希值  
5. 使用标准库的 `sort.Search` 进行二分查找，寻找第一个大于或等于该哈希值的位置  
6. 处理特殊情况：如果没有找到大于或等于的位置，表示应该环绕到哈希环的起点  
7. 通过哈希映射获取对应的实际节点名称  
8. 更新请求统计计数（读锁允许修改不影响并发安全的局部变量）  
9. 使用原子操作增加总请求计数  

二分查找保证了查找操作的时间复杂度为 **O(log n)**，其中 n 是虚拟节点的总数。

#### 负载均衡机制

```go
func (m *Map) checkAndRebalance() {
    if atomic.LoadInt64(&m.totalRequests) < 1000 {
        return // 样本太少，不进行调整
    }

    // 计算负载情况
    avgLoad := float64(m.totalRequests) / float64(len(m.nodeReplicas))
    var maxDiff float64

    for _, count := range m.nodeCounts {
        diff := math.Abs(float64(count) - avgLoad)
        if diff/avgLoad > maxDiff {
            maxDiff = diff / avgLoad
        }
    }

    // 如果负载不均衡度超过阈值，调整虚拟节点
    if maxDiff > m.config.LoadBalanceThreshold {
        m.rebalanceNodes()
    }
}

func (m *Map) rebalanceNodes() {
    m.mu.Lock()
    defer m.mu.Unlock()

    avgLoad := float64(m.totalRequests) / float64(len(m.nodeReplicas))

    // 调整每个节点的虚拟节点数量
    for node, count := range m.nodeCounts {
        currentReplicas := m.nodeReplicas[node]
        loadRatio := float64(count) / avgLoad

        var newReplicas int
        if loadRatio > 1 {
            // 负载过高，减少虚拟节点
            newReplicas = int(float64(currentReplicas) / loadRatio)
        } else {
            // 负载过低，增加虚拟节点
            newReplicas = int(float64(currentReplicas) * (2 - loadRatio))
        }

        // 确保在限制范围内
        if newReplicas < m.config.MinReplicas {
            newReplicas = m.config.MinReplicas
        }
        if newReplicas > m.config.MaxReplicas {
            newReplicas = m.config.MaxReplicas
        }

        if newReplicas != currentReplicas {
            // 重新添加节点的虚拟节点
            if err := m.Remove(node); err != nil {
                continue // 如果移除失败，跳过这个节点
            }
            m.addNode(node, newReplicas)
        }
    }

    // 重置计数器
    for node := range m.nodeCounts {
        m.nodeCounts[node] = 0
    }
    atomic.StoreInt64(&m.totalRequests, 0)

    // 重新排序
    sort.Ints(m.keys)
}
```

**负载均衡检查流程**：
1. 检查总请求数是否达到有效样本（1000），避免样本太少导致调整不准确  
2. 计算平均负载：总请求数 ÷ 节点数  
3. 计算最大负载偏差率：找出偏离平均负载最远的节点，计算其偏差占平均负载的比例  
4. 如果最大偏差超过配置的阈值，触发重新平衡操作  

**重新平衡算法**：
- 加写锁：确保在重新平衡期间没有其他操作  
- 重新计算平均负载  
- 遍历每个节点，计算其负载比率（相对于平均负载）  
- 根据负载比率调整虚拟节点数量：  
  - 负载过高（比率>1）：按比例减少虚拟节点  
  - 负载过低（比率<1）：增加虚拟节点，增加幅度为 `(2 - loadRatio)` 倍  
- 确保虚拟节点数量在配置的范围内  
- 先移除该节点所有虚拟节点，再用新的数量重新添加  
- 重置所有计数器，准备下一轮统计  
- 重新排序哈希环  

---

## 一致性哈希是分布式算法吗？
严格来说，一致性哈希本身并不是一个分布式算法，而是一种用于分布式系统的**数据分布策略**。

它的主要作用是在分布式存储或缓存系统中，将数据均匀地映射到不同的节点上，从而减少节点增删时的数据迁移，提高系统的可扩展性和稳定性。

虽然一致性哈希本身并不涉及节点间的通信和协调，但它是许多分布式算法的基础，比如：
- 分布式缓存（Groupcache、Memcached）  
- 分布式存储（Amazon DynamoDB、Cassandra）  
- 负载均衡（Nginx、Consul）  

在分布式系统中，一致性哈希常用于**无中心化**（decentralized）的架构，如 P2P 网络或去中心化存储。

---

### 与 Redis 的不同之处

| 对比项       | GoCache                                     | Redis                                          |
| ------------ | --------------------------------------------- | ---------------------------------------------- |
| 架构类型     | P2P（无中心化）分布式缓存                    | 基于主从的集中式分布式缓存                    |
| 数据存储     | 每个实例都有部分缓存，数据由一致性哈希决定   | 数据存储在独立的 Redis 服务器或 Redis Cluster |
| 节点间通信   | 节点互相发现，通过 Peer-to-Peer 直接访问     | 客户端-服务器模式，需要专门的 Redis 服务器    |
| 数据一致性   | 只缓存数据，依赖于底层数据库保证数据一致性   | 通过主从复制（Replication）保证数据同步       |

#### 一致性哈希的作用
- **Groupcache**：使用一致性哈希决定数据存放在哪个缓存节点。  
- **Redis（单实例）**：直接存储数据，不涉及一致性哈希。  
- **Redis Cluster**：使用哈希槽（Hash Slot）机制，通过 `CRC16(key) % 16384` 计算哈希槽，将 key 分片存储在不同的 Redis 节点上。

---

### 适用于哪些场景？
GoCache 是一个分布式缓存，适用于：
- 无中心化的分布式架构（如微服务、P2P 系统）  
- 高性能读缓存，尤其适用于防止缓存击穿  
- 避免集中式缓存的瓶颈，如单点 Redis 服务器的性能限制  

---

# 7. 缓存对外服务化

每个 GoCache 进程在哈希环中都是其中的一个节点，环中不同节点要互相通信，因此必须对外提供服务。

---

## 服务端模块

服务端模块是缓存系统对外提供服务的核心，负责接收和处理来自其他节点的请求。  
GoCache 使用 **gRPC** 进行节点间的通信，同时集成了服务注册发现、健康检查和安全传输等特性。

### 核心结构设计

```go
// Server 定义缓存服务器
type Server struct {
    pb.UnimplementedLCacheServer
    addr       string           // 服务地址
    svcName    string           // 服务名称
    groups     *sync.Map        // 缓存组
    grpcServer *grpc.Server     // gRPC 服务器
    etcdCli    *clientv3.Client // etcd 客户端
    stopCh     chan error       // 停止信号
    opts       *ServerOptions   // 服务器选项
}
```

`Server` 结构体是服务器模块的核心，包含以下关键字段：
- `UnimplementedLCacheServer`：gRPC 自动生成的基类，提供接口默认实现  
- `addr`：服务监听地址，格式为 `IP:Port`  
- `svcName`：服务名称，用于在服务注册中心标识服务  
- `groups`：本地缓存组映射表，使用 `sync.Map` 保证并发安全  
- `grpcServer`：gRPC 服务器实例  
- `etcdCli`：etcd 客户端，用于服务注册  
- `stopCh`：停止信号通道，用于服务优雅停止  
- `opts`：服务器配置选项  

### 服务创建和生命周期管理

```go
// NewServer 创建新的服务器实例
func NewServer(addr, svcName string, opts ...ServerOption) (*Server, error) {
    options := DefaultServerOptions
    for _, opt := range opts {
        opt(options)
    }

    // 创建 etcd 客户端
    etcdCli, err := clientv3.New(clientv3.Config{
        Endpoints:   options.EtcdEndpoints,
        DialTimeout: options.DialTimeout,
    })
    if err != nil {
        return nil, fmt.Errorf("failed to create etcd client: %v", err)
    }

    // 创建 gRPC 服务器
    var serverOpts []grpc.ServerOption
    serverOpts = append(serverOpts, grpc.MaxRecvMsgSize(options.MaxMsgSize))

    if options.TLS {
        creds, err := loadTLSCredentials(options.CertFile, options.KeyFile)
        if err != nil {
            return nil, fmt.Errorf("failed to load TLS credentials: %v", err)
        }
        serverOpts = append(serverOpts, grpc.Creds(creds))
    }

    srv := &Server{
        addr:       addr,
        svcName:    svcName,
        groups:     &sync.Map{},
        grpcServer: grpc.NewServer(serverOpts...),
        etcdCli:    etcdCli,
        stopCh:     make(chan error),
        opts:       options,
    }

    // 注册服务
    pb.RegisterLCacheServer(srv.grpcServer, srv)

    // 注册健康检查服务
    healthServer := health.NewServer()
    healthpb.RegisterHealthServer(srv.grpcServer, healthServer)
    healthServer.SetServingStatus(svcName, healthpb.HealthCheckResponse_SERVING)

    return srv, nil
}

// Start 启动服务器
func (s *Server) Start() error {
    // 启动 gRPC 服务器
    lis, err := net.Listen("tcp", s.addr)
    if err != nil {
        return fmt.Errorf("failed to listen: %v", err)
    }

    // 注册到 etcd
    stopCh := make(chan error)
    go func() {
        if err := registry.Register(s.svcName, s.addr, stopCh); err != nil {
            logrus.Errorf("failed to register service: %v", err)
            close(stopCh)
            return
        }
    }()

    logrus.Infof("Server starting at %s", s.addr)
    return s.grpcServer.Serve(lis)
}
```

**服务创建流程**：
1. 应用配置选项：合并默认选项和用户提供的选项  
2. 创建 etcd 客户端：用于服务注册  
3. 配置 gRPC 服务器：设置最大消息大小和可选的 TLS 加密  
4. 创建服务器实例：初始化 `Server` 结构体  
5. 注册 gRPC 服务：将缓存服务实现注册到 gRPC 服务器  
6. 添加健康检查服务：支持 gRPC 健康检查协议  

**服务启动过程**：
1. 创建网络监听器：在指定地址上监听 TCP 连接  
2. 服务注册：将服务信息注册到 etcd，使其对其他节点可见  
3. 启动 gRPC 服务：开始处理客户端请求  

服务注册是异步执行的，避免阻塞主服务启动流程。

### 缓存操作接口

```go
// Get 实现 LCache 服务的 Get 方法
func (s *Server) Get(ctx context.Context, req *pb.Request) (*pb.ResponseForGet, error) {
    group := GetGroup(req.Group)
    if group == nil {
        return nil, fmt.Errorf("group %s not found", req.Group)
    }

    view, err := group.Get(ctx, req.Key)
    if err != nil {
        return nil, err
    }

    return &pb.ResponseForGet{Value: view.ByteSlice()}, nil
}

// Set 实现 LCache 服务的 Set 方法
func (s *Server) Set(ctx context.Context, req *pb.Request) (*pb.ResponseForGet, error) {
    group := GetGroup(req.Group)
    if group == nil {
        return nil, fmt.Errorf("group %s not found", req.Group)
    }

    // 从 context 中获取标记，如果没有则创建新的 context
    fromPeer := ctx.Value("from_peer")
    if fromPeer == nil {
        ctx = context.WithValue(ctx, "from_peer", true)
    }

    if err := group.Set(ctx, req.Key, req.Value); err != nil {
        return nil, err
    }

    return &pb.ResponseForGet{Value: req.Value}, nil
}
```

**获取缓存的处理流程**：
1. 查找缓存组：根据请求中的组名找到对应的缓存组  
2. 获取缓存值：调用缓存组的 `Get` 方法获取数据  
3. 构造响应：将获取的数据封装到响应中返回  

**设置缓存的处理流程**：
1. 查找缓存组：根据请求中的组名找到对应的缓存组  
2. 标记来源：在上下文中添加标记，表明请求来自对等节点，避免循环传播  
3. 设置缓存值：调用缓存组的 `Set` 方法存储数据  
4. 构造响应：将原始值封装到响应中返回  

这里的 `from_peer` 标记非常重要，它防止了缓存更新无限传播的问题，是分布式缓存系统中的关键设计。

---

## 节点选择器

采用一致性哈希算法进行节点选择，结合 etcd 实现动态服务发现，是连接客户端和服务端的桥梁。

本模块解决了分布式缓存中的核心问题：
1. 如何在多个缓存节点之间均匀分布数据  
2. 如何动态感知节点的加入和退出  
3. 如何在节点变化时最小化数据迁移  
4. 如何选择合适的节点处理特定的缓存请求  

### 核心接口设计

```go
// PeerPicker 定义了 peer 选择器的接口
type PeerPicker interface {
    PickPeer(key string) (peer Peer, ok bool, self bool)
    Close() error
}
```

`PeerPicker` 是节点选择器的抽象接口，定义了两个核心方法：
- `PickPeer`：根据键选择合适的缓存节点，返回节点实例、是否找到、是否为本地节点  
- `Close`：关闭选择器并释放资源  

这种抽象设计使得节点选择策略可以灵活更换，例如可以实现基于地理位置、负载情况或其他策略的选择器。

```go
// Peer 定义了缓存节点的接口
type Peer interface {
    Get(group string, key string) ([]byte, error)
    Set(ctx context.Context, group string, key string, value []byte) error
    Delete(group string, key string) (bool, error)
    Close() error
}
```

`Peer` 接口定义了缓存节点的基本操作：
- `Get`：获取缓存数据  
- `Set`：设置缓存数据  
- `Delete`：删除缓存数据  
- `Close`：关闭节点连接并释放资源  

该接口是对远程缓存节点操作的抽象，隐藏了底层通信细节，使得上层应用可以用统一的方式操作本地或远程缓存。

```go
// ClientPicker 实现了 PeerPicker 接口
type ClientPicker struct {
    selfAddr string
    svcName  string
    mu       sync.RWMutex
    consHash *consistenthash.Map
    clients  map[string]*Client
    etcdCli  *clientv3.Client
    ctx      context.Context
    cancel   context.CancelFunc
}
```

`ClientPicker` 是 `PeerPicker` 接口的核心实现，包含以下关键字段：
- `selfAddr`：当前节点的地址，用于识别自身  
- `svcName`：服务名称，用于服务发现  
- `mu`：读写互斥锁，保证并发安全  
- `consHash`：一致性哈希实现，用于节点选择  
- `clients`：节点地址到客户端的映射  
- `etcdCli`：etcd 客户端，用于服务发现  
- `ctx` 和 `cancel`：上下文和取消函数，用于控制生命周期  

这种设计将节点选择、客户端管理和服务发现集成在一起，形成一个完整的节点管理解决方案。

### 服务发现与节点管理

```go
// startServiceDiscovery 启动服务发现
func (p *ClientPicker) startServiceDiscovery() error {
    // 先进行全量更新
    if err := p.fetchAllServices(); err != nil {
        return err
    }

    // 启动增量更新
    go p.watchServiceChanges()
    return nil
}
```

**服务发现分为两个阶段**：
1. **全量更新**：获取当前所有可用的服务节点  
2. **增量更新**：监听节点变化并实时更新  

这种设计确保了选择器能够立即获取当前的完整节点列表，并在后续及时感知节点的变化。

### 一致性哈希与节点选择

```go
// PickPeer 选择 peer 节点
func (p *ClientPicker) PickPeer(key string) (Peer, bool, bool) {
    p.mu.RLock()
    defer p.mu.RUnlock()

    if addr := p.consHash.Get(key); addr != "" {
        if client, ok := p.clients[addr]; ok {
            return client, true, addr == p.selfAddr
        }
    }
    return nil, false, false
}
```

**节点选择流程**：
1. 获取读锁，确保并发安全  
2. 使用一致性哈希算法根据键选择地址  
3. 查找对应地址的客户端  
4. 返回客户端、是否找到、是否为本地节点  

这个实现的返回值包括三个部分：
- **客户端实例**：用于进行后续操作  
- **是否找到节点**：表示选择是否成功  
- **是否为本地节点**：区分本地操作和远程操作  

---

# 8. 简历写法

推荐使用 [卡码简历](https://jianli.kamacoder.com/) 制作简历，高效方便。

## 项目：分布式缓存系统 LCache

**项目描述**  
基于 Go 语言实现的高性能分布式缓存系统，支持多种缓存淘汰策略和分布式协调机制。项目设计注重系统的可扩展性、高并发性和容错性，实现了在分布式环境下的高效数据共享和访问。

**个人工作**  
- 实现了 LRU 和 LRU2 缓存淘汰算法，针对不同访问模式优化缓存命中率；  
- 设计实现了自适应一致性哈希算法，支持虚拟节点和动态负载均衡，确保数据均匀分布；  
- 实现了分段锁和两级缓存结构，有效减少锁争用，提升高并发场景下的系统吞吐量；  
- 实现了基于 SingleFlight 的请求合并机制，防止缓存击穿，降低后端服务压力；  
- 基于 etcd 设计实现了服务注册发现模块，支持自动节点管理和健康检查；  
- 实现了基于 gRPC 的高性能节点间通信协议，保证分布式环境下的数据一致性；  
- 设计实现了优雅关闭和资源回收机制，确保系统稳定性和资源释放。

**项目难点**  
1. **分布式一致性保证**：设计并实现节点间数据同步协议，确保在节点增删和网络分区情况下的数据一致性；  
2. **高并发设计**：通过分段锁、原子操作和无锁数据结构，优化高并发下的系统性能；  
3. **缓存穿透和击穿防护**：设计实现请求合并和过期策略，防止缓存失效导致的系统压力；  
4. **动态负载均衡**：实现自适应一致性哈希算法，在保证数据分布均匀的同时支持动态节点管理；  
5. **高效内存管理**：通过预分配内存和双层缓存结构，减少 GC 压力并提高内存利用率。

**个人收获**  
1. 深入理解了分布式系统设计原则和最佳实践，特别是在数据一致性和可用性方面；  
2. 掌握了高并发编程技术，包括细粒度锁设计、原子操作和无锁编程；  
3. 提升了 Go 语言在系统级编程中的应用能力，特别是在协程和通道管理方面；  
4. 学习了各种缓存淘汰策略的实现和优化方法，以及在实际场景中的应用；  
5. 掌握了基于 etcd 的分布式协调技术和服务发现机制；  
6. 增强了对系统性能分析和优化的能力，能够识别瓶颈并进行有针对性的改进。

---

# 9. 常见面试题

#### 1. 什么是缓存？
**答**：缓存，就是数据交换的缓冲区，是一种用于临时存储数据的高效存储机制，其主要目的是加快访问速度、减轻后台系统压力，从而提升整体性能。我们平时说的缓存大多是指内存。目的是把读写速度慢的介质的数据保存在读写速度快的介质中（这里的“快”与“慢”是相对概念），从而提高读写速度，减少时间消耗。例如：

- **CPU 高速缓存**：高速缓存的读写速度远高于内存。CPU 读数据时，如果在高速缓存中找到所需数据，就不需要读内存；写数据时，可先写到高速缓存，再写回内存。  
- **磁盘缓存**：磁盘缓存把常用的磁盘数据保存在内存中，内存读写速度远高于磁盘。读数据时从内存中读取；写数据时，可先写回内存，定时或定量写回到磁盘，或者同步写回。

---

#### 2. 请说说有哪些缓存算法？是否能手写一下 LRU 代码的实现？
**答**：常见的缓存算法包括：
- FIFO（先进先出）  
- LRU（最近最少使用）  
- LFU（最不经常使用）  
- ARC（自适应替换）

**LRU 代码实现**（Go 语言）：

```go
package main

import (
    "container/list"
    "fmt"
)

type CacheNode struct {
    key   int
    value int
}

type LRUCache struct {
    capacity int
    cacheList *list.List          // 双向链表，存储缓存数据
    cacheMap  map[int]*list.Element // 哈希表，存储键和对应在双向链表中的元素指针
}

func NewLRUCache(capacity int) *LRUCache {
    return &LRUCache{
        capacity:  capacity,
        cacheList: list.New(),
        cacheMap:  make(map[int]*list.Element),
    }
}

func (cache *LRUCache) Get(key int) int {
    element, ok := cache.cacheMap[key]
    if !ok {
        return -1 // 未找到
    }
    // 将访问的节点移动到双向链表的头部
    cache.cacheList.MoveToFront(element)
    return element.Value.(*CacheNode).value
}

func (cache *LRUCache) Put(key int, value int) {
    element, ok := cache.cacheMap[key]
    if ok {
        // 如果键已存在，更新值，并移动到双向链表头部
        element.Value.(*CacheNode).value = value
        cache.cacheList.MoveToFront(element)
        return
    }

    if len(cache.cacheMap) == cache.capacity {
        // 如果缓存已满，移除双向链表的尾节点
        back := cache.cacheList.Back()
        if back != nil {
            delete(cache.cacheMap, back.Value.(*CacheNode).key)
            cache.cacheList.Remove(back)
        }
    }

    // 添加新节点到双向链表的头部
    node := &CacheNode{key: key, value: value}
    element = cache.cacheList.PushFront(node)
    cache.cacheMap[key] = element
}

func main() {
    cache := NewLRUCache(2)
    cache.Put(1, 1)
    cache.Put(2, 2)
    fmt.Println(cache.Get(1)) // 返回 1
    cache.Put(3, 3)           // 淘汰键 2
    fmt.Println(cache.Get(2)) // 返回 -1 (未找到)
    cache.Put(4, 4)           // 淘汰键 1
    fmt.Println(cache.Get(1)) // 返回 -1 (未找到)
    fmt.Println(cache.Get(3)) // 返回 3
    fmt.Println(cache.Get(4)) // 返回 4
}
```

---

#### 3. 请简述一下项目整体架构。举个例子说明下数据流转过程。
**答**：核心架构主要由以下几个部分组成：

1. **服务注册与发现（etcd）**：所有缓存节点启动后，会将自己的服务地址注册到 etcd 集群中。同时，每个节点也会监听 etcd 中服务地址的变化，动态维护集群节点列表。  
2. **节点间通信（gRPC）**：节点之间使用 gRPC 进行通信，用于获取、设置和删除远程缓存数据。  
3. **负载均衡（一致性哈希）**：通过一致性哈希算法确定 key 应由哪个节点负责，每个节点维护一个哈希环，实现高效的负载均衡和动态扩缩容。  
4. **缓存管理（Group & Cache）**：`Group` 是缓存的命名空间，对外提供统一的 `Get/Set/Delete` 接口，内部管理本地缓存 `Cache` 实例和对等节点选择器 `PeerPicker`。  
5. **本地缓存存储（Store）**：`Cache` 模块是对底层具体缓存实现的封装，本项目支持 LRU 和 LRU2 两种淘汰策略。  
6. **并发控制（SingleFlight）**：防止缓存击穿，确保对于同一个 key，在同一时刻只有一个请求会去加载数据源，其他请求等待并共享结果。

**数据流转示例**：  
客户端节点 A 发起 `Get("key_B")` 请求，而 `key_B` 的缓存数据实际存储在节点 B 上，流程如下：

1. **请求入口**：节点 A 调用 `group.Get(ctx, "key_B")`。  
2. **本地缓存查询**：`group.Get` 先查询本地缓存 `mainCache`，未命中。  
3. **选择对等节点**：调用 `peers.PickPeer("key_B")`，通过一致性哈希确定应由节点 B 负责，返回节点 B 的 gRPC 客户端。  
4. **远程 gRPC 调用**：节点 A 向节点 B 发起 `Get` RPC 调用，包含 group 名称和 key。  
5. **远程节点处理**：节点 B 的 gRPC 服务器收到请求，通过 `GetGroup` 找到对应 `Group`，调用 `group.Get(ctx, "key_B")`，本地缓存命中，返回数据。  
6. **返回结果**：节点 A 收到响应，将数据封装为 `ByteView`，并写入本地缓存（提高后续访问速度），最终返回给调用方。

---

#### 4. 项目中为什么选择使用一致性哈希？它相比普通的哈希取模方式有什么优势？
**答**：在分布式缓存中，需要决定某个 key 应该存储在哪个节点上。

- **普通哈希取模 `hash(key) % N`** 的问题：非常简单，但扩展性差。当节点数量 N 发生变化时，几乎所有 key 的映射结果都会改变，导致大量缓存失效，引发**缓存雪崩**，对数据库造成巨大压力。

- **一致性哈希的优势**：
  - 将节点和 key 都映射到同一个哈希环上，key 顺时针找到的第一个节点即为负责节点。
  - 当节点增加或删除时，只影响该节点在环上与前一节点之间的那部分 key 的归属，其他 key 的映射关系保持不变。
  - 大大降低了节点变动对整体缓存系统的影响，保证了系统的稳定性和高可用性。

---

#### 5. 你对一致性哈希的实现有什么优化么？
**答**：主要有两个优化：

**优化一：虚拟节点**  
- **问题**：物理节点较少时，在环上分布可能不均匀，导致数据倾斜和负载不均。  
- **解决方案**：为每个物理节点创建多个虚拟节点（如 `A-1, A-2, ..., A-k`），分别映射到环上。key 先找到虚拟节点，再映射回物理节点。  
- **项目实现**：在 `addNode` 方法中，通过循环 `replicas` 次（默认 50）为每个节点生成多个哈希值，大幅提高分布均匀性。

**优化二：动态负载均衡**  
- **问题**：长时间运行后，由于 key 分布或热点数据，仍可能出现负载不均。  
- **解决方案**：监控每个节点的请求量，根据实际负载动态调整其虚拟节点数量。  
- **项目实现**：  
  1. **负载统计**：`Get` 方法返回节点前，原子增加该节点的请求计数和总请求数。  
  2. **定时检查**：`startBalancer` 定时调用 `checkAndRebalance`。  
  3. **均衡判断**：计算平均负载，若某节点负载偏差超过阈值，触发再均衡。  
  4. **动态调整**：负载过高则按比例减少虚拟节点，负载过低则按比例增加虚拟节点，并限制在配置范围内。  
  5. **更新环**：通过 `Remove` 和 `addNode` 更新节点在哈希环上的虚拟节点。

这种自适应的动态负载均衡机制，使系统能更好地应对热点数据和不均匀的请求分布。

---

#### 6. 请解释一下缓存穿透、缓存击穿和缓存雪崩，你在项目中是如何应对这些问题的？
**答**：

**1. 缓存穿透**  
- **定义**：查询一个绝对不存在的数据。由于缓存中无此数据（缓存的是已存在的数据），请求会直接打到后端数据库。恶意攻击者可利用大量不存在的 key 造成数据库压力。  
- **GoCache 的应对**：  
  - 当前实现未直接处理，当 `getter` 返回错误时直接返回给调用方。  
  - **改进方案（面试时可提）**：  
    1. **缓存空值**：数据库查不到时，在缓存中存储一个特殊空值，并设置较短过期时间，后续查询直接命中空值，不再访问数据库。  
    2. **布隆过滤器**：访问缓存前先用布隆过滤器快速判断 key 是否存在，若不存在则直接返回，避免对缓存和数据库的查询。

**2. 缓存击穿**  
- **定义**：热点 key 在过期瞬间，大量并发请求同时访问该 key，缓存未命中，所有请求穿透到数据库，导致数据库压力剧增。  
- **GoCache 的应对**：  
  - **核心机制**：`SingleFlight`。  
  - **实现分析**：在 `group.load` 方法中，所有数据加载逻辑都被包裹在 `g.loader.Do()` 中。`singleflight.Group` 保证对于同一个 key，只有一个请求执行实际的加载操作，其他请求等待并共享结果。  
  - **效果**：即使成千上万个请求同时访问一个刚过期的热点 key，最终也只有一个请求去执行 `loadData`，有效防止数据库被冲击。

**3. 缓存雪崩**  
- **定义**：某一瞬间大量 key 同时过期，或缓存服务自身宕机，导致海量请求涌向数据库，造成数据库崩溃。  
- **GoCache 的应对**：  
  - **针对大量 key 同时过期**：  
    - 现有机制：`WithExpiration` 可为 `Group` 内的所有 key 设置统一过期时间，可在设置时引入随机扰动（Jitter），避免集中失效。  
  - **针对缓存服务宕机**：  
    - **高可用架构**：GoCache 是分布式系统，单个节点宕机不会导致整个缓存服务不可用。  
    - **一致性哈希**：宕机节点从 etcd 租约过期被移除后，只有该节点负责的 key 会失效并重新映射到其他节点，其他节点缓存不受影响，大大降低了单点故障的影响范围。

---

#### 7. `singleflight` 的实现中为什么使用 `sync.Map` 而不是 `map + sync.RWMutex`？它们的适用场景有什么不同？
**答**：

- **`map + sync.RWMutex`**：  
  - **工作方式**：一个互斥锁（或读写锁）保护原生 map，所有读写操作必须先获取锁。  
  - **性能**：并发竞争激烈时，锁会成为瓶颈。写锁会阻塞所有其他读锁和写锁，导致 goroutine 串行执行。  
  - **适用场景**：写多读少或读写均衡，以及对 map 有复杂操作（如遍历、取长度）的场景。

- **`sync.Map`**：  
  - **工作方式**：内部优化为两个 map——`read map`（原子操作访问）和 `dirty map`（加锁访问）。读操作优先无锁从 `read map` 读取，写操作加锁写入 `dirty map`，删除通过标记懒删除。  
  - **性能**：在“读多写少”且“key 相对稳定”的场景下性能极高，大部分读操作是无锁的原子操作。  
  - **适用场景**：官方定义为“读多写少”和“多个 goroutine 并发读写一个固定的、很少变更的 key 集合”。

**在 `singleflight` 中的选择**：  
- `Do` 方法中，一个 key 的生命周期是：`Store`（第一个请求到来）→ 若干次 `Load`（后续请求）→ `Delete`（fn 执行完毕）。  
- 当第一个 goroutine 正在执行 fn 时，可能有大量并发请求来 `Load` 同一个 key。此时 `sync.Map` 的无锁读取优势明显，允许多个 goroutine 同时高效获取等待对象；而 `map+RWMutex` 虽然可并发读，但仍有锁开销，且可能被其他 key 的写操作短暂阻塞。  
- 因此 `sync.Map` 更适合此场景。

---

#### 8. 请简述 LRU 算法的原理，你这里的 LRU2 相比普通 LRU 有什么优势？
**答**：

**1. LRU**  
- **原理**：最近最少使用，认为最近访问过的数据将来被访问的概率更高。  
- **实现**：哈希表 + 双向链表。哈希表 O(1) 查找，链表维护访问顺序，头部为最近使用，尾部为最近最少使用。  
- **操作**：  
  - `Get`：将节点移动到链表头部。  
  - `Set`：新节点插入头部，若缓存满则淘汰尾部节点。

**2. LRU2（GoCache 实现）**  
- **设计思想**：  
  - **分桶/分段**：通过哈希分桶降低锁粒度，提高并发性能。  
  - **两级缓存（L1/L2）**：  
    - 新数据先放入一级缓存（L1）。  
    - 数据在 L1 被 `Get` 时，晋升到二级缓存（L2）。  
    - L2 是真正的 LRU 缓存，淘汰策略为常规 LRU。  
- **相比普通 LRU 的优势**：  
  - **更高并发**：分桶机制显著减少锁冲突，提升吞吐量。  
  - **更强抗污染能力**：只有被访问至少两次的数据才会进入 L2，偶然的、单次访问的冷数据只在 L1 短暂停留，不会污染热点数据所在的 L2，使缓存命中率更稳定高效。

---

#### 9. 使用 etcd 做服务注册时有租约机制，请解释一下租约的作用是什么？如果某个缓存节点突然宕机，整个集群是如何感知到这个变化并调整工作状态的？
**答**：

**1. 租约（Lease）的作用**  
- 租约是 etcd 提供的一种有时效性的契约。服务实例启动时创建一个租约，指定 TTL，并将注册的 K-V 数据与租约绑定。  
- 服务实例通过 `KeepAlive` 定期为租约续期。只要实例存活且网络正常，租约就不会过期。  
- **核心作用**：将服务实例的存活状态与其在 etcd 中注册的数据的生命周期绑定。若实例宕机或网络中断，无法续约，租约过期后 etcd 会自动删除该租约及绑定的 K-V 数据，实现自动的故障检测与清理。

**2. 节点宕机后的感知与调整流程**  
1. **节点宕机**：节点 C 崩溃，无法为租约续期。  
2. **租约过期**：等待一个租约周期后，租约过期。  
3. **etcd 自动删除 Key**：etcd 检测到租约过期，删除与该租约绑定的键。  
4. **其他节点感知变化（Watch机制）**：  
   - 其他健康节点（如 A、B）通过 `Watch` 监听 `/services/kama-cache` 目录，收到 `EventTypeDelete` 事件。  
5. **集群状态调整**：  
   - 节点 A、B 从自己的对等节点列表和一致性哈希环中移除节点 C 的地址及对应客户端。  
6. **负载重新分配**：  
   - 后续请求中，原先应由节点 C 负责的 key，在哈希环上会自动顺时针找到下一个可用节点，负载平滑转移到其他节点，系统继续对外服务。

---

#### 10. 项目选择了 gRPC 作为节点间的通信协议，相比于更常见的 RESTful API，gRPC 和 Protobuf 有哪些优势？
**答**：

- **性能优势**：  
  - **传输协议**：gRPC 基于 HTTP/2，支持多路复用（Multiplexing），单个 TCP 连接可并行处理多个请求和响应，减少连接开销，解决 HTTP/1.1 的队头阻塞问题。  
  - **序列化**：默认使用 Protocol Buffers（Protobuf），二进制格式，体积小、编解码速度快，显著降低网络带宽消耗和 CPU 使用率。

- **服务定义与契约**：  
  - 使用 `.proto` 文件严格定义服务接口、方法和消息体，作为服务提供方与消费方的“契约”。  
  - 通过 `protoc` 编译器自动生成多语言的客户端存根和服务端骨架代码，保证接口一致性，减少联调成本。

- **高级特性**：  
  - gRPC 原生支持四种通信模式：一元 RPC、服务端流、客户端流、双向流，为复杂业务场景提供更多可能。

---

#### 11. 缓存的并发安全需要锁或原子操作来保证，解释一下互斥锁（Mutex）和原子操作（Atomic）的区别，以及它们各自的适用场景。
**答**：

- **互斥锁（Mutex / RWMutex）**：  
  - **机制**：高层次的并发原语，通过操作系统锁机制保证同一时刻只有一个 goroutine 进入临界区。RWMutex 允许多个读并发，写操作完全排他。  
  - **开销**：锁操作通常涉及内核态与用户态切换，高并发竞争时开销较大。  
  - **适用场景**：保护复杂数据结构（如 map、slice、struct 多个字段）或需要执行多步复合操作的场景。

- **原子操作（Atomic）**：  
  - **机制**：低层次、无锁的并发原语，由 CPU 硬件指令直接支持，保证对单个“机器字”（如 int32、int64、pointer）的操作是原子性的。  
  - **开销**：比互斥锁快得多，不涉及操作系统锁。  
  - **适用场景**：仅适用于对单个变量进行简单的、独立的读、写、增减等操作。

**GoCache 中的使用**：  
- `mu` 主要保护 `c.store`，即底层缓存实现（LRU 或 LRU2），这些实现包含复杂数据结构（map、list），必须使用互斥锁保证复合操作的完整性。  
- 对简单的状态标志和计数器（如 `closed`、`loads`、`hits`）则采用原子操作，以获得更高性能。

---

#### 12. 谈谈你对 CAP 理论的理解，etcd 是如何做取舍的？
**答**：  
CAP 理论是分布式系统设计的基石，指出一个分布式系统无法同时满足以下三个核心需求，最多满足其中两个：

- **C - 一致性**：所有节点在同一时刻看到的数据完全一致。  
- **A - 可用性**：任何来自客户端的请求，集群中的每个节点都能在有限时间内给出响应（不保证数据最新）。  
- **P - 分区容错性**：当网络发生故障（网络分区）时，系统仍能继续运行。

在分布式系统中，网络故障是常态，因此 **P** 是必须保证的，实际选择是在 **C** 和 **A** 之间权衡。

**etcd 的选择**：**CP**（放弃可用性，保证一致性）。  
etcd 作为服务发现和配置中心，数据的正确性和一致性是核心使命。在网络分区发生时，etcd 宁愿暂时无法写入，也要保证所有节点间的强一致性，避免出现数据歧义（例如对“谁是主节点”的认知不一致）。

---

#### 13. etcd 如何保证的一致性？介绍下它使用的协议。
**答**：  
etcd 使用 **Raft 算法**作为一致性协议。Raft 是一种易于理解和实现的共识算法，用于管理复制日志（replicated log），确保集群中所有节点对日志内容和顺序达成一致。

**Raft 的核心子问题**：
1. **领导者选举**（Leader Election）  
2. **日志复制**（Log Replication）  
3. **安全性**（Safety）

**工作流程简述**：

- **角色**：Raft 集群中的节点有三种角色——**Leader**（领导者）、**Follower**（跟随者）、**Candidate**（候选人）。  
- **领导者选举**：  
  - 启动时所有节点为 Follower，每个 Follower 拥有随机的选举计时器。  
  - 计时器超时未收到 Leader 心跳，Follower 转变为 Candidate，增加任期号并向其他节点请求投票。  
  - 获得超过半数投票的 Candidate 成为新的 Leader。  
- **日志复制**（正常工作状态）：  
  - 所有写请求由 Leader 处理，Leader 将请求作为新日志条目附加到自己的日志中。  
  - Leader 并行向所有 Follower 发送 `AppendEntries` RPC，要求复制该日志条目。  
  - 当 Leader 收到超过半数 Follower 成功复制的响应后，该日志条目被标记为“已提交”，Leader 将操作应用到状态机，并向客户端返回成功。  
- **安全性**：Raft 通过选举限制、日志匹配等规则，保证已提交的日志条目永远不会被覆盖或删除，确保数据一致性。
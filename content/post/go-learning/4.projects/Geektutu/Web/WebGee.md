---
title: "从零实现 Web 框架 (Gee)"
date: 2026-03-05T21:00:00+08:00
draft: false
tags: ["Go", "Web", "Gee", "框架开发"]
categories: ["Golang 学习笔记"]
description: "用 Go 从零实现 Web 框架 Gee 教程的学习笔记。"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260305211932326.png"
---
## 前情提要

本项目为2026年学习[7部分用Go从零实现Web框架Gee教程 | 极客兔兔](https://geektutu.com/post/gee.html)的学习笔记。

在写代码之前，我们需要先去vscode上安装插件**REST Client**（作者：Huachao Mao）。

1. 打开 VS Code，按 Ctrl+Shift+X（或点击左侧扩展图标）。

2. 搜索 **REST Client**（作者：Huachao Mao）。

3. 点击 **安装**（免费，无需额外配置）。

4. 创建一个名为`api.http`的文件

   - 示例：GET https://api.mossia.top/duckMo HTTP/1.1

5. 按Ctrl + Alt + R或者在请求行上方会出现蓝色 Send Request 按钮发送信息



## Http基础

### 功能需求分析

首先需要明确我们现在需要完成的任务是什么？我们应该实现如下的一个基础的main功能

```go
package main

import (
	"elari/elaina"
	"fmt"
	"net/http"
)

func main() {
	e := elaina.New()
	{
		e.GET("/", index)
		e.POST("/", post)
	}
	e.Run(":8080")
}
func index(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "hello elaina")
}
func post(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "hello post")
}
```

### 功能设计与实现

我们需要实现如下三个功能：

1. 创建构造函数New

2. 创建基础的方法，传入路径和处理函数

3. 创建启动端口的函数

首先先对原始的`func(w http.ResponseWriter, r *http.Request)`进行封装，将其转换为`type HandleFunc func(w http.ResponseWriter, r *http.Request)`

然后构建一个结构体`Elaina`，其中包含一个路由表`router`，用于存储路径和处理函数的映射关系。

创建一个New方法，返回一个指向`Elaina`结构体的指针。

到这里我们完成了第一个功能，即创建构造函数New。

---

实现第二个功能，我们可以先创建一个addRoute方法，用于将路径和处理函数添加到路由表中，并分别处理不同的GET和POST等请求，将其封装为`func (e *Elaina) addRoute(method, path string, handler HandleFunc)`，将请求方法和路径映射到处理函数。

然后创建GET和POST方法，分别用于添加GET和POST请求的路由，将其封装为`func (e *Elaina) GET(path string, handler HandleFunc)`和`func (e *Elaina) POST(path string, handler HandleFunc)`。

到这里我们完成了第二个功能，即创建基础的方法，传入路径和处理函数。

---

实现第三个功能，我们可以创建一个Run方法，用于启动Web服务器，将原始的`http.ListenAndServe`封装为`func (e *Elaina) Run(addr string) error`。

到这里我们完成了第三个功能，即创建启动端口的函数。


```go
package elaina
import (
	"fmt"
	"net/http"
)
// HandleFunc 是处理 HTTP 请求的函数类型
// 它与 http.HandlerFunc 拥有相同的函数签名，方便框架内部统一使用
type HandleFunc func(w http.ResponseWriter, r *http.Request)
// Elaina 是我们自己实现的极简 Web 框架核心结构体
// 它实现了 http.Handler 接口，因此可以直接传给 http.ListenAndServe
type Elaina struct {
	// router 是路由表：key = "METHOD-PATH"（例如 "GET-/users"），value = 处理函数
	// 使用 map 实现 O(1) 查找，非常简单高效（教学级实现）
	router map[string]HandleFunc
}
// New 创建一个新的 Elaina 实例并初始化路由表
func New() *Elaina {
	return &Elaina{
		router: make(map[string]HandleFunc),
	}
}
// addRoute 是底层添加路由的方法
// method: "GET"、"POST" 等，path: "/users"，handler: 处理函数
func (e *Elaina) addRoute(method, path string, handler HandleFunc) {
	key := method + "-" + path
	e.router[key] = handler
}
// GET 注册 GET 请求路由（语法糖）
func (e *Elaina) GET(path string, handler HandleFunc) {
	e.addRoute("GET", path, handler)
}
// POST 注册 POST 请求路由（语法糖）
func (e *Elaina) POST(path string, handler HandleFunc) {
	e.addRoute("POST", path, handler)
}
// ServeHTTP 实现 http.Handler 接口的核心方法
// 这是框架的“心脏”：每来一个请求都会调用它
func (e *Elaina) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 构造路由 key，例如 "GET-/api/users"
	key := r.Method + "-" + r.URL.Path
	// 从路由表查找
	handler, ok := e.router[key]
	if !ok {
		// 没找到路由 → 返回 404
		http.Error(w, "404 not found", http.StatusNotFound)
		return
	}
	// 执行对应的处理函数
	handler(w, r)
}
// Run 启动 HTTP 服务器，监听指定地址
// 本质上是调用 http.ListenAndServe(addr, e)，把 Elaina 自己当作 Handler
func (e *Elaina) Run(addr string) error {
	fmt.Printf("🚀 Elaina 服务器启动成功，监听地址: %s\n", addr)
	return http.ListenAndServe(addr, e)
}
```

### 测试功能

创建`api.http`文件，用于测试我们的路由功能。

```http
GET http://127.0.0.1:8080/ HTTP/1.1
```

```http
# GET http://127.0.0.1:8080/ HTTP/1.1
HTTP/1.1 200 OK
Date: Thu, 05 Mar 2026 08:28:40 GMT
Content-Length: 12
Content-Type: text/plain; charset=utf-8
Connection: close

hello elaina
```

```http
POST http://127.0.0.1:8080/ HTTP/1.1
```

```http
# POST http://127.0.0.1:8080/ HTTP/1.1
HTTP/1.1 200 OK
Date: Thu, 05 Mar 2026 08:29:08 GMT
Content-Length: 10
Content-Type: text/plain; charset=utf-8
Connection: close

hello post
```

### Go 1.22新写法

上面的代码是不支持`/users/{id}`这种写法的，但从 **Go 1.22** 开始，官方 net/http 的 ServeMux 进行了**重大增强**（这也是目前最新的路由能力，Go 1.23~1.26 继续完善），现在官方路由已经能直接支持：

- 方法前缀："GET /users"

- 路径参数："/users/{id}"（支持 {name} 和 {name...} 通配符）

- 通过 r.PathValue("id") 取参数

- 更智能的匹配优先级

```go
// Elaina.go（现代化版本）
type Elaina struct {
	*http.ServeMux  // 直接嵌入官方最新 mux
}

func New() *Elaina {
	return &Elaina{ServeMux: http.NewServeMux()}
}

// 取消 addRoute 这种方法，因为现在官方的 ServeMux 已经支持路径参数，所以不需要再额外封装 addRoute 了

// GET / POST 现在支持路径参数！
func (e *Elaina) GET(path string, handler HandleFunc) {
	e.HandleFunc("GET "+path, handler)
}

func (e *Elaina) POST(path string, handler HandleFunc) {
	e.HandleFunc("POST "+path, handler)
}

// Run 不变
func (e *Elaina) Run(addr string) error {
	fmt.Printf("🚀 Elaina (基于 Go 1.26 ServeMux) 启动: %s\n", addr)
	return http.ListenAndServe(addr, e.ServeMux)
}
```

相比于文档的使用方式完全不变，但现在支持 `/users/{id}`了！

```go
e.GET("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")  // 官方新方法
    // ...
})
```

## 上下文Context

### 上下文Context的设计

接下来我们将实现下面的两个功能：

- 将`路由(router)`独立出来，方便之后增强。

- 设计`上下文(Context)`，封装 Request 和 Response ，提供对 JSON、HTML 等返回类型的支持。

需要实现的最终效果如下：

```go
package main

import (
	"elari/elaina"
)

func main() {
	r := elaina.New()
	// GET http://127.0.0.1:8080/ HTTP/1.1
	r.GET("/", indexHandler)
	// GET http://127.0.0.1:8080/hello?name=majotabi HTTP/1.1
	r.GET("/hello", helloHandler)
	// POST http://127.0.0.1:8080/login?username=majotabi&password=612866 HTTP/1.1
	r.POST("/login", loginHandler)
	r.Run(":8080")
}

// indexHandler 是处理索引请求的处理函数
func indexHandler(c *elaina.Context) {
	c.HTML(200, "<h1>Hello Elaina</h1>")
}

// loginHandler 是处理登录请求的处理函数
func loginHandler(c *elaina.Context) {
	c.JSON(200, elaina.H{
		"username": c.PostForm("username"),
		"password": c.PostForm("password"),
	})
}

// helloHandler 是处理hello请求的处理函数
func helloHandler(c *elaina.Context) {
	// expect /hello?name=geektutu
	c.String(200, "hello %s, you're at %s\n", c.Query("name"), c.Path)
}
```

- `HandlerFunc` 的参数变成了 `*elaina.Context`，提供了查询 Query/PostForm 参数的功能。
- `elaina.Context`封装了`HTML/String/JSON`函数，能够快速构造HTTP响应。

### 设计Context

引用文档的话:

- 对Web服务来说，无非是根据请求`*http.Request`，构造响应`http.ResponseWriter`。但是这两个对象提供的接口粒度太细，比如我们要构造一个完整的响应，需要考虑消息头(Header)和消息体(Body)，而 Header 包含了状态码(StatusCode)，消息类型(ContentType)等几乎每次请求都需要设置的信息。因此，如果不进行有效的封装，那么框架的用户将需要写大量重复，繁杂的代码，而且容易出错。针对常用场景，能够高效地构造出 HTTP 响应是一个好的框架必须考虑的点。

- 针对使用场景，封装`*http.Request`和`http.ResponseWriter`的方法，简化相关接口的调用，只是设计 Context 的原因之一。对于框架来说，还需要支撑额外的功能。例如，将来解析动态路由`/hello/:name`，参数`:name`的值放在哪呢？再比如，框架需要支持中间件，那中间件产生的信息放在哪呢？Context 随着每一个请求的出现而产生，请求的结束而销毁，和当前请求强相关的信息都应由 Context 承载。因此，设计 Context 结构，扩展性和复杂性留在了内部，而对外简化了接口。路由的处理函数，以及将要实现的中间件，参数都统一使用 Context 实例， Context 就像一次会话的百宝箱，可以找到任何东西。

翻译一下就是将 `*http.Request` 和 `http.ResponseWriter` 封装到一个结构体中，提供了一些方便的方法，比如 `Query`、`PostForm`、`JSON`、`HTML`、`String` 等，也便于后续扩展 `Param`、`Middleware` 等功能。

把所有“和本次请求强相关”的东西都塞进 Context，让它成为一次 HTTP 请求的百宝箱。这样：

- 对外接口超级简洁（用户只需操作 c 一个对象）

- 对内扩展性极强（以后加再多功能都不用改用户代码）

如下所示：

- 封装前

```go
obj = map[string]interface{}{
    "name": "geektutu",
    "password": "1234",
}
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusOK)
encoder := json.NewEncoder(w)
if err := encoder.Encode(obj); err != nil {
    http.Error(w, err.Error(), 500)
}
```

- 封装后：

```go
c.JSON(http.StatusOK, elaina.H{
    "username": c.PostForm("username"),
    "password": c.PostForm("password"),
})
```

### 实现Context

首先，我们需要定义 Context 结构体，如下所示：
```go
type Context struct {
	// 原始的 ResponseWriter 和 Request
	Writer http.ResponseWriter
	Req    *http.Request
	// 请求路径和方法
	Path   string
	Method string
	// 响应状态码
	StatusCode int
}
```

上面的代码定义了 Context 结构体，包含了原始的 ResponseWriter 和 Request，以及请求路径和方法，以及响应状态码。可以实现如下功能：

- 封装 Request 和 Response ，提供对 JSON、HTML 等返回类型的支持。

- 提供查询 Query/PostForm 参数的功能。

- 提供设置响应状态码的功能。

其次，设置一个快捷的类型 `H`，用于存储 JSON 数据。

```go
type H map[string]any // H 是一个快捷类型，用于构造 JSON 数据
```

在定义 JSON 方法时，需要先设置响应头中的 `Content-Type` 为 `application/json`，最后使用 `json.NewEncoder` 编码数据。

完整的`context.go`代码如下：

```go
package elaina

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type H map[string]any // H 是一个快捷类型，用于构造 JSON 数据

type Context struct {
	// 中文注释
	// 原始的 ResponseWriter 和 Request
	Writer http.ResponseWriter
	Req    *http.Request
	// 请求路径和方法
	Path   string
	Method string
	// 响应状态码
	StatusCode int
}

// newContext 创建一个新的上下文实例
func newContext(w http.ResponseWriter, req *http.Request) *Context {
	return &Context{
		Writer: w,
		Req:    req,
		Path:   req.URL.Path,
		Method: req.Method,
	}
}

// PostForm方法用于获取POST请求中的表单参数
func (c *Context) PostForm(key string) string {
	return c.Req.FormValue(key)
}

// Query方法用于获取URL查询参数
func (c *Context) Query(key string) string {
	return c.Req.URL.Query().Get(key)
}

// Status方法用于设置响应状态码
func (c *Context) Status(code int) {
	c.StatusCode = code
	c.Writer.WriteHeader(code)
}

// SetHeader方法用于设置响应头
func (c *Context) SetHeader(key, value string) {
	c.Writer.Header().Set(key, value)
}

// String方法用于设置响应体为字符串
func (c *Context) String(code int, format string, values ...interface{}) {
	c.SetHeader("Content-Type", "text/plain")
	c.Status(code)
	c.Writer.Write([]byte(fmt.Sprintf(format, values...)))
}

// JSON方法用于设置响应体为JSON格式
func (c *Context) JSON(code int, obj interface{}) {
	c.SetHeader("Content-Type", "application/json")
	c.Status(code)                              // 设置响应状态码
	encoder := json.NewEncoder(c.Writer)        // 创建JSON编码器
	if err := encoder.Encode(obj); err != nil { // 编码JSON并写入响应体
		http.Error(c.Writer, err.Error(), 500) // 如果编码过程中出错，返回500 Internal Server Error
	}
}

// Data方法用于设置响应体为二进制数据
func (c *Context) Data(code int, data []byte) {
	c.Status(code)
	c.Writer.Write(data)
}

// HTML方法用于设置响应体为HTML格式
func (c *Context) HTML(code int, html string) {
	c.SetHeader("Content-Type", "text/html")
	c.Status(code)
	c.Writer.Write([]byte(html))
}
```

### 实现路由

我们可以重新构造路由，创建一个 router 结构体作为 Elaina 框架的路由管理器。它维护了一个 handlers 映射表，用于存储 HTTP 方法和路径组合到对应处理函数的映射。并将 router 的 handle 方法作了一个细微的调整，即 handler 的参数变成了 `*Context`。

```go
package elaina

import (
	"log"
	"net/http"
)

// HandlerFunc 定义了 elaina 使用的请求处理函数
type HandlerFunc func(*Context)

// router 结构体是 Elaina 框架的路由管理器。
// 它维护了一个 handlers 映射表，用于存储 HTTP 方法和路径组合到对应处理函数的映射。
type router struct {
	// handlers 存储所有的路由规则。
	// key 的格式是由 "请求方法-路径" 拼接而成的字符串，例如 "GET-/"。
	// value 是对应的 HandlerFunc 处理函数。
	handlers map[string]HandlerFunc
}

// newRouter 是 router 结构体的构造函数，用于初始化并返回一个新的 router 实例。
func newRouter() *router {
	return &router{handlers: make(map[string]HandlerFunc)}
}

// addRoute 向路由管理器中注册一条新的路由规则。
// method: 指定请求的 HTTP 方法，如 "GET"、"POST" 等。
// pattern: 指定请求的路径模式，如 "/"、"/hello" 等。
// handler: 当请求匹配该方法和路径时，将执行的处理函数 HandlerFunc。
func (r *router) addRoute(method string, pattern string, handler HandlerFunc) {
	// 在控制台打印日志，记录新注册的路由信息。
	log.Printf("Route %4s - %s", method, pattern)
	// 将方法和路径拼接成唯一的 key，存入 handlers 映射表中。
	key := method + "-" + pattern
	r.handlers[key] = handler
}

// handle 是 router 的核心处理方法。
// 它根据 Context 中携带的请求方法和路径信息，在 handlers 映射表中查找匹配的处理函数。
// 如果找到匹配的路由，则调用该处理函数并传入 Context。
// 如果未找到匹配的路由，则通过 Context 返回 404 NOT FOUND 响应。
func (r *router) handle(c *Context) {
	// 拼接查找 key，例如 "GET-/"。
	key := c.Method + "-" + c.Path
	// 在 handlers 映射表中尝试查找。
	if handler, ok := r.handlers[key]; ok {
		// 找到路由，执行处理逻辑。
		handler(c)
	} else {
		// 未找到匹配路由，返回 404 状态码和错误提示。
		c.String(http.StatusNotFound, "404 NOT FOUND: %s\n", c.Path)
	}
}

```

将router的代码独立后，最新的`elaina.go`代码如下：

```go
package elaina

import "net/http"



// Elaina 实现了 ServeHTTP 接口
type Elaina struct {
	router *router
}

// New 是 Elaina 的构造函数
func New() *Elaina {
	return &Elaina{router: newRouter()}
}

func (Elaina *Elaina) addRoute(method string, path string, handler HandlerFunc) {
	Elaina.router.addRoute(method, path, handler)
}

// GET 定义了添加 GET 请求的方法
func (Elaina *Elaina) GET(path string, handler HandlerFunc) {
	Elaina.addRoute("GET", path, handler)
}

// POST 定义了添加 POST 请求的方法
func (Elaina *Elaina) POST(path string, handler HandlerFunc) {
	Elaina.addRoute("POST", path, handler)
}

// Run 定义了启动 HTTP 服务器的方法
func (Elaina *Elaina) Run(addr string) (err error) {
	return http.ListenAndServe(addr, Elaina)
}

func (Elaina *Elaina) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	c := newContext(w, req)
	Elaina.router.handle(c)
}

```

相比于上一篇的代码，这个版本的 Elaina 框架，将路由相关的代码独立出来，放到了一个单独的 router 结构体中。

最新的`main.go`如下:

```go
package main

import (
	"elari/elaina"
)

func main() {
	r := elaina.New()
	// GET http://127.0.0.1:8080/ HTTP/1.1
	r.GET("/", indexHandler)
	// GET http://127.0.0.1:8080/hello?name=majotabi HTTP/1.1
	r.GET("/hello", helloHandler)
	// POST http://127.0.0.1:8080/login?username=majotabi&password=612866 HTTP/1.1
	r.POST("/login", loginHandler)
	r.Run(":8080")
}

// indexHandler 是处理索引请求的处理函数
func indexHandler(c *elaina.Context) {
	c.HTML(200, "<h1>Hello Elaina</h1>")
}

// loginHandler 是处理登录请求的处理函数
func loginHandler(c *elaina.Context) {
	c.JSON(200, elaina.H{
		"username": c.PostForm("username"),
		"password": c.PostForm("password"),
	})
}

// helloHandler 是处理hello请求的处理函数
func helloHandler(c *elaina.Context) {
	// expect /hello?name=majotabi
	c.String(200, "hello %s, you're at %s\n", c.Query("name"), c.Path)
}

```

### 测试

```http
GET http://127.0.0.1:8080/ HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html
Date: Thu, 05 Mar 2026 09:11:59 GMT
Content-Length: 21
Connection: close

<h1>Hello Elaina</h1>
```

---

```http
GET http://127.0.0.1:8080/hello?name=majotabi HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Thu, 05 Mar 2026 09:14:16 GMT
Content-Length: 33
Connection: close

hello majotabi, you're at /hello
```

---

```http
POST http://127.0.0.1:8080/login?username=majotabi&password=612866 HTTP/1.1
Content-Type: application/x-www-form-urlencoded
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
Date: Thu, 05 Mar 2026 09:14:40 GMT
Content-Length: 44
Connection: close

{
  "password": "612866",
  "username": "majotabi"
}
```

## 前缀树路由Router

### 当前功能的不足之处

前两部分的路由是基于 `map[string]HandlerFunc` 的**静态路由**，只能精确匹配 `/hello` 或 `/login`，一旦路径带参数（如 `/hello/geektutu`）就彻底匹配失败。

第三部分的目标是实现**动态路由**，支持两种常见写法（这也是目前主流框架的标准能力）：

- **命名参数**（named parameter）：`/hello/:name`、` /majotabi/:name/:birthday`

- **通配符**（wildcard）：`/assets/*filepath`

### 最终实现的效果

```go
package main
import (
	"elari/elaina"
	"net/http"
)
func main() {
	r := elaina.New()
	r.GET("/hello", indexHandler)
	r.GET("/majotabi/:name/:birthday", majoHandler)
	r.GET("/ciallo/*0721", helloHandler)
	r.Run(":8080")
}
func helloHandler(c *elaina.Context) {
	filepath := c.Param("0721")
	c.JSON(http.StatusOK, elaina.H{"filepath": filepath})
}
func indexHandler(c *elaina.Context) {
	c.HTML(200, "<h1>Hello Elaina</h1>")
}
func majoHandler(c *elaina.Context) {
	c.String(200, "%s 你的生日是 %s\n", c.Param("name"), c.Param("birthday"))
}
```

- 支持 /hello、 /majotabi/:name/:birthday、 /ciallo/*0721 等路径

- 处理函数里通过 c.Param(key) 取出参数

- 路由匹配的时间复杂度与路径段数相关，路径越长越能体现前缀树的优势

### 改进方向

为了实现路由匹配功能，需要改进路由的实现方式。一种常见的方法是使用前缀树（Trie）来存储路由模式。

Trie 树的优势：

- 路径部分天然按 / 分层，前缀相同的路径可以复用节点
- 支持动态参数和通配符
- 查找速度极快（路径越长优势越明显）

核心思路：

1. 把每条路径按 / 拆成若干段（parts）

2. 用 Trie 树逐层存储这些段

3. 插入时标记 :name 和 *filepath 为通配节点

4. 查找时支持“精确匹配”或“通配符匹配”

5. 匹配成功后把参数提取出来放到 Context 中

### Trie树的实现

插入:把路由按 / 切开，一层层往树里放，没有就新建，最后一个节点记下完整 pattern。

查找:把请求路径按 / 切开，从根开始递归往下找：普通节点精确匹配，: 节点匹配任意一段，* 节点匹配后续全部，最后只有落在带 pattern 的节点上才算成功。

#### 节点的字段：

- pattern：完整的路由模式，比如"/users/:id/:birthday"

- part：当前节点这一段是什么？比如"/users/:id/:birthday"中的"users"

- children：它的子节点们，比如":id"和":birthday"

- isWild：是否是通配符节点，比如":id"；只要part以`:`和`*`开头，就是true

```go
type node struct {
	pattern  string
	part     string
	children []*node
	isWild   bool 
}
```

修改router.go:

- 字段 roots，用于存储不同 HTTP 方法的根节点。比如 roots["GET"] 就是 GET 方法的根节点。

- 字段 handlers，用于存储路由模式和处理函数的映射关系。比如 handlers["GET-/users/:id"] 就是处理 GET /users/:id 请求的函数。

```go
type router struct {
	roots    map[string]*node
	handlers map[string]HandlerFunc
}
func newRouter() *router {
	return &router{
		roots:    make(map[string]*node),
		handlers: make(map[string]HandlerFunc),
	}
}
```

#### 路由解析函数parsePattern:

- 把路由模式按 / 拆分成 parts,比如"/users/:id/:birthday"拆分成["users",":id",":birthday"]

- 遍历 parts，遇到 `*` ，标记为通配符节点，后续匹配就“来者不拒”。比如`/ciallo/*0721`

- 返回 parts 数组。

```go
func parsePattern(pattern string) []string {
	path := strings.Split(pattern, "/")
	parts := make([]string, 0)
	for _, part := range path {
		if part != "" {
			parts = append(parts, part)
			if part[0] == '*' {
				break
			}
		}
	}
	return parts
}
```

示例：

- "/majotabi/:name/:birthday" → ["majotabi", ":name", ":birthday"]

- "/assets/*filepath" → ["assets", "*filepath"]

#### 实现插入函数insert（核心函数）

- 递归插入，根据 parts 数组的高度，逐层向下插入。当高度等于 parts 数组的长度时，把完整的路由模式赋值给 pattern 字段。

- 遇到通配符节点，标记为 isWild 为 true。

```go
func (n *node) insert(pattern string, parts []string, height int) {
	if len(parts) == height {
		n.pattern = pattern
		return
	}
	part := parts[height]
	child := n.matchChild(part)
	if child == nil {
		child = &node{
			part:   part,
			isWild: part[0] == ':' || part[0] == '*',
		}
		n.children = append(n.children, child)
	}
	child.insert(pattern, parts, height+1)
}
```

**辅助函数matchChild（插入专用）**

- 遍历当前节点的子节点，查找是否有匹配的子节点。

- 如果子节点的 part 等于 查找需要的part，或者子节点是通配符节点，就返回该子节点。

- 否则，返回 nil。

```go
func (n *node) matchChild(part string) *node {
	for _, child := range n.children {
		if child.part == part || child.isWild {
			return child
		}
	}
	return nil
}
```

插入过程举例（插入 GET /majotabi/:name/:birthday）：

parts = ["majotabi", ":name", ":birthday"]

- height=0，part="majotabi" → 新建节点 part="majotabi", isWild=false

- height=1，part=":name" → 新建节点 part=":name", isWild=true

- height=2，part=":birthday" → 新建节点 part=":birthday", isWild=true

- height=3 == 3 → 在 ":birthday" 节点上记录完整 pattern "/majotabi/:name/:birthday"

#### 实现查找函数search（核心函数）

- 递归查找，根据 parts 数组的高度，逐层向下查找。当高度等于 parts 数组的长度时，返回当前节点。

- 遇到 `*` 通配符节点时，直接返回当前匹配结果。

- 如果当前节点的 pattern 为空，返回 nil。

- 否则，返回当前节点。

```go
func (n *node) search(parts []string, height int) *node {
	if len(parts) == height || strings.HasPrefix(n.part, "*") {
		if n.pattern == "" {
			return nil
		}
		return n
	}
	part := parts[height]
	children := n.matchChildren(part)
	for _, child := range children {
		result := child.search(parts, height+1)
		if result != nil {
			return result
		}
	}
	return nil
}
```

**辅助函数matchChildren（查找专用）**

- 创建一个空的切片 nodes，用于存储匹配的子节点。

- 遍历当前节点的子节点，查找是否有匹配的子节点。

- 如果子节点的 part 等于 查找需要的part，或者子节点是通配符节点，就把该子节点添加到 nodes 切片中。

- 最后返回 nodes 切片。

```go
func (n *node) matchChildren(part string) []*node {
	nodes := make([]*node, 0)
	for _, child := range n.children {
		if child.part == part || child.isWild {
			nodes = append(nodes, child)
		}
	}
	return nodes
}
```

查找过程举例（请求 /majotabi/elaina/1017）：

parts = ["majotabi", "elaina", "1017"]

- height=0 → 匹配 "majotabi" 节点

- height=1，part="elaina" → :name 是通配符 → 直接进入

- height=2 → 匹配 "1017" 节点

到达叶子节点 → 返回该节点（匹配成功！）

通配符 * 的神奇之处（请求 /ciallo/abc/def/ghi.jpg）：

走到 *0721 节点时，因为 strings.HasPrefix(n.part, "*") 为 true，直接返回，不再继续往下匹配，完美捕获剩余所有路径。

**插入只需要找到一个能走的分支，所以返回一个**

**查找可能有多个分支都能匹配，所以要全部返回，再挨个递归试。**

#### 参数提取getRoute

匹配到节点后，还需要把参数解析出来。如请求 /majotabi/elaina/1017，匹配到节点 /majotabi/:name/:birthday，需要把 elaina 和 1017 提取出来。

- 先通过parsePattern把路由模式解析成 parts 数组。

- 在创建一个空的map params，用于存储参数。

- 判断当前节点的roots是否存在method方法的路由树。如果不存在，返回 nil, nil。

- 调用search方法查找节点。如果节点为 nil，返回 nil, nil。

- 否则，继续解析路由模式。

- 遍历路由模式的 parts 数组，判断是否为参数。

- 如果是参数，就把参数添加到 params 映射中。

- 如果是通配符，就把通配符后面的路径添加到 params 映射中。

- 最后返回节点和参数映射。

```go
func (r *router) getRoute(method string, path string) (*node, map[string]string) {
	searchParts := parsePattern(path)
	params := make(map[string]string)
	root, ok := r.roots[method]
	if !ok {
		return nil, nil
	}
	n := root.search(searchParts, 0)
	if n != nil {
		parts := parsePattern(n.pattern)
		for index, part := range parts {
			if part[0] == ':' {
				params[part[1:]] = searchParts[index]
			}
			if part[0] == '*' && len(part) > 1 {
				params[part[1:]] = strings.Join(searchParts[index:], "/") 
				break
			}
		}
		return n, params
	}
	return nil, nil
}
```

#### 实现路由添加addRoute

- 先调用parsePattern方法解析路由模式，得到 parts 数组。

- 生成一个唯一的键值，格式为 method-pattern，比如 `GET-/majotabi/:name/:birthday`。

- 判断 roots 映射中是否存在 method 方法的路由树。如果不存在，就创建一个新的路由树。

- 调用路由树的 insert 方法，插入路由模式和 parts 数组。

- 把处理函数添加到 handlers 映射中，键值为 method-pattern。

```go
func (r *router) addRoute(method string, pattern string, handler HandlerFunc) {
	parts := parsePattern(pattern)
	key := method + "-" + pattern
	_, ok := r.roots[method]
	if !ok {
		r.roots[method] = &node{}
	}
	r.roots[method].insert(pattern, parts, 0)
	r.handlers[key] = handler
}
```

#### 实现路由处理handle

- 先调用getRoute方法查找节点和参数映射。

- 如果节点为 nil，返回 404 错误。

- 否则，把参数映射赋值给 Context 的 Params 字段。

- 生成一个唯一的键值，格式为 method-pattern，比如 GET-/users/:id。

- 从 handlers 映射中根据键值查找处理函数。

- 如果找到，就调用处理函数。

- 否则，返回 404 错误。

```go
func (r *router) handle(c *Context) {
	n, params := r.getRoute(c.Method, c.Path)
	if n != nil {
		c.Params = params
		key := c.Method + "-" + n.pattern
		r.handlers[key](c) 
	} else {
		c.String(http.StatusNotFound, "404 NOT FOUND: %s\n", c.Path)
	}
}
```

#### 实现参数获取Param

为context.go中的Context结构体添加一个Param方法，用于根据参数名获取参数值。Param方法接收一个参数名key，返回参数值。

```go
type Context struct {
	Writer     http.ResponseWriter
	Req        *http.Request
	Path       string
	Method     string
	StatusCode int
	Params map[string]string
}
func (c *Context) Param(key string) string {
	return c.Params[key]
}
```

### 测试功能

1. 测试hello路由
```http
GET http://127.0.0.1:8080/hello HTTP/1.1
```
```http
HTTP/1.1 200 OK
Content-Type: text/html
Date: Fri, 06 Mar 2026 15:12:30 GMT
Content-Length: 21
Connection: close

<h1>Hello Elaina</h1>
```

---

2. 测试majotabi路由
```http
GET http://127.0.0.1:8080/majotabi/elaina/1017 HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Fri, 06 Mar 2026 15:14:16 GMT
Content-Length: 28
Connection: close

elaina 你的生日是 1017
```

---

3. 测试ciallo路由
```http
GET http://127.0.0.1:8080/ciallo/abc/def/ghi.jpg HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
Date: Fri, 06 Mar 2026 15:14:34 GMT
Content-Length: 31
Connection: close

{
  "filepath": "abc/def/ghi.jpg"
}
```

### 总结

通过以上测试，我们可以看到框架的路由功能是正常的。我们可以根据不同的路由模式，添加不同的处理函数。同时，我们也可以根据参数名获取参数值，方便我们在处理函数中使用。

## 路由分组控制Group

### 当前功能的不足之处

虽然我们已经支持了动态路由，但是随着接口数量增加，很快就会遇到两个问题：

- 很多路由拥有共同前缀，比如 `/v1`、`/v2`、`/admin`，每次都手写完整路径会非常重复。

- 不同模块的路由都堆在一起，代码可读性和可维护性会越来越差。

因此第四部分的目标是实现**路由分组（RouterGroup）**，让一组路由共享前缀，并支持继续创建子分组。

### 最终实现的效果

```go
package main

import (
	"elari/elaina"
	"log"
	"net/http"
)

func main() {
	// 创建框架实例。此时 r 既是引擎，也是根分组。
	r := elaina.New()

	// 注册一个普通根路由。
	r.GET("/index", func(c *elaina.Context) {
		c.HTML(http.StatusOK, "<h1>Hello Elaina</h1>")
	})

	// 创建 /v1 分组，之后这个分组下的所有路由都会自动带上 /v1 前缀。
	v1 := r.Group("/v1")
	{
		// 实际注册的完整路径是 /v1/
		v1.GET("/", func(c *elaina.Context) {
			c.HTML(http.StatusOK, "<h1>Hello Elaina - v1</h1>")
		})
		// 实际注册的完整路径是 /v1/hello
		v1.GET("/hello", func(c *elaina.Context) {
			c.String(http.StatusOK, "你好 %s, you're at %s\n", c.Query("name"), c.Path)
		})
	}

	// 创建 /v2 分组，用于演示动态路由和 POST 表单。
	v2 := r.Group("/v2")
	{
		// 实际注册的完整路径是 /v2/hello/:name
		v2.GET("/hello/:name", func(c *elaina.Context) {
			c.String(http.StatusOK, "你好 %s, 你请求的路径是 %s\n", c.Param("name"), c.Path)
		})
		// 实际注册的完整路径是 /v2/login
		v2.POST("/login", func(c *elaina.Context) {
			c.JSON(http.StatusOK, elaina.H{
				"username": c.PostForm("username"),
				"password": c.PostForm("password"),
			})
		})
	}

	// 在 /v2 下面继续创建子分组，最终前缀会变成 /v2/admin。
	admin := v2.Group("/admin")
	{
		// 实际注册的完整路径是 /v2/admin/stats
		admin.GET("/stats", func(c *elaina.Context) {
			c.JSON(http.StatusOK, elaina.H{
				"group": "v2/admin",
				"path":  c.Path,
			})
		})
	}

	// 启动服务；如果启动失败，log.Fatal 会直接打印错误并退出程序。
	log.Fatal(r.Run(":8080"))
}
```

这个版本支持：

- 根路由：`/index`

- 一级分组：`/v1`、`/v2`

- 二级嵌套分组：`/v2/admin`

- 分组与动态路由共存：`/v2/hello/:name`

### 设计RouterGroup

核心思路是：**让 Elaina 本身就是一个根分组**，这样既可以像以前一样直接 `r.GET(...)`，也可以继续创建子分组。

先定义一个 `RouterGroup` 结构体：

```go
type RouterGroup struct {
	// prefix 是当前分组共享的路径前缀，例如 "/v1"、"/v2/admin"。
	prefix string

	// middlewares 用于保存挂在这个分组上的中间件。
	// 这一章先预留，下一章会真正用起来。
	middlewares []HandlerFunc

	// parent 指向父分组，便于维护分组层级关系。
	parent *RouterGroup

	// engine 指向整个框架实例，最终注册路由还是要落到总路由器上。
	engine *Elaina
}
```

其中几个字段的含义如下：

- `prefix`：当前分组的公共前缀，例如 `/v1`

- `parent`：指向父分组，方便维护分组层级

- `engine`：指向整个框架实例，最终注册路由还是要落到全局路由器上

- `middlewares`：先预留，为后面的中间件能力做准备

再让 `Elaina` 嵌入一个 `*RouterGroup`：

```go
type Elaina struct {
	// 嵌入 RouterGroup 后，Elaina 本身就拥有了 Group/GET/POST 等方法。
	*RouterGroup

	// router 是真正负责路由匹配和分发的核心路由器。
	router *router

	// groups 保存全部分组，后面做中间件匹配时会遍历它。
	groups []*RouterGroup
}
```

这样做的好处是：

- `Elaina` 自动拥有 `Group`、`GET`、`POST` 等方法

- 根引擎和分组之间的关系非常自然

- 后续要遍历全部分组时，可以直接读取 `groups`

### 实现分组控制

下面是 `web_day04/elaina/elaina.go` 的核心实现：

```go
package elaina

import (
	"log"
	"net/http"
)

// HandlerFunc 统一了路由处理函数的签名。
type HandlerFunc func(*Context)

type RouterGroup struct {
	// prefix 是当前分组的公共路径前缀。
	prefix      string

	// middlewares 预留给后续的中间件系统使用。
	middlewares []HandlerFunc

	// parent 指向父分组。
	parent      *RouterGroup

	// engine 指向所属框架实例。
	engine      *Elaina
}

type Elaina struct {
	// 根引擎本身也是一个 RouterGroup。
	*RouterGroup

	// router 保存真正的路由树和处理函数映射。
	router *router

	// groups 记录框架中创建过的所有分组。
	groups []*RouterGroup
}

// New 创建框架实例，并初始化根分组。
func New() *Elaina {
	engine := &Elaina{
		router: newRouter(),
	}

	// 创建根分组。根分组默认没有 prefix。
	engine.RouterGroup = &RouterGroup{
		engine: engine,
	}

	// 把根分组也放进 groups，后续统一遍历。
	engine.groups = []*RouterGroup{engine.RouterGroup}
	return engine
}

// Group 基于当前分组创建一个新的子分组。
func (group *RouterGroup) Group(prefix string) *RouterGroup {
	engine := group.engine
	newGroup := &RouterGroup{
		// 子分组前缀 = 父分组前缀 + 自己的前缀
		prefix: group.prefix + prefix,
		parent: group,
		engine: engine,
	}

	// 新分组创建后，要登记到引擎的 groups 里。
	engine.groups = append(engine.groups, newGroup)
	return newGroup
}

// addRoute 用于把相对路径转换成带分组前缀的完整路径，再注册到路由器。
func (group *RouterGroup) addRoute(method, relativePath string, handler HandlerFunc) {
	// 例如 group.prefix="/v2"，relativePath="/hello/:name"
	// 最终 pattern="/v2/hello/:name"
	pattern := group.prefix + relativePath
	log.Printf("Route %4s - %s", method, pattern)
	group.engine.router.addRoute(method, pattern, handler)
}

// GET 是注册 GET 路由的语法糖。
func (group *RouterGroup) GET(relativePath string, handler HandlerFunc) {
	group.addRoute(http.MethodGet, relativePath, handler)
}

// POST 是注册 POST 路由的语法糖。
func (group *RouterGroup) POST(relativePath string, handler HandlerFunc) {
	group.addRoute(http.MethodPost, relativePath, handler)
}

// Run 启动 HTTP 服务。
func (e *Elaina) Run(addr string) error {
	return http.ListenAndServe(addr, e)
}

// ServeHTTP 实现 http.Handler 接口。
// 每次请求进来时，先创建 Context，再交给 router 处理。
func (e *Elaina) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	c := newContext(w, req)
	e.router.handle(c)
}
```

这里最关键的是两个方法：

1. `Group(prefix string)`

   - 基于当前分组创建一个子分组。

   - 子分组的前缀是 `group.prefix + prefix`。

   - 例如当前是 `/v2`，继续 `Group("/admin")`，最终前缀就是 `/v2/admin`。

2. `addRoute(method, relativePath string, handler HandlerFunc)`

   - 用户传入的是相对路径，比如 `/hello`。

   - 真正注册到路由树中的，是拼接后的完整路径，比如 `/v2/hello/:name`。

这样一来，业务代码只需要关心“当前分组下的相对路径”，不需要每次手写完整前缀。

### 测试功能

1. 测试根分组路由

```http
GET http://127.0.0.1:8080/index HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html

<h1>Hello Elaina</h1>
```

---

2. 测试 v1 分组

```http
GET http://127.0.0.1:8080/v1/hello?name=elaina HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain

你好 elaina, you're at /v1/hello
```

---

3. 测试 v2 动态路由

```http
GET http://127.0.0.1:8080/v2/hello/elaina HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain

你好 elaina, 你请求的路径是 /v2/hello/elaina
```

---

4. 测试嵌套分组

```http
GET http://127.0.0.1:8080/v2/admin/stats HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "group": "v2/admin",
  "path": "/v2/admin/stats"
}
```

---

5. 测试 POST 表单

```http
POST http://127.0.0.1:8080/v2/login HTTP/1.1
Content-Type: application/x-www-form-urlencoded

username=elaina&password=0721
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "password": "0721",
  "username": "elaina"
}
```

### 总结

到这里我们已经完成了分组路由能力。后续新增接口时，可以先划分模块，再在模块下注册相对路径，代码会清爽很多。同时 `groups` 和 `middlewares` 字段也为下一章的中间件机制提前打好了基础。

## 中间件Middleware

### 当前功能的不足之处

即使有了路由分组，很多“和业务逻辑无关但每次请求都想做”的事情仍然不好处理，比如：

- 统一打印请求日志

- 统计耗时

- 登录校验、权限控制

- 在进入处理函数前后插入公共逻辑

如果把这些代码全部写进每个路由处理函数里，会导致大量重复代码。所以第五部分的目标是实现**中间件（Middleware）**。

### 最终实现的效果

```go
package main

import (
	"elari/elaina"
	"log"
	"net/http"
	"time"
)

func main() {
	// 创建框架实例。
	r := elaina.New()

	// 把 Logger 安装到根分组上。
	// 这样所有请求都会先经过日志中间件。
	r.Use(elaina.Logger())

	// 注册一个普通首页路由。
	r.GET("/", func(c *elaina.Context) {
		c.HTML(http.StatusOK, "<h1>Hello Elaina</h1>")
	})

	// 创建 /v2 分组，并为它单独挂一个中间件。
	v2 := r.Group("/v2")
	v2.Use(onlyForV2())
	{
		// 只有以 /v2 开头的请求才会进入这个处理函数。
		v2.GET("/hello/:name", func(c *elaina.Context) {
			c.String(http.StatusOK, "hello %s, you're at %s\n", c.Param("name"), c.Path)
		})
	}

	log.Fatal(r.Run(":8080"))
}

// onlyForV2 演示一个典型的分组级中间件：
// 1. 先做前置逻辑
// 2. 满足条件时可以直接中断请求
// 3. 否则继续往后执行
// 4. 最后再做后置逻辑
func onlyForV2() elaina.HandlerFunc {
	return func(c *elaina.Context) {
		// 记录开始时间，用于统计耗时。
		start := time.Now()

		// fail=1 时，直接中断请求并返回错误 JSON。
		if c.Query("fail") == "1" {
			c.Fail(http.StatusInternalServerError, "forced by onlyForV2 middleware")
			log.Printf("[%d] %s in %v for group v2", c.StatusCode, c.Req.RequestURI, time.Since(start))
			return
		}

		// 执行后续中间件和最终路由处理函数。
		c.Next()

		// 后置逻辑：在请求处理完之后记录日志。
		log.Printf("[%d] %s in %v for group v2", c.StatusCode, c.Req.RequestURI, time.Since(start))
	}
}
```

这个版本有两个关键能力：

- 根分组安装全局 `Logger()` 中间件

- `v2` 分组安装局部中间件 `onlyForV2()`

也就是说，请求 `/v2/hello/elaina` 时，会依次经过：

1. 根分组中间件

2. `v2` 分组中间件

3. 最终路由处理函数

### 中间件的设计

中间件本质上仍然是一个 `HandlerFunc`，只是它不一定直接返回结果，而是可以选择：

- 在执行前做一些事

- 调用 `c.Next()` 让后续处理继续执行

- 在执行后再做一些事

- 或者直接中断请求

为了做到这一点，我们需要把“一次请求要执行的所有函数”串成一个处理链。

所以要改造 `Context`：

```go
type Context struct {
	Writer     http.ResponseWriter
	Req        *http.Request
	Path       string
	Method     string
	StatusCode int
	Params     map[string]string

	// handlers 保存当前请求要执行的完整处理链。
	// 里面既包含中间件，也包含最终路由函数。
	handlers []HandlerFunc

	// index 表示当前执行到 handlers 的哪个位置。
	index    int
}
```

这里新增了两个字段：

- `handlers`：保存本次请求的处理链，包括中间件和最终路由函数

- `index`：记录当前执行到了第几个处理函数

### 实现中间件机制

#### 第一步：为分组添加 Use 方法

```go
// Use 用于给当前分组挂载一个或多个中间件。
func (group *RouterGroup) Use(middlewares ...HandlerFunc) {
	group.middlewares = append(group.middlewares, middlewares...)
}
```

作用很直接：把中间件挂到某个分组上。

---

#### 第二步：让 Context 支持 Next 和 Fail

```go
func newContext(w http.ResponseWriter, req *http.Request) *Context {
	return &Context{
		Writer: w,
		Req:    req,
		Path:   req.URL.Path,
		Method: req.Method,

		// 先置为 -1，这样第一次调用 Next 时就会从 0 开始执行。
		index:  -1,
	}
}

// Next 的作用是把当前请求的处理链继续往后推进。
// 中间件里调用 c.Next() 后，后续中间件和最终路由函数才会继续执行。
func (c *Context) Next() {
	c.index++
	for c.index < len(c.handlers) {
		// 执行当前下标对应的处理函数。
		c.handlers[c.index](c)
		c.index++
	}
}

// Fail 用于立刻中断剩余处理链，并返回统一的错误响应。
func (c *Context) Fail(code int, err string) {
	// 把 index 直接推进到链尾，表示后续函数都不再执行。
	c.index = len(c.handlers)
	c.JSON(code, H{"message": err})
}
```

这里有两个关键点：

- `Next()` 会把处理链从当前位置继续往后执行

- `Fail()` 会直接把 `index` 置为链尾，表示后续处理函数不再执行

这就是“中间件可继续、可中断”的核心。

---

#### 第三步：在 ServeHTTP 中收集中间件

```go
func (e *Elaina) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	// 根据请求路径，收集所有命中的分组中间件。
	var middlewares []HandlerFunc
	for _, group := range e.groups {
		if strings.HasPrefix(req.URL.Path, group.prefix) {
			middlewares = append(middlewares, group.middlewares...)
		}
	}

	// 为本次请求创建 Context，并把中间件链先塞进去。
	c := newContext(w, req)
	c.handlers = middlewares

	// 再交给路由器补上最终处理函数或 404 处理函数。
	e.router.handle(c)
}
```

逻辑也很简单：

- 遍历所有分组

- 只要请求路径以该分组前缀开头，就说明命中了这个分组

- 把该分组的中间件追加到当前请求的 `handlers` 里

例如请求 `/v2/hello/elaina`：

- 命中根分组 `""`

- 命中 `/v2`

- 最终得到处理链：`[Logger, onlyForV2, 路由处理函数]`

---

#### 第四步：路由命中后，不是立刻执行，而是追加到处理链尾部

```go
func (r *router) handle(c *Context) {
	n, params := r.getRoute(c.Method, c.Path)
	if n != nil {
		// 路由匹配成功时，先把路径参数保存到 Context 中。
		c.Params = params
		key := c.Method + "-" + n.pattern

		// 把真正的路由处理函数追加到处理链尾部。
		c.handlers = append(c.handlers, r.handlers[key])
	} else {
		// 如果路由未命中，也追加一个 404 处理函数。
		// 这样之前收集到的中间件依然可以执行。
		c.handlers = append(c.handlers, func(c *Context) {
			c.String(http.StatusNotFound, "404 NOT FOUND: %s\n", c.Path)
		})
	}

	// 从处理链头部开始执行。
	c.Next()
}
```

这里非常关键：

- 路由命中时，把最终处理函数追加到 `handlers`

- 路由未命中时，也追加一个 404 处理函数

- 然后统一调用 `c.Next()`

这样就保证了：**即使是 404，请求也会先经过已经命中的中间件**。

---

#### 第五步：实现 Logger 中间件

```go
package elaina

import (
	"log"
	"time"
)

// Logger 返回一个日志中间件。
// 它会在请求处理完成后，统一打印状态码、请求路径和耗时。
func Logger() HandlerFunc {
	return func(c *Context) {
		// 记录处理开始时间。
		start := time.Now()

		// 继续执行后续中间件和路由处理函数。
		c.Next()

		// 当后续逻辑全部完成后，再打印日志。
		log.Printf("[%d] %s in %v", c.StatusCode, c.Req.RequestURI, time.Since(start))
	}
}
```

这个写法非常典型：

- `c.Next()` 前面是“前置逻辑”

- `c.Next()` 后面是“后置逻辑”

所以中间件完全可以像一个洋葱模型一样，一层层包住真正的业务处理函数。

### 测试功能

1. 测试普通请求

```http
GET http://127.0.0.1:8080/ HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html

<h1>Hello Elaina</h1>
```

控制台会打印类似日志：

```text
[200] / in 317.5µs
```

---

2. 测试通过中间件的 v2 路由

```http
GET http://127.0.0.1:8080/v2/hello/elaina HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain

hello elaina, you're at /v2/hello/elaina
```

控制台会打印两条日志，一条来自 `onlyForV2()`，一条来自全局 `Logger()`。

---

3. 测试中间件主动中断

```http
GET http://127.0.0.1:8080/v2/hello/elaina?fail=1 HTTP/1.1
```

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "message": "forced by onlyForV2 middleware"
}
```

此时由于执行了 `c.Fail(...)`，后面的路由处理函数不会再运行。

---

4. 测试 404 也会经过中间件

```http
GET http://127.0.0.1:8080/not-found HTTP/1.1
```

```http
HTTP/1.1 404 Not Found
Content-Type: text/plain

404 NOT FOUND: /not-found
```

虽然没有命中路由，但全局日志中间件仍然会执行。

### 总结

到这里我们已经实现了一个非常基础但很重要的中间件系统。通过 `handlers + index + Next()` 这套机制，框架已经具备了统一日志、鉴权、错误恢复等扩展能力，而这些能力都不需要侵入业务处理函数。

## 模板渲染与静态文件

### 当前功能的不足之处

前面的 `Context.HTML()` 只能直接返回一段 HTML 字符串，例如：

```go
c.HTML(200, "<h1>Hello Elaina</h1>")
```

这种方式虽然简单，但是很快就会遇到问题：

- HTML 页面无法复用

- 页面数据和页面结构混在一起

- 没法优雅地引入 CSS、JS、图片等静态资源

因此第六部分的目标是实现两个能力：

1. 模板渲染

2. 静态文件服务

### 最终实现的效果

```go
package main

import (
	"elari/elaina"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"
)

// student 是模板里要渲染的结构体。
type student struct {
	Name string
	Age  int8
}

// FormatAsDate 会注册进模板函数表，用来把 time.Time 格式化成字符串。
func FormatAsDate(t time.Time) string {
	year, month, day := t.Date()
	return fmt.Sprintf("%d-%02d-%02d", year, month, day)
}

func main() {
	// 创建框架实例，并先挂上日志中间件。
	r := elaina.New()
	r.Use(elaina.Logger())

	// 注册模板函数。
	// 注意：必须先注册函数，再加载模板。
	r.SetFuncMap(template.FuncMap{
		"FormatAsDate": FormatAsDate,
	})

	// 解析 templates 目录下的全部模板文件。
	r.LoadHTMLGlob("templates/*")

	// 把本地 static 目录映射到 URL 前缀 /assets。
	r.Static("/assets", "./static")

	// 准备模板要用的测试数据。
	stu1 := &student{Name: "Elaina", Age: 20}
	stu2 := &student{Name: "Saya", Age: 22}

	// 首页渲染 css.tmpl 模板。
	r.GET("/", func(c *elaina.Context) {
		c.HTML(http.StatusOK, "css.tmpl", nil)
	})

	// /students 路由渲染学生列表模板。
	r.GET("/students", func(c *elaina.Context) {
		c.HTML(http.StatusOK, "arr.tmpl", elaina.H{
			"title":  "Elaina Travelers",
			"stuArr": [2]*student{stu1, stu2},
		})
	})

	// /date 路由演示自定义模板函数的使用。
	r.GET("/date", func(c *elaina.Context) {
		c.HTML(http.StatusOK, "custom_func.tmpl", elaina.H{
			"title": "Elaina Date",
			"now":   time.Date(2019, 8, 17, 0, 0, 0, 0, time.UTC),
		})
	})

	log.Fatal(r.Run(":8080"))
}
```

这个版本已经支持：

- `c.HTML(code, templateName, data)` 按模板名渲染页面

- 自定义模板函数 `FormatAsDate`

- `Static("/assets", "./static")` 暴露静态资源目录

### 实现模板渲染

为了支持模板能力，需要先在 `Elaina` 中保存模板相关资源：

```go
type Elaina struct {
	// 根分组。
	*RouterGroup

	// 路由管理器。
	router *router

	// 全部分组列表。
	groups []*RouterGroup

	// funcMap 保存模板函数，比如 FormatAsDate。
	funcMap       template.FuncMap

	// htmlTemplates 保存解析后的模板集合。
	htmlTemplates *template.Template
}
```

其中：

- `funcMap`：保存模板函数表

- `htmlTemplates`：保存解析好的模板集合

接着实现两个方法：

```go
// SetFuncMap 用来注册模板函数表。
func (e *Elaina) SetFuncMap(funcMap template.FuncMap) {
	e.funcMap = funcMap
}

// LoadHTMLGlob 按照 glob 规则一次性解析多个模板文件。
func (e *Elaina) LoadHTMLGlob(pattern string) {
	e.htmlTemplates = template.Must(template.New("").Funcs(e.funcMap).ParseGlob(pattern))
}
```

这里要注意一个顺序问题：

- 先 `SetFuncMap(...)`

- 再 `LoadHTMLGlob(...)`

因为模板在解析阶段就需要知道有哪些函数可用。

---

为了让 `Context` 在处理请求时访问模板资源，还要给它加一个 `engine` 字段：

```go
type Context struct {
	Writer     http.ResponseWriter
	Req        *http.Request
	Path       string
	Method     string
	StatusCode int
	Params     map[string]string

	// handlers 保存本次请求的完整处理链。
	handlers []HandlerFunc

	// index 记录处理链执行到哪一步。
	index    int

	// engine 让 Context 能访问框架级资源，比如模板集合。
	engine   *Elaina
}
```

然后在 `ServeHTTP` 中补上：

```go
func (e *Elaina) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	// 先收集当前请求命中的全部分组中间件。
	var middlewares []HandlerFunc
	for _, group := range e.groups {
		if strings.HasPrefix(req.URL.Path, group.prefix) {
			middlewares = append(middlewares, group.middlewares...)
		}
	}

	// 创建 Context，并把中间件链和引擎实例都塞进去。
	c := newContext(w, req)
	c.handlers = middlewares
	c.engine = e

	// 最后再交给路由器追加最终处理函数并开始执行。
	e.router.handle(c)
}
```

最后把原来的 `HTML` 方法改造成“模板渲染版”：

```go
// HTML 根据模板名渲染页面，并把 data 作为模板数据传进去。
func (c *Context) HTML(code int, name string, data interface{}) {
	c.SetHeader("Content-Type", "text/html")
	c.Status(code)

	// ExecuteTemplate 会从已经解析好的模板集合里找到指定模板并执行。
	if err := c.engine.htmlTemplates.ExecuteTemplate(c.Writer, name, data); err != nil {
		// 模板渲染失败时，直接返回 500。
		c.Fail(http.StatusInternalServerError, err.Error())
	}
}
```

从此以后，我们调用的就不再是“直接写 HTML 字符串”，而是“渲染某个模板文件”。

### 实现静态文件服务

静态文件的目标是把本地目录映射到某个 URL 前缀下，例如：

- 本地目录：`./static`

- 对外访问路径：`/assets`

实现代码如下：

```go
// createStaticHandler 把标准库的 FileServer 包装成框架自己的 HandlerFunc。
func (group *RouterGroup) createStaticHandler(relativePath string, fs http.FileSystem) HandlerFunc {
	// absolutePath 是 URL 层面的静态资源前缀，例如 /assets。
	absolutePath := path.Join(group.prefix, relativePath)

	// StripPrefix 用来把请求路径前缀去掉，再交给底层 FileServer 读取实际文件。
	fileServer := http.StripPrefix(absolutePath, http.FileServer(fs))
	return func(c *Context) {
		// filepath 参数来自动态路由 /assets/*filepath
		file := c.Param("filepath")

		// 先尝试打开文件，提前判断文件是否存在。
		f, err := fs.Open(file)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		_ = f.Close()

		// 文件存在时，直接复用标准库 FileServer 返回内容。
		fileServer.ServeHTTP(c.Writer, c.Req)
	}
}

// Static 对外暴露一个更友好的方法，用来把目录挂到某个 URL 前缀下。
func (group *RouterGroup) Static(relativePath, root string) {
	// root 是本地目录，例如 ./static
	handler := group.createStaticHandler(relativePath, http.Dir(root))

	// 把静态资源目录注册成动态路由，例如 /assets/*filepath
	urlPattern := path.Join(relativePath, "/*filepath")
	group.GET(urlPattern, handler)
}
```

这里的设计很巧妙：

- `Static("/assets", "./static")` 最终注册出一个动态路由：`/assets/*filepath`

- 请求 `/assets/css/elaina.css` 时，`filepath` 就是 `css/elaina.css`

- 先用 `fs.Open(file)` 判断文件是否存在

- 存在就交给 `http.FileServer` 返回文件内容

所以静态文件服务，本质上也是动态路由的一种应用。

### 补充模板与静态资源文件

`templates/css.tmpl`

```html
{{define "css.tmpl"}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Elaina CSS</title>
    <link rel="stylesheet" href="/assets/css/elaina.css">
</head>
<body>
    <h1>Elaina Day06</h1>
    <p>elaina.css is loaded</p>
    <p><a href="/students">students</a></p>
    <p><a href="/date">date</a></p>
    <p><a href="/assets/file1.txt">file1.txt</a></p>
</body>
</html>
{{end}}
```

`templates/arr.tmpl`

```html
{{define "arr.tmpl"}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{.title}}</title>
</head>
<body>
    <h1>{{.title}}</h1>
    <ul>
        {{range .stuArr}}
        <li>{{.Name}} - {{.Age}}</li>
        {{end}}
    </ul>
</body>
</html>
{{end}}
```

`templates/custom_func.tmpl`

```html
{{define "custom_func.tmpl"}}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{{.title}}</title>
</head>
<body>
    <h1>{{.title}}</h1>
    <p>Today is {{.now | FormatAsDate}}</p>
</body>
</html>
{{end}}
```

`static/css/elaina.css`

```css
body {
    font-family: "Segoe UI", sans-serif;
    margin: 40px;
    background: #f3f6fb;
    color: #1f2937;
}

h1 {
    color: #0f766e;
}

a {
    color: #2563eb;
}
```

### 测试功能

1. 测试首页模板

```http
GET http://127.0.0.1:8080/ HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Elaina CSS</title>
    <link rel="stylesheet" href="/assets/css/elaina.css">
</head>
...
```

---

2. 测试学生列表模板

```http
GET http://127.0.0.1:8080/students HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html

...
<h1>Elaina Travelers</h1>
<ul>
    <li>Elaina - 20</li>
    <li>Saya - 22</li>
</ul>
...
```

---

3. 测试自定义模板函数

```http
GET http://127.0.0.1:8080/date HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/html

...
<p>Today is 2019-08-17</p>
...
```

---

4. 测试静态 CSS

```http
GET http://127.0.0.1:8080/assets/css/elaina.css HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/css; charset=utf-8

body {
    font-family: "Segoe UI", sans-serif;
    margin: 40px;
    background: #f3f6fb;
    color: #1f2937;
}
```

---

5. 测试静态文本文件

```http
GET http://127.0.0.1:8080/assets/file1.txt HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

This is a static file served by Elaina day06.
```

### 总结

到这里，Elaina 已经从“只能返回字符串”的玩具框架，进化成了一个支持模板渲染和静态资源托管的小型 Web 框架。后面如果要做博客、后台页面或者简单管理系统，这一章的能力已经足够打基础了。

## 错误恢复Recovery

### 当前功能的不足之处

到第六部分为止，框架已经支持了路由、分组、中间件、模板和静态资源。但还有一个很严重的问题：

如果某个处理函数里发生 `panic`，整个服务就会直接崩掉。

这在真实项目里是不能接受的。一个请求失败，不应该把整个服务进程一起带走。所以第七部分的目标是实现：

- `Recovery()` 中间件，用来拦截 panic

- `Default()` 构造函数，用来快速创建一个带常用中间件的框架实例

### 最终实现的效果

```go
package main

import (
	"elari/elaina"
	"log"
	"net/http"
)

func main() {
	// Default 会自动安装 Logger 和 Recovery 两个常用中间件。
	r := elaina.Default()

	// 正常首页路由。
	r.GET("/", func(c *elaina.Context) {
		c.String(http.StatusOK, "Hello Elaina\n")
	})

	// 故意制造一个 panic，用来测试 Recovery 是否生效。
	r.GET("/panic", func(c *elaina.Context) {
		names := []string{"elaina"}
		c.String(http.StatusOK, names[100])
	})

	// 启动服务。
	log.Fatal(r.Run(":8080"))
}
```

这里 `r := elaina.Default()` 非常关键，它默认就安装好了：

- `Logger()`

- `Recovery()`

这样一来，普通项目甚至可以直接从 `Default()` 开始写。

### 实现Recovery中间件

核心代码在 `web_day07/elaina/recovery.go`：

```go
package elaina

import (
	"fmt"
	"log"
	"net/http"
	"runtime"
	"strings"
)

// trace 用来生成一段更友好的 panic 调用栈信息。
func trace(message string) string {
	// pcs 用来保存程序计数器（Program Counter）。
	var pcs [32]uintptr

	// runtime.Callers 会把当前 goroutine 的调用栈写入 pcs。
	// 这里跳过前 3 层，是为了忽略 runtime.Callers/trace/Recovery 自己的栈帧。
	n := runtime.Callers(3, pcs[:])

	// 用 strings.Builder 拼接最终输出文本，效率更高。
	var builder strings.Builder
	builder.WriteString(message)
	builder.WriteString("\nTraceback:")

	for _, pc := range pcs[:n] {
		// 根据程序计数器找到对应的函数信息。
		fn := runtime.FuncForPC(pc)

		// 进一步拿到文件名和行号。
		file, line := fn.FileLine(pc)
		builder.WriteString(fmt.Sprintf("\n\t%s:%d", file, line))
		builder.WriteString(fmt.Sprintf("\n\t%s", fn.Name()))
	}

	return builder.String()
}

// Recovery 返回一个专门用来拦截 panic 的中间件。
func Recovery() HandlerFunc {
	return func(c *Context) {
		// defer 会在当前函数返回前执行。
		// 因此无论后续链路里谁发生 panic，这里都有机会 recover。
		defer func() {
			if err := recover(); err != nil {
				// 把 panic 对象转成字符串。
				message := fmt.Sprintf("%s", err)

				// 记录带调用栈的错误日志，方便排查问题。
				log.Printf("%s\n\n", trace(message))

				// 给客户端返回统一的 500 响应，而不是让服务直接崩掉。
				c.Fail(http.StatusInternalServerError, "Internal Server Error")
			}
		}()

		// 继续执行后续中间件和最终路由处理函数。
		c.Next()
	}
}
```

这个中间件的执行流程如下：

1. 进入 `Recovery()`

2. 先注册一个 `defer`

3. 调用 `c.Next()` 执行后续中间件和路由处理函数

4. 如果后续过程中发生 `panic`，`recover()` 会把它截住

5. 记录错误和调用栈

6. 返回统一的 500 响应，而不是让整个进程退出

### 实现调用栈追踪 trace

`trace(message string)` 的作用，是把 panic 时的调用栈整理成更容易阅读的文本。

关键点：

- `runtime.Callers(3, pcs[:])`：获取当前 goroutine 的调用栈

- `runtime.FuncForPC(pc)`：根据程序计数器拿到函数信息

- `fn.FileLine(pc)`：拿到对应的文件和行号

最终日志中会包含：

- panic 的错误信息

- 每一层调用对应的文件名、行号和函数名

这对于定位线上问题非常有用。

### 封装Default构造函数

为了减少每个项目都重复手写：

```go
r := elaina.New()
r.Use(elaina.Logger(), elaina.Recovery())
```

我们可以直接封装一个默认构造函数：

```go
// Default 返回一个预装常用中间件的框架实例。
func Default() *Elaina {
	// 先创建一个普通引擎。
	engine := New()

	// 把 Logger 和 Recovery 一次性挂上去。
	engine.Use(Logger(), Recovery())
	return engine
}
```

这样使用时就简单很多：

```go
r := elaina.Default()
```

这也是很多 Web 框架的常见做法，比如 Gin 就有 `gin.Default()`。

### 测试功能

1. 测试正常首页

```http
GET http://127.0.0.1:8080/ HTTP/1.1
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain

Hello Elaina
```

---

2. 测试 panic 恢复

```http
GET http://127.0.0.1:8080/panic HTTP/1.1
```

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "message": "Internal Server Error"
}
```

此时服务不会崩溃，控制台会输出类似如下的日志：

```text
runtime error: index out of range [100] with length 1
Traceback:
    web_day07/main.go:19
    main.main.func2
    ...
```

最关键的是：**访问 `/panic` 之后，服务依然存活，后续请求 `/` 仍然可以正常响应。**

### 总结

到这里，Elaina 的基础主线功能就已经全部补齐了：

- 第一部分：实现基础路由

- 第二部分：封装 Context

- 第三部分：实现动态路由和参数提取

- 第四部分：实现路由分组

- 第五部分：实现中间件机制

- 第六部分：支持模板渲染与静态文件

- 第七部分：实现错误恢复

虽然它还远远不是一个完整生产级框架，但作为学习 Web 框架设计思路的练手项目，它已经把最核心的骨架都串起来了。

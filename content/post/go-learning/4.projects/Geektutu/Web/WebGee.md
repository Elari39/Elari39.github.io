---
title: "从零实现 Web 框架 (Gee)"
date: 2026-03-05T21:00:00+08:00
lastmod: 2026-03-06T23:26:00+08:00
draft: false
tags: ["Go", "Web", "Gee", "框架开发"]
categories: ["Golang 学习笔记"]
description: "用 Go 从零实现 Web 框架 Gee 教程的学习笔记。"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260305211932326.png"
---
## 前情提要

本项目为2026年学习[7天用Go从零实现Web框架Gee教程]([7天用Go从零实现Web框架Gee教程 | 极客兔兔](https://geektutu.com/post/gee.html))的学习笔记

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
		e.Get("/", index)
		e.Post("/", post)
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

实现第二个功能，我们可以先创建一个AddRoute方法，用于将路径和处理函数添加到路由表中，并分别处理不同的GET和POST等请求，将其封装为`func (e *Elaina) AddRoute(method, path string, handler HandleFunc)`，将请求方法和路径映射到处理函数。

然后创建Get和Post方法，分别用于添加GET和POST请求的路由，将其封装为`func (e *Elaina) Get(path string, handler HandleFunc)`和`func (e *Elaina) Post(path string, handler HandleFunc)`。

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
// HandleFunc 是处理 HTTP 请求的函数类型别名
// 它就是 http.HandlerFunc 的别名，方便框架内部统一使用
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
// AddRoute 是底层添加路由的方法
// method: "GET"、"POST" 等，path: "/users"，handler: 处理函数
func (e *Elaina) AddRoute(method, path string, handler HandleFunc) {
	key := method + "-" + path
	e.router[key] = handler
}
// Get 注册 GET 请求路由（语法糖）
func (e *Elaina) Get(path string, handler HandleFunc) {
	e.AddRoute("GET", path, handler)
}
// Post 注册 POST 请求路由（语法糖）
func (e *Elaina) Post(path string, handler HandleFunc) {
	e.AddRoute("POST", path, handler)
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

//取消掉的了AddRoute这种方法，因为现在官方的ServeMux已经支持了路径参数，所以不需要再添加AddRoute方法了

// Get / Post 现在支持路径参数！
func (e *Elaina) Get(path string, handler HandleFunc) {
	e.HandleFunc("GET "+path, handler)
}

func (e *Elaina) Post(path string, handler HandleFunc) {
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
e.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
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

- `Handler`的参数变成成了`elaina.Context`，提供了查询Query/PostForm参数的功能。
- `elaina.Context`封装了`HTML/String/JSON`函数，能够快速构造HTTP响应。

### 设计Context

引用文档的话:

- 对Web服务来说，无非是根据请求`*http.Request`，构造响应`http.ResponseWriter`。但是这两个对象提供的接口粒度太细，比如我们要构造一个完整的响应，需要考虑消息头(Header)和消息体(Body)，而 Header 包含了状态码(StatusCode)，消息类型(ContentType)等几乎每次请求都需要设置的信息。因此，如果不进行有效的封装，那么框架的用户将需要写大量重复，繁杂的代码，而且容易出错。针对常用场景，能够高效地构造出 HTTP 响应是一个好的框架必须考虑的点。

- 针对使用场景，封装`*http.Request`和`http.ResponseWriter`的方法，简化相关接口的调用，只是设计 Context 的原因之一。对于框架来说，还需要支撑额外的功能。例如，将来解析动态路由`/hello/:name`，参数`:name`的值放在哪呢？再比如，框架需要支持中间件，那中间件产生的信息放在哪呢？Context 随着每一个请求的出现而产生，请求的结束而销毁，和当前请求强相关的信息都应由 Context 承载。因此，设计 Context 结构，扩展性和复杂性留在了内部，而对外简化了接口。路由的处理函数，以及将要实现的中间件，参数都统一使用 Context 实例， Context 就像一次会话的百宝箱，可以找到任何东西。

翻译一下就是将 `*http.Request` 和 `http.ResponseWriter` 封装到一个结构体中，提供了一些方便的方法，比如 `Query`、`PostForm`、`JSON`、`HTML`、`String` 等，以及一些额外的功能，比如 `PathValue`、`Param`、`Middleware` 等。

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
c.JSON(http.StatusOK, gee.H{
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
type H map[string]any // H 是路由处理函数中使用的上下文类型，用于存储请求和响应相关的信息
```

这定义json方法是，需要先设置请求头为Content-Type为application/json，最后使用json.NewEncoder编码数据。

完整的`context.go`代码如下：

```go
package elaina

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type H map[string]any // H 是路由处理函数中使用的上下文类型，用于存储请求和响应相关的信息

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

// Query方法可能需要考虑表单和URL查询参数
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

我们可以重新构造路由，创建一个router 结构体是 Elaina 框架的路由管理器。它维护了一个 handlers 映射表，用于存储 HTTP 方法和路径组合到对应处理函数的映射。并将router的handle 方法作了一个细微的调整，即 handler 的参数，变成了 Context。

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

前两天的路由是基于 `map[string]HandlerFunc` 的**静态路由**，只能精确匹配 `/hello` 或 `/login`，一旦路径带参数（如 `/hello/geektutu`）就彻底匹配失败。

第三天的目标是实现**动态路由**，支持两种常见写法（这也是目前主流框架的标准能力）：

- **命名参数**（named parameter）：`/hello/:name`、` /p/:lang/doc`

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

- 路由表仍保持 O(1) 级别的查找速度（前缀树天生优势）

### 改进方向

为了实现路由匹配功能，需要改进路由的实现方式。一种常见的方法是使用前缀树（Trie）来存储路由模式。

Trie 树的优势：

- 路径天然按 / 分层，前缀相同的路径可以复用节点
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

- part：当前节点这一段是什么？比如"/users/:id/birthday"中的"users"

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

- 字段 handlers，用于存储路由模式和处理函数的映射关系。比如 handlers["GET:/users/:id"] 就是处理 GET /users/:id 请求的函数。

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

- "/p/:lang/doc" → ["p", ":lang", "doc"]

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

- 遍历总节点的子节点，查找是否有匹配的子节点。

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

插入过程举例（插入 GET /p/:lang/doc）：

parts = ["p", ":lang", "doc"]

- height=0，part="majotabi" → 新建节点 part="majotabi", isWild=false

- height=1，part=":name" → 新建节点 part=":name", isWild=true

- height=2，part=":birthday" → 新建节点 part=":birthday", isWild=true

- height=3 == 3 → 在 ":birthday" 节点上记录完整 pattern "/majotabi/:name/:birthday"

#### 实现查找函数search（核心函数）

- 递归查找，根据 parts 数组的高度，逐层向下查找。当高度等于 parts 数组的长度时，返回当前节点。

- 遇到通配符节点，标记为 isWild 为 true。

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

- 遍历总节点的子节点，查找是否有匹配的子节点。

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

查找过程举例（请求 /majotabi/:name/:birthday）：

parts = ["majotabi", "elaina", "1017"]

- height=0 → 匹配 "majotabi" 节点

- height=1，part="elaina" → :name 是通配符 → 直接进入

- height=2 → 匹配 "1017" 节点

到达叶子节点 → 返回该节点（匹配成功！）

通配符 * 的神奇之处（请求 /assets/css/style.css）：

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
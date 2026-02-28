---
title: "Golang 笔记Day01 基础篇"
date: 2026-02-27T23:00:00+08:00
draft: false
tags: ["Golang", "Go 1.26", "基础语法", "后端开发"]
categories: ["Golang 学习笔记"]
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/18a085a00341d8cec36657c0c1699988affc8b791c5000-ovUDyw.jpg"
---

## 1. 编写第一个 Go 程序

### 1.1 程序源码

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello world!")
}
```

### 1.2 运行和编译

- **运行命令：**
  ```shell
  go run main.go
  ```
- **编译后运行：**
  ```shell
  go build main.go
  ./main
  ```

### 1.3 2026 年新增或删改内容 (Go 1.24/1.26)

- **工具链优化：** `go mod init` 现在默认指定较低的 Go 版本（例如 1.25.0），以增强模块的向后兼容性。
- **命令行工具：** 原有的 `go tool doc` 已被弃用并删除，建议全面切换到 `go doc` 命令。
- **自动版本嵌入：** `go build` 现在会自动根据版本控制系统（VCS）的标签或提交记录在编译后的二进制文件中嵌入主模块版本。

> **💡 注意：**
> 1. 必须是 `main` 包：`package main`
> 2. 必须有 `main` 函数：`func main()`
> 3. 文件名不一定是 `main.go`

---

## 2. 与其他编程语言的差异

### 2.1 返回值

- Go 中 `main` 函数不支持任何返回值。
- 通过 `os.Exit()` 函数退出程序。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    fmt.Println("Hello world!")
    os.Exit(0)
}
```

> **⚠️ 注意：**
> - `os.Exit()` 函数会立即退出程序，不会执行 `defer` 函数。
> - 退出返回值 `0` 表示正常退出，非 `0` 值表示异常退出。

### 2.2 获取命令行参数

- `main` 函数不支持传入参数（即没有 `func main(arg []string)`）。
- 在程序中直接通过 `os.Args` 获取命令行参数，第一个参数是程序名。

```go
package main

import (
    "fmt"
    "os"
)

func main() {
    if len(os.Args) > 1 {
        fmt.Println("Hello world!", os.Args[1])
    }
}
``` 

**命令行参数示例：**
```shell
./main elari39
```
**输出结果：**
```text
Hello world! elari39
```

### 2.3 2026 年新增或删改内容 (Go 1.26)

- **`new` 函数增强：** 以往 `new(T)` 只能创建零值指针，现在 `new` 允许直接传入表达式来初始化变量，这在处理 JSON 或 Protobuf 的可选字段（指针类型）时非常方便。
  ```go
  // 传统方式
  val := 300
  ptr := &val

  // Go 1.26+ 简化方式
  ptr := new(int(300)) 
  ```

---

## 3. 变量、常量与测试

### 3.1 编写测试程序

1. 源码文件以 `_test.go` 结尾：`xxx_test.go`
2. 测试函数以 `Test` 开头：`func TestXXX(t *testing.T){...}`

**测试示例：**
```go
// filename: first_test.go
package try_test

import (
    "testing"
)

func TestFirstTry(t *testing.T) {
    t.Log("My first test!")
}
```

### 3.2 实现 Fibonacci 数列

> 1, 1, 2, 3, 5, 8, 13, ...

```go
// fib_test.go
package fib

import (
    "testing"
)

func TestFibList(t *testing.T) {
    // 快捷赋值方式
    a, b := 1, 1
    t.Log(a)
    for i := 0; i < 5; i++ {
        t.Log(" ", b)
        tmp := a
        a = b
        b = tmp + b
    }
}
```

### 3.3 变量赋值与交换

- **自动类型推断：**
  ```go
  a := 1       // int
  b := 1.0     // float64
  c := "hello" // string
  ```
- **多变量同时赋值：**
  ```go
  a, b := 1, 2
  // 简化交换 a, b 的值
  a, b = b, a
  ```

### 3.4 常量定义

- **快速设置连续值 (iota)：**
```go
const (
    Monday = iota + 1 // 1
    Tuesday           // 2
    Wednesday         // 3
    Thursday          // 4
    Friday            // 5
    Saturday          // 6
    Sunday            // 7
)

const (
    Open = 1 << iota  // 1
    Close             // 2
    Pending           // 4
)
```

### 3.5 2026 年新增或删改内容 (Go 1.22+)

- **`for` 循环变量语义修复 (Go 1.22)：** 解决了经典的“循环变量在闭包中共享”的问题。现在 `for` 循环每次迭代都会创建新变量，无需再手动使用 `i := i`。
- **测试框架增强 (Go 1.25/1.26)：** 引入了 `testing/synctest` (1.25 实验性) 和 `testing/cryptotest` (1.26)，为并发同步和加密算法测试提供了官方支持。
- **现代化工具：** `go fix` 现已重写，包含数十个“现代化分析器”，可自动将代码库更新到最新的惯用法。

---

## 4. 数据类型

### 4.1 基本数据类型

- **布尔型：** `bool`
- **整型：** `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64`
- **浮点型：** `float32`, `float64`
- **复数型：** `complex64`, `complex128`
- **字符串型：** `string`
- **字节型：** `byte` (alias for `uint8`)
- **符文型：** `rune` (alias for `int32`)

### 4.2 类型转换

- **不允许隐式类型转换：** `int` 类型不能直接赋值给 `float` 类型。
  ```go
  var a int = 10
  var b float64 = float64(a) // 必须显式转换
  ``` 
- **别名和原有类型也不能隐式转换。**

### 4.3 指针类型

1. **不支持指针运算：** 例如 `&a + 1` 是错误的。
2. **`string` 是值类型：** 其默认初始化值为空字符串 `""`，而不是 `nil`。

### 4.4 2026 年新增或删改内容 (Go 1.24/1.26)

- **泛型类型别名 (Go 1.24)：** 允许类型别名也支持泛型参数。
- **自引用泛型 (Go 1.26)：** 泛型类型现在可以在自身的类型参数列表中引用自己，极大地增强了复杂数据结构和接口的描述能力。
  ```go
  type Adder[A Adder[A]] interface {
      Add(A) A
  }
  ```

---

## 5. 运算符

### 5.1 算术与比较

- **算术运算符：** `+`, `-`, `*`, `/`, `%`, `++`, `--`
- **比较运算符：** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **用 `==` 比较数组：** 
  - 相同维数且长度相同的数组才可以比较。
  - 每个元素都相同才相等。

### 5.2 位运算符

- **按位与/或/异或/取反：** `&`, `|`, `^`, `~`
- **左移/右移：** `<<`, `>>`
- **`&^` 按位清空 (AND NOT)：** `a &^ b` 表示将 `a` 中与 `b` 中为 `1` 的位清空。
  - `1 &^ 0 = 1`
  - `1 &^ 1 = 0`
  - `0 &^ 1 = 0`
  - `0 &^ 0 = 0`

### 5.3 2026 年新增或删改内容

- **编译器优化：** 虽然基础运算符没有变动，但 Go 1.25/1.26 的编译器针对 64 位平台（如 amd64/arm64）对位运算和算术运算进行了更深入的向量化优化，性能显著提升。

---

## 6. 条件与循环

### 6.1 循环 (for)

> **Go 仅支持 `for` 关键字：**

```go
// while 模式
n := 0
for n < 5 {
    fmt.Println(n)
    n++
}

// 无限循环
for {
    // ...
}
```

### 6.2 条件控制 (if/switch)

- **`if` 条件：**
  1. 结果必须为 `bool` 类型。
  2. 支持初始化变量：`if v, err := someFunc(); err == nil { ... }`

- **`switch` 条件：**
  1. 表达式不限制为常量或整数。
  2. 单个 `case` 支持多个选项：`case 1, 2, 3:`
  3. 不需要 `break` 显式退出。
  4. 支持无表达式模式（等同于多重 `if-else`）。

### 6.3 2026 年新增或删改内容 (Go 1.22/1.23)

- **`range` 整数 (Go 1.22)：** 现支持直接 `for i := range 10` 来循环 10 次。
- **`range` 函数/迭代器 (Go 1.23)：** 引入了标准迭代器支持，允许 `for` 循环遍历自定义函数返回的序列。

---

## 7. 数组与切片

### 7.1 数组

```go
var a [3]int            // 声明
a := [3]int{1, 2, 3}    // 初始化
a := [...]int{1, 2, 3}  // 自动长度
```

### 7.2 切片 (Slice)

- **内部结构：** 底层数组指针、长度 (`len`)、容量 (`cap`)。
- **声明与初始化：**
  ```go
  var s []int            // 声明
  s := []int{1, 2, 3}    // 初始化
  s := make([]int, 3, 5) // 指定 len 和 cap
  ```
- **切片扩容：** 容量小于 1024 时翻倍，大于等于 1024 时增加 1/4。
- **共享存储：** 切片是引用类型，多个切片可指向同一底层数组。

### 7.3 2026 年新增或删改内容 (Go 1.21/1.26)

- **`slices` 标准库 (Go 1.21)：** 引入泛型包 `slices`，提供 `Sort`, `Contains`, `Reverse` 等高效操作。
- **栈分配优化 (Go 1.26)：** 编译器现在可以在更多场景下将切片的底层存储分配到栈上，大幅减少堆内存分配和 GC 压力。

---

## 8. Map 与 Set

### 8.1 Map 声明与访问

- **声明：** `m := map[string]int{"a": 1}` 或 `make(map[string]int, 10)`。
- **访问：** Key 不存在时返回零值。
- **判断 Key 是否存在：** `value, ok := m["key"]`

### 8.2 实现 Set

Go 内置没有 Set，通常通过 `map[type]bool` 实现。

```go
s := map[int]bool{}
s[1] = true // 添加
if s[1] { /* 存在 */ }
delete(s, 1) // 删除
```

### 8.3 2026 年新增或删改内容 (Go 1.21/1.23)

- **`maps` 标准库 (Go 1.21)：** 引入 `maps` 包，包含 `Keys`, `Values`, `Copy`, `DeleteFunc` 等常用操作。
- **`unique` 包 (Go 1.23)：** 引入了 `unique` 包，用于“值驻留”（Interning）。当 Map 的 Key 或 Value 存在大量重复字符串时，使用 `unique.Handle` 可以显著节省内存。

---

## 9. 字符串

- **特性：** 只读的 `byte slice`，`string` 是值类型。
- **编码：** `Unicode` 是字符集，`UTF-8` 是编码实现。

**编码与存储示例：**

| 字符 | Unicode 码点 | UTF-8 编码 | string / []byte |
| :---: | :---: | :---: | :---: |
| "中" | `0x4E2D` | `0xE4B8AD` | `[0xE4, 0xB8, 0xAD]` |

### 9.1 2026 年新增或删改内容 (Go 1.21+)

- **`cmp` 标准库 (Go 1.21)：** 引入泛型包 `cmp`，统一了字符串和数值的比较操作。
- **现代化迁移：** 建议使用 `go fix` 自动将旧的 `fmt.Printf` 误用或低效字符串拼接模式迁移至最新的现代 API。


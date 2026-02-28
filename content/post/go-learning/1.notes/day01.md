---
title: "Golang 笔记Day01 基础篇"
date: 2026-02-27T23:00:00+08:00
draft: false
tags: ["Golang", "学习记录"]
categories: ["GolangStudy"]
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

---

## 9. 字符串

- **特性：** 只读的 `byte slice`，`string` 是值类型。
- **编码：** `Unicode` 是字符集，`UTF-8` 是编码实现。

**编码与存储示例：**

| 字符 | Unicode 码点 | UTF-8 编码 | string / []byte |
| :---: | :---: | :---: | :---: |
| "中" | `0x4E2D` | `0xE4B8AD` | `[0xE4, 0xB8, 0xAD]` |

---

## 🚀 Go 1.26+ 最新动态与补充

针对教程内容，基于最新版 **Go 1.26** (2026-02-10 发布) 的补充说明：

### 🛠️ 基础工具链
- **推荐使用 Go Modules：** 执行 `go mod init <name>` 后，推荐使用 `go run .` 运行整个包。
- **构建优化：** `go build` 和 `go run` 的缓存机制更加智能。

### 📦 内置函数增强
- **`min` & `max` (Go 1.21+)：** 支持任意可比较类型，无需手动编写。
- **`new` 函数增强 (Go 1.26+)：** 支持直接传入表达式初始化指针值。
  ```go
  p := new(42) // 直接创建指向 42 的 *int
  ```
- **`clear` 函数 (Go 1.21+)：** 用于快速清空 `slice`（元素置零）或 `map`（删除所有键值对）。

### 🔄 循环与迭代 (Go 1.22+)
- **作用域安全：** `for` 循环每次迭代都会创建新变量，解决了闭包捕获的问题。
- **Range over Integer：** 
  ```go
  for i := range 5 { // 0, 1, 2, 3, 4
      fmt.Println(i)
  }
  ```

### 📚 标准库推荐
- **`slices` 包：** 提供 `Sort`, `Contains`, `Delete`, `Insert`, `Clone` 等高效操作。
- **`maps` 包：** 提供 `Clone`, `Equal`, `Keys`, `Values` 等实用工具。
- **性能优化：** Go 1.26 编译器对切片的逃逸分析更加优化，减少 GC 压力。

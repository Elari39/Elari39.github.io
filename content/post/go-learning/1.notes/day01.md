---
title: "Golang 笔记Day01 基础篇"
date: 2026-02-27T23:00:00+08:00
draft: false
tags: ["Golang", "学习记录"]
categories: ["GolangStudy"]
---

## 编写第一个go程序

```go
package main

import "fmt"

func main(){
    fmt.Println("Hello world!")
}
```

### 运行和编译

运行命令：
```shell
go run main.go
```
编译后运行命令：
```shell
go build main.go
./main
```

### 注意：

> 1. 必须是main包：package main
> 2. 必须有main函数：func main()
> 3. 文件名不一定是main.go

### 与其他注意编程语言的差异

#### 返回值

- Go中main函数不支持任何返回值
- 通过os.Exit()函数退出程序

```go
package main

import (
    "fmt"
    "os"
)

func main(){
    fmt.Println("Hello world!")
    os.Exit(0)
}
```

> 注意：
> - os.Exit()函数会立即退出程序，不会执行defer函数
> - 退出返回值0表示正常退出，非0值表示异常退出

#### 获取命令行参数

- main函数不支持传入参数
  - func main(<del>arg []string</del>)
- 在程序中直接通过os.Args获取命令行参数，第一个参数是程序名

```go
package main

import (
    "fmt"
    "os"
)

func main(){
    if len(os.Args) > 1 {
        fmt.Println("Hello world!", os.Args[1])
    }
}
``` 

命令行参数示例：
```shell
./main elari39
```

> 输出：
> Hello world! elari39

## 变量、常量以及与其他语言的差异

### 编写测试程序

1. 源码文件以_test.go结尾：xxx_test.go
2. 测试函数以Test开头：func TestXXX(t *testing.T){...}

### 测试示例

```go
// filename: first_test.go
package try_test

import (
    "testing"
)

func TestFirstTry(t *testing.T){
    t.Log("My first test!")
}
```

### 实现Fibonacci数列

> 1,1,2,3,5,8,13,...

```go
//fib_test.go
package fib

import (
    "fmt"
    "testing"
)

func TestFibList(t *testing.T){
    /* var a int=1
    var b int=1 */
    //简写
    /* var (
        a int=1
        b int=1
    ) */
    //快捷方式
    a,b:=1,1
    // fmt.Println(a)
    t.Log(a)
    for i:=0;i<5;i++{
        // fmt.Println(" ",b)
        t.Log(" ",b)
        tmp:=a
        a=b
        b=tmp+b
    }
    // fmt.Println()
    t.Log()
}
```

### 与其他注意编程语言的差异

#### 变量赋值
- 赋值可以进行自动类型推断
> a:=1
> b:=1.0
> c:="hello"
- 在一个赋值语句中可以对多个变量进行同时赋值
```go
a,b:=1,2
// 交换a,b的值
/* tmp:=a
a=b
b=tmp */
// 简化交换a,b的值
a,b=b,a
```

#### 常量

- 快速设置连续值
```go
const (
    Monday = iota+1 // 1
    Tuesday// 2
    Wednesday// 3
    Thursday// 4
    Friday// 5
    Saturday// 6
    Sunday// 7
)
const (
    Open = 1<<iota// 1
    Close// 2
    Pending// 4
)
```

## 数据类型

### 基本数据类型

> 1. 布尔型：bool
> 2. 整型：int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64
> 3. 浮点型：float32, float64
> 4. 复数型：complex64, complex128
> 5. 字符串型：string
> 6. 字节型：byte // alias for uint8 
> 7. 符文型：rune // alias for int32

### 与其他编程语言的差异

#### 类型转化

- Go语言不允许隐式类型转换
> 例如：int类型不能直接赋值给float类型
```go
var a int = 10
var b float64 = a // 编译错误
``` 

- 别名和原有类型也不能进行类型转换
```go
var a int = 10
var b byte = a // 编译错误
``` 

#### 类型的预定义值

1. math.MaxInt32
2. math.MaxInt64
3. math.MaxFloat32
4. math.MaxFloat64
5. math.MaxUint32

#### 指针类型

1. 不支持指针运算
> 例如：&a+1是错误的

2. string是值类型，其默认的初始化值为空字符串，而不是nil
> 例如：
> var s string
> fmt.Println(s) // 输出空字符串
> fmt.Println(s == "") // 输出 true

## 运算符

### 算术运算符

1. 加法：+
2. 减法：-
3. 乘法：*
4. 除法：/
5. 取余：% 
6. 自增：++
7. 自减：--

### 比较运算符

1. 等于：==
2. 不等于：!=
3. 大于：>
4. 小于：<
5. 大于等于：>=
6. 小于等于：<=

#### 用 == 比较数组

- 相同维数且含有相同个数元素的数组才可以比较
> 例如：
> a:=[...]int{1,2,3}
> b:=[...]int{1,2,3}
> fmt.Println(a==b) // 输出true

- 每个元素都相同的才相等
> 例如：
> a:=[...]int{1,2,3}
> b:=[...]int{1,2,4}
> fmt.Println(a==b) // 输出false

### 逻辑运算符

1. 与：&&
2. 或：||
3. 非：!

### 位运算符

1. 按位与：&
2. 按位或：|
3. 按位异或：^
4. 按位取反：~
5. 左移：<<
6. 右移：>>

> 与其他编程语言的差异（位运算符）：
> **&^ 按位清空（AND NOT）**
> a&^b表示将a中与b中为1的位清空，为0的位保持不变(*右边为1，则清零；右边为0，则保持不变*)
> - 1&^0=1
> - 1&^1=0
> - 0&^1=0
> - 0&^0=0

## 条件和循环

### 循环

> 与其他主要编程语言的差异：
**Go语言仅支持循环关键字for**
`for j:=0;j<5;j++{...}`
```go
//while循环
n:=0
for n<5{
    fmt.Println(n)
    n++
}

//无限循环
for{
    fmt.Println("infinite loop")
}
```

### 条件

#### if条件

> 与其他主要编程语言的差异：
1. condition表达式结果必须为bool类型
> 例如：
> if 1==1{...} // 编译通过
> if a:=1;a==1{...} // 编译通过

2. 支持变量赋值：
> 例如：
> if var declaration;condition{...}
> if v,err:=someFunc();err==nil{...}

#### switch条件

> **与其他主要编程语言的差异：**
1. 条件表达式不限制为常量或者整数
> 例如：
> switch time.Now().Weekday(){
> case time.Saturday,time.Sunday:
>     fmt.Println("weekend")
> default:
>     fmt.Println("weekday")
> }

2. 单个case中，可以出现多个结果选项，使用逗号分隔
> 例如：
> switch a{
> case 1,2,3:
>     fmt.Println("1,2,3")
> } // 编译通过

3. 与c语言等规则相反，Go语言不需要用break来明确退出一个case
> 例如：
> switch a{
> case 1,2,3:
>     fmt.Println("1,2,3")
> default:
>     fmt.Println("other")
> } // 编译通过

4. 可以不设定swicth之后的条件表达式，在此种情况下，整个switch结构与多个if-else的逻辑作用等同
> 例如：
> switch{
> case a==1:
>     fmt.Println("1")
> case a==2:
>     fmt.Println("2")
> default:
>     fmt.Println("other")
> } // 编译通过

## 数组和切片

### **数组的声明和初始化**

> 例如：
> var a [3]int // 声明一个长度为3的int数组
> a[0]=1
> 
> a:=[3]int{1,2,3} // 初始化一个长度为3的int数组
> a:=[...]int{1,2,3} // 初始化一个长度为3的int数组，省略长度 
> c:=[2][2]int{
> {1,2},
> {3,4}
> } // 初始化一个2*2的int数组

### 数组的遍历

```go
func TestArrayTravel(t *testing.T) {
    a:=[...]int{1,2,3}
    for i:=0;i<len(a);i++{
        fmt.Println(a[i])
    }
    for index,element:=range a{// 遍历数组，index为索引，element为元素
        fmt.Println(index,element)
    }
}
```

### 数组的截取

> 例如：
> a:=[...]int{1,2,3,4,5}
> b:=a[1:3] // 截取a数组的索引1到索引3之间的元素，不包含索引3
> fmt.Println(b) // 输出[2 3]
> b:=a[1:] // 截取a数组的索引1到末尾的元素
> fmt.Println(b) // 输出[2 3 4 5]
> b:=a[:3] // 截取a数组的索引0到索引3之间的元素，不包含索引3
> fmt.Println(b) // 输出[1 2 3]
**不支持为负数的截取：a[-1:]是错误的**

### 切片

#### **切片内部结构：**

1. 指向底层数组的指针
2. 切片的长度（len）
3. 切片的容量（cap） 

#### 切片的声明和初始化

> 例如：
> var s []int // 声明一个int类型的切片
> s:=[]int{1,2,3} // 初始化一个int类型的切片
> s:=make([]int,3,5) // 初始化一个int类型的切片，长度为3，容量为5
> s:=append(s,4,5) // 向切片s中追加元素4和5
> 
> fmt.Println(s) // 输出[0 0 0 4 5]
> fmt.Println(len(s)) // 输出3
> fmt.Println(cap(s)) // 输出5

#### 切片的扩容

> 切片的容量是指切片底层数组的长度，而切片的长度是指切片中元素的个数
> 当切片的长度超过了容量时，切片就会自动扩容
> 扩容的规则是：如果容量小于1024，则每次扩容一倍；如果容量大于等于1024，则每次扩容1/4

```go
func TestSliceExpand(t *testing.T) {
    s:=[]int{1,2,3}
    fmt.Println(len(s),cap(s)) // 输出3 3
    s=append(s,4)
    fmt.Println(len(s),cap(s)) // 输出4 6
}
```

#### 切片共享存储结构

> 切片是引用类型，它的底层数组是共享的
> 例如：
> s:=[]int{1,2,3}
> t:=s
> fmt.Println(s,t) // 输出[1 2 3] [1 2 3]
> t[0]=100
> fmt.Println(s,t) // 输出[100 2 3] [100 2 3]
> fmt.Println(&s[0],&t[0]) // 输出0xc000014098 0xc000014098，说明s和t的底层数组是共享的

```go
func TestSliceShare(t *testing.T) {
    year:=[]string{"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"}
    Q2:=year[3:6]
    fmt.Println(Q2,len(Q2),cap(Q2)) // 输出[Apr May Jun] 3 9
    Summer:=year[5:8]
    fmt.Println(Summer,len(Summer),cap(Summer)) // 输出[Jun Jul Aug] 3 7
    Summer[0]="Unknow"
    fmt.Println(year) // 输出[Jan Feb Mar Apr Unknow Jun Jul Aug Sep Oct Nov Dec]
}
```

### 数组 vs 切片

1. 容量是否可伸缩
> 数组的容量是固定的，不能伸缩
> 切片的容量是可伸缩的，当切片的长度超过了容量时，切片就会自动扩容
2. 是否可以进行比较
> 数组是值类型，数组与数组直接进行比较时，比较的是数组的每个元素是否相等；数组与切片不能直接进行比较
> 切片是引用类型，切片与切片之间不能直接进行比较，只能使用len()和cap()函数来比较切片的长度和容量

## Map 声明、元素访问及遍历

### Map声明

> 例如：
> m:=map[string]int{
> "a":1,
> "b":2,
> }
> 
> m1:=map[string]int{}
>
> m1["one"]=1
>
> m2:=make(map[string]int,10 ) // 初始化一个string到int的map，容量为10

**为什么不初始化len？：**
> 因为map的len是动态的，它会根据元素的添加和删除而变化
> 而cap是固定的，它是map的初始容量，不能超过这个值

```go
func TestInitMap(t *testing.T) {
    m:=map[string]int{
        "a":1,
        "b":2,
    }
    t.Log(m,len(m),cap(m)) // 输出map[a:1 b:2] 2 10
}
```

### Map元素访问

> 与其他主要编程语言的差异：

- 在访问的Key不存在时，Go语言的map会返回零值，而不是通过返回nil来判断元素是否存在
    - **面对不存在的key，map会返回零值。**
        > 例如：
        > fmt.Println(m["c"]) // 输出0
        > fmt.Println(m1["one"]) // 输出1
        > fmt.Println(m2["two"]) // 输出0

- 可以使用双赋值语句来判断一个key是否存在
    - **如何判断一个key是否存在？**
        > 可以使用双赋值语句来判断一个key是否存在
        > 例如：
        > value,ok:=m["a"]
        > if ok{
        > fmt.Println("key a exists,value is",value) 
        > }else{
        > fmt.Println("key a does not exist")
        > }

### Map遍历

> 例如：
> for key,value:=range m{
> fmt.Println(key,value)
> }

## Map与工厂模式，在Go语言中实现Set

- Map的value可以是一个方法
    - **如何使用Map的value是一个方法？**
        > 可以将一个方法赋值给Map的value，然后通过key来调用这个方法
        > 例如：
        > m:=map[string]func(int)int{
        > "add":func(a int)int{return a+1},
        > "sub":func(a int)int{return a-1},
        > }
        > fmt.Println(m["add"](1)) // 输出2
        > fmt.Println(m["sub"](1)) // 输出0

```go
func TestMapWithFunValue(t *testing.T) {
    m:=map[string]func(int)int{}
    m["add"]=func(a int)int{return a+1}
    m["sub"]=func(a int)int{return a-1}
    t.Log(m["add"](1)) // 输出2
    t.Log(m["sub"](1)) // 输出0
}
```

- 与Go的Dock type接口方式一起，可以方便的实现单一方法对象的工程模式

### 实现Set

Go的内置集合中没有Set实现，可以通过map来实现Set的功能（map[type]bool）

1. 元素的唯一性
2. 基本操作
    - 1. 添加元素
    - 2. 检查元素是否存在
    - 3. 删除元素
    - 4. 元素个数

```go
func TestMapForSet(t *testing.T) {
    s:=map[int]bool{}
    s[1]=true
    n:=1
    if s[n]{
        t.Logf("%d exists",n)
    }else{
        t.Logf("%d does not exist",n)
    }
    s[3]=true
    t.Logf("s has %d elements",len(s)) 
    delete(s,3)
    t.Logf("s has %d elements after delete",len(s))
    if s[3]{
        t.Logf("%d exists",3)
    }else{
        t.Logf("%d does not exist",3)
    }
}
```

## 字符串

### 字符串的基本操作

与其他主要编程语言的差异：
1. string是数据类型，不是引用或者指针类型
> 例如：
> var s string
> fmt.Println(s) // 输出""
> fmt.Println(&s) // 输出0xc000014098，说明s是一个指针类型

2. string是只读的byte slice，len函数可以返回字符串的字节数，而不是字符数
> 例如：
> s:="hello"
> fmt.Println(len(s)) // 输出5，说明s有5个字节
> fmt.Println(len([]rune(s))) // 输出5，说明s有5个字符
 
3. string的byte数组可以存放任意数据
> 例如：
> s:="hello"
> fmt.Println([]byte(s)) // 输出[104 101 108 108 111]，说明s的每个字符都对应一个字节

### Unicode UTF-8编码

1. Unicode是一个字符集，它定义了世界上所有的字符，每个字符都有一个唯一的编号（称为码点 code point）
2. UTF-8是一种编码方式(unicode的一种实现:转换为字节序列的规则)，它将每个码点映射为一个或多个字节
3. 每个字节的最高位为0，其他位为码点的二进制表示 

### 编码与存储
| 字符 | "中" | 
| :---: | :---: | 
|Unicode码点| 0x4E2D |
|UTF-8编码| 0xE4B8AD |
|string/[]byte| [0xE4,0xB8,0xAD] |

### 常用字符串函数

1. strings包(https://golang.org/pkg/strings/)
2. strconv包(https://golang.org/pkg/strconv/)

```go
func TestStringFn(t *testing.T) {
    s:="A,B,C"
    // 字符串分割
    parts:=strings.Split(s,",")
    t.Log(parts) // 输出[A B C]
    for _,part:=range parts{
        t.Log(part)
    }
    // 字符串拼接
    t.Log(strings.Join(parts,"-")) // 输出A-B-C
}
func TestConvFn(t *testing.T) {
    s:="123"
    // 字符串转换为整数
    i,err:=strconv.Atoi(s)
    if err!=nil{
        t.Fatal(err)
    }
    t.Log(i+10) // 输出133
    // 整数转换为字符串
    s=strconv.Itoa(i)
    t.Log("str is",s) // 输出str is 123
}
```

## 2026与课程的差异：

**以下是针对教程内容，基于最新版 Go 1.26（2026 年 2 月 10 日正式发布）的补充说明。**

---

### 编写第一个go程序
（你的原有代码和运行命令保持不变）

**【Go 1.26 最新版更新】**  

- **强烈推荐使用 Go Modules**（自 Go 1.13 起已成为标准做法）：  
  ```shell
  go mod init example.com/myapp   # 项目根目录执行一次即可
  go run .                        # 推荐写法（运行整个包）
  go run main.go                  # 仍完全支持
  ```
- `go build` 和 `go run` 会自动使用构建缓存，可执行文件缓存更智能。

#### 注意：
（原有 3 点保持不变）

#### 与其他注意编程语言的差异

（返回值、命令行参数部分保持不变）

---

### 变量、常量以及与其他语言的差异

（你的变量赋值、交换值、iota 等示例保持不变）
**【Go 1.26 最新版更新】**  
- **Go 1.21** 新增内置函数 `min`、`max`（支持任意可比较类型）：
  ```go
  m := max(1, 3, 2)        // 3
  n := min(1.1, 2.2, 0.5)  // 0.5
  ```
- **Go 1.26** `new` 函数增强：现在支持传入**表达式**直接初始化值（极大简化指针初始化）：
  ```go
  // Go 1.26+ 写法
  p := new(42)                    // *int，指向的值是 42
  u := new(User{Name: "Alice"})   // *User，已初始化字段
  // 旧写法仍支持
  p := new(int)
  *p = 42
  ```
---

### 数据类型

（基本数据类型列表保持不变）
**【Go 1.26 最新版更新 & 修正】**  
- **Go 1.18** 引入 `any`（等价于旧的 `interface{}`）和 `comparable` 接口（泛型常用约束）。
- **Go 1.21** 新增内置 `clear()` 函数（用于 slice 和 map）：
  ```go
  s := []int{1, 2, 3}
  clear(s)           // s 变为 [0 0 0]，len 和 cap 不变
  m := map[string]int{"a": 1}
  clear(m)           // map 清空
  ```
---

### 运算符

（算术、比较、逻辑、位运算符保持不变，`&^` 仍存在）
**【Go 1.26 最新版更新】**  
无语法变化。

---

### 条件和循环

（while、无限循环写法保持不变）
**【Go 1.22+ 重要更新（强烈建议加入教程）】**  
1. **for 循环变量作用域变更**（Go 1.22）：  
   每一次迭代都会创建一个**全新的循环变量**，彻底解决多年来“for 循环 + 闭包/ goroutine”捕获最后一个值的经典 bug。旧代码通常仍能工作，但新代码更安全。
2. **新增 range over integer**（Go 1.22，最常用语法糖）：
   ```go
   for i := range 5 {     // 等价于 for i := 0; i < 5; i++
       fmt.Println(i)     // 输出 0 1 2 3 4
   }
   ```
---

### 数组和切片

（声明、初始化、遍历、截取保持不变）
**【Go 1.21+ 重大更新】**  
- **强烈推荐导入 `slices` 标准包**（Go 1.21）：
  ```go
  import "slices"
  slices.Sort(s)                    // 排序
  slices.Contains(s, 42)            // 是否包含
  s = slices.Delete(s, 1, 3)        // 删除元素
  s = slices.Insert(s, 2, 99)       // 插入元素
  s2 := slices.Clone(s)             // 深拷贝
  ```
- **内置 `clear(s)`**（Go 1.21，见数据类型章节）。
- **Go 1.26** 编译器优化：更多情况下切片底层数组会分配在栈上，性能更好、GC 压力更小。

#### 数组 vs 切片

（原有对比保持，但补充：现在推荐用 `slices.Equal`、`slices.Compare` 来比较切片）

---

### Map 声明、元素访问及遍历

（声明、访问、遍历、Set 实现保持不变）
**【Go 1.21+ 更新】**  
- **强烈推荐导入 `maps` 标准包**（Go 1.21）：
  ```go
  import "maps"
  m2 := maps.Clone(m)          // 拷贝 map
  maps.Equal(m1, m2)           // 比较两个 map 是否相等
  keys := maps.Keys(m)         // 返回所有 key 的迭代器（可 range）
  values := maps.Values(m)     // 返回所有 value 的迭代器
  ```
- `clear(m)` 内置函数（推荐替代手动循环 delete）。

---

### 字符串

（基本操作、Unicode、常用函数保持不变）
**【Go 1.26 最新版更新】**  
无重大语法变化，但推荐结合 `slices` 包处理字节/字符切片。

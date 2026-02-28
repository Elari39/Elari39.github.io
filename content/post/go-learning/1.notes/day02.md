---
title: "Golang 笔记Day02 基础篇"
date: 2026-02-28T21:00:00+08:00
draft: false
tags: ["Golang", "学习记录", "Go 1.26", "后端开发"]
categories: ["GolangStudy", "Golang进阶"]
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20200930104704_7950d.jpeg"
---

## 1. Go 语言的函数

### 1.1 函数是一等公民

> 与其他主要编程语言的差异
>
> 1. 可以有多个返回值
> 2. 所有参数都是按值传递：slice，map，channel会有传引用的错觉
> 3. 函数可以作为变量的值
> 4. 函数可以作为参数和返回值

```go
func returnMultiValues()(int,int){
    return rand.Intn(10),fand.Intn(20)
}
// timeSpent 是一个装饰器函数，用于计算函数执行时间
func timeSpent(inner func (op int) int) func (op int) int{// inner 是被装饰的函数
    return func(n int) int {
        start:=time.Now()// 记录开始时间
        ret:=inner(n)// 调用原函数
        fmt.Println("time spent:",time.Since(start)) // 打印函数执行时间
        return ret // 返回原函数的返回值
    }
}
func slowFun(op int) int{
    time.Sleep(time.Second)
    return op
} 

func TestFn(t *testing.T){
    a,g:=returnMultiValues()
    t.Log(a,b)
    tsSF:=timeSpent(slowFun)
    t.Log(tsSF(10))
}
```

> 推荐书籍：计算机程序的构造与解释

### 1.2 2026年新增或删改内容

> **Go 1.26 新特性：`new(expr)` 表达式初始化**
>
> 在 Go 1.26 之前，`new` 只能接受类型作为参数。现在，`new` 允许接受一个表达式，并直接使用该表达式的值进行初始化。这在处理 JSON 或 Protobuf 中的可选指针字段时非常有用。

```go
// 以前的写法
x := 42
p := &x

// Go 1.26 写法
p := new(42) // 分配 int 并初始化为 42，返回 *int

// 在结构体初始化中更简洁
type Person struct {
    Age *int
}
person := Person{Age: new(25)}
```

## 2. 可变参数和 defer

### 2.1 可变参数

> 可变参数是指函数可以接受任意数量的参数。
>
> 可变参数必须是函数的最后一个参数。

```go
// sum 函数接受任意数量的整数参数，并返回它们的和
func sum(nums ...int) int{
    ret:=0 // 初始化结果为0
    for _,v:=range nums{
        ret+=v // 累加每个参数的值
    }
    return ret // 返回累加结果
}

```

### 2.2 defer 函数

> defer 函数是在函数返回前执行的函数。
>
> 多个 defer 函数按照先进后出的顺序执行。
>
> defer 函数可以用于资源释放、日志记录等场景。
>
> 注意：defer 函数中的变量是在定义时就确定的，而不是在执行时确定的。


```go
func TestDefer(t *testing.T){
    defer func(){
        t.Log("Close resources")
    }() // 定义 defer 函数,在函数返回前执行
    t.Log("Start") // 打印 "Start"
    panic("Fatal error") // 触发 panic 异常,defer 仍会执行
    t.Log("End") // 不会执行
}

```

### 2.3 2026年新增或删改内容

> **Go 1.22 & 1.23：循环与迭代器的重大改进**
>
> 1. **循环变量作用域（Go 1.22）**：`for` 循环中的变量现在在每次迭代中都是唯一的，解决了闭包捕获循环变量的经典坑。
> 2. **Range over Integers（Go 1.22）**：支持 `for i := range 10` 这种简洁写法。
> 3. **Range over Functions（Go 1.23）**：引入了标准迭代器模式，支持对函数进行 `range`。

```go
// Go 1.22 Range over Int
for i := range 5 {
    fmt.Print(i) // 01234
}

// Go 1.23 Iterator (简化示例)
// iter.Seq[V] 是一个函数类型
func Backward(s []string) iter.Seq[string] {
    return func(yield func(string) bool) {
        for i := len(s) - 1; i >= 0; i-- {
            if !yield(s[i]) { return }
        }
    }
}
```

## 3. 行为的定义和实现

### 3.1 封装数据 and 行为

#### 3.1.1 结构体定义

> 结构体是一种自定义的数据类型,用于封装数据和行为。
>
> 结构体定义了一个对象的属性和方法。
>
> 结构体的属性是对象的状态,方法是对象的行为。

```go
// Employee 结构体定义了一个员工的属性
type Employee struct{
    ID string // 员工ID
    Name string // 员工姓名
    Age int // 员工年龄
}
```
> 实例创建与初始化
>
> 结构体可以通过字面量或 `new` 函数创建实例。
>
> 字面量初始化时,可以省略字段,未初始化的字段将使用零值。
>
> `new` 函数返回一个指向结构体的指针,所有字段都初始化为零值。

```go
e:=Employee{"0","Bob",20} // 初始化员工 e,ID 为 "0",姓名为 "Bob",年龄为 20
e1:=Employee{Name:"Alice",Age:25} // 初始化员工 e1,姓名为 "Alice",年龄为 25
e2:=new(Employee) // e2 是一个指向 Employee 结构体的指针,相当于 &Employee{}
e2.ID="1" //与其他主要编程语言的差异：通过实例的指针访问成员不需要使用 ->,直接使用 . 即可
e2.Name="Charlie"
e2.Age=30
```
### 3.1.2 方法（行为）定义

> 与其他主要编程语言的区别
>
> 1. 方法的接收者是结构体实例或指针。
> 2. 方法可以直接访问接收者的字段,无需使用 `this` 或 `self`。
> 3. 方法可以定义在结构体类型或指针类型上。

```go
// 第一种定义方式在实例对应方法被调用时，实例的成员会进行值复制
func (e Employee) String() string{
    fmt.Printf("Address is %x\n",unsafe.Pointer(&e.Name)) // 打印 Name 字段的地址   
    return fmt.Sprintf("ID:%s Name:%s Age:%d",e.ID,e.Name,e.Age)
}
// 通常情况下为了避免内存拷贝，我们使用第二种定义方式
// 第二种定义方式在指针方法中,可以通过指针访问实例的字段
func (e *Employee) String() string{
    fmt.Printf("Address is %x\n",unsafe.Pointer(&e.Name)) // 打印指针指向的 Name 字段的地址
    return fmt.Sprintf("ID:%s Name:%s Age:%d",e.ID,e.Name,e.Age)
}
```

### 3.1.3 2026年新增或删改内容

> **Go 1.24：Map 性能飞跃**
>
> Go 1.24 重新设计了 `map` 的底层实现（受 Swiss Table 启发），显著提升了查找和插入性能，并降低了长尾延迟。

## 4. Go 语言的相关接口

### 4.1 Duck Type 式接口实现

> 接口定义
> 接口是一种抽象类型,定义了一组方法签名。
> 任何实现了接口中所有方法的类型,都被认为实现了该接口。

```go
type Code string // 自定义类型 Code 是一个字符串类型,用于表示代码片段
type Programmer interface{
    WriteHelloWorld() Code // 方法 WriteHelloWorld 返回一个 Code 类型的值
}
```

> 接口实现
> 接口实现是指结构体或指针类型实现了接口中定义的所有方法。
> 接口实现是 Go 语言中实现多态的重要机制。
> 接口实现允许不同类型的对象对同一接口进行操作,实现了代码的灵活性和可扩展性。

```go
// GoProgrammer 结构体实现了 Programmer 接口
type GoProgrammer struct{
} 
// WriteHelloWorld 方法实现了 Programmer 接口的 WriteHelloWorld 方法
func (p *GoProgrammer) WriteHelloWorld() Code{
    return "fmt.Println(\"Hello world!\")"
} 

func TestClient(t *testing.T){
    var p Programmer // p 是一个 Programmer 接口类型的变量
    p=new(GoProgrammer) // p 指向一个 GoProgrammer 结构体实例
    t.Log(p.WriteHelloWorld()) // 调用 GoProgrammer 结构体的 WriteHelloWorld 方法
}
```

**与其他主要编程语言的差异**

> 1. 接口为非入侵性，实现不依赖于接口定义
>
> 2. 所以接口的定义可以包含在接口使用者包内

### 4.2 接口变量
> 接口变量是一种引用类型,可以指向实现了该接口的任意类型的实例。
> 接口变量可以存储不同类型的对象,实现了多态的效果。

`var prog Code=&GoProgrammer{}`

| 类型|数据|
|:--:|:--:|
| type GoProgrammer struct{ }  | &GoProgrammer{}|

### 4.3 自定义类型

> 自定义类型是指用户定义的新类型,可以基于已有的类型进行扩展。
> 自定义类型可以用于提高代码的可读性和可维护性。

1. type IntConvertionFn func (n int) int // 自定义类型 IntConvertionFn 是一个函数类型,参数为 int,返回值也为 int
2. type MyPoint int // 自定义类型 MyPoint 是一个 int 类型的别名,可以用于表示点的坐标

### 4.4 2026年新增或删改内容

> **Go 1.26：递归类型约束（Recursive Type Constraints）**
>
> 泛型类型现在可以在其类型参数列表中引用自身。这极大简化了某些复杂数据结构（如链表、树）的泛型实现。

```go
// 以前不被允许，现在可以了
type Adder[A Adder[A]] interface {
    Add(A) A
}

func algo[A Adder[A]](x, y A) A {
    return x.Add(y)
}
```

## 5. 扩展与复用

> 扩展与复用是指在已有的代码基础上,通过添加新的功能或修改现有代码,来实现代码的复用和扩展。
> 扩展与复用可以提高代码的可维护性和可扩展性,减少重复劳动和错误。

```go
package extension
type Pet struct{
}
func (p *Pet)Speak(){
    fmt.Println("...")
}
func (p *Pet)SpeakTo(host string){
    p.Speak()
    fmt.Printf(" ",host)
}
type Dog struct{
    p *Pet
}
func (d *Dog)Speak(){
    d.p.Speak()
}
func (d *Dog)SpeakTo(host string){
    // d.p.SpeakTo(host)
    d.Speak()
    fmt.Printf(" to %s",host)
}
func TestDog(t *testing.T){
    d:=new(Dog)
    d.SpeakTo("Chao")
    d.p=new(Pet)
    d.SpeakTo("Alice")
}
```

匿名嵌套类型
> 匿名嵌套类型是指在结构体中直接嵌入另一个结构体类型,而无需使用字段名。
> 匿名嵌套类型可以用于实现代码的复用和扩展,同时保持代码的简洁性。

```go
package extension
type Pet struct{
}
func (p *Pet)Speak(){
    fmt.Println("...")
}
func (p *Pet)SpeakTo(host string){
    p.Speak()
    fmt.Printf(" ",host)
}
type Dog struct{
    Pet
}
func TestDog(t *testing.T){
    d:=new(Dog)
    d.SpeakTo("Chao")
}
```

无法支持LSP
> 匿名嵌套类型无法支持LSP（语言服务器协议）,因为它没有字段名,无法被外部代码访问。
> 为了支持LSP,需要在结构体中添加字段名,或者使用指针嵌套类型。

## 6. 不一样的接口类型，一样的多态

### 6.1 接口类型的变量

```go
type Code string // 自定义类型 Code 是一个字符串类型,用于表示代码片段
type Programmer interface{
    WriteHelloWorld() Code // 方法 WriteHelloWorld 返回一个 Code 类型的值
}
// GoProgrammer 结构体实现了 Programmer 接口
type GoProgrammer struct{
} 
// WriteHelloWorld 方法实现了 Programmer 接口 of WriteHelloWorld 方法
func (p *GoProgrammer) WriteHelloWorld() Code{
    return "fmt.Println(\"Hello world!\")"
} 
// JavaProgrammer 结构体实现了 Programmer 接口
type JavaProgrammer struct{
} 
// WriteHelloWorld 方法实现了 Programmer 接口 of WriteHelloWorld 方法
func (p *JavaProgrammer) WriteHelloWorld() Code{
    return "System.out.println(\"Hello world!\");"
} 
func writerFirstProgram(p Programmer){
    fmt.Printf("%T %v\n",p,p.WriteHelloWorld())
}
func TestPalymorphism(t *testing.T){
    goProg:=new(GoProgrammer)
    javaProg:=new(JavaProgrammer)
    writerFirstProgram(goProg)
    writerFirstProgram(javaProg)
}
```

> 接口类型的变量可以存储不同类型的对象,实现了多态的效果。
> 接口类型的变量可以调用实现了该接口的任意类型的方法,而无需知道具体的类型。
> 这使得接口类型在编写可复用的代码时非常有用,可以提高代码的灵活性和可维护性。

### 6.2 空接口与断言

1. 空接口可以表示任何类型
2. 通过断言来讲空接口转换为指定类型
    - `v,ok:=p.(int) //ok为true时,v为int类型`
    - `v,ok:=p.(string) //ok为true时,v为string类型`
    - `v:=p.(int) //如果p不是int类型,会触发panic`

```go
func DoSomething(p interface{}){
    /* if i,ok:=p.(int);ok{
        fmt.Println("Integer ",i)
    }
    if s,ok:=p.(string);ok{
        fmt.Println("String ",s)
    }
    fmt.Println("Unknown type") */
    // 使用 switch 语句进行类型断言
    switch v:=p.(type){
    case int:
        fmt.Println("Integer ",v)
    case string:
        fmt.Println("String ",v)
    default:
        fmt.Println("Unknown type")
    }
}
func TestEmptyInterface(t *testing.T){
    DoSomething(100) // Integer 100
    DoSomething("Hello world!") // String Hello world!
    DoSomething(100.0) // Unknown type
}
```

### 6.3 Go接口最佳实践

1. 倾向于使用小的接口定义，很多接口只包含一个方法
```go
type Reader interface{
    Read(p []byte) (n int, err error)
}
type Writer interface{
    Write(p []byte) (n int, err error)
}
```

2. 较大的接口定义，可以由多个小接口定义组合而成
```go
type ReadWriter interface{
    Reader
    Writer
}
```

3. 只依赖于必要功能的最小接口
```go
func StoreData(reader Reader) error{
    ...
}
```

## 7. 编写好的错误处理

### 7.1 Go的错误机制

> 与其他主要编程语言的差异
>
> - 1. 没有异常机制
>
> - 2. error类型实现了error接口
    > type error interface{
    >     Error() string
    > }
>
> - 3. 可以通过errors.New来快速创建错误实例
    > errors.New("something went wrong")

```go
package extension

var LessThanTwoError=errors.New("n must be greater than 0")
var GreaterThanHundredError=errors.New("n must be less than 100")

func GetFibonacci(n int) ([]int,error){
    /* if n<0||n>100{
        return nil,errors.New("n must be between 0 and 100")
    } */
    if n<2{
        return nil,LessThanTwoError
    }
    if n>100{
        return nil,GreaterThanHundredError
    }
    fibList:=[]int{1,1}
    for i:=2;i<=n;i++{
        fibList=append(fibList,fibList[i-2]+fibList[i-1])
    }
    return fibList,nil
}

func TestGetFibonacci(t *testing.T){
   if fib,err:=GetFibonacci(10);err!=nil{
        if errors.Is(err,LessThanTwoError){
            t.Log("n is less than 2")
        }else if errors.Is(err,GreaterThanHundredError){
            t.Log("n is greater than 100")
        }else{
            t.Error(err)
        }
   }else{
    t.Log(fib)
   }
}
```

> 及早失败，避免嵌套
>
> - 1. 及早失败可以避免在后续代码中处理无效状态
> - 2. 避免在函数中嵌套多个条件判断语句,使代码更加清晰和易于维护

### 7.2 2026年新增或删改内容

> **Go 1.26：类型安全的错误检查 `errors.AsType`**
>
> 引入了泛型版本的 `errors.As`，名为 `errors.AsType`。它更简洁且类型安全，避免了使用反射带来的潜在风险。

```go
// 以前写法
var target *MyError
if errors.As(err, &target) { ... }

// Go 1.26 写法
if target, ok := errors.AsType[*MyError](err); ok {
    fmt.Println(target.Message)
}
```

## 8. panic和recover

### 8.1 panic

- 用于不可以恢复的错误
- 退出前会执行defer指定的内容

> panic vs. os.Exit
>
> - os.Exit退出是不会调用defer指定的函数
> - os.Exit 退出时不输出当前调用栈信息

### 8.2 recover

```c++
try{
    ...
}catch(...){
    ...
}
```

```go
defer func(){
    if err:=recover();err!=nil{
        //恢复错误
    }
}()
```

**当心！recover成为恶魔：**

- 形成僵尸服务进程，导致health check失效
- “Let it Crash”往往是我们恢复不稳定性错误的最好方法

## 9. 构建可复用的模块（包）

### 9.1 package
1. 基本复用模块单元
- 以首字母大写来表明可被包外代码访问
> 包外代码可以通过包名来访问包内的导出标识符

2. 代码的package可以和所在的目录不一致
> 这使得我们可以将相关的代码组织在不同的目录中,而不是将所有代码都放在一个目录中

3. 同一目录里的Go代码的package要保持一致
> 这是为了确保在编译时可以正确地识别和组织代码

4. 通过`go get`来获取远程依赖
- `go get -u` 强制从网络更新远程依赖
> 这是为了确保我们获取到的是最新版本的依赖

5. 注意代码在github上的组织形式，以适应`go get`
- 直接以代码路径开始，不要用src
> 这是为了确保在使用`go get`时可以正确地获取到代码
> 例如,如果我们的代码在`github.com/elari39/hello`目录下,我们应该直接将代码放在`github.com/elari39/hello`目录下,而不是放在`github.com/elari39/hello/src`目录下

### 9.2 init方法

- **在main被执行前，所有依赖的package的init方法都会被执行**
> 这包括main包在内的所有依赖包的init方法

- **不同包的init函数按照包导入的依赖关系决定执行顺序**
> 这是为了确保在执行init方法时,所有依赖的包都已经初始化完成

- **每个包可以有多个init函数**
> 这是为了确保在初始化包时,可以执行多个初始化操作

- **包的每个源文件也可以有多个init函数，这点比较特殊**
> 这是为了确保在初始化包时,可以执行多个初始化操作,而不是只执行一个init函数

## 10. 依赖管理

### 10.1 Go未解决的依赖问题

1. 同一环境在，不同项目使用同一包的不同版本
2. 无法管理对包的特点版本的依赖

### vendor 路径

随着 **Go 1.5** Release 版本的发布，`vendor` 目录被添加到了除 `GOPATH` 和 `GOROOT` 之外的依赖目录查找解决方案中。在 **Go 1.6** 之前，该功能需要手动设置环境变量开启。

**查找依赖包路径的优先级顺序如下：**

1. **当前包下**的 `vendor` 目录。

2. **向上级目录查找**，直到找到 `src` 下的 `vendor` 目录。

3. 在 **`GOPATH`** 路径下查找依赖包。

4. 在 **`GOROOT`** 目录下查找。

> 常用的依赖管理工具
> 
> 1. godep https://github.com/tools/godep
> 
> 2. glide https://github.com/Masterminds/glide
>
> 3. dep https://github.com/golang/dep

### 10.2 2026年新增或删改内容

> **Go 1.26：`go mod init` 默认版本优化**
>
> 现在 `go mod init` 会默认使用 `1.(N-1).0` 版本，以确保新创建的模块能兼容当前主流的 Go 版本。

## 11. 协程机制

### 11.1 Thread vs. Goroutine

#### 11.1.1. 创建时默认的 Stack 大小
*   **Java Thread**：JDK 5 以后，`stack` 默认大小为 **1M**。
*   **Goroutine**：`stack` 初始化大小仅为 **2K**。

#### 11.1.2. 和 KSE (Kernel Space Entity) 的对应关系
*   **Java Thread**：对应关系为 **1:1**（一个用户线程对应一个内核线程）。
*   **Goroutine**：对应关系为 **M:N**（多个协程对应多个内核线程，两级线程模型）。

```go
func TestGoroutine(t *testing.T){
    // 测试goroutine的创建和执行
    for i:=0;i<10;i++{
        go func(i int){
            t.Log(i) // 打印goroutine的ID
        }(i)
        /* go func(){
            t.Log(i)
        }() */
    }
    t.Sleep(time.Second)
}
```

### 11.2 2026年新增或删改内容

> **Go 1.25 & 1.26：调度与诊断增强**
>
> 1. **容器感知调度（Go 1.25）**：自动调整容器环境下的并行度，显著降低延迟。
> 2. **Goroutine 泄漏剖析（Go 1.26）**：`runtime/pprof` 新增了 `goroutineleak` 配置文件，用于精准定位泄漏。

## 12. 共享内存并发机制

```c++
lock Lock = ...;
lock.lock();
try{
    // 临界区代码
}catch(...){
    // 处理异常
}finally{
    lock.unlock();
}
```

```go
func TestCounter(t *testing.T){
    counter:=0
    for i:=0;i<5000;i++{
        go func (){
            counter++
        }()
    }
    t.Sleep(time.Second)
    t.Logf("counter:%d",counter)
}
```


```go
func TestCounterThreadSafe(t *testing.T){
    counter:=0
    var mut sync.Mutex
    for i:=0;i<5000;i++{
        wg.Add(1)
        go func (){
            defer func(){
                mut.Unlock()
            }()
            mut.Lock()
            counter++
        }()
    }
    t.Sleep(time.Second)
    t.Logf("counter:%d",counter)
}
```

### 12.2 WaitGroup

```go
// 测试WaitGroup
var wg sync.WaitGroup
for i:=0;i<5000;i++{
    wg.Add(1)// 每个goroutine都要调用Add方法
    go func(){
        defer func (){
            wg.Done() // 每个goroutine都要调用Done方法
        }()
        //...
    }()
}
wg.Wait() // 等待所有goroutine执行完毕
```

## 13. CSP并发机制

### 13.1 CSP vs. Actor

*   **通讯方式**：和 **Actor** 的直接通讯不同，**CSP** 模式是通过 **Channel** 进行通讯的，耦合度更低（更松耦合）。
*   **容量与处理机制**：
    *   **Go (CSP)**：Channel 是有容量限制的，并且独立于处理 **Goroutine**。
    *   **Erlang (Actor)**：Actor 模式中的 **Mailbox** 容量在理论上是无限的，且接收进程总是被动地处理消息。

### 13.2 异步返回

```java
private static FutureTask<String> service() {
    // 创建一个 FutureTask，并定义其异步执行的任务内容
    FutureTask<String> task = new FutureTask<String>(() -> "Do something");
    // 启动新线程执行该任务
    new Thread(task).start();
    // 立即返回 FutureTask 实例
    return task;
}
// 调用异步服务
FutureTask<String> ret = service();
// 在异步任务执行的同时，继续处理其他逻辑
System.out.println("Do something else");
// 获取异步执行的结果（如果任务未完成，此处会阻塞等待）
System.out.println(ret.get());
```

在Golang里面通过csp实现：

```go

// 模拟一个耗时 50 毫秒的服务
func service() string {
    time.Sleep(time.Millisecond * 50)
    return "Done"
}
// 模拟另一个耗时 100 毫秒的任务
func otherTask() {
    fmt.Println("working on something else")
    time.Sleep(time.Millisecond * 100)
    fmt.Println("Task is done.")
}
// 测试函数：展示同步调用过程
/* 串行执行 */
func TestService(t *testing.T) {
    fmt.Println(service())
    otherTask()
}

// AsyncService 异步调用服务并返回一个 channel 用于接收结果
func AsyncService() chan string {
    // 创建一个无缓冲的 channel
    retCh := make(chan string)
    // 或者创建一个带缓冲的 channel（容量为 1）
    // retCh := make(chan string, 1)
    // 启动一个协程执行耗时操作
    go func() {
        ret := service()
        fmt.Println("returned result.")
        // 将结果发送到 channel 中
        retCh <- ret
        fmt.Println("service exited.")
    }()
    // 立即返回 channel，不阻塞调用者
    return retCh
}
func TestAsyncService(t *testing.T){
    // 调用异步服务
    retCh := AsyncService()
    otherTask()
    // 从 channel 接收结果（阻塞等待）
    t.Log(<-retCh)
    time.Sleep(time.Millisecond * 100)
}
```


## 14. 多路选择和超时

### 14.1 select

#### 14.1.1 多渠道的选择
```go
select {
case ret := <-retCh1: // 从 retCh1 接收结果
    t.Logf("result %s", ret)// 打印 retCh1 的结果
case ret :=<-retCh2: // 从 retCh2 接收结果
    t.Logf("result %s", ret) // 打印 retCh2 的结果
default:
    t.Error("No one returned") // 没有任何渠道返回结果时的处理
}
```

#### 14.1.2 超时控制
```go
select {
case ret := <-retCh: // 从 retCh 接收结果
    t.Logf("result %s", ret) // 打印 retCh 的结果
case <-time.After(time.Second * 1): // 等待 1 秒超时
    t.Error("time out") // 超时处理
}
```

## 15. channel的关闭和广播

### 15.1 channel的关闭

- 向关闭的 channel 发送数据，会导致 panic

- `v, ok <-ch;` ok 为 bool 值，true 表示正常接受，false 表示通道关闭

- 所有的 channel 接收者都会在 channel 关闭时，立刻从阻塞等待中返回且上述 ok 值为 false。这个广播机制常被利用，进行向多个订阅者同时发送信号。如：退出信号。

```go
func dataProducer(ch chan int, wg *sync.WaitGroup) {
    go func() {
        for i := 0; i < 10; i++ {
            ch <- i
        }
        // 通知channel数据放完
        close(ch)
        wg.Done()
    }()
}
func dataReceiver(ch chan int, wg *sync.WaitGroup) {
    go func() {
        for i := 0; i < 10; i++ {
            // data := <-ch
            data,ok:=<-ch
            if !ok{
                t.Log("channel closed")
                break
            }
            fmt.Println(data)
        }
        wg.Done()
    }()
}
func TestCloseChannel(t *testing.T){
    var wg sync.WaitGroup
    ch:=make(chan int)
    wg.Add(1)
    dataProducer(ch,&wg)
    wg.Add(1)
    dataReceiver(ch,&wg)
    wg.Wait()
}
```


## 16. 任务的取消

```go
func isCancelled(cancelChan chan struct{}) bool {
    select {
    case <-cancelChan: // 检查是否收到取消信号
        return true
    default: // 没有收到取消信号
        return false
    }
}
// cancel_1 发送取消信号
func cancel_1(cancelChan chan struct{}) {
    cancelChan <- struct{}{} // 发送取消信号
}
// cancel_2 关闭 channel 发送取消信号
func cancel_2(cancelChan chan struct{}) {
    close(cancelChan) // 关闭 channel 发送取消信号
}
// TestCancel 测试取消信号的传递
func TestCancel(t *testing.T) {
    cancelChan := make(chan struct{}, 0)
    for i := 0; i < 5; i++ {
        go func(i int, cancelCh chan struct{}) {
            for {
                if isCancelled(cancelCh) {
                    break // 收到取消信号，跳出循环
                }
                time.Sleep(time.Millisecond * 5)
            }
            fmt.Println(i, "Done")
        }(i, cancelChan)
    }
    cancel_1(cancelChan) // 发送取消信号
    // cancel_2(cancelChan) // 广播取消信号，关闭 channel 发送取消信号
    time.Sleep(time.Second * 1) // 等待 1 秒，确保所有 goroutine 都有机会执行
}
```


## 17. Context与任务取消

##  关联任务的取消 

*   **Main**
    *   **Handle(Req1)**
        *   Search(A)
        *   Search(B)
        *   Search(C)
    *   **Handle(Req2)**
        *   Search(A)
        *   Search(B)
        *   Search(C)

### 17.2 Context

- 根 Context：通过 context.Background () 创建
- 子 Context：context.WithCancel(parentContext) 创建
    - `ctx, cancel := context.WithCancel(context.Background())`
- 当前 Context 被取消时，基于他的子 context 都会被取消
- 接收取消通知 `<-ctx.Done()`

```go
func isCancelled(ctx context.Context) bool {
    select {
    case <-ctx.Done(): // 检查是否收到取消信号
        return true
    default: // 没有收到取消信号
        return false
    }
}
func TestCancel(t *testing.T) {
    ctx, cancel := context.WithCancel(context.Background())
    for i := 0; i < 5; i++ {
        go func(i int, ctx context.Context) {
            for {
                if isCancelled(ctx) {
                    break
                }
                time.Sleep(time.Millisecond * 5)
            }
            fmt.Println(i, "Done")
        }(i, ctx)
    }
    cancel() // 取消所有子 context
    time.Sleep(time.Second * 1) 
}
```

### 17.3 2026年新增或删改内容

> **Go 1.24 & 1.25：`testing/synctest` 虚拟时间**
>
> 引入了 `testing/synctest` 包，通过虚拟化时间解决了异步并发测试中“等多久”的问题，使测试更可靠且瞬间完成。

---
title: "使用 Go flag 实现 Todo CLI"
date: 2026-03-02T18:00:00+08:00
draft: false
tags: ["Go", "Flag", "Todo", "CLI"]
categories: ["Go"]
math: false
description: "从 0 到 1 使用 Go 标准库 flag 构建一个 Todo 命令行工具，包含新增、列表、完成标记与 JSON 持久化，并提供逐段详细代码注释。"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260302174530103.png"
---

这篇文章带你用 **Go 标准库 `flag` 包**实现一个轻量级的 Todo CLI。

和常见“只给代码”的教程不同，这里会：
- 先讲清楚 `flag` 的使用方式；
- 再按文件拆解项目结构；
- 最后给出**带详细注释**的完整核心代码，方便你边看边学。

## 1. 项目结构

```text
├── README.md
├── cmd
│   └── todocli
│       └── main.go
├── data.json
├── go.mod
├── go.sum
└── internal
    ├── app
    │   └── run.go
    ├── command
    │   ├── add.go
    │   ├── done.go
    │   └── list.go
    ├── domain
    │   └── task.go
    └── storage
        └── file.go
```

各目录职责：
- `cmd/todocli/main.go`：程序入口。
- `internal/app`：参数解析与命令分发。
- `internal/command`：业务命令（add/list/done）。
- `internal/domain`：领域模型（Task）。
- `internal/storage`：文件读写（`data.json`）。

---

## 2. `flag` 包快速理解

本项目的命令风格是：

```bash
go run ./cmd/todocli -cmd add -title "学习 Go"
go run ./cmd/todocli -cmd list
go run ./cmd/todocli -cmd done -id 1
```

`flag` 包常见用法：

```go
// flag.String 返回 *string（指针）
cmd := flag.String("cmd", "", "操作命令")

// 解析命令行参数（必须调用）
flag.Parse()

// 使用参数值时需要解引用
fmt.Println(*cmd)
```

关键点：
- `flag.String/Int/Bool` 都会返回“对应类型的指针”；
- `flag.Parse()` 之后，参数值才会写入变量；
- 可通过重写 `flag.Usage` 自定义帮助信息；
- 可用 `flag.PrintDefaults()` 打印所有参数说明。

---

## 3. 核心代码（详细注释版）

### 3.1 `cmd/todocli/main.go`

```go
package main

import "todo-cli/internal/app"

func main() {
	// 程序入口非常薄，只负责调用应用层 Run。
	// 这种结构可以让 main 保持干净，便于后续扩展（例如注入配置、日志器等）。
	app.Run()
}
```

### 3.2 `internal/app/run.go`

```go
package app

import (
	"flag"
	"fmt"
	"os"
	"todo-cli/internal/command"
)

var (
	// -cmd 用于告诉程序要执行哪种动作（add/list/done/help）
	cmd = flag.String("cmd", "", "操作命令: /help/add/list/done")

	// -title 只在 add 命令时有意义
	title = flag.String("title", "", "待办事项标题")

	// -id 只在 done 命令时有意义
	id = flag.Int("id", 0, "输入 id 标记完成状态")

	// 当前版本中该参数尚未使用，可作为后续扩展（例如 done=false 回滚状态）
	done = flag.Bool("done", false, "完成状态")
)

func Run() {
	// 告诉 flag 包：当用户触发帮助时，使用我们自定义的 usage 输出格式。
	flag.Usage = usage

	// 解析命令行参数，解析后 *cmd / *title / *id 等值才生效。
	flag.Parse()

	// 避免 done 变量出现“声明未使用”语义困惑。
	// 这里显式丢弃值，表示该参数为“预留字段”。
	_ = done

	// 如果没有输入 cmd，或者 cmd=help，就展示帮助并退出。
	if *cmd == "" || *cmd == "help" {
		flag.Usage()
		return
	}

	// 根据 -cmd 分发到不同业务逻辑。
	switch *cmd {
	case "add":
		command.Add(*title)
	case "list":
		command.List()
	case "done":
		command.Done(*id)
	default:
		// 兜底分支：提示未知命令并打印帮助。
		fmt.Printf("❌ 未知命令: %s\n", *cmd)
		fmt.Println()
		flag.Usage()
	}
}

func usage() {
	// 帮助信息打印到 stderr（常见 CLI 习惯），
	// 正常结果才打印到 stdout。
	fmt.Fprintln(os.Stderr, "选项:")

	// 自动打印所有 flag 定义：参数名、默认值、说明。
	flag.PrintDefaults()

	// 附加命令说明，告诉使用者不同 cmd 的语义。
	fmt.Fprintln(os.Stderr, "命令:")
	fmt.Fprintln(os.Stderr, "  add    添加一个新的待办事项")
	fmt.Fprintln(os.Stderr, "  list   列出所有待办事项")
	fmt.Fprintln(os.Stderr, "  done   标记一个待办事项为已完成")
	fmt.Fprintln(os.Stderr, "  help   显示帮助信息")
}
```

### 3.3 `internal/command/add.go`

```go
package command

import (
	"encoding/json"
	"fmt"
	"todo-cli/internal/domain"
	"todo-cli/internal/storage"
)

func Add(title string) {
	// 基础参数校验：标题不能为空。
	if title == "" {
		fmt.Println("标题不能为空")
		return
	}

	// tasks 保存当前所有任务。
	var tasks []domain.Task

	// 尝试读取已有数据；如果读取失败（如文件不存在），
	// 当前实现会直接把 tasks 视作空切片继续追加。
	data, err := storage.ReadData()
	if err == nil {
		// 读取成功后，反序列化 JSON -> []Task
		err = json.Unmarshal(data, &tasks)
		if err != nil {
			fmt.Println("读取数据失败:", err)
			return
		}
	}

	// 生成新任务：ID 使用当前长度 + 1 的简单策略。
	newTask := &domain.Task{
		ID:    len(tasks) + 1,
		Title: title,
		Done:  false,
	}

	// 追加到任务列表。
	tasks = append(tasks, *newTask)

	// 重新编码为带缩进的 JSON，便于人工查看 data.json。
	data, err = json.MarshalIndent(tasks, "", "    ")
	if err != nil {
		fmt.Println("序列化 JSON 失败:", err)
		return
	}

	// 持久化写入文件。
	err = storage.WriteData(data)
	if err != nil {
		fmt.Println("写入 data.json 失败:", err)
		return
	}

	// 输出新增成功反馈。
	fmt.Printf("✅ 添加成功: %+v\n", newTask)
}
```

### 3.4 `internal/command/done.go`

```go
package command

import (
	"encoding/json"
	"fmt"
	"todo-cli/internal/domain"
	"todo-cli/internal/storage"
)

func Done(id int) {
	// 保存任务列表的内存切片。
	var tasks []domain.Task

	// 读取 data.json。
	data, err := storage.ReadData()
	if err != nil {
		fmt.Println("读取文件失败:", err)
		return
	}

	// JSON -> []Task。
	err = json.Unmarshal(data, &tasks)
	if err != nil {
		fmt.Println("Unmarshal 失败:", err)
		return
	}

	// 遍历找到目标 id，将 Done 置为 true。
	for i, task := range tasks {
		if task.ID == id {
			tasks[i].Done = true
			break
		}
	}

	// 把更新后的任务列表重新编码。
	data, err = json.MarshalIndent(tasks, "", "    ")
	if err != nil {
		fmt.Println("Marshal 失败:", err)
		return
	}

	// 写回文件，完成持久化。
	err = storage.WriteData(data)
	if err != nil {
		fmt.Println("写入文件失败:", err)
		return
	}

	// 输出更新结果。
	fmt.Printf("✅ 更新成功: %+v\n", tasks)
}
```

### 3.5 `internal/command/list.go`

```go
package command

import (
	"encoding/json"
	"fmt"
	"todo-cli/internal/domain"
	"todo-cli/internal/storage"
)

func List() {
	// 用于接收读取后的任务列表。
	var tasks []domain.Task

	// 读取 data.json。
	data, err := storage.ReadData()
	if err != nil {
		fmt.Println("读取文件失败:", err)
		return
	}

	// 反序列化 JSON。
	err = json.Unmarshal(data, &tasks)
	if err != nil {
		fmt.Println("Unmarshal 失败:", err)
		return
	}

	// 打印当前任务列表。
	fmt.Printf("✅ 读取成功: %+v\n", tasks)
}
```

### 3.6 `internal/domain/task.go`

```go
package domain

// Task 是待办项的领域模型。
type Task struct {
	// ID: 任务编号（当前项目使用递增整数）。
	ID int `json:"id"`

	// Title: 任务标题。
	// 注意：这里的 JSON tag 使用了 "description"，
	// 因此落盘字段名会是 description。
	Title string `json:"description"`

	// Done: 是否已完成。
	Done bool `json:"done"`
}
```

### 3.7 `internal/storage/file.go`

```go
package storage

import "os"

// data.json 作为简单持久化存储文件。
const dataFileName = "data.json"

func ReadData() ([]byte, error) {
	// 读取整个文件内容并返回字节数组。
	// 调用方负责处理“文件不存在”“权限不足”等错误。
	return os.ReadFile(dataFileName)
}

func WriteData(data []byte) error {
	// 以 0644 权限覆盖写入文件：
	// - 文件不存在会自动创建
	// - 文件存在会被覆盖
	return os.WriteFile(dataFileName, data, 0644)
}
```

---

## 4. 执行流程总结

当执行 `go run ./cmd/todocli -cmd add -title "学习 Go"` 时：
1. `main.go` 调用 `app.Run()`；
2. `flag.Parse()` 解析 `-cmd` 和 `-title`；
3. 根据 `cmd=add` 进入 `command.Add()`；
4. 读取 `data.json`（若存在则解析历史数据）；
5. 追加新任务并写回 `data.json`。

`list` 与 `done` 也是同样入口，不同分支。

---

## 5. 运行示例

```bash
# 1) 添加任务
go run ./cmd/todocli -cmd add -title "学习 Go 语言"

# 2) 查看任务
go run ./cmd/todocli -cmd list

# 3) 完成任务（将 id=1 置为已完成）
go run ./cmd/todocli -cmd done -id 1

# 4) 查看帮助
go run ./cmd/todocli -cmd help
```


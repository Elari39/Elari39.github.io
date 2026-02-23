---
title: "Day 04: 链表篇"
date: 2026-02-22T13:00:00+08:00
draft: false
tags: ["算法", "链表", "Go"]
categories: ["代码随想录"]
---
# 链表篇（Day 1）

今天是**代码随想录**算法训练营的第四天，我们正式开启**链表篇**的学习！  
链表与数组形成鲜明对比：数组连续存储、随机访问快；链表非连续存储、插入删除快。掌握链表的**指针操作**和**虚拟头结点**技巧，是后续树、图、递归等高级结构的必备基础。

在这篇文章中，我们重点总结**链表理论**、**203. 移除链表元素** 和 **707. 设计链表** 两道经典题目，以及 **Go 语言实现细节**，帮助大家快速建立链表操作的肌肉记忆。

---
## 一、链表理论基础回顾

### 1. 定义与内存模型
* **单链表 (Singly Linked List)**：每个节点包含 `Val`（值）和 `Next`（指向下一个节点的指针）。
* **内存特点**：非连续存储，每个节点在堆上动态分配，通过指针“串”起来。
* **与数组对比**：
  | 操作     | 数组 | 链表 |
  |----------|------|------|
  | 随机访问 | O(1) | O(n) |
  | 头插/头删 | O(n) | O(1) |
  | 尾插     | O(1)（有容量） | O(n)（无尾指针） |

### 2. Go 语言中的链表实现
```go
type ListNode struct {
    Val  int
    Next *ListNode
}
```
* **核心技巧：虚拟头结点 (Dummy Head)**  
  ```go
  dummy := &ListNode{Next: head}
  ```
  作用：统一处理头节点删除/插入，避免对 `head` 做特殊判断，最后返回 `dummy.Next`。
* **遍历常用写法**：
  ```go
  for cur := dummy; cur.Next != nil; { ... }
  ```

---
## 二、今日两题详解

### 1. 203. 移除链表元素
**题目**：给你一个链表的头节点 `head` 和一个整数 `val`，请你删除链表中所有满足 `Node.val == val` 的节点，并返回新的头节点。

**示例 1**（如图所示）：  
输入：`head = [1,2,6,3,4,5,6], val = 6`  
输出：`[1,2,3,4,5]`

**核心思路**：**虚拟头结点 + 单指针遍历**  
- 用 `dummy` 简化头节点删除  
- `cur` 指针遍历，当 `cur.Next.Val == val` 时直接跳过节点  
- 否则正常后移  

**Go 完整代码**：
```go
// removeElements 移除链表中所有值为 val 的节点
func removeElements(head *ListNode, val int) *ListNode {
    // 创建虚拟头结点，指向原链表头部
    // 这样做的好处是删除头节点和删除其他节点的操作逻辑一致
    dummy := &ListNode{Next: head} 
    
    // cur 指针指向虚拟头结点，从虚拟头结点开始遍历
    cur := dummy
    
    // 遍历链表，直到 cur 的下一个节点为空
    // 注意这里判断的是 cur.Next，因为我们需要操作的是 cur.Next 这个节点
    for cur.Next != nil {
        // 如果下一个节点的值等于目标值 val
        if cur.Next.Val == val {
            // 删除操作：将 cur 的 Next 指针指向下下个节点
            // 此时 cur.Next 这个节点就被移除了（GC 会回收）
            cur.Next = cur.Next.Next
        } else {
            // 如果值不相等，cur 指针后移
            cur = cur.Next
        }
    }
    
    // 返回虚拟头结点的下一个节点，即新的头节点
    // 注意不要返回 head，因为原 head 可能已经被删除了
    return dummy.Next
}
```
**复杂度**：时间 O(n)，空间 O(1)。

**易错点**：
- 不要忘记处理所有连续相同值的节点（用 `if` 而不是 `else if`）。
- 返回 `dummy.Next`，不是 `head`（head 可能被删除）。

### 2. 707. 设计链表
**题目**：设计链表的实现，支持以下操作（下标从 0 开始）：
- `MyLinkedList()` 初始化
- `int get(index)` 获取第 `index` 个节点的值（无效返回 -1）
- `void addAtHead(val)` 在头部插入
- `void addAtTail(val)` 在尾部追加
- `void addAtIndex(index, val)` 在第 `index` 个节点**之前**插入（`index == size` 时追加到尾部）
- `void deleteAtIndex(index)` 删除第 `index` 个节点

**核心思路**：**虚拟头结点 + size 维护长度**  
- 所有插入/删除操作统一通过 `AddAtIndex` 实现  
- 使用 `size` 变量快速判断边界，遍历时只需走到 `index-1` 即可插入/删除  

**Go 完整实现**：
```go
// Node 定义链表节点
type Node struct {
    Val  int   // 节点值
    Next *Node // 指向下一个节点的指针
}

// MyLinkedList 定义单链表结构
type MyLinkedList struct {
    head *Node // 虚拟头结点，不存储真实数据
    size int   // 链表长度，便于快速判断索引合法性
}

// Constructor 初始化链表
func Constructor() MyLinkedList {
    return MyLinkedList{
        head: &Node{}, // 初始化虚拟头结点
        size: 0,       // 初始长度为 0
    }
}

// Get 获取第 index 个节点的值（下标从 0 开始）
// 如果 index 无效，返回 -1
func (this *MyLinkedList) Get(index int) int {
    // 索引越界检查
    if index < 0 || index >= this.size {
        return -1
    }
    
    // 从真实头节点（dummy.Next）开始遍历
    cur := this.head.Next
    // 遍历 index 次，cur 指向第 index 个节点
    for i := 0; i < index; i++ {
        cur = cur.Next
    }
    return cur.Val
}

// AddAtHead 在链表头部插入一个节点
func (this *MyLinkedList) AddAtHead(val int) {
    // 等同于在索引 0 处插入
    this.AddAtIndex(0, val)
}

// AddAtTail 在链表尾部追加一个节点
func (this *MyLinkedList) AddAtTail(val int) {
    // 等同于在索引 size 处插入
    this.AddAtIndex(this.size, val)
}

// AddAtIndex 在第 index 个节点之前插入一个新节点
// 如果 index 等于链表长度，则添加到链表末尾
// 如果 index 大于链表长度，则不会插入节点
func (this *MyLinkedList) AddAtIndex(index int, val int) {
    // 索引越界检查（注意这里 index 可以等于 size）
    if index < 0 || index > this.size {
        return
    }
    
    // 从虚拟头结点开始遍历，目的是找到 index 前一个节点
    cur := this.head
    for i := 0; i < index; i++ {
        cur = cur.Next
    }
    
    // 创建新节点
    node := &Node{Val: val, Next: cur.Next}
    // 将新节点插入到 cur 之后
    cur.Next = node
    // 链表长度 +1
    this.size++
}

// DeleteAtIndex 删除第 index 个节点
func (this *MyLinkedList) DeleteAtIndex(index int) {
    // 索引越界检查
    if index < 0 || index >= this.size {
        return
    }
    
    // 从虚拟头结点开始遍历，找到 index 前一个节点
    cur := this.head
    for i := 0; i < index; i++ {
        cur = cur.Next
    }
    
    // 删除 cur.Next 节点
    cur.Next = cur.Next.Next
    // 链表长度 -1
    this.size--
}
```
**复杂度**：每个操作 O(n)（遍历），空间 O(n)（存储节点）。

**设计亮点**：
- `AddAtHead`、`AddAtTail` 复用 `AddAtIndex`，代码简洁。
- `size` 维护让边界判断一目了然。

---
## 三、Go 语言刷题小贴士

1. **指针判空**：`cur.Next != nil` 永远是遍历链表的“护身符”，忘记会导致 nil panic。
2. **虚拟头结点**：几乎所有链表题的“万能钥匙”，强烈推荐养成习惯。
3. **结构体定义**：LeetCode 题目的 `ListNode` 已内置，直接用即可；设计题需自己定义 `Node`。
4. **值传递 vs 指针**：方法接收者用 `this *MyLinkedList`（指针接收者）才能修改结构体。
5. **边界测试**：空链表、删除头节点、index == size、index > size 都要单独过一遍。

---
## 四、总结

今天通过 **203**（删除节点）和 **707**（完整实现链表），我们彻底掌握了链表最核心的**虚拟头结点**和**指针移动**技巧。  
链表的难点在于**边界处理**和**指针的指向关系**，多画图、多手写是王道。

> **Talk is cheap. Show me the code.**
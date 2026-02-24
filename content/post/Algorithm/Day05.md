---
title: "Day 05: 链表篇"
date: 2026-02-23T13:00:00+08:00
draft: true
tags: ["算法", "链表", "Go"]
categories: ["代码随想录"]
---
# 链表篇（Day 2）

今天是**代码随想录**算法训练营的第五天，我们继续深入**链表篇**！  
昨天掌握了虚拟头结点和基本增删操作后，今天的三道题将带我们进入链表的**指针翻转与移动**进阶技巧：

- **206. 反转链表**：最经典的指针反转题
- **24. 两两交换链表中的节点**：成对操作 + 虚拟头结点
- **19. 删除链表的倒数第 N 个结点**：快慢指针 + 虚拟头结点

掌握这三题后，你对链表指针的操控将达到“指哪打哪”的境界！  
下面我们逐题拆解，并给出**带详细中文注释的 Go 完整实现**（均已通过 LeetCode 测试）。

---
## 一、206. 反转链表
**题目**：给你单链表的头节点 `head`，请你反转链表，并返回反转后的链表。

**示例 1**（如图所示）：  
输入：`head = [1,2,3,4,5]`  
输出：`[5,4,3,2,1]`

**核心思路**：**迭代三指针法**（pre、cur、next）  
每次把 `cur` 的 `Next` 指向 `pre`，然后三个指针一起向后移动。

**Go 完整代码（详细注释）**：
```go
// reverseList 反转整个链表（迭代版，推荐！空间 O(1)）
func reverseList(head *ListNode) *ListNode {
    // pre 始终指向已反转部分的头节点（初始为 nil）
    var pre *ListNode
    // cur 是当前正在处理的节点，从 head 开始
    cur := head

    // 当 cur 不为空时继续反转
    for cur != nil {
        // 1. 先保存下一个节点，防止断链
        next := cur.Next
        
        // 2. 核心：把当前节点的 next 指向前一个节点，实现反转
        cur.Next = pre
        
        // 3. pre 和 cur 同时向前移动一位
        pre = cur
        cur = next
    }
    
    // 循环结束后 pre 指向新的头节点（原尾节点）
    return pre
}
```
**复杂度**：时间 O(n)，空间 O(1)。

**小技巧**：也可以用递归实现，但迭代更省空间，面试首选。

---
## 二、24. 两两交换链表中的节点
**题目**：给你一个链表，两两交换其中相邻的节点，并返回交换后链表的头节点。你必须在不修改节点内部值的情况下完成本题（即只能进行节点交换）。

**示例 1**（如图所示）：  
输入：`head = [1,2,3,4]`  
输出：`[2,1,4,3]`

**核心思路**：**虚拟头结点 + 成对交换**  
用 `dummy` 简化头节点处理，每轮交换 `pre` 后面的两个节点。

**Go 完整代码（详细注释）**：
```go
// swapPairs 两两交换相邻节点
func swapPairs(head *ListNode) *ListNode {
    // 虚拟头结点，统一处理头节点交换的情况
    dummy := &ListNode{Next: head}
    
    // pre 始终指向要交换的两个节点的前一个节点
    pre := dummy
    
    // 当还有至少两个节点可以交换时继续
    for head != nil && head.Next != nil {
        // 1. 记录要交换的第二个节点和后面的节点
        first := head          // 当前第一个节点
        second := head.Next    // 当前第二个节点
        nextPair := second.Next // 下一对的起始节点
        
        // 2. 执行交换：second -> first -> nextPair
        pre.Next = second      // pre 指向第二个节点
        second.Next = first    // 第二个节点的 next 指向第一个
        first.Next = nextPair  // 第一个节点的 next 指向下一对
        
        // 3. 为下一轮准备：pre 移动到当前 first，head 移动到下一对
        pre = first
        head = nextPair
    }
    
    return dummy.Next
}
```
**复杂度**：时间 O(n)，空间 O(1)。

**注意**：必须只交换节点，不能改 `Val`！

---
## 三、19. 删除链表的倒数第 N 个结点
**题目**：给你一个链表，删除链表的倒数第 `n` 个结点，并且返回链表的头结点。

**示例 1**（如图所示）：  
输入：`head = [1,2,3,4,5], n = 2`  
输出：`[1,2,3,5]`

**核心思路**：**快慢指针 + 虚拟头结点**  
让快指针先走 `n` 步，然后快慢一起走，快指针到尾时，慢指针正好在倒数第 `n` 个节点前面。

**Go 完整代码（详细注释）**：
```go
// removeNthFromEnd 删除链表的倒数第 n 个节点
func removeNthFromEnd(head *ListNode, n int) *ListNode {
    // 虚拟头结点，处理删除头节点的情况
    dummyNode := &ListNode{Next: head}
    
    // fast 先走 n 步
    fast, slow := dummyNode, dummyNode
    
    // fast 先前进 n 步（注意 <= n，否则 fast 会停在倒数第 n 个节点上）
    for i := 0; i < n; i++ {
        fast = fast.Next
    }
    
    // fast 和 slow 同时前进，直到 fast 到达最后一个节点
    // 此时 slow 正好指向要删除节点的前一个节点
    for fast.Next != nil {
        fast = fast.Next
        slow = slow.Next
    }
    
    // 删除 slow 后面的节点
    slow.Next = slow.Next.Next
    
    return dummyNode.Next
}
```
**复杂度**：时间 O(n)，空间 O(1)。一次遍历搞定！

**关键点**：`dummy` + `fast` 先走 `n` 步，保证 `slow` 永远指向待删除节点的前驱。

---
## 四、Go 语言刷题小贴士（链表进阶）

1. **三指针反转**：`pre`、`cur`、`next` 是反转链表的“黄金三剑客”。
2. **虚拟头结点**：今天三题全部用到，强烈建议养成习惯。
3. **快慢指针**：删除倒数第 N 个节点的标配，记住“快先走 N 步”。
4. **边界处理**：
   - 空链表 / 只有一个节点
   - 删除头节点 / 尾节点
   - `n == 链表长度`（删除头节点）

---
## 五、总结

今天通过 **206（反转）**、**24（两两交换）**、**19（删除倒数第N个）**，我们彻底掌握了链表中最常用的三种指针技巧：**反转**、**成对操作**、**快慢指针**。  
链表的灵魂就是**指针的指向关系**，多画图、多手写，很快就能“手感”满满！

> **Talk is cheap. Show me the code.**

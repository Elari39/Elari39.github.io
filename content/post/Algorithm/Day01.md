---
title: "Day 01: 数组理论基础"
date: 2026-02-19T13:00:00+08:00
draft: false
tags: ["算法", "数组", "Go"]
categories: ["代码随想录"]
---

# 数组理论基础

今天正式开启**代码随想录**的学习之旅！作为第一天，我们重点复习数组的基础知识和常用技巧。数组在 Go 中以切片（slice）形式存在，掌握好切片的底层操作、双指针、二分查找等，是后续所有算法题的基石。

今天我们一起用 **Go 语言** 手撕以下两道经典数组题目，每道题都会附上**完整可运行代码 + 逐行详细解析**，帮助你彻底吃透实现细节。

## 题目列表

- [704. 二分查找](https://leetcode.cn/problems/binary-search/)
- [27. 移除元素](https://leetcode.cn/problems/remove-element/)

---

## 704. 二分查找

**题目描述**：给定一个升序排列的整数数组 `nums` 和一个目标值 `target`，在数组中搜索 `target`，如果存在返回下标，否则返回 `-1`。要求时间复杂度 `O(log n)`。

**Go 代码实现**：

```go
func search(nums []int, target int) int {
    left, right := 0, len(nums)-1
    for left <= right {
        // 防止溢出（Go int 虽然不会像 C++ 那样轻易溢出，但这是好习惯）
        mid := left + (right-left)>>1
        if nums[mid] == target {
            return mid
        } else if nums[mid] < target {
            left = mid + 1
        } else {
            right = mid - 1
        }
    }
    return -1
}
```

**详细解析**（逐行讲解）：

1. `left, right := 0, len(nums)-1`：定义左右闭区间指针，`[left, right]` 初始覆盖整个数组。
2. `for left <= right`：当区间还有元素时继续搜索（左闭右闭写法，循环结束时 `left > right`）。
3. `mid := left + (right-left)>>1`：经典防溢出写法，`>>1` 即除以 2（位运算比 `/2` 更快）。
4. `if nums[mid] == target`：命中直接返回。
5. `else if nums[mid] < target`：目标在右半区，收缩左边界 `left = mid + 1`。
6. `else`：目标在左半区，收缩右边界 `right = mid - 1`。
7. 循环结束后返回 `-1`，符合题意。

**时间复杂度**：`O(log n)`，**空间复杂度**：`O(1)`。

---

## 27. 移除元素

**题目描述**：给你一个数组 `nums` 和一个值 `val`，原地移除所有数值等于 `val` 的元素，并返回移除后数组的新长度。元素顺序可以改变。

**Go 代码实现**：

```go
func removeElement(nums []int, val int) int {
    slow := 0
    for fast := 0; fast < len(nums); fast++ {
        if nums[fast] != val {
            nums[slow] = nums[fast]
            slow++
        }
    }
    return slow
}
```

**详细解析**（逐行讲解）：

1. `slow := 0`：慢指针，表示「下一个要填充的位置」。
2. `for fast := 0; fast < len(nums); fast++`：快指针遍历整个数组。
3. `if nums[fast] != val`：发现一个不需要移除的元素，就把它「复制」到慢指针位置。
4. `nums[slow] = nums[fast]; slow++`：复制后慢指针前移。
5. 循环结束后，`slow` 就是新数组的长度，前 `slow` 个元素就是结果（后面元素无需关心）。

**为什么原地？** Go 的切片是引用底层数组，我们只修改了前 `slow` 个位置，符合「原地」要求。

**时间复杂度**：`O(n)`，**空间复杂度**：`O(1)`。

---

## 总结

**今天收获**：

- 掌握了**二分查找**的左右闭区间写法和防溢出技巧。
- 学会了**快慢指针**原地修改数组（移除元素）。
- 在 Go 中熟练运用切片、`make`、`for` 循环、`>>` 位运算等语言特性。

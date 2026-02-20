---
title: "Day 01: 数组理论基础"
date: 2026-02-19T13:00:00+08:00
draft: false
tags: ["算法", "数组", "Go"]
categories: ["代码随想录"]
---

# 数组理论基础

今天正式开启**代码随想录**的学习之旅！作为第一天，我们重点复习数组的基础知识和常用技巧。数组在 Go 中以切片（slice）形式存在，掌握好切片的底层操作、双指针、二分查找等，是后续所有算法题的基石。

今天我们一起用 **Go 语言** 手撕以下三道经典数组题目，每道题都会附上**完整可运行代码 + 逐行详细解析**，帮助你彻底吃透实现细节。

## 题目列表

- [704. 二分查找](https://leetcode.cn/problems/binary-search/)
- [27. 移除元素](https://leetcode.cn/problems/remove-element/)
- [977. 有序数组的平方](https://leetcode.cn/problems/squares-of-a-sorted-array/)

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

## 977. 有序数组的平方

**题目描述**：给你一个按 **非递减顺序** 排序的整数数组 `nums`，返回每个数字的平方组成的新数组，要求也按非递减顺序排序。

**Go 代码实现**：

```go
func sortedSquares(nums []int) []int {
    n := len(nums)
    left, right := 0, n-1
    res := make([]int, n) // 结果数组

    for i := n - 1; i >= 0; i-- {
        if abs(nums[left]) > abs(nums[right]) {
            res[i] = nums[left] * nums[left]
            left++
        } else {
            res[i] = nums[right] * nums[right]
            right--
        }
    }
    return res
}

// 辅助函数
func abs(x int) int {
    if x < 0 {
        return -x
    }
    return x
}
```

**详细解析**（逐行讲解）：

1. `left, right := 0, n-1`：双指针分别指向数组最左（最小值）和最右（最大值）。
2. `res := make([]int, n)`：提前分配结果数组，大小和原数组一致。
3. `for i := n-1; i >= 0; i--`：从结果数组**末尾**往前填充（因为平方后最大值一定在两端）。
4. `if abs(nums[left]) > abs(nums[right])`：左边绝对值更大，说明左边平方更大，把它放到 `res[i]`，左指针右移。
5. 否则右边绝对值更大（或相等），把右边平方放到 `res[i]`，右指针左移。
6. `abs` 函数处理负数：因为负数的平方等于正数的平方，但我们要比较绝对值大小。

**为什么 O(n)？** 每个元素只被访问一次，指针只会向中间移动。

**时间复杂度**：`O(n)`，**空间复杂度**：`O(n)`（题目要求返回新数组）。

---

## 总结

**今天收获**：

- 掌握了**二分查找**的左右闭区间写法和防溢出技巧。
- 学会了**快慢指针**原地修改数组（移除元素）。
- 理解了**双指针从两端向中间**处理有序数组的思路（平方后排序）。
- 在 Go 中熟练运用切片、`make`、`for` 循环、`>>` 位运算等语言特性。

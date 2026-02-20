---

title: "Day 02: 数组 - 双指针、滑动窗口与模拟" 
date: 2026-02-20T13:00:00+08:00 
draft: false 
tags: ["算法", "数组", "双指针", "滑动窗口", "模拟", "Go"] 
categories: ["代码随想录"]

---
# 数组 - 双指针、滑动窗口与模拟

今天是**代码随想录**数组专题第二天！昨天打好了理论基础，今天我们重点学习数组中极具代表性的三大高频技巧：**双指针法**（处理有序数组）、**滑动窗口**（用于求最小长度连续子数组）和**边界模拟**（生成螺旋矩阵）。掌握这些套路后，处理区间、矩阵类问题将事半功倍。

我们继续用 **Go 语言** 手撕以下三道经典题目，每道题都会附上**完整可运行代码 + 逐行详细解析**，帮助你彻底吃透实现细节。

## 题目列表

* [977. 有序数组的平方](https://leetcode.cn/problems/squares-of-a-sorted-array/)
* [209. 长度最小的子数组](https://leetcode.cn/problems/minimum-size-subarray-sum/)
* [59. 螺旋矩阵 II](https://leetcode.cn/problems/spiral-matrix-ii/)

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

1. `left, right := 0, n-1`：由于原数组是有序的但包含负数，平方后的最大值一定在数组的**两端**。定义双指针分别指向头尾。
2. `res := make([]int, n)`：提前分配结果数组，大小和原数组一致。
3. `for i := n-1; i >= 0; i--`：核心精髓！既然最大值在两端，我们就从新数组的**末尾**开始往前填入较大的值。
4. `if abs(nums[left]) > abs(nums[right])`：比较头尾元素的绝对值。如果左边绝对值更大，说明左边的平方值更大。
5. `res[i] = nums[left] * nums[left]; left++`：将左边元素的平方放入结果数组的当前末尾，并让左指针向右移动。
6. `else`：反之，将右边元素的平方放入结果数组，右指针向左移动。

**时间复杂度**：`O(n)`，**空间复杂度**：`O(n)`（题目要求返回新数组）。

---

## 209. 长度最小的子数组

**题目描述**：给定一个含有 `n` 个正整数的数组和一个正整数 `target` 。找出该数组中满足其和大于等于 `target` 的长度最小的 **连续子数组** `[nums_l, nums_l+1, ..., nums_r]` ，并返回其长度。如果不存在符合条件的子数组，返回 `0` 。

**Go 代码实现**：

```go
func minSubArrayLen(target int, nums []int) int {
    n := len(nums)
    if n == 0 {
        return 0
    }
    minLen := n + 1
    left, sum := 0, 0
    for right := 0; right < n; right++ {
        sum += nums[right]
        for sum >= target {
            if right-left+1 < minLen {
                minLen = right - left + 1
            }
            sum -= nums[left]
            left++
        }
    }
    if minLen == n+1 {
        return 0
    }
    return minLen
}

```

**详细解析**（逐行讲解）：

1. `n := len(nums)`：获取数组长度，方便后续边界判断。
2. `if n == 0 { return 0 }`：空数组直接返回 0，符合题意。
3. `minLen := n + 1`：初始化最小长度为不可能的大值（比任何合法长度都大），用于后续取最小。
4. `left, sum := 0, 0`：`left` 是滑动窗口左边界，`sum` 维护当前窗口内元素和。
5. `for right := 0; right < n; right++`：右指针不断右移，扩展窗口（滑动窗口核心：先扩张）。
6. `sum += nums[right]`：把新加入的元素累加到窗口和中。
7. `for sum >= target`：只要当前窗口和满足条件，就不断收缩左边界（贪心思想：使子数组尽可能短）。
8. `if right-left+1 < minLen`：记录当前窗口长度，如果更小则更新 `minLen`。
9. `sum -= nums[left]; left++`：移除最左边的元素，左指针右移，缩小窗口。
10. 循环结束后，如果 `minLen` 仍为 `n+1` 说明没有找到符合条件的子数组，返回 0，否则返回 `minLen`。

**为什么 O(n)？** 右指针只向右移动 `n` 次，左指针也最多向右移动 `n` 次，每个元素最多被访问两次。

**时间复杂度**：`O(n)`，**空间复杂度**：`O(1)`。

---

## 59. 螺旋矩阵 II

**题目描述**：给你一个正整数 `n` ，生成一个包含 `1` 到 `n²` 所有元素，且元素按顺时针顺序螺旋排列的 `n x n` 正方形矩阵 `matrix` 。

**Go 代码实现**：

```go
func generateMatrix(n int) [][]int {
    matrix := make([][]int, n)
    for i := range matrix {
        matrix[i] = make([]int, n)
    }
    left, right := 0, n-1
    top, bottom := 0, n-1
    num := 1
    target := n * n

    for num <= target {
        // 从左到右填充上边界
        for i := left; i <= right; i++ {
            matrix[top][i] = num
            num++
        }
        top++
        // 从上到下填充右边界
        for i := top; i <= bottom; i++ {
            matrix[i][right] = num
            num++
        }
        right--
        // 从右到左填充下边界（防止边界交叉时重复填充）
        if top <= bottom {
            for i := right; i >= left; i-- {
                matrix[bottom][i] = num
                num++
            }
            bottom--
        }
        // 从下到上填充左边界（防止边界交叉时重复填充）
        if left <= right {
            for i := bottom; i >= top; i-- {
                matrix[i][left] = num
                num++
            }
            left++
        }
    }
    return matrix
}

```

**详细解析**（逐行讲解）：

1. `matrix := make([][]int, n)` + 内层 `make([]int, n)`：创建 `n x n` 二维切片，初始化为零值。
2. `left, right, top, bottom`：四个边界指针，分别表示当前层的左右上下边界，初始覆盖整个矩阵。
3. `num := 1; target := n*n`：当前要填入的数字和总共需要填充的数字数量。
4. `for num <= target`：循环直到所有数字都填完。
5. 第一段 `for`：沿上边界从左到右填充一行，填完后 `top++`（上边界内缩）。
6. 第二段 `for`：沿右边界从上到下填充一列，填完后 `right--`（右边界内缩）。
7. 第三段 `if top <= bottom`：如果还有下边界，才沿下边界从右到左填充一行，防止单行时重复；填完后 `bottom--`。
8. 第四段 `if left <= right`：如果还有左边界，才沿左边界从下到上填充一列，防止单列时重复；填完后 `left++`。
9. 四个方向循环一次就是一层，边界不断内缩，直到填满整个矩阵。*(注：这套加了 if 判断的逻辑也是生成非对称螺旋矩阵的满分通用模板！)*

**时间复杂度**：`O(n²)`（每个元素只访问一次），**空间复杂度**：`O(n²)`（返回结果矩阵）。

---

## 总结

**今天收获**：

* **双指针复习**：再次体会了在有序数组中，利用首尾双指针向中间靠拢的优雅解法。
* 彻底掌握**滑动窗口**（双指针 + 窗口和维护）的经典模板，轻松把暴力 O(n²) 优化到 O(n)。
* 学会**四边界模拟**法生成螺旋矩阵，逻辑清晰、边界处理严谨，适用于所有矩阵遍历/生成题。
* 在 Go 中熟练运用二维切片初始化、`make`、`for` 循环以及边界收缩技巧。
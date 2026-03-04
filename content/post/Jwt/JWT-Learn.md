---
title: "JWT (JSON Web Token) 深入浅出"
date: 2026-03-04T15:00:00+08:00
draft: false
tags: ["Go", "JWT", "Authentication", "Security", "Web Development"]
categories: ["Backend", "Go Learning"]
math: false
description: "深入浅出介绍 JWT (JSON Web Token) 的原理、结构以及在 Go 语言中的完整实现流程，包括令牌的生成、解析与验证。"
cover: "https://elari39.oss-cn-chengdu.aliyuncs.com/blog/20260304150622536.png"

---

## 🌟 什么是 JWT

> **JWT (JSON Web Token)** 是一种基于 JSON 的开放标准（[RFC 7519](https://tools.ietf.org/html/rfc7519)），用于在网络应用环境间传递声明（Claims）。它通常被用作一种 **身份认证令牌**。

### 🔄 认证流程

1. **用户登录/注册**：用户提交凭据。
2. **生成令牌**：服务器验证成功后，根据 *密钥 (Secret)* 生成 Token 并返回给用户。
   - 🛠️ 核心函数：`GenerateToken`
3. **客户端存储**：用户收到 Token 后通常存储在 `LocalStorage` 或 `Cookie` 中。
4. **携带请求**：用户后续请求在 Header 中携带 Token：`Authorization: Bearer <token>`。
5. **服务器解析**：服务器拦截请求并解析 Token 验证身份。
   - 🛠️ 核心函数：`ParseToken`

---

## 🏗️ JWT 的组成

JWT 由三部分组成，通过 `.` 连接：`Header.Payload.Signature`

### 1️⃣ 头部 (Header)
包含了 Token 的类型（JWT）和使用的签名算法（如 HS256 或 RSA）。
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### 2️⃣ 载荷 (Payload)
包含了用户的相关信息（Claims），如用户 ID、用户名、过期时间等。
```json
{
  "user_id": 1017,
  "username": "Elaina",
  "exp": 1710000000
}
```
**建议存放：** 用户 ID、用户名、角色、过期时间。
> [!WARNING]
> **注意：** Payload 仅经过 **Base64URL 编码**，并未加密。**切勿在 Payload 中存放密码等敏感信息！**

### 3️⃣ 签名 (Signature)
用于验证 Token 的真实性，防止被篡改。它是将 Header 和 Payload 编码后，使用 Secret 进行哈希计算得出的。
```go
// 签名原理示例
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  secret
)
```

---

## 🚀 Go 语言实现完整流程

### 1. 创建 JWT
1. **定义 Claims**：创建自定义结构体，嵌入 `jwt.RegisteredClaims`，并包含业务字段（如 UserID）。
2. **编写生成函数**：
   - 实例化 `MyClaims`，设置业务数据、过期时间（`ExpiresAt`）和签发人（`Issuer`）。
   - 选择签名算法（推荐 `HS256`）。
   - 使用 `SignedString` 结合 `JWT_SECRET` 生成最终字符串。

### 2. 解析与验证 JWT
1. **编写解析函数**：传入 Token 字符串，返回 `*MyClaims`。
2. **类型检查**：在 `ParseWithClaims` 的回调中，**必须**验证 `token.Method` 是否为预期的 HMAC 类型，防止算法切换攻击。
3. **有效性检查**：通过 `token.Valid` 检查 Token 是否过期或签名无效。

---

## 💻 核心代码实现

```go
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// MyClaims 自定义声明结构体
type MyClaims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateToken 生成 JWT 令牌
func GenerateToken(userID uint, userName string) (string, error) {
	// 1. 设置过期时间：24小时
	exp := time.Now().Add(24 * time.Hour)
	
	claims := &MyClaims{
		UserID:   userID,
		Username: userName,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			Issuer:    "Elari39",
		},
	}
	
	// 2. 创建 JWT 对象 (使用 HS256 算法)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	
	// 3. 使用密钥签名并生成 Token 字符串
	// 安全提示：JWT_SECRET 应存储在 .env 环境变量中
	tokenString, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		return "", err
	}
	
	return tokenString, nil
}

// ParseToken 解析并验证 JWT 令牌
func ParseToken(tokenString string) (*MyClaims, error) {
	claims := &MyClaims{}
	
	// 1. 解析令牌
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		// 🛡️ 重要安全检查：验证签名算法是否符合预期
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		
		// 返回用于验证签名的密钥
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	
	if err != nil {
		return nil, err
	}
	
	// 2. 检查令牌有效性并提取 Claims
	if claims, ok := token.Claims.(*MyClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}
```
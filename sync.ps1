# 自动同步脚本
# 功能：拉取最新代码 -> 添加所有更改 -> 提交 -> 推送

# 设置控制台输出编码为 UTF-8，防止乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "正在拉取最新代码..." -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Error "拉取失败，请检查冲突或网络连接。"
    exit $LASTEXITCODE
}

Write-Host "正在添加更改..." -ForegroundColor Cyan
git add .

$hasChanges = git status --porcelain
if (-not $hasChanges) {
    Write-Host "没有检测到更改。" -ForegroundColor Yellow
    exit 0
}

$commitMessage = Read-Host "请输入提交信息（默认为'Update blog content'）"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update blog content"
}

Write-Host "正在提交更改..." -ForegroundColor Cyan
git commit -m "$commitMessage"

Write-Host "正在推送到远程仓库..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "同步完成！" -ForegroundColor Green
} else {
    Write-Error "推送失败，请检查网络连接或权限。"
}

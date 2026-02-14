# 鑷姩鍚屾鑴氭湰
# 鍔熻兘锛氭媺鍙栨渶鏂颁唬鐮?-> 娣诲姞鎵€鏈夋洿鏀?-> 鎻愪氦 -> 鎺ㄩ€?

# 璁剧疆鎺у埗鍙拌緭鍑虹紪鐮佷负 UTF-8锛岄槻姝贡鐮?
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "姝ｅ湪鎷夊彇鏈€鏂颁唬鐮?.." -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Error "鎷夊彇澶辫触锛岃妫€鏌ュ啿绐佹垨缃戠粶杩炴帴銆?
    exit $LASTEXITCODE
}

Write-Host "姝ｅ湪娣诲姞鏇存敼..." -ForegroundColor Cyan
git add .

$hasChanges = git status --porcelain
if (-not $hasChanges) {
    Write-Host "娌℃湁妫€娴嬪埌鏇存敼銆? -ForegroundColor Yellow
    exit 0
}

$commitMessage = Read-Host "璇疯緭鍏ユ彁浜や俊鎭?(榛樿涓?'Update blog content')"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update blog content"
}

Write-Host "姝ｅ湪鎻愪氦鏇存敼..." -ForegroundColor Cyan
git commit -m "$commitMessage"

Write-Host "姝ｅ湪鎺ㄩ€佸埌杩滅▼浠撳簱..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "鍚屾瀹屾垚锛丟itHub Actions 灏嗚嚜鍔ㄥ紑濮嬫瀯寤哄拰閮ㄧ讲銆? -ForegroundColor Green
} else {
    Write-Error "鎺ㄩ€佸け璐ワ紝璇锋鏌ョ綉缁滆繛鎺ユ垨鏉冮檺銆?
}


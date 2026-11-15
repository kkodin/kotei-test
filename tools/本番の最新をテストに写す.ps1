# ================================================================
#  本番の最新をテストに写す.ps1  ― 本番の最新をテストに写す.bat から呼ばれる（2026-11-15）
#  会社の OneDrive「社内共有フォルダ」の本番データを、99_テスト の同じ場所へ写す。
#    本番 → テスト の一方通行。本番には何も書かない。
#    コピーだけで、ミラーはしない（テストにしか無いファイルも消さない）。
#    常用日報の「使用中_〜.json」（使用中の札）は写さない。テスト側に残っている札は消す。
#  写すと、テスト版で入力・保存した内容は本番の内容で上書きされる。
#  -Root -Yes は試験用。ふだんは何も渡さない
# ================================================================
param(
    [string]$Root = '',     # 社内共有フォルダ の場所（空なら自動で探す）
    [switch]$Yes            # 確認を飛ばす（試験用）
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Quit($msg) { Say $msg Red; exit 1 }

# 写すフォルダ（社内共有フォルダ からの道筋）。テスト側は 99_テスト の下の同じ道筋
$Pairs = @('12_工程\工程データ', '03_自社機械稼働表\稼働データ', '06_配置表\配置表データ')
$TestDir = '99_テスト'

# 社内共有フォルダ を探す（PCごとにユーザー名と OneDrive の名前が違うので決め打ちしない）
if (-not $Root) {
    $cands = @()
    if ($env:OneDriveCommercial) { $cands += Join-Path $env:OneDriveCommercial '社内共有フォルダ' }
    $cands += @(Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -Filter 'OneDrive - *' -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName '社内共有フォルダ' })
    $Root = $cands | Where-Object { Test-Path -LiteralPath (Join-Path $_ $TestDir) } | Select-Object -First 1
    if (-not $Root) { Quit "社内共有フォルダ\$TestDir が見つかりません。会社の OneDrive が同期されているか確かめてください。" }
}
$Root = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')

Say '=========================================================='  Cyan
Say '  本番の最新をテストに写す（本番 → 99_テスト の一方通行）'  Cyan
Say '=========================================================='  Cyan
Say "社内共有フォルダ: $Root`n"

$jobs = @()
foreach ($p in $Pairs) {
    $src = Join-Path $Root $p
    $dst = Join-Path (Join-Path $Root $TestDir) $p
    # 写し先は必ず 99_テスト の中。本番へ書く形になっていたら止める
    if ($dst -notlike "*\$TestDir\*" -or $src -like "*\$TestDir\*") { Quit "写す場所の組み合わせがおかしいので止めました: $src → $dst" }
    if (-not (Test-Path -LiteralPath $src)) { Quit "本番のフォルダが見つかりません: $src" }
    $n = @(Get-ChildItem -LiteralPath $src -File -Recurse -ErrorAction SilentlyContinue).Count
    Say ("  {0}`n      → {1}\{0}   （本番のファイル {2} 個）" -f $p, $TestDir, $n)
    $jobs += [pscustomobject]@{ Src = $src; Dst = $dst; Name = $p }
}
Say "`n・本番には何も書きません。テスト（$TestDir）の中だけが変わります。" Yellow
Say '・テスト版で入力・保存した内容は、本番の内容で上書きされます。' Yellow
Say '・常用日報の「使用中」の札は写さず、テスト側に残っている札は消します。' Yellow
if (-not $Yes) {
    $a = (Read-Host "`n写してよければ Y、やめるなら Enter").Trim()
    if ($a -notmatch '^[yYｙＹ]$') { Say 'やめました。何も変えていません。' Yellow; exit 0 }
}

$bad = 0
foreach ($j in $jobs) {
    Say "`n--- $($j.Name) ---" Cyan
    if (-not (Test-Path -LiteralPath $j.Dst)) { New-Item -ItemType Directory -Path $j.Dst -Force | Out-Null }
    # /E 下のフォルダも写す（空のフォルダも）。/PURGE・/MIR は使わない（テスト側を消さない）
    # robocopy の表示は文字化けして読みにくいので出さず、結果の番号で判断する（1＝写した、0＝変わりなし、8以上＝失敗）
    $log = & robocopy $j.Src $j.Dst /E /XF '使用中_*.json' /R:2 /W:3 /NP /NDL /NFL /NJH /NJS /XJ
    $rc = $LASTEXITCODE
    if ($rc -ge 8) { $bad++; Say "  写せないファイルがありました（robocopy の結果 $rc）。" Red; $log | Out-Host }
    elseif ($rc -band 1) { Say '  写しました（変わったファイルを上書き）。' Green }
    else { Say '  本番と同じでした（写すものなし）。' Green }
    # テスト側に残っている「使用中」の札を消す（写し先＝99_テスト の中だけ）
    Get-ChildItem -LiteralPath $j.Dst -Recurse -File -Filter '使用中_*.json' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*\$TestDir\*" } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Say "  使用中の札を消しました: $($_.Name)" DarkGray }
}

Say ''
if ($bad) { Say "★ 一部が写せませんでした。OneDrive の同期が終わってから、もう一度実行してください。" Red; exit 1 }
Say "★ 終わりました（$(Get-Date -Format 'yyyy/MM/dd HH:mm')）。OneDrive の同期が終わってから、テスト版を開いてください。" Green
Say '   テスト版：https://kkodin.github.io/kotei-test/' Green

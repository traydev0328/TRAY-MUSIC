# TRAY MUSIC 휴대폰 APK 로컬 빌드 (Windows 11 PowerShell)
# 사전 조건: Android Studio 설치(SDK 포함), 이 저장소 루트에서 실행
# 사용: .\scripts\build-mobile.ps1            -> 디버그 APK
#       .\scripts\build-mobile.ps1 -Release   -> keystore.properties 로 서명된 릴리스 APK
param([switch]$Release)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:JAVA_HOME) {
    $jbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbr) { $env:JAVA_HOME = $jbr } else { throw "JAVA_HOME 이 없습니다. Android Studio 를 설치하세요." }
}
if (-not (Test-Path "local.properties")) {
    $sdk = "$env:LOCALAPPDATA\Android\Sdk"
    if (-not (Test-Path $sdk)) { throw "Android SDK 를 찾을 수 없습니다: $sdk" }
    "sdk.dir=$($sdk -replace '\\','\\\\')" | Out-File -Encoding ascii local.properties
}

# gradlew 가 없으면 Android Studio 로 한 번 Open 하면 생성됩니다(또는 설치된 gradle 로 'gradle wrapper').
$gradle = if (Test-Path ".\gradlew.bat") { ".\gradlew.bat" } else { "gradle" }
$task = if ($Release) { ":app-mobile:assembleRelease" } else { ":app-mobile:assembleDebug" }
& $gradle $task
if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }

$apk = Get-ChildItem -Recurse app-mobile\build\outputs\apk -Filter *.apk | Select-Object -First 1
New-Item -ItemType Directory -Force out | Out-Null
Copy-Item $apk.FullName out\TRAY_MUSIC_MOBILE.apk -Force
(Get-FileHash out\TRAY_MUSIC_MOBILE.apk -Algorithm SHA256).Hash | Tee-Object out\TRAY_MUSIC_MOBILE.apk.sha256
Write-Host "완료: out\TRAY_MUSIC_MOBILE.apk"

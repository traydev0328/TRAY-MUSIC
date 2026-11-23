# Google Cloud · 서명 키 설정 가이드

Google 로그인(OAuth)은 **APK 서명 인증서 SHA-1** 이 Google Cloud에 등록된 것과 같아야 작동합니다.
그래서 순서가 중요합니다: ① 서명 키 → ② GitHub Secrets → ③ Google Cloud.

## ① 개인 서명 키

`tray-release.jks` 와 `TRAY_SIGNING_KEY_INFO.txt`(비밀번호·SHA-1 포함)를 받았다면 그대로 사용합니다.
- 두 파일을 USB/개인 클라우드 등 **두 곳 이상에 백업**하세요. 잃어버리면 앱 업데이트 설치가 불가능합니다.
- 절대 저장소에 커밋하지 마세요.

직접 새로 만들려면 (Android Studio 설치 시 함께 설치되는 keytool 사용, PowerShell):
```powershell
keytool -genkeypair -v -keystore tray-release.jks -alias tray -keyalg RSA -keysize 4096 -validity 36500
keytool -list -v -keystore tray-release.jks -alias tray   # SHA1 확인
[Convert]::ToBase64String([IO.File]::ReadAllBytes("tray-release.jks")) | Set-Content tray-release.jks.base64
```

## ② GitHub Secrets 등록

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| 이름 | 값 |
|---|---|
| `TRAY_KEYSTORE_BASE64` | `tray-release.jks.base64` 파일 내용 전체 |
| `TRAY_KEYSTORE_PASSWORD` | 키 정보 파일의 비밀번호 |
| `TRAY_KEY_ALIAS` | `tray` |
| `TRAY_KEY_PASSWORD` | 키 정보 파일의 비밀번호 |
| `YOUTUBE_API_KEY` | (선택) ③-3 에서 만든 API 키 |

등록 후 Actions 탭에서 `Run workflow` 로 다시 빌드하면 개인 키로 서명된 release APK가 나옵니다.
Artifact 안 `SIGNING_CERT.txt` 의 SHA-1 이 키 정보 파일과 같은지 확인하세요.

## ③ Google Cloud (https://console.cloud.google.com)

1. 상단 프로젝트 선택 → **새 프로젝트** → 이름 `TRAY-MUSIC` → 만들기
2. **API 및 서비스 → 라이브러리** → `YouTube Data API v3` 검색 → **사용**
3. (선택) **사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**
   - 키 수정 → *애플리케이션 제한*: Android 앱 → 패키지 `com.tray.music` + SHA-1 입력
   - *API 제한*: YouTube Data API v3 만 선택 → 저장
   - 앱은 `X-Android-Package`, `X-Android-Cert` 헤더를 자동으로 보내므로 이 제한이 작동합니다.
4. **Google Auth Platform(OAuth 동의 화면)** → 시작하기
   - 앱 이름 `TRAY MUSIC`, 지원 이메일 = 본인, 대상 **외부(External)**, 연락처 이메일 입력
   - **대상(Audience) → 테스트 사용자**에 본인 Gmail 추가 (게시 상태는 '테스트' 유지)
5. **클라이언트 → 클라이언트 만들기** → 유형 **Android**
   - 패키지 이름 `com.tray.music`
   - SHA-1 인증서 디지털 지문: 키 정보 파일의 SHA1
   - 디버그 키로도 테스트할 경우, 그 SHA-1 로 Android 클라이언트를 하나 더 만듭니다.
6. 앱 → **설정 → 연결/재승인** 또는 **YouTube → Google 연결**

### 참고
- 테스트 모드 OAuth는 일정 기간 후 재승인을 요구할 수 있습니다. 앱이 재승인 화면을 다시 띄웁니다.
- `DEVELOPER_ERROR` 가 나오면 패키지명/SHA-1 불일치입니다.
- API 사용은 일일 할당량(기본 10,000 units) 안에서 무료이며 별도 결제가 필요하지 않습니다.

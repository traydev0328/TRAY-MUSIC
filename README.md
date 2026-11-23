# TRAY MUSIC

Galaxy S23 Ultra / Galaxy Watch5 Pro 개인 전용 음악 관리 앱.

> 같은 저장소의 별도 프로젝트: [`tray-fps/`](tray-fps/README.md) — 모바일·PC 웹 3D FPS **TRAY BLACK RAIN** (싱글 + 멀티 협동, GitHub Pages 배포)
 기준 문서: `docs/TRAY_MUSIC_ULTIMATE_v1.0.md`

## 현재 상태 (정직한 표시)

| 단계 | 상태 |
|---|---|
| P0 휴대폰 기본 앱 | 구현 · CI 빌드 통과 · 실기기 미검증 |
| P1 자동 동기화/허가 음원 매칭/EQ·가사·시각화 | 구현(크로스페이드·Commons/Archive 제외) · CI 통과 · 실기기 미검증 |
| P2 Wear OS 앱/전송/AAC 변환/리모컨 | 구현 · CI 통과 · 실기기 미검증 |
| P3 실기기 장애 테스트·안정화 | **실기기 필요 — 미완료** (`docs/TEST_PLAN.md`) |

기능별 상세 상태는 [`docs/STATUS.md`](docs/STATUS.md).

## APK 받는 법 (GitHub Actions)

1. 저장소 **Actions** 탭 → `Build TRAY MUSIC APK` → 최신 실행(초록 체크) 클릭
2. 하단 **Artifacts** 의 `TRAY_MUSIC_APKS` 다운로드 → 압축 해제
   - `TRAY_MUSIC_MOBILE.apk` → 휴대폰에 설치 ('출처를 알 수 없는 앱 설치' 허용)
   - `TRAY_MUSIC_WEAR.apk` → 워치에 adb 로 설치 (`docs/SETUP_GOOGLE_CLOUD.md` ⑤)

Google 로그인을 쓰려면 **서명 키 Secrets 등록 + Google Cloud 설정**이 필요합니다 → [`docs/SETUP_GOOGLE_CLOUD.md`](docs/SETUP_GOOGLE_CLOUD.md)

## 로컬 빌드 (Windows 11)

```powershell
# Android Studio(최신 안정판) 설치 후 이 폴더를 Open
# 또는 PowerShell 에서:
.\scripts\build-mobile.ps1
```

## 기술 스택

Kotlin 2.1 · Jetpack Compose (Material3) · Media3 ExoPlayer/MediaSession · Room · WorkManager · DataStore · OkHttp · Google Identity AuthorizationClient · YouTube Data API v3

## 정책

- YouTube는 **메타데이터 조회 + 공식 앱/웹 재생 연결**만 합니다. YouTube 오디오 추출·변환·다운로드는 구현하지 않습니다.
- 다운로드는 사용자가 **이용 권한 근거를 입력·확인한 https 직접 URL**만 처리합니다.
- 비밀값(`secrets.properties`, `keystore.properties`, `*.jks`)은 Git에 올리지 않습니다.

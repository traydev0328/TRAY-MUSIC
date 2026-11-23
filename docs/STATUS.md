# 구현 상태표 (v0.1.0-p0)

표기: ✅ 코드 작성됨 · 🧪 자동 테스트 있음 · ⏳ 실기기 미검증 · ❌ 미구현

| 기능 | 상태 | 파일 |
|---|---|---|
| Gradle 프로젝트 / CI APK 빌드 | ✅ ⏳ | `build.gradle.kts`, `.github/workflows/android.yml` |
| 다크 테마 5탭 UI + 미니 플레이어 | ✅ ⏳ | `ui/TrayRoot.kt` 외 |
| 로컬 음악 검색 (MediaStore, 권한 처리) | ✅ ⏳ | `library/LocalMusicRepository.kt` |
| 보관함 검색/아티스트/앨범/TRAY 폴더 보기 | ✅ ⏳ | `ui/LibraryPlayerScreens.kt` |
| Media3 백그라운드 재생, 알림·잠금화면·BT 버튼, 오디오 포커스, 이어폰 분리 시 정지 | ✅ ⏳ | `playback/PlaybackService.kt` |
| 풀스크린 플레이어 (탐색, 셔플, 반복) | ✅ ⏳ | `ui/LibraryPlayerScreens.kt` |
| 허가 URL 다운로드: https 전용, 내부망 차단, 리디렉션 재검사 | ✅ 🧪 ⏳ | `net/SafeHttp.kt` |
| 이어받기 (Range + If-Range ETag/Last-Modified, 206 위치 검증, 200 시 재시작) | ✅ ⏳ | `downloads/DownloadWorker.kt` |
| 429/5xx 재시도·403 영구 실패·최대 6회 | ✅ ⏳ | 〃 |
| SHA-256 중복 검사, MediaExtractor 오디오 검증, HTML 응답 차단 | ✅ ⏳ | 〃 |
| `Music/TRAY MUSIC/` MediaStore 저장 (IS_PENDING) | ✅ ⏳ | 〃 |
| 대기열 일시정지/재개/취소/기록 삭제, 앱 재시작 후 복구 | ✅ ⏳ | `downloads/DownloadRepository.kt` |
| 동시 3개 제한, Wi-Fi 전용 기본 정책 | ✅ ⏳ | 〃 |
| 실측 기반 속도·남은 시간 (추정 불가 시 미표시) | ✅ ⏳ | `ui/DownloadsScreen.kt` |
| YouTube URL 파싱 | ✅ 🧪 | `youtube/YouTubeApi.kt` |
| Google OAuth (youtube.readonly, 동의/재승인, 오류 안내) | ✅ ⏳ | `auth/GoogleAuth.kt` |
| 내 재생목록·공개 목록 조회, 50개 페이지 전체 수집, 원자적 반영 | ✅ ⏳ | `youtube/YouTubeRepository.kt` |
| 공유 시트로 YouTube 링크 받기 | ✅ ⏳ | `MainActivity.kt` |
| 연결 해제 시 API 데이터 삭제 | ✅ ⏳ | 〃 |
| SAF 폴더 선택 | ❌ (P1) | |
| 백그라운드 자동 동기화 (WorkManager 주기 작업) | ❌ (P1) | |
| Jamendo 등 허가 카탈로그 검색·매칭 | ❌ (P1) | |
| 자동 다운로드 동의 UI·배터리 25% 정책 | ❌ (P1) | |
| EQ / 가사 / 시각화 / 크로스페이드 | ❌ (P1) | |
| Wear OS 앱·전송·독립 재생·AAC 변환 | ❌ (P2) | |
| 장애 시나리오·실기기 테스트·문서 완성 | ❌ (P3) | |

미구현 기능은 UI에 버튼으로 노출하지 않고 "P1/P2 예정" 문구로만 안내합니다.

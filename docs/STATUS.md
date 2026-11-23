# 구현 상태표 (v1.0.0)

표기: ✅ 코드 작성 + CI 컴파일 통과 · 🧪 자동 단위 테스트 있음 · ⏳ 실기기 미검증 · ⚠️ 제한/부분 구현 · ❌ 미구현

> 모든 기능은 **실기기(S23 Ultra / Watch5 Pro)에서 아직 검증되지 않았습니다.** `docs/TEST_PLAN.md` 실측 후 이 표를 갱신합니다.

## 휴대폰 (app-mobile)

| 기능 | 상태 | 파일 |
|---|---|---|
| 다크 테마 5탭 UI + 미니 플레이어 | ✅ ⏳ | `ui/TrayRoot.kt` |
| 로컬 음악 검색, 전체/즐겨찾기/TRAY 폴더/아티스트/앨범 보기 | ✅ ⏳ | `library/`, `ui/LibraryPlayerScreens.kt` |
| Media3 백그라운드 재생, 알림·잠금화면·BT 버튼, 오디오 포커스 | ✅ ⏳ | `playback/PlaybackService.kt` |
| 대기열·재생 위치 영속화(앱 재시작 후 이어 듣기) | ✅ ⏳ | `QueueStore` |
| 셔플/반복/탐색, 재생 속도·피치 | ✅ ⏳ | |
| 이퀄라이저(기기 제공 밴드 수), 프리셋, 베이스 부스트, 음량 보정 | ✅ ⚠️ ⏳ | `audiofx/AudioFx.kt` — 정확한 10밴드는 보장 안 함(기기 의존) |
| 실시간 스펙트럼 시각화 (화면 표시 + 재생 중에만) | ✅ ⏳ | 마이크 권한 필요(Android 규정, 녹음 안 함) |
| LRC 동기화 가사: 가져오기, 현재 줄 강조, 터치 이동, 싱크 ±0.5초 | ✅ 🧪 ⏳ | `lyrics/Lyrics.kt` |
| Gapless | ⚠️ | ExoPlayer 기본(파일에 지연 정보가 있을 때) |
| 크로스페이드 | ❌ | 이중 플레이어 구조 필요 — 미구현으로 UI에 명시 |
| 허가 URL 다운로드: https, 내부망 차단, 리디렉션 재검사 | ✅ 🧪 ⏳ | `net/SafeHttp.kt` |
| 이어받기(Range/If-Range, 206 검증, 200 재시작), 429/5xx 재시도 | ✅ ⏳ | `downloads/DownloadWorker.kt` |
| SHA-256 중복, 오디오 디코딩 검증, HTML 응답 차단 | ✅ ⏳ | |
| 저장: `Music/TRAY MUSIC/`(IS_PENDING) 또는 SAF 선택 폴더 | ✅ ⏳ | |
| 동시 3개, Wi-Fi 전용 기본, 자동 작업 배터리 25% 보류 | ✅ ⏳ | |
| Google OAuth(youtube.readonly) 연결/재승인/해제 | ✅ ⏳ | `auth/GoogleAuth.kt` |
| 공개·개인 재생목록, 50개 페이지 수집, 원자적 반영, 영상 길이 수집 | ✅ 🧪 ⏳ | `youtube/` |
| 백그라운드 자동 동기화(1시간, 절전 6시간) + 수동 즉시 동기화 | ✅ ⏳ | `sync/SyncWorker.kt` |
| Jamendo 허가 음원 검색 + 보수적 동일 녹음본 판정 5단계 | ✅ 🧪 ⏳ | `matching/`, `sources/JamendoSource.kt` |
| VERIFIED 자동 다운로드(명시 동의), NEEDS_REVIEW 수동 승인 | ✅ ⏳ | |
| Wikimedia Commons / Internet Archive 어댑터 | ❌ | 자료별 라이선스 판정 규칙 필요 — 미구현 |
| 워치 기기 탐색·승인, 상태(용량/배터리) 조회 | ✅ ⏳ | `watchlink/WatchLink.kt` |
| 워치 전송: 1MiB 블록, 워치 보고 오프셋부터 재개, SHA-256 검증 ACK | ✅ ⏳ | `watchlink/WatchTransferWorker.kt` |
| 무손실→AAC-LC 128/192/256 변환(MediaCodec), 손실 음원 재압축 금지, 변환 캐시 | ✅ ⏳ | `watchlink/AudioTranscoder.kt` |
| 워치 예산 40%·최소 여유 512MiB/10%·워치 배터리 30% 보류 | ✅ ⏳ | |
| 즐겨찾기 워치 자동 전송 | ✅ ⏳ | |
| 워치 리모컨 명령 수신(재생/일시정지/이전/다음/볼륨) | ✅ ⏳ | `watchlink/TrayWearListenerService.kt` |

## 워치 (app-wear)

| 기능 | 상태 |
|---|---|
| 홈 / 워치 음악 / 플레이어 / 리모컨 / 저장공간 화면 (원형 화면, Wear Compose) | ✅ ⏳ |
| 휴대폰 없이 독립 재생 (Media3) — 출력은 Wear OS 오디오 경로(BT 이어폰 연결 시 BT) | ✅ ⏳ |
| 수신: OFFER 응답(이어받기 위치/이미 있음/공간 부족), part 파일 append, 크기·SHA-256·디코딩 검증 후 등록 | ✅ ⏳ |
| 저장공간·배터리 보고, 수신 진행 표시, 곡 삭제(이중 확인) | ✅ ⏳ |

## 알려진 제약

- 휴대폰·워치 APK가 **같은 서명 키**여야 통신됩니다. Secrets 미등록 시 CI는 매 실행마다 같은 임시 디버그 키로 두 APK를 서명하므로 *같은 실행에서 나온 두 APK*는 서로 통신 가능하지만, Google 로그인(SHA-1 고정 필요)은 안 됩니다.
- DB v1(P0 시험판) → v2 업그레이드 시 재생목록/다운로드 기록이 초기화됩니다(음악 파일은 유지).
- 성능(60fps, 배터리 소모, 전송 속도)은 측정하지 않았습니다.

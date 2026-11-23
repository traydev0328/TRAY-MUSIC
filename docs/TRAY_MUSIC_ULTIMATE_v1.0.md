# TRAY MUSIC ULTIMATE — 최종 개발 기획서 v1.0

- 문서 버전: 1.0
- 작성 기준일: 2026-11-23
- 프로젝트 종류: Android / Wear OS 개인 전용 음악 관리 앱
- 개발 대상: Galaxy S23 Ultra(휴대폰), Galaxy Watch5 Pro(시계)
- 배포 방식: Google Play 미등록, 개인용 APK 직접 설치
- 상태: **개발 착수용 확정 기획서**. 실제 구현·빌드·실기기 검증이 끝났다는 의미는 아님.

> **최종 지시:** Q01~Q13까지 합의한 기능 범위를 유지하되, 추가 기획 질문·기능 확장 없이 이 문서를 기준으로 코드 작성, 인증 구성, APK 빌드, 실기기 검증을 수행한다. 검증하지 않은 부분을 '완성'이라고 표시하지 않는다.

---

## 1. 프로젝트 목표

사용자는 하나의 Android 앱에서 (1) YouTube 음악 재생목록 URL을 불러오거나 본인 Google 계정을 연동하고, (2) 곡 목록을 정리·동기화하며, (3) 별도로 **다운로드 허가가 확인된** 음악 파일을 검색·일괄 다운로드하고, (4) 해당 파일을 휴대폰에서 오프라인으로 재생하며, (5) Galaxy Watch5 Pro로 전송해 휴대폰 없이 재생한다.

### 반드시 구분할 범위

- **YouTube 연동:** 공식 YouTube Data API v3로 공개·권한이 있는 개인 재생목록의 *메타데이터*를 가져오고, 온라인 재생은 정책을 따르는 공식 YouTube 재생 수단으로 제공한다.
- **음원 다운로드:** 별도의 저작권·다운로드 권한이 명확한 음원 카탈로그, 사용자 소유·사용 허락을 받은 직접 URL, 기기 내 파일을 대상으로 한다.
- **지원하지 않음:** 일반 YouTube 영상의 오디오를 직접 MP3로 추출/변환/우회 다운로드, YouTube 오디오만 분리해서 자체 백그라운드 플레이어에 연결, 유료 음악 서비스의 DRM 우회.
- **결과 안내:** YouTube 재생목록에 100곡이 있어도 다운로드 가능한 파일이 0곡일 수 있다. 이를 정상 상태로 취급하며, 온라인 재생 목록과 오프라인 파일 보관함을 구분한다.

## 2. Q01~Q13 확정사항 요약

| 결정 | 확정 내용 |
|---|---|
| Q01 | 직접 음악 링크 다운로드 + 허가된 음악 검색 + 로컬 플레이어 통합 |
| Q02 | 일반 K-POP·팝송 등 YouTube 재생목록 *정보* 연동 |
| Q03 | 재생목록 URL, Google OAuth, 개인 목록 조회, 자동 동기화 |
| Q04 | 앱 실행 시 갱신 검사 + 배터리/연결 상태 기반 적응형 백그라운드 동기화 |
| Q05 | `Music/TRAY MUSIC/` 기본 저장, 폴더 선택, 중복·손상·중단 복구 |
| Q06 | 고급 음악 플레이어, EQ, 가사, 시각화, MediaSession, 백그라운드 재생 |
| Q07 | Wear OS 별도 APK, 원격 제어, 시계 저장 음악의 독립 재생 |
| Q08 | 수동/즐겨찾기/선택 재생목록의 워치 자동 전송·체크포인트 복구 |
| Q09 | 원본 보존 + 조건부 AAC 128/192/256kbps 변환, 워치 공간 최적화 |
| Q10 | 허가된 외부 음원 출처 검색, YouTube 곡과의 신중한 동일 음원 매칭 |
| Q11 | 사용자 동의 범위 내 자동 다운로드·일괄 처리·백그라운드 복구 |
| Q12 | 개인용 APK 직접 설치(정식 Google Play 등록 불필요) |
| Q13 | Google Cloud 프로젝트 신규 생성, API/OAuth 준비 후 개발 착수 |

## 3. 사용자 경험 및 화면 명세

### 휴대폰 앱: 6개 기본 화면

1. **홈:** 최근 재생·최근 다운로드·동기화 상태·즐겨찾기, 하단 미니 플레이어.
2. **검색/YouTube:** URL 붙여넣기, Google 계정 연결, 개인 재생목록 선택, 공개 목록 등록, 공식 온라인 재생으로 이동.
3. **재생목록 상세:** 제목·채널/아티스트·영상/음원 구분·곡 순서·새 곡/삭제 변경·매칭 결과 표시. `유튜브 온라인 재생`, `허가된 파일 발견`, `확인 필요` 상태를 시각적으로 구별.
4. **다운로드 센터:** 대기/실행/검증/완료/실패/보류 필터; 진행률·속도·남은 시간(추정 가능할 때만)·일시정지·재시도·취소; 저장 경로.
5. **내 음악/풀스크린 플레이어:** 앨범/아티스트/폴더/재생목록, 재생·탐색·셔플·반복·가사·EQ·오디오 시각화·잠금화면 제어.
6. **설정/워치:** Google 연결·해제, 네트워크·배터리·저장 정책, 권한, 워치 연결, 자동 동기화 대상/음질/용량, 사용 기록·오류 진단.

### 디자인 기준

- 기본 다크 테마, 가독성 높은 타이포그래피, 색 대비 및 터치 타깃 확보.
- 미니 플레이어는 모든 주요 화면 하단에서 같은 재생 상태 유지.
- 애니메이션은 60fps *목표*이나 실기기 프로파일링으로 판정하고 `애니메이션 줄이기` 시스템 설정을 존중.
- 네트워크 요청/외부 조회 중에는 로딩과 취소 상태를 표시. 실패 사유는 실제 원인으로 노출하고 허위 속도/남은 시간을 표시하지 않는다.
- 오프라인일 때도 로컬 보관함과 기존 다운로드 파일을 계속 사용할 수 있어야 한다.

### 워치 앱: 4개 화면

1. 로컬 곡 보관함·재생목록
2. 원형 화면 최적화 플레이어(곡 제목, 재생·일시정지, 이전·다음, 볼륨)
3. 전송 상태/저장 공간 및 동기화 정책
4. 휴대폰 원격 제어/워치 독립 재생 모드 전환

## 4. 시스템 아키텍처

```text
[Android 휴대폰 앱 - Kotlin / Jetpack Compose]
    |-- Account & OAuth Manager ------- Google AuthorizationClient
    |-- YouTube Playlist Adapter ------ YouTube Data API v3
    |-- Source Registry --------------- Jamendo/허가된 공개 자료/직접 URL
    |-- Match & Rights Verifier ------- 제목·아티스트·버전·권한 증거
    |-- Auto Sync Scheduler ----------- WorkManager + Constraints
    |-- Persistent Download Queue ----- Room + HTTP downloader/UIDT
    |-- Media Library ----------------- MediaStore + SAF + Room
    |-- Local Player ------------------ Media3 ExoPlayer + MediaSessionService
    |-- Audio Effects & Lyrics -------- DSP, LRC parser, visualizer
    |-- Watch Sync Sender ------------- Wearable Data Layer
    |
    +---------------- Wear OS Data Layer ----------------+
                                                        |
[Galaxy Watch5 Pro 앱 - Compose for Wear OS] <-----------+
    |-- Device pairing & transfer receiver
    |-- Chunk manifest / checkpoint / integrity verifier
    |-- Watch local database & music file store
    |-- Media3 local player, Bluetooth audio output
    |-- Sync policy, storage budget, battery policy
```

- 사용자 음악 파일과 기본 개인정보는 **로컬 우선**으로 보관한다.
- 별도의 유료 AI API, 자체 클라우드 서버, 상시 PC 실행을 필수 조건으로 두지 않는다.
- Google Cloud는 YouTube API 활성화 및 OAuth 클라이언트 관리용이며, 이 설계에는 별도 유료 서버가 필요하지 않다. API별 할당량과 서비스 조건은 별도로 적용된다.

### 개발 언어/라이브러리

- Android: Kotlin, Jetpack Compose, AndroidX Navigation, Coroutines/Flow, Room, WorkManager, DataStore, OkHttp, Media3 ExoPlayer/Session/Transformer, Google Identity authorization.
- Wear OS: Kotlin, Compose for Wear OS, Wearable Data Layer `DataClient`/`MessageClient`/`ChannelClient`, Media3, Room.
- 빌드: Android Studio, Android SDK, Gradle Kotlin DSL, JDK(사용하는 Android Gradle Plugin이 요구하는 버전).
- 의존성 버전은 개발 시작 시 공식 안정 버전의 호환 조합으로 고정하고, 잠금 파일과 빌드 기록을 남긴다. 근거 없이 구버전 번호를 확정하지 않는다.
- Android APK와 Wear OS APK는 동일한 앱 식별자 `com.tray.music`와 동일 서명 키를 사용하는 구성으로 시작한다. 각 기기별 APK에는 서로 다른 기능 모듈을 포함한다.

## 5. YouTube API 및 Google 인증

### 처음 1회 설정

1. https://console.cloud.google.com 에서 `TRAY-MUSIC` 프로젝트 생성.
2. `YouTube Data API v3` 활성화.
3. API 키 생성: 공개 데이터 요청에만 사용하며 YouTube API 및 Android 애플리케이션 제한을 검토·적용. 제한이 실제 HTTP 요청 환경에서 작동하는지 확인.
4. Google Auth Platform의 앱 정보·개인정보 방침 등 필요한 항목 구성, 테스트 사용자로 본인 계정 등록.
5. Android OAuth 클라이언트 생성: 패키지 `com.tray.music`, **실제로 빌드할 서명 인증서 SHA-1** 등록. 디버그용/개인 릴리스용 서명 키가 다르면 각각 등록.
6. 앱에서 Google 계정 권한 요청: `https://www.googleapis.com/auth/youtube.readonly`.
7. `AuthorizationClient`로 사용자 승인 후 개인 재생목록을 조회. 별도 계정 표시가 필요하면 그 목적에 맞는 최소 로그인 범위만 추가.
8. Google 계정의 OAuth 테스트/검증 정책 때문에 재승인이 요구될 수 있으므로 토큰 만료·권한 철회·재동의 과정을 구현.

### API 처리

- 공개/일부 미등록 목록: 접근 가능한 범위에서 `playlists.list`, `playlistItems.list` 조회.
- 개인/비공개 목록: 인증된 사용자가 접근 권한을 가진 경우 OAuth로 조회.
- 한 페이지 최대 50개 항목, `nextPageToken`으로 전 페이지 취합.
- 같은 영상이 목록에 중복 있어도 `playlistItem.id`를 별도 항목 식별자로 보존.
- 동기화 중 실패하면 이전에 검증된 목록을 보존; 전체 스냅샷 수집 후 원자적 반영.
- 삭제/비공개 전환 곡은 '현재 접근 불가'로 표시하되, 별도의 합법적 로컬 파일을 자동 삭제하지 않는다.
- API 할당량·지수 백오프·제한 오류를 지키며, API 출처 표시·OAuth 해제·보존 데이터 갱신/삭제 정책을 구현.
- 기본 동기화: 앱 열 때 필요 시 확인 + 1시간 정도의 백그라운드 예약 *목표*; 절전 상황에 따라 6~24시간으로 완화. Android가 실제 실행 시점을 결정하며 실시간 보장 없음.

### 보안

- API 키 및 OAuth 설정값은 소스 저장소에 커밋하지 않는다. 로컬 환경 파일은 `.gitignore` 처리.
- APK 내부에 포함된 API 키는 완전한 비밀로 간주할 수 없으므로 API/앱 제한과 사용량 관리를 병행한다.
- 사용자의 Google 비밀번호를 앱에서 수집하거나 자체 저장하지 않는다.
- OAuth 토큰은 플랫폼 인증 라이브러리의 생명주기에 맞춰 관리하고, 인증 토큰을 워치/음원 출처에 보내지 않는다.

## 6. 허가된 음원 검색·일괄 다운로드

### 출처 우선순위

1. 사용자가 직접 제공한 사용 권한이 있는 HTTPS 음원 URL.
2. 휴대폰에 이미 저장되어 접근 가능한 음악 파일.
3. **Jamendo 공식 API**: 애플리케이션의 사용 조건을 확인한 뒤 등록; `audiodownload_allowed` 등 실제 다운로드 허용 값 검증.
4. Wikimedia Commons / Internet Archive: 각 자료별 라이선스, 제공 방식, 다운로드 재배포 가능 여부 확인 후 선택적 어댑터 활성화. 검색 결과에 존재한다는 사실만으로 다운로드 허용 판단 금지.

### YouTube 목록과의 매칭

1. 곡명·아티스트·버전·재생 시간 추출 및 정규화.
2. 외부 허가 카탈로그 검색.
3. 동일 **녹음본**인지 증거 대조. 같은 제목인 커버/라이브/리믹스는 별도 판정.
4. 결과 상태: `VERIFIED`, `NEEDS_REVIEW`, `DIFFERENT_VERSION`, `UNAVAILABLE`, `RIGHTS_BLOCKED`.
5. `VERIFIED`이고 권한 확인도 통과한 파일만 사용자 동의 범위 내 자동 다운로드. 유사도 점수만으로 자동 확정하지 않는다.
6. 미확인 인기 가요는 원본 대신 커버를 자동 다운로드하지 않고 '온라인 재생/직접 음원 연결'로 남긴다.

### 다운로드 생명주기

`DISCOVERED → MATCHING → RIGHTS_CHECK → QUEUED → DOWNLOADING → VERIFYING → COMMITTING → COMPLETED → LIBRARY_REGISTERED`

예외 상태: `WAITING_NETWORK`, `WAITING_BATTERY`, `WAITING_STORAGE`, `PAUSED`, `NEEDS_REVIEW`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `CANCELLED`.

- 기본 동시 다운로드 3개. 출처의 이용 제한과 네트워크 상태에 맞춰 조정.
- 기본 Wi-Fi에서만 자동 시작. 모바일 데이터는 사용자가 명시적으로 켜야 함.
- 자동 신규 다운로드는 휴대폰 배터리 25% 미만 시 보류(초기 조정 가능 값).
- 전송 전 예상 크기/저장 공간 확인, 파일을 임시 보관 후 전체 해시·포맷 검증.
- HTTP Range + ETag/Last-Modified 조건이 맞으면 이어받기. `206` 범위 정확성 검증, `200`이면 처음부터 재시작. 조건이 불명확하면 처음부터 재다운로드.
- 중복 기준: 출처 음원 ID+다운로드 변형+해시. 음악 제목만으로 파일을 삭제/덮어쓰지 않음.
- `429`는 `Retry-After` 존중, `5xx`는 제한된 지수 백오프, `403`은 권한 재확인.
- 사용자 시작 대용량 전송은 Android 14+ User-Initiated Data Transfer 조건을 검토. 일반 예약 작업은 WorkManager. OS 제약을 우회하는 상시 실행 방식 사용 금지.
- 재생목록에서 곡이 사라져도 다운로드가 완료된 로컬 파일은 사용자 동의 없이 삭제하지 않는다.

## 7. 오프라인 저장소·라이브러리

- 기본 폴더: 공유 음악 저장소 `Music/TRAY MUSIC/`에 MediaStore를 통해 생성.
- 사용자 지정 위치: Storage Access Framework 폴더 선택. 시스템이 제한한 위치는 선택 불가.
- 저장 중 임시 파일과 완료 파일 분리. `IS_PENDING` 등의 MediaStore 규칙을 지켜 미완성 파일이 일반 플레이어에 노출되지 않도록 함.
- 앱 삭제 후 공유 Music 폴더 파일은 일반적으로 유지되지만, 앱 전용 캐시/DB는 삭제될 수 있음. 재설치 후 MediaStore 재스캔으로 보관함 복원.
- 앱이 소유하지 않은 다른 앱의 음악 검색에는 Android 버전에 맞는 `READ_MEDIA_AUDIO` 등의 권한 처리.
- 메타데이터: 제목/앨범/아티스트/아트워크/파일 경로 URI/코덱/길이/크기/해시/출처/라이선스/재생횟수/즐겨찾기.
- 곡 삭제/정리는 반드시 사용자 확인 또는 사전에 동의한 명시적 정책을 따른다.

## 8. 휴대폰 음악 플레이어

- 핵심: Media3 ExoPlayer + MediaSessionService + MediaController.
- 기능: 재생/일시정지/탐색/이전/다음/셔플/반복/대기열 영속화, 잠금화면·시스템 알림·Bluetooth 미디어 버튼, 오디오 포커스 대응.
- 고급 기능: EQ 프리셋 및 사용자 설정, 가능한 경우 10밴드 처리, Bass Boost, 음량 정규화, Gapless, 크로스페이드(0~12초), 재생 속도·피치, 실시간 스펙트럼/파형.
- EQ는 Android 기본 Equalizer의 밴드 수가 기기마다 다르므로 정확히 10밴드를 보장하려면 PCM DSP 경로가 필요하다. 미지원 시 기능을 숨기거나 대체한다.
- 크로스페이드와 하드웨어 오디오 오프로딩은 조합에 따라 제약이 있으므로 두 기능의 동시 활성 여부를 실제 기기에서 검사한다.
- 가사: 사용자가 가져온 LRC 또는 이용 허가된 가사 메타데이터. 시간 오프셋 조정·가사 터치 이동. 무단 가사 크롤링 제외.
- 시각화: 로컬 오디오 신호/허가된 재생 경로에서 분석 가능할 때만 동작. API·권한 제한 준수. 화면이 꺼지면 렌더링 중단.
- YouTube 공식 재생은 자체 ExoPlayer와 혼동하지 않고 별도 공식 플레이어/YouTube 앱 열기 경로를 마련한다.

## 9. Wear OS 동기화·독립 재생

### 두 실행 모드

- **원격 제어:** 워치로 휴대폰 MediaSession의 음악 제어.
- **독립 재생:** 워치 내부 저장된 음원 파일을 휴대폰 없이 Media3로 재생하며 Bluetooth 이어폰 출력.

### Wearable Data Layer

- 동일 패키지명 및 서명 일치. 연결된 본인 워치를 식별·승인.
- `MessageClient`: 재생 제어, 전송 시작/중단/취소 같은 짧은 명령.
- `DataClient`: 재생목록·즐겨찾기·상태 등 작은 동기화 자료.
- `ChannelClient`: 음악 파일 스트림 전송. 전송 완료 확인·중단 복구는 앱 프로토콜에서 구현.

### 전송 프로토콜

1. 휴대폰에서 소스 파일 식별, 변환 여부 결정, 크기·해시·전송 ID 계산.
2. 워치 저장 가능 바이트·동기화 상한·배터리·연결 상태 확인.
3. 시작 승인 후 기본 1MiB 블록 단위 전송, 체크포인트 기록.
4. 연결 중단 시 워치가 수신한 실제 바이트·체크포인트를 다시 조회하고 일치하는 위치부터 재개.
5. 전송 종료 시 워치가 전체 파일 SHA-256·디코딩 가능 여부 확인 후 라이브러리에 원자적 등록.
6. 완료 ACK 전까지 휴대폰에 전송 작업 보관. 중복 전송 요청은 동일 작업 ID로 합치기.

### 워치 음질 최적화

- 기본 `ADAPTIVE`; 원본이 작고 호환되면 그대로 전송.
- 옵션: AAC-LC 128kbps(절약), 192kbps(기본 균형), 256kbps(상대적 고음질), 원본 유지.
- 변환은 휴대폰에서 Media3 Transformer / 지원 MediaCodec으로 처리. 워치에서 대량 재인코딩하지 않음.
- MP3 128/192kbps 등 손실 음원을 무조건 AAC로 다시 압축하지 않음. 손실 파일 재인코딩은 품질 저하 가능.
- 파일별 실제 코덱·비트레이트·출력 형식·길이 재검증. AAC 파일은 적합한 컨테이너(예: `.m4a`) 사용.
- 변환 실패 시 원본 보존, 필요한 경우 워치 호환성 경고.

### 용량·배터리

- 워치 실제 사용 가능한 용량을 동적으로 검사. 초기 자동 음악 예산은 가용 용량의 40% 이내; 최소 512MiB 또는 전체 저장소 10% 중 큰 값을 여유 공간 목표로 한다(조정 가능 설계값).
- 워치 배터리 30% 미만 자동 대량 전송 보류, 15% 미만 진행 중 자동 전송 안전 중단(초기값).
- 충전 중 및 가능한 빠른 연결을 우선 이용하지만 전송 속도/통신 경로는 보장할 수 없음.
- 자동 공간 정리는 사용자 동의 없이는 파일 삭제 금지.
- 워치만 남았을 때도 다운로드 완료한 음악을 재생할 수 있어야 함.

## 10. Room 데이터 모델(초안)

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `youtube_playlists` | `id`, `owner_account`, `title`, `last_synced_at`, `sync_state` | API 데이터 갱신 정책 포함 |
| `youtube_playlist_items` | `playlist_item_id`, `playlist_id`, `video_id`, `position`, `status` | 목록 내 중복 영상 허용 |
| `music_tracks` | `track_id`, `title`, `artist`, `album`, `duration`, `source_type` | 로컬 공통 논리 트랙 |
| `download_sources` | `source_id`, `track_id`, `uri`, `rights_status`, `license_url`, `checked_at` | 출처 추적 |
| `track_matches` | `video_id`, `track_id`, `match_status`, `evidence` | 확실성 분리 |
| `download_jobs` | `job_id`, `source_id`, `state`, `bytes_done`, `total_bytes`, `attempts` | 재시도/복원 |
| `music_files` | `file_id`, `track_id`, `content_uri`, `sha256`, `codec`, `size` | MediaStore/SAF URI |
| `local_playlists` | `id`, `title`, `updated_at` | 사용자 목록 |
| `local_playlist_items` | `playlist_id`, `track_id`, `position` | 순서 보존 |
| `watch_devices` | `node_id`, `approved`, `last_seen`, `storage_policy` | 승인된 기기 |
| `watch_transfers` | `transfer_id`, `file_id`, `offset`, `hash`, `state` | 이어받기 |
| `audio_conversions` | `source_sha256`, `profile`, `output_uri`, `output_sha256` | 캐시 재사용 |
| `user_policies` | `wifi_only`, `battery_min`, `storage_limit`, `auto_download` | 동의 및 설정 |
| `audit_events` | `event_type`, `object_id`, `time`, `reason` | 민감정보 최소화 |

DB는 파일 원본이 아니라 **파일 URI와 메타데이터**를 저장한다. 관계형 키·인덱스·유일성 제약·마이그레이션 테스트를 구현한다. 시계 앱에는 필요한 테이블만 경량화해 둔다.

## 11. 보안·정책·장애 대응

- 입력 URL: `https` 기본, 리디렉션 재검사, 허용 크기·포맷·프로토콜 검사, 로컬/내부 네트워크 우회 차단.
- 서비스 정책: YouTube와 다운로드 카탈로그 각각의 API 및 라이선스 요구사항 준수. 다운로드 허가 정보가 불명확하면 자동 실행하지 않음.
- 권한: 최소 권한 요청. Google 인증 해제, 다운로드 출처 차단, 자동 다운로드 철회 제공.
- 데이터 최소화: 기기 외 저장 없이 로컬 기본, 외부 요청의 목적과 전송 대상 구분.
- 오류: HTTP 401/403/404/429/5xx·인터넷 단절·토큰 만료·저장소 권한 철회·파일 손상·워치 분리 등에서 복구/보류 상태 명확화.
- 복원력: 상태는 작업 시작/청크 완료/파일 검증/완료마다 영구 저장. 앱 또는 기기 재부팅 시 불완전 작업을 탐색하여 복원.
- Google YouTube API 데이터는 제공 정책에 맞춰 갱신 또는 삭제. 소유한 로컬 파일은 이 데이터의 자동 삭제와 분리.
- 로그에는 Google access token, 다운로드용 인증 헤더, 개인 계정 식별정보 등 비밀정보를 쓰지 않는다.
- 앱이 할 수 없거나 외부 서비스에서 금지한 작업을 할 수 있다고 표시하지 않는다.

## 12. 개발 구조(권장 디렉터리)

```text
TRAY-MUSIC/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/libs.versions.toml
├── app-mobile/
│   └── src/main/java/com/tray/music/
│       ├── ui/{home,search,playlist,downloads,player,settings,watch}/
│       ├── auth/
│       ├── youtube/
│       ├── sources/{jamendo,commons,archive,direct}/
│       ├── matching/
│       ├── downloads/
│       ├── library/
│       ├── playback/
│       ├── lyrics/
│       ├── audiofx/
│       └── watchlink/
├── app-wear/
│   └── src/main/java/com/tray/music/
│       ├── ui/
│       ├── library/
│       ├── playback/
│       ├── transfer/
│       └── storage/
├── core-model/
├── core-database/
├── core-network/
├── core-protocol/
├── docs/
│   ├── SETUP_GOOGLE_CLOUD.md
│   ├── PERMISSIONS.md
│   ├── TEST_PLAN.md
│   └── THIRD_PARTY_LICENSES.md
└── scripts/
    ├── build-mobile.ps1
    ├── build-wear.ps1
    └── verify-artifacts.ps1
```

- 패키지와 모듈은 Android Studio/Gradle이 실제로 유효한 구성으로 조정하되, 화면·네트워크·DB·오디오 서비스·워치 프로토콜을 분리한다.
- `local.properties`, 서명 키, OAuth 관련 개인 파일은 Git에 포함하지 않는다.

## 13. 실제 개발 단계와 우선순위

**P0 — 설치 가능한 기본 앱 만들기**

1. 빈 프로젝트가 아닌 실제 Android Gradle 프로젝트 구성, 빌드 검사 및 휴대폰 실행.
2. 로컬 음악 검색·Media3 재생·알림/잠금화면 컨트롤.
3. Music 폴더와 파일 권한 처리, 직접 허가된 URL 다운로드, Room 저장·복원.
4. Google Cloud 신규 생성/YouTube API/OAuth 설정, 공개/개인 재생목록 조회 및 기본 화면.

**P1 — 핵심 자동화 실사용 가능**

5. 재생목록 변경 감지, 페이지네이션, 중복/실패 복구.
6. Jamendo 같은 허가된 카탈로그 연결, 다운로드 허가 검사, 동일 음원 매칭 및 리뷰 상태.
7. 자동 다운로드 동의 UI, 다운로드 대기열/이어받기/오류 복구, 저장소 관리.
8. 휴대폰 음악 플레이어의 EQ·가사·시각화·크로스페이드(실제 지원조건 테스트).

**P2 — Wear OS 독립 동작**

9. 워치 APK 설치/연결, 원격 재생 제어, 자체 보관함·Media3 독립 재생.
10. 음악 파일 스트림 전송·해시 검사·체크포인트 재개.
11. 즐겨찾기/선택 재생목록 자동 동기화, 배터리/용량/동의 관리.
12. 조건부 AAC 변환, 기기 호환성 검증 및 전송 최적화.

**P3 — 통합 안정화/배포**

13. 인증 만료/동기화 손상/네트워크 중단/저장 공간 부족/프로세스 종료 테스트.
14. Android 16 실제 휴대폰과 Galaxy Watch5 Pro의 충전/절전/Bluetooth 조건에서 실기기 테스트.
15. 오류 수정, 동일 서명 키로 개인 배포 APK 2종 빌드 및 SHA-256 체크섬 기록.
16. 설치 가이드·Google Cloud 설정 가이드·권한 및 장애 대응 문서 작성.

모든 단계는 가능한 한 실행 가능한 APK를 유지하는 증분 방식으로 진행한다. 기능을 구현하지 않은 경우 더미 버튼을 '완료'로 표시하지 않는다.

## 14. 필수 완료 검증 기준

| 영역 | 완료 조건 |
|---|---|
| 빌드 | 휴대폰·워치 Gradle 빌드 성공, 서명된 개인용 APK 2종 산출 |
| 기본 재생 | 합법적으로 보유한 MP3/AAC/FLAC 파일 재생·탐색·백그라운드·잠금화면 정상 |
| 저장소 | 지정 폴더 저장, 앱 삭제 시 공유 Music 파일 유지, 재설치 후 재탐색 |
| YouTube | 공개/본인 인증 목록 조회, 50개 초과 페이지 수집, 목록 변경 반영 |
| 인증 | OAuth 허가·취소·만료·재승인 처리, 비밀값 로그 미노출 |
| 다운로드 | 100개 작업 대기열, 네트워크 중단·재개, 중복/부분파일/손상 대응 |
| 권리 검증 | 허가되지 않거나 곡 동일성 불확실한 파일을 자동 다운로드하지 않음 |
| EQ/가사/UI | 지원 가능한 기능 작동, 미지원 기능은 명확한 비활성 상태 안내 |
| 워치 전송 | 대용량 파일 중간 분리 후 재개, 양쪽 파일 해시 일치 |
| 워치 독립 재생 | 휴대폰 통신이 없는 상태에서 워치에 저장된 음악 정상 재생 |
| 배터리/용량 | 동기화 보류 정책 준수, 공간 부족에서 원본 파일 보호 |
| 장애 처리 | 강제 종료·재부팅·저장 권한 철회 후 상태/오류 표시 및 복구 |

각 항목에 테스트 기기, OS 버전, 실행 절차, 결과 로그, 통과/실패 및 이슈 번호를 기록한다. '모든 기능 100% 정상'이라는 표현은 이 표의 실측을 완료한 경우에만 사용한다.

## 15. 외부 준비물 및 필수 사용자 작업

- Android Studio, Android SDK, JDK, 인터넷 연결된 Windows 11 PC.
- Galaxy S23 Ultra에서 개발자 옵션/USB 디버깅 허용(실기기 테스트용).
- Galaxy Watch5 Pro에서 개발자 모드/무선 디버깅 등 워치 디버깅 활성화(실기기 테스트용).
- Google Cloud 신규 프로젝트, YouTube Data API v3, Android OAuth 클라이언트, 테스트 계정.
- Android/Wear APK에 공통으로 사용할 개인 서명 키(안전하게 백업).
- Jamendo 등 실제 사용 출처의 개발자 계정/사용 조건 확인(필요한 경우).
- 다운로드가 허용된 테스트용 MP3/AAC/FLAC 몇 개와 실제 공개 YouTube 재생목록 URL.

## 16. 납품물

1. 휴대폰용 `TRAY_MUSIC_MOBILE.apk`.
2. 시계용 `TRAY_MUSIC_WEAR.apk`.
3. 전체 Android Studio 소스코드 프로젝트와 빌드 설정.
4. `SETUP_GOOGLE_CLOUD.md`, 개인용 APK 설치 안내, 권한 안내.
5. 테스트 결과표·알려진 제약·오류 재현 방법.
6. 빌드 버전, APK 서명 지문, SHA-256 체크섬, 제3자 라이선스 목록.

실제 배포 전에는 릴리스 서명 키 백업이 필수이며, 임의의 테스트용 서명 키를 릴리스 서명 키로 바꾸면 기존 앱 업데이트 설치가 실패할 수 있다.

---

## 17. 공식 기술 참고 문서

- YouTube Data API `playlistItems.list`: https://developers.google.com/youtube/v3/docs/playlistItems/list
- YouTube Data API 인증: https://developers.google.com/youtube/data/guides/authentication
- YouTube API 정책: https://developers.google.com/youtube/terms/developer-policies
- Google Android 권한 승인: https://developer.android.com/identity/authorization
- Media3 백그라운드 재생: https://developer.android.com/media/media3/session/background-playback
- Android MediaStore: https://developer.android.com/training/data-storage/shared/media
- Android WorkManager 주기적 작업: https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work
- 사용자 시작 전송(UIDT): https://developer.android.com/develop/background-work/background-tasks/uidt
- Wear OS Data Layer: https://developer.android.com/training/wearables/data/overview
- Wear OS 클라이언트 유형: https://developer.android.com/training/wearables/data/client-types
- Jamendo Tracks API: https://developer.jamendo.com/v3.0/tracks

### 개발자에게 전달할 최종 실행 지시

**이 문서가 최종 확정 요구사항이다. 새로운 Q 번호 또는 추가 기능 기획을 요구하지 말고 P0부터 실제 개발한다. 빌드 가능성을 먼저 확인하고, 매 단계마다 실행 APK/소스/테스트 결과를 남긴다. 저작권·API 정책을 위반하는 YouTube MP3 추출을 구현하지 않으며, 다운로드가 허가된 외부 음원과 로컬 음악을 중심으로 모든 자동화 기능을 완성한다.**

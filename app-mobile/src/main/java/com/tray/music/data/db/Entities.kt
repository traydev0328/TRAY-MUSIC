package com.tray.music.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** YouTube 재생목록 메타데이터 (API 데이터 — 파일 아님) */
@Entity(tableName = "youtube_playlists")
data class YoutubePlaylistEntity(
    @PrimaryKey val id: String,
    /** "mine" = OAuth로 가져온 본인 목록, "public" = URL로 등록한 공개/미등록 목록 */
    val ownerAccount: String,
    val title: String,
    val channelTitle: String,
    val itemCount: Int,
    val thumbnailUrl: String?,
    val lastSyncedAt: Long,
    val syncState: String,          // IDLE / SYNCING / OK / FAILED
    val syncError: String?,
)

/** 재생목록 항목. 같은 영상이 여러 번 있어도 playlistItemId 로 각각 보존 */
@Entity(
    tableName = "youtube_playlist_items",
    indices = [Index("playlistId"), Index("videoId")],
)
data class YoutubePlaylistItemEntity(
    @PrimaryKey val playlistItemId: String,
    val playlistId: String,
    val videoId: String,
    val title: String,
    val channelTitle: String,
    val position: Int,
    /** AVAILABLE / UNAVAILABLE (삭제·비공개 전환 영상) */
    val status: String,
    val thumbnailUrl: String?,
    /** videos.list contentDetails 로 받은 영상 길이(초). 0 = 모름 */
    val durationSec: Int = 0,
)

/** 영구 다운로드 작업 — 앱/기기 재시작 후에도 복원 */
@Entity(tableName = "download_jobs", indices = [Index("state")])
data class DownloadJobEntity(
    @PrimaryKey val jobId: String,
    val url: String,
    val displayName: String,
    val state: String,              // DownloadState.name
    val bytesDone: Long,
    val totalBytes: Long,           // -1 = 알 수 없음
    val etag: String?,
    val lastModified: String?,
    val attempts: Int,
    val errorMessage: String?,
    val contentUri: String?,
    val sha256: String?,
    val rightsNote: String,         // 사용자가 확인한 이용 권한 근거
    val createdAt: Long,
    val updatedAt: Long,
    /** true = 자동 매칭으로 생성된 작업 (배터리/동의 정책 적용) */
    val isAuto: Boolean = false,
    /** 자동 작업의 원본 YouTube 영상 ID */
    val videoId: String? = null,
)

/** 앱이 저장·검증한 음악 파일 (원본은 MediaStore, DB에는 URI와 메타데이터만) */
@Entity(
    tableName = "music_files",
    indices = [Index(value = ["sha256"], unique = true), Index(value = ["contentUri"], unique = true)],
)
data class MusicFileEntity(
    @PrimaryKey(autoGenerate = true) val fileId: Long = 0,
    val contentUri: String,
    val sha256: String,
    val displayName: String,
    val mimeType: String?,
    val size: Long,
    val source: String,             // 출처 URL 또는 "local"
    val rightsNote: String,
    val createdAt: Long,
)

enum class DownloadState {
    QUEUED, WAITING_NETWORK, WAITING_BATTERY, DOWNLOADING, VERIFYING, COMMITTING, COMPLETED,
    PAUSED, FAILED_RETRYABLE, FAILED_PERMANENT, CANCELLED, DUPLICATE;

    val isActive get() = this == QUEUED || this == WAITING_NETWORK || this == WAITING_BATTERY || this == DOWNLOADING ||
        this == VERIFYING || this == COMMITTING || this == FAILED_RETRYABLE
}

/** YouTube 영상 ↔ 허가 카탈로그 음원 매칭 결과 */
@Entity(tableName = "track_matches")
data class TrackMatchEntity(
    @PrimaryKey val videoId: String,
    /** VERIFIED / NEEDS_REVIEW / DIFFERENT_VERSION / UNAVAILABLE / RIGHTS_BLOCKED */
    val status: String,
    val source: String,             // "jamendo"
    val sourceTrackId: String?,
    val title: String?,
    val artist: String?,
    val durationSec: Int,
    val downloadUrl: String?,
    val licenseUrl: String?,
    val evidence: String,
    val checkedAt: Long,
)

/** 즐겨찾기 (MediaStore 오디오 ID 기준) */
@Entity(tableName = "favorites")
data class FavoriteEntity(
    @PrimaryKey val mediaId: Long,
    val title: String,
    val addedAt: Long,
)

/** 휴대폰 → 워치 전송 작업 (체크포인트 = 워치가 보고한 수신 바이트) */
@Entity(tableName = "watch_transfers", indices = [Index("state"), Index("nodeId")])
data class WatchTransferEntity(
    @PrimaryKey val transferId: String,
    val nodeId: String,
    val mediaId: Long,
    val sourceUri: String,
    val title: String,
    val artist: String,
    /** 실제 전송 파일 (원본 URI 또는 변환된 캐시 파일 경로) */
    val payloadPath: String?,
    val payloadMime: String?,
    val size: Long,
    val sha256: String?,
    val profile: String,
    val state: String,              // PENDING/PREPARING/WAITING_WATCH/SENDING/VERIFYING/COMPLETED/FAILED/CANCELLED
    val bytesAcked: Long,
    val attempts: Int,
    val error: String?,
    val createdAt: Long,
    val updatedAt: Long,
)

/** 변환 결과 캐시 재사용 */
@Entity(tableName = "audio_conversions", primaryKeys = ["sourceKey", "profile"])
data class AudioConversionEntity(
    val sourceKey: String,          // MediaStore ID + 크기 + 수정시각
    val profile: String,
    val outputPath: String,
    val outputSha256: String,
    val outputSize: Long,
    val createdAt: Long,
)

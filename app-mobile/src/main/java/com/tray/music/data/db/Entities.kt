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
    QUEUED, WAITING_NETWORK, DOWNLOADING, VERIFYING, COMMITTING, COMPLETED,
    PAUSED, FAILED_RETRYABLE, FAILED_PERMANENT, CANCELLED, DUPLICATE;

    val isActive get() = this == QUEUED || this == WAITING_NETWORK || this == DOWNLOADING ||
        this == VERIFYING || this == COMMITTING || this == FAILED_RETRYABLE
}

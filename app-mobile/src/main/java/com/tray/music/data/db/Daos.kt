package com.tray.music.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class YoutubeDao {
    @Query("SELECT * FROM youtube_playlists ORDER BY ownerAccount, title")
    abstract fun observePlaylists(): Flow<List<YoutubePlaylistEntity>>

    @Query("SELECT * FROM youtube_playlists WHERE id = :id")
    abstract fun observePlaylist(id: String): Flow<YoutubePlaylistEntity?>

    @Query("SELECT * FROM youtube_playlists WHERE id = :id")
    abstract suspend fun getPlaylist(id: String): YoutubePlaylistEntity?

    @Query("SELECT * FROM youtube_playlist_items WHERE playlistId = :playlistId ORDER BY position")
    abstract fun observeItems(playlistId: String): Flow<List<YoutubePlaylistItemEntity>>

    @Upsert
    abstract suspend fun upsertPlaylist(p: YoutubePlaylistEntity)

    @Query("UPDATE youtube_playlists SET syncState = :state, syncError = :error WHERE id = :id")
    abstract suspend fun setSyncState(id: String, state: String, error: String?)

    @Query("DELETE FROM youtube_playlist_items WHERE playlistId = :playlistId")
    abstract suspend fun deleteItems(playlistId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertItems(items: List<YoutubePlaylistItemEntity>)

    @Query("DELETE FROM youtube_playlists WHERE id = :id")
    abstract suspend fun deletePlaylistRow(id: String)

    /**
     * 전체 스냅샷을 다 받은 뒤에만 호출 → 중간 실패 시 이전 목록이 그대로 남는다(원자적 반영).
     */
    @Transaction
    open suspend fun replaceSnapshot(playlist: YoutubePlaylistEntity, items: List<YoutubePlaylistItemEntity>) {
        upsertPlaylist(playlist)
        deleteItems(playlist.id)
        insertItems(items)
    }

    @Transaction
    open suspend fun deletePlaylist(id: String) {
        deleteItems(id)
        deletePlaylistRow(id)
    }

    /** Google 연결 해제 시 OAuth로 가져온 API 데이터 삭제 (로컬 음악 파일과는 무관) */
    @Query("DELETE FROM youtube_playlist_items WHERE playlistId IN (SELECT id FROM youtube_playlists WHERE ownerAccount = 'mine')")
    abstract suspend fun deleteMineItems()

    @Query("DELETE FROM youtube_playlists WHERE ownerAccount = 'mine'")
    abstract suspend fun deleteMinePlaylists()
}

@Dao
interface DownloadDao {
    @Query("SELECT * FROM download_jobs ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<DownloadJobEntity>>

    @Query("SELECT * FROM download_jobs WHERE jobId = :id")
    suspend fun get(id: String): DownloadJobEntity?

    @Query("SELECT * FROM download_jobs WHERE state IN (:states)")
    suspend fun getByStates(states: List<String>): List<DownloadJobEntity>

    @Insert
    suspend fun insert(job: DownloadJobEntity)

    @Upsert
    suspend fun upsert(job: DownloadJobEntity)

    @Query("UPDATE download_jobs SET bytesDone = :done, totalBytes = :total, updatedAt = :now WHERE jobId = :id")
    suspend fun updateProgress(id: String, done: Long, total: Long, now: Long = System.currentTimeMillis())

    @Query("UPDATE download_jobs SET state = :state, errorMessage = :error, updatedAt = :now WHERE jobId = :id")
    suspend fun setState(id: String, state: String, error: String? = null, now: Long = System.currentTimeMillis())

    @Query("DELETE FROM download_jobs WHERE jobId = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM download_jobs WHERE url = :url AND state NOT IN ('CANCELLED','FAILED_PERMANENT')")
    suspend fun countLiveByUrl(url: String): Int
}

@Dao
interface MusicFileDao {
    @Query("SELECT * FROM music_files WHERE sha256 = :sha LIMIT 1")
    suspend fun findBySha(sha: String): MusicFileEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(f: MusicFileEntity): Long

    @Query("SELECT * FROM music_files ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<MusicFileEntity>>

    @Query("DELETE FROM music_files WHERE contentUri = :uri")
    suspend fun deleteByUri(uri: String)
}

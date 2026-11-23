package com.tray.music.youtube

import com.tray.music.auth.AuthOutcome
import com.tray.music.auth.GoogleAuth
import com.tray.music.data.SettingsStore
import com.tray.music.data.db.YoutubeDao
import com.tray.music.data.db.YoutubePlaylistEntity

sealed interface SyncResult {
    data class Ok(val count: Int) : SyncResult
    data class NeedsConsent(val outcome: AuthOutcome.NeedsConsent) : SyncResult
    data class Failed(val message: String) : SyncResult
}

class YouTubeRepository(
    private val api: YouTubeApi,
    private val dao: YoutubeDao,
    private val auth: GoogleAuth,
    private val settings: SettingsStore,
) {
    val playlists = dao.observePlaylists()
    fun playlist(id: String) = dao.observePlaylist(id)
    fun items(id: String) = dao.observeItems(id)

    private suspend fun tokenOrNull(): String? {
        if (!settings.current().googleConnected) return null
        return (auth.authorize() as? AuthOutcome.Token)?.accessToken
    }

    /** Google 계정 연결 + 본인 재생목록 목록 가져오기 */
    suspend fun connectAndFetchMine(): SyncResult {
        return when (val o = auth.authorize()) {
            is AuthOutcome.NeedsConsent -> SyncResult.NeedsConsent(o)
            is AuthOutcome.Failed -> SyncResult.Failed(o.message)
            is AuthOutcome.Token -> {
                settings.setGoogleConnected(true)
                fetchMine(o.accessToken)
            }
        }
    }

    suspend fun fetchMine(token: String): SyncResult = try {
        val lists = api.myPlaylists(token)
        for (p in lists) {
            val existing = dao.getPlaylist(p.id)
            dao.upsertPlaylist(
                p.copy(
                    lastSyncedAt = existing?.lastSyncedAt ?: 0,
                    syncState = existing?.syncState ?: "IDLE",
                    syncError = existing?.syncError,
                )
            )
        }
        SyncResult.Ok(lists.size)
    } catch (e: Exception) {
        SyncResult.Failed(e.message ?: "알 수 없는 오류")
    }

    /** URL/ID로 공개(또는 본인 접근 가능) 재생목록 등록 후 즉시 동기화 */
    suspend fun addByUrl(input: String): SyncResult {
        val id = YouTubeApi.parsePlaylistId(input)
            ?: return SyncResult.Failed("재생목록 URL에서 list= 값을 찾지 못했습니다.")
        return try {
            val token = tokenOrNull()
            val p = api.playlist(id, token, owner = if (token != null) "mine" else "public")
            val existing = dao.getPlaylist(id)
            dao.upsertPlaylist(p.copy(ownerAccount = existing?.ownerAccount ?: "public"))
            sync(id)
        } catch (e: Exception) {
            SyncResult.Failed(e.message ?: "알 수 없는 오류")
        }
    }

    /**
     * 전체 페이지를 모두 받은 뒤 한 번에 교체. 실패하면 기존 목록 유지 + 실패 사유 기록.
     */
    suspend fun sync(playlistId: String): SyncResult {
        val current: YoutubePlaylistEntity = dao.getPlaylist(playlistId)
            ?: return SyncResult.Failed("등록되지 않은 재생목록입니다.")
        dao.setSyncState(playlistId, "SYNCING", null)
        return try {
            val token = tokenOrNull()
            val meta = runCatching { api.playlist(playlistId, token, current.ownerAccount) }.getOrNull()
            val items = api.allItems(playlistId, token)
            val updated = (meta ?: current).copy(
                ownerAccount = current.ownerAccount,
                itemCount = items.size,
                lastSyncedAt = System.currentTimeMillis(),
                syncState = "OK",
                syncError = null,
            )
            dao.replaceSnapshot(updated, items)
            SyncResult.Ok(items.size)
        } catch (e: Exception) {
            val msg = e.message ?: "알 수 없는 오류"
            dao.setSyncState(playlistId, "FAILED", msg)
            SyncResult.Failed(msg)
        }
    }

    suspend fun remove(playlistId: String) = dao.deletePlaylist(playlistId)

    /**
     * 앱 내 연결 해제: 'mine' 데이터 삭제 + 연결 플래그 해제.
     * Google 쪽 권한 자체의 완전 철회는 myaccount.google.com/permissions 에서 사용자가 수행 (설정 화면에서 바로가기 제공).
     */
    suspend fun disconnect() {
        dao.deleteMineItems()
        dao.deleteMinePlaylists()
        settings.setGoogleConnected(false)
    }
}

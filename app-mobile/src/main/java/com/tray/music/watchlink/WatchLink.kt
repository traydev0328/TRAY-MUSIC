package com.tray.music.watchlink

import android.content.ContentUris
import android.content.Context
import android.provider.MediaStore
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import com.tray.music.data.SettingsStore
import com.tray.music.data.db.FavoriteDao
import com.tray.music.data.db.WatchDao
import com.tray.music.data.db.WatchTransferEntity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

data class WatchStatus(
    val nodeId: String,
    val freeBytes: Long,
    val totalBytes: Long,
    val trayUsedBytes: Long,
    val battery: Int,
    val charging: Boolean,
    val trackCount: Int,
    val receivedAt: Long = System.currentTimeMillis(),
)

data class WatchNode(val id: String, val name: String, val nearby: Boolean, val approved: Boolean)

class WatchLink(
    private val context: Context,
    private val dao: WatchDao,
    private val favorites: FavoriteDao,
    private val settings: SettingsStore,
) {
    private val prefs = context.getSharedPreferences("watch_nodes", Context.MODE_PRIVATE)
    private val waiters = ConcurrentHashMap<String, CompletableDeferred<JSONObject>>()
    private val _status = MutableStateFlow<Map<String, WatchStatus>>(emptyMap())
    val status: StateFlow<Map<String, WatchStatus>> = _status.asStateFlow()
    val transfers = dao.observeAll()

    // ---------------- 기기 ----------------

    /** TRAY MUSIC 워치 앱이 설치되어 연결된 기기만 반환 */
    suspend fun nodes(): List<WatchNode> {
        val cap = Wearable.getCapabilityClient(context)
            .getCapability(WearProtocol.CAPABILITY_WATCH, CapabilityClient.FILTER_REACHABLE).await()
        return cap.nodes.map { n: Node -> WatchNode(n.id, n.displayName, n.isNearby, isApproved(n.id)) }
    }

    fun isApproved(nodeId: String) = prefs.getBoolean("approved_$nodeId", false)
    fun setApproved(nodeId: String, v: Boolean) = prefs.edit().putBoolean("approved_$nodeId", v).apply()

    // ---------------- 메시지 ----------------

    suspend fun send(nodeId: String, path: String, json: JSONObject) {
        Wearable.getMessageClient(context).sendMessage(nodeId, path, json.toString().toByteArray()).await()
    }

    /** 응답 대기 키: "<path>:<id>" */
    suspend fun request(nodeId: String, path: String, json: JSONObject, replyKey: String, timeoutMs: Long): JSONObject? {
        val d = CompletableDeferred<JSONObject>()
        waiters[replyKey] = d
        return try {
            send(nodeId, path, json)
            withTimeoutOrNull(timeoutMs) { d.await() }
        } finally { waiters.remove(replyKey) }
    }

    fun expect(key: String): CompletableDeferred<JSONObject> = CompletableDeferred<JSONObject>().also { waiters[key] = it }
    fun forget(key: String) { waiters.remove(key) }

    /** TrayWearListenerService 에서 호출 */
    fun onReply(path: String, nodeId: String, json: JSONObject) {
        when (path) {
            WearProtocol.STATUS -> {
                val s = WatchStatus(
                    nodeId = nodeId,
                    freeBytes = json.optLong("free"),
                    totalBytes = json.optLong("total"),
                    trayUsedBytes = json.optLong("used"),
                    battery = json.optInt("battery", -1),
                    charging = json.optBoolean("charging"),
                    trackCount = json.optInt("count"),
                )
                _status.value = _status.value + (nodeId to s)
                waiters["${WearProtocol.STATUS}:$nodeId"]?.complete(json)
            }
            WearProtocol.RESUME, WearProtocol.DONE -> waiters["$path:${json.optString("id")}"]?.complete(json)
        }
    }

    suspend fun refreshStatus(nodeId: String): WatchStatus? {
        request(nodeId, WearProtocol.STATUS_REQ, JSONObject(), "${WearProtocol.STATUS}:$nodeId", 8_000)
        return _status.value[nodeId]
    }

    suspend fun sendNowPlaying(title: String, artist: String, playing: Boolean) {
        val nodes = runCatching { nodes() }.getOrDefault(emptyList()).filter { it.approved }
        val j = JSONObject().put("title", title).put("artist", artist).put("playing", playing)
        nodes.forEach { runCatching { send(it.id, WearProtocol.NOW_PLAYING, j) } }
    }

    // ---------------- 전송 ----------------

    /** 곡 한 개를 워치 전송 대기열에 추가. 이미 진행/완료된 같은 곡·프로필이면 합친다. */
    suspend fun enqueue(nodeId: String, mediaId: Long, title: String, artist: String): String {
        val profile = settings.current().watchQuality.name
        dao.findLive(nodeId, mediaId, profile)?.let { existing ->
            if (existing.state != "COMPLETED") schedule(existing.transferId)
            return existing.transferId
        }
        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL), mediaId)
        val now = System.currentTimeMillis()
        val t = WatchTransferEntity(
            transferId = UUID.randomUUID().toString(), nodeId = nodeId, mediaId = mediaId,
            sourceUri = uri.toString(), title = title, artist = artist,
            payloadPath = null, payloadMime = null, size = 0, sha256 = null, profile = profile,
            state = "PENDING", bytesAcked = 0, attempts = 0, error = null, createdAt = now, updatedAt = now,
        )
        dao.upsert(t)
        schedule(t.transferId)
        return t.transferId
    }

    fun schedule(transferId: String) {
        val req = OneTimeWorkRequestBuilder<WatchTransferWorker>()
            .setInputData(workDataOf(WatchTransferWorker.KEY_ID to transferId))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag("watch-transfer")
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("watch-$transferId", ExistingWorkPolicy.KEEP, req)
    }

    suspend fun cancel(transferId: String) {
        WorkManager.getInstance(context).cancelUniqueWork("watch-$transferId")
        dao.setState(transferId, "CANCELLED", "사용자 취소")
    }

    suspend fun retry(transferId: String) {
        val t = dao.get(transferId) ?: return
        dao.upsert(t.copy(state = "PENDING", attempts = 0, error = null, updatedAt = System.currentTimeMillis()))
        schedule(transferId)
    }

    suspend fun remove(transferId: String) {
        WorkManager.getInstance(context).cancelUniqueWork("watch-$transferId")
        dao.delete(transferId)
    }

    /** 승인된 워치로 즐겨찾기 곡 자동 전송 (Q08) */
    suspend fun syncFavorites(): Int {
        val favs = favorites.all()
        if (favs.isEmpty()) return 0
        val targets = nodes().filter { it.approved }
        var n = 0
        for (node in targets) for (f in favs) {
            val title = f.title
            enqueue(node.id, f.mediaId, title, "")
            n++
        }
        return n
    }

    /** 앱 시작 시 미완료 전송 재예약 */
    suspend fun recover() { dao.unfinished().forEach { schedule(it.transferId) } }
}

package com.tray.music.wear.link

import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import com.tray.music.wear.WearApp
import com.tray.music.wear.data.Offer
import com.tray.music.wear.data.WatchTrack
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * 휴대폰 → 워치 수신부
 * - OFFER: 이미 있으면 ALREADY_HAVE, 공간 부족이면 NO_SPACE, 아니면 part 파일 길이(이어받기 위치) 응답
 * - 채널 열림: part 파일에 append 수신 (ChannelClient.receiveFile)
 * - 입력 종료: 크기 → SHA-256 → 디코딩 가능 여부 검증 후 라이브러리에 원자적 등록, DONE 응답
 */
class WearListener : WearableListenerService() {

    private val app get() = WearApp.from(this)
    private val dao get() = app.db.dao()

    override fun onMessageReceived(event: MessageEvent) {
        val json = runCatching { JSONObject(String(event.data)) }.getOrDefault(JSONObject())
        when (event.path) {
            WearProtocol.OFFER -> app.scope.launch { onOffer(event.sourceNodeId, json) }
            WearProtocol.STATUS_REQ -> app.scope.launch { sendStatus(event.sourceNodeId) }
            WearProtocol.NOW_PLAYING -> app.nowPlaying.value = com.tray.music.wear.PhoneNowPlaying(
                json.optString("title"), json.optString("artist"), json.optBoolean("playing"), System.currentTimeMillis())
        }
    }

    private suspend fun reply(node: String, path: String, json: JSONObject) {
        runCatching { Wearable.getMessageClient(this).sendMessage(node, path, json.toString().toByteArray()).await() }
    }

    private suspend fun sendStatus(node: String) {
        val s = app.storageInfo()
        reply(node, WearProtocol.STATUS, JSONObject()
            .put("free", s.free).put("total", s.total).put("used", s.used)
            .put("battery", s.battery).put("charging", s.charging).put("count", dao.count()))
    }

    private fun part(id: String) = File(app.partDir, "$id.part")

    private suspend fun onOffer(node: String, j: JSONObject) {
        val id = j.optString("id")
        val sha = j.optString("sha")
        val size = j.optLong("size")
        if (id.isEmpty() || sha.length != 64 || size <= 0) {
            reply(node, WearProtocol.RESUME, JSONObject().put("id", id).put("error", "BAD_OFFER")); return
        }
        if (dao.track(sha) != null) {
            part(id).delete()
            reply(node, WearProtocol.RESUME, JSONObject().put("id", id).put("error", "ALREADY_HAVE")); return
        }
        val p = part(id)
        var offset = if (p.exists()) p.length() else 0L
        if (offset > size) { p.delete(); offset = 0 }
        val s = app.storageInfo()
        val reserve = maxOf(256L shl 20, s.total / 20)   // 워치 자체 보호용 최소 여유
        if (s.free - (size - offset) < reserve) {
            reply(node, WearProtocol.RESUME, JSONObject().put("id", id).put("error", "NO_SPACE")); return
        }
        dao.putOffer(Offer(id, node, j.optString("name"), j.optString("mime"), size, sha,
            j.optString("title").ifBlank { j.optString("name") }, j.optString("artist"), System.currentTimeMillis()))
        reply(node, WearProtocol.RESUME, JSONObject().put("id", id).put("offset", offset))
    }

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (!channel.path.startsWith(WearProtocol.DATA_PREFIX)) return
        val id = channel.path.removePrefix(WearProtocol.DATA_PREFIX)
        app.receiving.value = app.receiving.value + (id to System.currentTimeMillis())
        // append=true → 이전에 받은 바이트 뒤에 이어서 기록 (휴대폰은 OFFER 응답의 offset 부터 전송)
        Wearable.getChannelClient(this).receiveFile(channel, Uri.fromFile(part(id)), true)
    }

    override fun onInputClosed(channel: ChannelClient.Channel, closeReason: Int, appSpecificErrorCode: Int) {
        if (!channel.path.startsWith(WearProtocol.DATA_PREFIX)) return
        val id = channel.path.removePrefix(WearProtocol.DATA_PREFIX)
        app.scope.launch {
            try { finish(id) } finally { app.receiving.value = app.receiving.value - id }
        }
    }

    private suspend fun finish(id: String) {
        val o = dao.offer(id) ?: return
        val p = part(id)
        val len = p.length()
        fun done(ok: Boolean, err: String? = null) = JSONObject().put("id", id).put("ok", ok).put("offset", p.length())
            .apply { if (err != null) put("error", err) }
        when {
            len < o.size -> { reply(o.nodeId, WearProtocol.DONE, done(false, "INCOMPLETE")); return }   // 다음 OFFER 에서 이어받기
            len > o.size -> { p.delete(); reply(o.nodeId, WearProtocol.DONE, done(false, "SIZE_MISMATCH")); return }
        }
        val actual = sha256(p)
        if (actual != o.sha256) { p.delete(); reply(o.nodeId, WearProtocol.DONE, done(false, "HASH_MISMATCH")); return }
        if (!decodable(p)) { p.delete(); reply(o.nodeId, WearProtocol.DONE, done(false, "NOT_DECODABLE")); return }
        val ext = o.name.substringAfterLast('.', "audio")
        val dest = File(app.musicDir, "${o.sha256}.$ext")
        if (!p.renameTo(dest)) { reply(o.nodeId, WearProtocol.DONE, done(false, "MOVE_FAILED")); return }
        dao.putTrack(WatchTrack(o.sha256, o.title, o.artist, dest.absolutePath, o.mime, o.size, System.currentTimeMillis()))
        dao.deleteOffer(id)
        reply(o.nodeId, WearProtocol.DONE, JSONObject().put("id", id).put("ok", true))
    }

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { s -> val b = ByteArray(256 * 1024); while (true) { val n = s.read(b); if (n < 0) break; md.update(b, 0, n) } }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun decodable(f: File): Boolean {
        val ex = MediaExtractor()
        return try {
            ex.setDataSource(f.absolutePath)
            (0 until ex.trackCount).any { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        } catch (_: Exception) { false } finally { ex.release() }
    }
}

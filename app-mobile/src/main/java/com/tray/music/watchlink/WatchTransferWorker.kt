package com.tray.music.watchlink

import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.google.android.gms.wearable.Wearable
import com.tray.music.TrayApp
import com.tray.music.data.WatchQuality
import com.tray.music.data.db.AudioConversionEntity
import com.tray.music.data.db.WatchTransferEntity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest

private class Hold(msg: String) : Exception(msg)
private class Fatal(msg: String) : Exception(msg)

/**
 * 휴대폰 → 워치 파일 전송 (Q07/Q08/Q09)
 * PREPARING(변환·해시) → WAITING_WATCH(용량·배터리 확인) → SENDING(1MiB 블록, 워치 보고 오프셋부터 재개) → VERIFYING(워치 SHA-256) → COMPLETED
 */
class WatchTransferWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    private val c get() = (applicationContext as TrayApp).container
    private val dao get() = c.db.watchDao()

    override suspend fun getForegroundInfo(): ForegroundInfo = fg("워치 전송 준비", 0, 0)

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.failure()
        var t = dao.get(id) ?: return Result.failure()
        if (t.state in setOf("COMPLETED", "CANCELLED")) return Result.success()

        return mutex.withLock {   // 블루투스 대역폭 공유 → 한 번에 하나씩
            try {
                runCatching { setForeground(fg(t.title, 0, 0)) }
                if (t.payloadPath == null || t.sha256 == null || !payloadExists(t)) {
                    dao.setState(id, "PREPARING", null)
                    t = prepare(t)
                }

                dao.setState(id, "WAITING_WATCH", null)
                val st = c.watch.refreshStatus(t.nodeId) ?: throw Hold("워치에 연결할 수 없습니다(꺼짐/블루투스 끊김).")
                if (st.battery in 0 until 30 && !st.charging) throw Hold("워치 배터리 ${st.battery}% — 30% 이상 또는 충전 중에 재개")
                checkBudget(t, st)

                val offer = JSONObject().put("id", t.transferId).put("name", fileName(t)).put("mime", t.payloadMime)
                    .put("size", t.size).put("sha", t.sha256).put("title", t.title).put("artist", t.artist)
                val resume = c.watch.request(t.nodeId, WearProtocol.OFFER, offer, "${WearProtocol.RESUME}:${t.transferId}", 20_000)
                    ?: throw Hold("워치 응답 없음")
                resume.optString("error").takeIf { it.isNotEmpty() }?.let {
                    if (it == "ALREADY_HAVE") {
                        dao.setProgress(id, t.size); dao.setState(id, "COMPLETED", "워치에 이미 같은 파일이 있습니다.")
                        return@withLock Result.success()
                    }
                    throw Fatal("워치 거부: $it")
                }
                val offset = resume.optLong("offset").coerceIn(0, t.size)

                dao.setState(id, "SENDING", null)
                val doneKey = "${WearProtocol.DONE}:${t.transferId}"
                val doneWaiter = c.watch.expect(doneKey)   // 전송 전에 등록 → 빠른 응답 유실 방지
                val result = try {
                    sendFrom(t, offset)
                    dao.setState(id, "VERIFYING", null)
                    // 워치가 SHA-256·디코딩 검증 후 응답. 대용량 파일 고려해 2분 대기
                    withTimeoutOrNull(120_000) { doneWaiter.await() } ?: throw Hold("워치 검증 응답 시간 초과")
                } finally { c.watch.forget(doneKey) }
                if (result.optBoolean("ok")) {
                    dao.setProgress(id, t.size)
                    dao.setState(id, "COMPLETED", null)
                    Result.success()
                } else {
                    throw Hold("워치 검증 실패: ${result.optString("error")}")
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Fatal) {
                dao.setState(id, "FAILED", e.message); Result.failure()
            } catch (e: Exception) {
                val cur = dao.get(id) ?: return@withLock Result.failure()
                val attempts = cur.attempts + 1
                dao.upsert(cur.copy(attempts = attempts, updatedAt = System.currentTimeMillis()))
                val msg = e.message ?: e.javaClass.simpleName
                if (attempts >= 10) { dao.setState(id, "FAILED", "$msg (재시도 초과)"); Result.failure() }
                else { dao.setState(id, "WAITING_WATCH", msg); Result.retry() }
            }
        }
    }

    // ---------- 준비: 변환 여부 결정 + 해시 ----------

    private suspend fun prepare(t0: WatchTransferEntity): WatchTransferEntity = withContext(Dispatchers.IO) {
        val src = Uri.parse(t0.sourceUri)
        val info = runCatching { AudioTranscoder.probe(applicationContext, src) }
            .getOrElse { throw Fatal("원본 파일을 읽을 수 없습니다: ${it.message}") }
        val q = WatchQuality.valueOf(t0.profile)
        val srcSize = querySize(src)
        val wantConvert = when (q) {
            WatchQuality.ORIGINAL -> false
            // 손실 음원(MP3/AAC/OGG 등)은 재압축하지 않음. 무손실만 AAC 로.
            WatchQuality.ADAPTIVE -> AudioTranscoder.isLossless(info.mime)
            else -> AudioTranscoder.isLossless(info.mime)
        }
        var path = t0.sourceUri
        var mime = mimeOf(info.mime)
        var size = srcSize
        var sha: String
        if (wantConvert) {
            val key = "${t0.mediaId}:$srcSize"
            val cached = dao.conversion(key, q.name)?.takeIf { File(it.outputPath).length() == it.outputSize }
            if (cached != null) {
                path = Uri.fromFile(File(cached.outputPath)).toString(); mime = "audio/mp4"; size = cached.outputSize; sha = cached.outputSha256
            } else {
                val out = File(File(applicationContext.cacheDir, "watch_conv").apply { mkdirs() }, "${t0.mediaId}_${q.name}.m4a")
                try {
                    AudioTranscoder.transcode(applicationContext, src, out, q.bitrate)
                    sha = sha256(out.inputStream()); size = out.length(); mime = "audio/mp4"
                    path = Uri.fromFile(out).toString()
                    dao.putConversion(AudioConversionEntity(key, q.name, out.absolutePath, sha, size, System.currentTimeMillis()))
                } catch (e: Exception) {
                    // 변환 실패 → 원본 전송 (호환성 경고 기록)
                    out.delete()
                    sha = open(src).use { sha256(it) }
                    dao.setState(t0.transferId, "PREPARING", "변환 실패로 원본 전송: ${e.message}")
                }
            }
        } else {
            sha = open(src).use { sha256(it) }
        }
        val t = t0.copy(payloadPath = path, payloadMime = mime, size = size, sha256 = sha, updatedAt = System.currentTimeMillis())
        dao.upsert(t)
        t
    }

    private suspend fun checkBudget(t: WatchTransferEntity, st: WatchStatus) {
        val policy = c.settings.current()
        val reserve = maxOf(512L shl 20, st.totalBytes / 10)
        val remainingNeeded = t.size - t.bytesAcked.coerceAtMost(t.size)
        if (st.freeBytes - remainingNeeded < reserve) {
            throw Fatal("워치 저장 공간 부족 (여유 ${st.freeBytes shr 20}MiB, 최소 여유 ${reserve shr 20}MiB 유지)")
        }
        val budget = (st.freeBytes + st.trayUsedBytes) * policy.watchBudgetPercent / 100
        if (st.trayUsedBytes + remainingNeeded > budget) {
            throw Fatal("워치 음악 예산(${policy.watchBudgetPercent}%) 초과 — 설정에서 예산을 늘리거나 워치에서 곡을 정리하세요")
        }
    }

    // ---------- 전송 ----------

    private suspend fun sendFrom(t: WatchTransferEntity, offset: Long) = withContext(Dispatchers.IO) {
        val client = Wearable.getChannelClient(applicationContext)
        val channel = client.openChannel(t.nodeId, WearProtocol.DATA_PREFIX + t.transferId).await()
        try {
            val out = client.getOutputStream(channel).await()
            out.use { o ->
                open(Uri.parse(t.payloadPath)).use { input ->
                    var skipped = 0L
                    while (skipped < offset) {
                        val s = input.skip(offset - skipped)
                        if (s <= 0) throw Fatal("원본 파일 길이가 변경되었습니다.")
                        skipped += s
                    }
                    val buf = ByteArray(BLOCK)
                    var sent = offset
                    var lastReport = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        o.write(buf, 0, n)
                        sent += n
                        val now = System.currentTimeMillis()
                        if (now - lastReport > 700) {
                            lastReport = now
                            dao.setProgress(t.transferId, sent)
                            runCatching { setForeground(fg(t.title, sent, t.size)) }
                        }
                    }
                    o.flush()
                    dao.setProgress(t.transferId, sent)
                }
            }
        } finally {
            runCatching { client.close(channel).await() }
        }
    }

    // ---------- 유틸 ----------

    private fun payloadExists(t: WatchTransferEntity): Boolean {
        val p = t.payloadPath ?: return false
        val u = Uri.parse(p)
        return if (u.scheme == "file") File(u.path!!).length() == t.size else true
    }

    private fun open(u: Uri): InputStream = applicationContext.contentResolver.openInputStream(u)
        ?: throw Fatal("파일을 열 수 없습니다: $u")

    private fun querySize(u: Uri): Long =
        applicationContext.contentResolver.query(u, arrayOf(MediaStore.MediaColumns.SIZE), null, null, null)?.use {
            if (it.moveToFirst()) it.getLong(0) else -1L
        } ?: -1L

    private fun sha256(input: InputStream): String {
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(256 * 1024)
        while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun mimeOf(codec: String) = when (codec) {
        "audio/mpeg" -> "audio/mpeg"; "audio/flac", "audio/x-flac" -> "audio/flac"
        "audio/mp4a-latm" -> "audio/mp4"; "audio/vorbis", "audio/opus" -> "audio/ogg"
        else -> codec
    }

    private fun fileName(t: WatchTransferEntity): String {
        val ext = when (t.payloadMime) { "audio/mpeg" -> "mp3"; "audio/flac" -> "flac"; "audio/mp4" -> "m4a"; "audio/ogg" -> "ogg"; else -> "audio" }
        return "${t.sha256}.$ext"
    }

    private fun fg(name: String, done: Long, total: Long): ForegroundInfo {
        val n = NotificationCompat.Builder(applicationContext, TrayApp.CHANNEL_DOWNLOADS)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("워치로 전송: $name")
            .setOnlyAlertOnce(true).setOngoing(true)
            .apply { if (total > 0) setProgress(1000, (done * 1000 / total).toInt(), false) else setProgress(0, 0, true) }
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            ForegroundInfo(id.hashCode(), n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else ForegroundInfo(id.hashCode(), n)
    }

    companion object {
        const val KEY_ID = "transferId"
        private const val BLOCK = 1 shl 20   // 1MiB
        private val mutex = Mutex()
    }
}

package com.tray.music.downloads

import android.content.ContentValues
import android.content.Context
import android.content.pm.ServiceInfo
import android.database.sqlite.SQLiteConstraintException
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.tray.music.TrayApp
import com.tray.music.data.db.DownloadJobEntity
import com.tray.music.data.db.DownloadState
import com.tray.music.data.db.MusicFileEntity
import com.tray.music.library.LIBRARY_RELATIVE_PATH
import com.tray.music.net.SafeHttp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest

private class PermanentFailure(msg: String) : Exception(msg)
private class RetryableFailure(msg: String) : Exception(msg)

/**
 * 허가된 직접 URL 다운로드 작업.
 * 흐름: DOWNLOADING(이어받기 지원) → VERIFYING(SHA-256 + 오디오 트랙 확인) → COMMITTING(MediaStore IS_PENDING) → COMPLETED
 */
class DownloadWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    private val app get() = applicationContext as TrayApp
    private val dao get() = app.container.db.downloadDao()
    private val musicDao get() = app.container.db.musicFileDao()

    override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo("다운로드 준비 중", 0, 0)

    override suspend fun doWork(): Result {
        val jobId = inputData.getString(KEY_JOB_ID) ?: return Result.failure()
        val job = dao.get(jobId) ?: return Result.failure()
        if (job.state in TERMINAL) return Result.success()

        return gate.withPermit {   // 동시 다운로드 최대 3개
            try {
                runCatching { setForeground(foregroundInfo(job.displayName, 0, 0)) }
                dao.setState(jobId, DownloadState.DOWNLOADING.name)
                val part = DownloadRepository.partFile(applicationContext, jobId)
                download(job, part)

                dao.setState(jobId, DownloadState.VERIFYING.name)
                val sha = sha256(part)
                val mime = verifyAudio(part)

                val dup = musicDao.findBySha(sha)
                if (dup != null) {
                    part.delete()
                    dao.upsert(dao.get(jobId)!!.copy(
                        state = DownloadState.DUPLICATE.name, sha256 = sha, contentUri = dup.contentUri,
                        errorMessage = "같은 파일(SHA-256 일치)이 이미 보관함에 있습니다.",
                        updatedAt = System.currentTimeMillis(),
                    ))
                    return@withPermit Result.success()
                }

                dao.setState(jobId, DownloadState.COMMITTING.name)
                val fileName = safeFileName(job.displayName, mime)
                val uri = commitToMediaStore(part, fileName, mime)
                try {
                    musicDao.insert(MusicFileEntity(
                        contentUri = uri, sha256 = sha, displayName = fileName, mimeType = mime,
                        size = part.length(), source = job.url, rightsNote = job.rightsNote,
                        createdAt = System.currentTimeMillis(),
                    ))
                } catch (_: SQLiteConstraintException) { /* 동시 완료된 중복 — 파일은 이미 저장됨 */ }
                part.delete()
                dao.upsert(dao.get(jobId)!!.copy(
                    state = DownloadState.COMPLETED.name, sha256 = sha, contentUri = uri,
                    errorMessage = null, updatedAt = System.currentTimeMillis(),
                ))
                Result.success()
            } catch (e: CancellationException) {
                // 일시정지/취소/제약 해제로 중단. 상태는 호출자(pause/cancel)가 기록. 제약 해제면 WorkManager 가 재실행.
                val cur = dao.get(jobId)
                if (cur?.state == DownloadState.DOWNLOADING.name) {
                    dao.setState(jobId, DownloadState.WAITING_NETWORK.name, "네트워크/시스템 조건 대기 중")
                }
                throw e
            } catch (e: PermanentFailure) {
                dao.setState(jobId, DownloadState.FAILED_PERMANENT.name, e.message)
                DownloadRepository.partFile(applicationContext, jobId).delete()
                Result.failure()
            } catch (e: Exception) {
                val attempts = (dao.get(jobId)?.attempts ?: 0) + 1
                dao.get(jobId)?.let { dao.upsert(it.copy(attempts = attempts)) }
                val msg = when (e) {
                    is RetryableFailure -> e.message
                    is IOException -> "네트워크 오류: ${e.message}"
                    else -> "${e.javaClass.simpleName}: ${e.message}"
                }
                if (attempts >= MAX_ATTEMPTS) {
                    dao.setState(jobId, DownloadState.FAILED_PERMANENT.name, "$msg (재시도 ${attempts}회 초과)")
                    Result.failure()
                } else {
                    dao.setState(jobId, DownloadState.FAILED_RETRYABLE.name, msg)
                    Result.retry()
                }
            }
        }
    }

    // ---------------- 다운로드 (이어받기) ----------------

    private suspend fun download(job0: DownloadJobEntity, part: File) = withContext(Dispatchers.IO) {
        var job = job0
        var offset = if (part.exists()) part.length() else 0L
        val canResume = offset > 0 && (job.etag != null || job.lastModified != null)
        if (!canResume && offset > 0) { part.delete(); offset = 0 }

        val resp = openWithRedirects(job.url) { b ->
            if (offset > 0) {
                b.header("Range", "bytes=$offset-")
                b.header("If-Range", job.etag ?: job.lastModified!!)
            }
        }
        resp.use { r ->
            when (r.code) {
                200 -> { if (offset > 0) { part.delete(); offset = 0 } }   // 서버가 범위 무시 → 처음부터
                206 -> {
                    val cr = r.header("Content-Range") ?: throw RetryableFailure("Content-Range 누락")
                    val start = Regex("bytes (\\d+)-").find(cr)?.groupValues?.get(1)?.toLongOrNull()
                    if (start != offset) { part.delete(); throw RetryableFailure("이어받기 위치 불일치 → 처음부터 재시도") }
                }
                401, 403 -> throw PermanentFailure("접근 거부(${r.code}). 다운로드 권한/URL을 다시 확인하세요.")
                404, 410 -> throw PermanentFailure("파일을 찾을 수 없습니다(${r.code}).")
                416 -> { part.delete(); throw RetryableFailure("요청 범위 오류(416) → 처음부터 재시도") }
                429 -> throw RetryableFailure("요청이 너무 많습니다(429). 잠시 후 재시도합니다.")
                in 500..599 -> throw RetryableFailure("서버 오류(${r.code})")
                else -> throw PermanentFailure("예상하지 못한 응답 코드 ${r.code}")
            }

            val body = r.body ?: throw RetryableFailure("응답 본문 없음")
            val ctype = body.contentType()?.toString()?.lowercase().orEmpty()
            if (ctype.startsWith("text/html")) throw PermanentFailure("음악 파일이 아니라 웹페이지(HTML)가 반환되었습니다.")
            val remaining = body.contentLength()
            val total = if (remaining >= 0) offset + remaining else -1L
            if (total > MAX_BYTES) throw PermanentFailure("파일이 너무 큽니다(최대 1GiB).")
            val free = applicationContext.filesDir.usableSpace
            if (remaining > 0 && remaining * 2 > free) throw RetryableFailure("저장 공간 부족")

            job = job.copy(
                etag = r.header("ETag")?.takeUnless { it.startsWith("W/") },
                lastModified = r.header("Last-Modified"),
                totalBytes = total, bytesDone = offset,
            )
            dao.upsert(job.copy(updatedAt = System.currentTimeMillis()))

            FileOutputStream(part, offset > 0).use { out ->
                val src = body.byteStream()
                val buf = ByteArray(64 * 1024)
                var done = offset
                var lastReport = 0L
                while (true) {
                    coroutineContext.ensureActive()
                    val n = src.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    done += n
                    if (done > MAX_BYTES) throw PermanentFailure("파일이 너무 큽니다(최대 1GiB).")
                    val now = System.currentTimeMillis()
                    if (now - lastReport > 500) {
                        lastReport = now
                        dao.updateProgress(job.jobId, done, total)
                        runCatching { setForeground(foregroundInfo(job.displayName, done, total)) }
                    }
                }
                out.fd.sync()
                dao.updateProgress(job.jobId, done, total)
                if (total >= 0 && done != total) throw RetryableFailure("수신 크기 불일치 ($done / $total)")
            }
        }
    }

    /** 리디렉션을 직접 따라가며 매번 URL 보안 검사 (최대 5회) */
    private fun openWithRedirects(start: String, extra: (Request.Builder) -> Unit): Response {
        var url = SafeHttp.validate(start)
        repeat(6) {
            val b = Request.Builder().url(url).header("User-Agent", "TRAY-MUSIC/0.1 (personal)")
            extra(b)
            val r = SafeHttp.downloadClient.newCall(b.build()).execute()
            if (r.code in listOf(301, 302, 303, 307, 308)) {
                val loc = r.header("Location")
                r.close()
                val next = loc?.let { url.resolve(it) } ?: throw PermanentFailure("리디렉션 주소 없음")
                url = SafeHttp.validate(next.toString())
            } else return r
        }
        throw PermanentFailure("리디렉션이 너무 많습니다.")
    }

    // ---------------- 검증 ----------------

    private fun sha256(f: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { s ->
            val buf = ByteArray(256 * 1024)
            while (true) { val n = s.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** 실제로 디코딩 가능한 오디오 트랙이 있는지 확인. 반환: MIME 타입 */
    private fun verifyAudio(f: File): String {
        val ex = MediaExtractor()
        try {
            ex.setDataSource(f.absolutePath)
            for (i in 0 until ex.trackCount) {
                val mime = ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) return containerMime(f, mime)
            }
            throw PermanentFailure("오디오 트랙이 없는 파일입니다.")
        } catch (e: PermanentFailure) {
            throw e
        } catch (e: Exception) {
            throw PermanentFailure("손상되었거나 지원하지 않는 오디오 파일입니다: ${e.message}")
        } finally {
            ex.release()
        }
    }

    /** 코덱 MIME → 저장 컨테이너 MIME (파일 헤더로 판별) */
    private fun containerMime(f: File, codecMime: String): String {
        val h = ByteArray(12)
        f.inputStream().use { it.read(h) }
        val s = String(h, Charsets.ISO_8859_1)
        return when {
            s.startsWith("fLaC") -> "audio/flac"
            s.startsWith("ID3") || (h[0].toInt() and 0xFF == 0xFF && h[1].toInt() and 0xE0 == 0xE0) -> "audio/mpeg"
            s.startsWith("OggS") -> "audio/ogg"
            s.startsWith("RIFF") -> "audio/wav"
            s.substring(4, 8) == "ftyp" -> "audio/mp4"
            else -> codecMime
        }
    }

    private fun safeFileName(name: String, mime: String): String {
        val ext = when (mime) {
            "audio/flac" -> "flac"; "audio/mpeg" -> "mp3"; "audio/ogg" -> "ogg"
            "audio/wav" -> "wav"; "audio/mp4" -> "m4a"; else -> "audio"
        }
        val base = name.substringBeforeLast('.').replace(Regex("[\\\\/:*?\"<>|]"), "_").take(100).ifBlank { "track" }
        return "$base.$ext"
    }

    /** 공유 Music/TRAY MUSIC/ 에 저장. IS_PENDING 동안 다른 앱에 노출되지 않음 */
    private fun commitToMediaStore(part: File, fileName: String, mime: String): String {
        val resolver = applicationContext.contentResolver
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Audio.Media.MIME_TYPE, mime)
            put(MediaStore.Audio.Media.RELATIVE_PATH, LIBRARY_RELATIVE_PATH)
            put(MediaStore.Audio.Media.IS_MUSIC, 1)
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: throw RetryableFailure("MediaStore 항목 생성 실패")
        try {
            resolver.openOutputStream(uri)?.use { out -> part.inputStream().use { it.copyTo(out) } }
                ?: throw RetryableFailure("저장 스트림을 열 수 없습니다.")
            resolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)   // 미완성 파일 제거
            throw e
        }
        return uri.toString()
    }

    // ---------------- 알림 ----------------

    private fun foregroundInfo(name: String, done: Long, total: Long): ForegroundInfo {
        val n = NotificationCompat.Builder(applicationContext, TrayApp.CHANNEL_DOWNLOADS)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("다운로드: $name")
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .apply {
                if (total > 0) setProgress(1000, ((done * 1000) / total).toInt(), false)
                else setProgress(0, 0, true)
            }
            .build()
        val notifId = id.hashCode()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notifId, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else ForegroundInfo(notifId, n)
    }

    companion object {
        const val KEY_JOB_ID = "jobId"
        private const val MAX_ATTEMPTS = 6
        private const val MAX_BYTES = 1L shl 30
        private val gate = Semaphore(3)
        private val TERMINAL = setOf(
            DownloadState.COMPLETED.name, DownloadState.CANCELLED.name,
            DownloadState.DUPLICATE.name, DownloadState.PAUSED.name,
        )
    }
}

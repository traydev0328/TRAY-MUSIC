package com.tray.music.downloads

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.tray.music.data.SettingsStore
import com.tray.music.data.db.DownloadDao
import com.tray.music.data.db.DownloadJobEntity
import com.tray.music.data.db.DownloadState
import com.tray.music.net.SafeHttp
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

class DownloadRepository(
    private val context: Context,
    private val dao: DownloadDao,
    private val settings: SettingsStore,
) {
    val jobs = dao.observeAll()

    /**
     * 사용자가 이용 권한을 확인한 직접 URL만 등록.
     * @return 오류 메시지 (성공 시 null)
     */
    suspend fun enqueue(rawUrl: String, rightsNote: String): String? {
        val url = try { SafeHttp.validate(rawUrl) } catch (e: Exception) { return e.message }
        if (rightsNote.isBlank()) return "이용 권한 근거를 입력해야 다운로드할 수 있습니다."
        if (dao.countLiveByUrl(url.toString()) > 0) return "이미 대기열에 있거나 완료된 URL입니다."
        val name = url.pathSegments.lastOrNull { it.isNotBlank() } ?: "download"
        val now = System.currentTimeMillis()
        val job = DownloadJobEntity(
            jobId = UUID.randomUUID().toString(),
            url = url.toString(),
            displayName = name,
            state = DownloadState.QUEUED.name,
            bytesDone = 0, totalBytes = -1,
            etag = null, lastModified = null,
            attempts = 0, errorMessage = null,
            contentUri = null, sha256 = null,
            rightsNote = rightsNote.trim(),
            createdAt = now, updatedAt = now,
        )
        dao.insert(job)
        schedule(job.jobId)
        return null
    }

    suspend fun schedule(jobId: String) {
        val wifiOnly = settings.current().wifiOnly
        val req = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(workDataOf(DownloadWorker.KEY_JOB_ID to jobId))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
                    .setRequiresStorageNotLow(true)
                    .build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(workName(jobId), ExistingWorkPolicy.KEEP, req)
    }

    suspend fun pause(jobId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(workName(jobId))
        dao.setState(jobId, DownloadState.PAUSED.name)
    }

    suspend fun resume(jobId: String) {
        val job = dao.get(jobId) ?: return
        dao.upsert(job.copy(state = DownloadState.QUEUED.name, attempts = 0, errorMessage = null,
            updatedAt = System.currentTimeMillis()))
        schedule(jobId)
    }

    suspend fun retry(jobId: String) = resume(jobId)

    suspend fun cancel(jobId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(workName(jobId))
        dao.setState(jobId, DownloadState.CANCELLED.name)
        partFile(context, jobId).delete()
    }

    /** 목록에서 기록 제거 (완료된 음악 파일 자체는 삭제하지 않음) */
    suspend fun removeRecord(jobId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(workName(jobId))
        partFile(context, jobId).delete()
        dao.delete(jobId)
    }

    /** 앱 시작 시: 프로세스 종료로 멈춘 작업을 다시 예약 (WorkManager 가 대부분 복원하지만 상태 불일치 보정) */
    suspend fun recoverInterrupted() {
        val stuck = dao.getByStates(
            listOf(
                DownloadState.QUEUED.name, DownloadState.WAITING_NETWORK.name,
                DownloadState.DOWNLOADING.name, DownloadState.VERIFYING.name,
                DownloadState.COMMITTING.name, DownloadState.FAILED_RETRYABLE.name,
            )
        )
        stuck.forEach { schedule(it.jobId) }
    }

    companion object {
        const val TAG = "tray-download"
        fun workName(jobId: String) = "download-$jobId"
        fun partFile(context: Context, jobId: String) =
            File(File(context.filesDir, "downloads").apply { mkdirs() }, "$jobId.part")
    }
}

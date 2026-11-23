package com.tray.music.sync

import android.content.Context
import android.os.PowerManager
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.tray.music.TrayApp
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

/**
 * 재생목록 자동 동기화 + 허가 음원 매칭 + 워치 즐겨찾기 자동 전송 예약.
 * Android 가 실제 실행 시점을 결정하므로 실시간은 보장되지 않는다.
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val c = (applicationContext as TrayApp).container
        val policy = c.settings.current()
        if (!policy.autoSync && !inputData.getBoolean(KEY_MANUAL, false)) return Result.success()

        val playlists = c.db.youtubeDao().observePlaylists().first()
        var failed = 0
        for (p in playlists) {
            val r = c.youtube.sync(p.id)
            if (r is com.tray.music.youtube.SyncResult.Failed) failed++
            val items = c.db.youtubeDao().observeItems(p.id).first()
            runCatching { c.matching.matchItems(items) }
        }
        if (policy.watchAutoFavorites) runCatching { c.watch.syncFavorites() }
        return if (failed > 0 && runAttemptCount < 2) Result.retry() else Result.success()
    }

    companion object {
        private const val PERIODIC = "tray-periodic-sync"
        private const val ONCE = "tray-sync-now"
        const val KEY_MANUAL = "manual"

        /** 기본 1시간, 절전 모드면 6시간으로 완화 */
        fun schedule(context: Context, enabled: Boolean) {
            val wm = WorkManager.getInstance(context)
            if (!enabled) { wm.cancelUniqueWork(PERIODIC); return }
            val power = context.getSystemService(PowerManager::class.java)
            val hours = if (power?.isPowerSaveMode == true) 6L else 1L
            val req = PeriodicWorkRequestBuilder<SyncWorker>(hours, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .setRequiresBatteryNotLow(true)
                        .build()
                )
                .build()
            wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
        }

        fun runNow(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setInputData(androidx.work.workDataOf(KEY_MANUAL to true))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONCE, ExistingWorkPolicy.KEEP, req)
        }
    }
}

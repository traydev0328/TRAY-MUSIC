package com.tray.music

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.tray.music.auth.GoogleAuth
import com.tray.music.data.SettingsStore
import com.tray.music.data.db.AppDatabase
import com.tray.music.downloads.DownloadRepository
import com.tray.music.library.LocalMusicRepository
import com.tray.music.playback.PlayerConnection
import com.tray.music.youtube.YouTubeApi
import com.tray.music.youtube.YouTubeRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** 간단한 수동 의존성 컨테이너 */
class AppContainer(app: Application) {
    val db = AppDatabase.create(app)
    val settings = SettingsStore(app)
    val auth = GoogleAuth(app)
    val youtube = YouTubeRepository(YouTubeApi(app), db.youtubeDao(), auth, settings)
    val downloads = DownloadRepository(app, db.downloadDao(), settings)
    val library = LocalMusicRepository(app)
    val player = PlayerConnection(app)
    val musicFiles = db.musicFileDao()
}

class TrayApp : Application() {
    lateinit var container: AppContainer
        private set
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_DOWNLOADS, "다운로드", NotificationManager.IMPORTANCE_LOW)
        )
        appScope.launch { container.downloads.recoverInterrupted() }
    }

    companion object {
        const val CHANNEL_DOWNLOADS = "downloads"
    }
}

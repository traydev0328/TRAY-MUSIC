package com.tray.music

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import com.tray.music.audiofx.AudioFx
import com.tray.music.auth.GoogleAuth
import com.tray.music.data.SettingsStore
import com.tray.music.data.db.AppDatabase
import com.tray.music.downloads.DownloadRepository
import com.tray.music.library.LocalMusicRepository
import com.tray.music.lyrics.LyricsStore
import com.tray.music.matching.MatchingRepository
import com.tray.music.playback.PlayerConnection
import com.tray.music.sources.JamendoSource
import com.tray.music.sync.SyncWorker
import com.tray.music.watchlink.WatchLink
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
    val matching = MatchingRepository(db.matchDao(), JamendoSource(), downloads, settings)
    val library = LocalMusicRepository(app)
    val player = PlayerConnection(app)
    val musicFiles = db.musicFileDao()
    val favorites = db.favoriteDao()
    val audioFx = AudioFx(app)
    val lyrics = LyricsStore(app)
    val watch = WatchLink(app, db.watchDao(), db.favoriteDao(), settings)
}

class TrayApp : Application() {
    lateinit var container: AppContainer
        private set
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_DOWNLOADS, "다운로드·전송", NotificationManager.IMPORTANCE_LOW)
        )
        appScope.launch {
            runCatching { container.downloads.recoverInterrupted() }
            runCatching { container.watch.recover() }
            SyncWorker.schedule(this@TrayApp, container.settings.current().autoSync)
        }
    }

    companion object {
        const val CHANNEL_DOWNLOADS = "downloads"
    }
}

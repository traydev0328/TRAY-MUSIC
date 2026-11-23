package com.tray.music.wear.playback

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import com.tray.music.wear.MainActivity
import com.tray.music.wear.data.WatchTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/** 워치 독립 재생 (휴대폰 없이 워치 저장 파일 재생) */
class WearPlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        session = MediaSession.Builder(this, player).setSessionActivity(open).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }
}

data class WearPlayerState(
    val hasMedia: Boolean = false, val playing: Boolean = false,
    val title: String = "", val artist: String = "", val currentId: String? = null,
    val positionMs: Long = 0, val durationMs: Long = 0,
)

/** UI ↔ 워치 재생 서비스 연결 */
class WearPlayer(private val context: Context) {
    private val _state = MutableStateFlow(WearPlayerState())
    val state = _state.asStateFlow()
    private var controller: MediaController? = null

    fun connect() {
        if (controller != null) return
        val f = MediaController.Builder(context, SessionToken(context, ComponentName(context, WearPlaybackService::class.java))).buildAsync()
        f.addListener({
            val c = runCatching { f.get() }.getOrNull() ?: return@addListener
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = publish(player)
            })
            publish(c)
        }, ContextCompat.getMainExecutor(context))
    }

    fun release() { controller?.release(); controller = null }

    private fun publish(p: Player) {
        _state.value = WearPlayerState(
            hasMedia = p.mediaItemCount > 0, playing = p.isPlaying,
            title = p.mediaMetadata.title?.toString().orEmpty(), artist = p.mediaMetadata.artist?.toString().orEmpty(),
            currentId = p.currentMediaItem?.mediaId, positionMs = p.currentPosition, durationMs = p.duration.coerceAtLeast(0),
        )
    }

    fun refreshPosition() { controller?.let { publish(it) } }

    fun play(tracks: List<WatchTrack>, index: Int) {
        val c = controller ?: return
        c.setMediaItems(tracks.map {
            MediaItem.Builder().setMediaId(it.sha256).setUri(Uri.fromFile(File(it.path)))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(it.title).setArtist(it.artist).build()).build()
        }, index, 0)
        c.prepare(); c.play()
    }

    fun toggle() { controller?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { controller?.seekToNext() }
    fun prev() { controller?.seekToPrevious() }
    fun stop() { controller?.stop() }
}

package com.tray.music.playback

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.tray.music.library.LocalTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerUiState(
    val connected: Boolean = false,
    val hasMedia: Boolean = false,
    val isPlaying: Boolean = false,
    val title: String = "",
    val artist: String = "",
    val durationMs: Long = 0,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val currentMediaId: String? = null,
    val error: String? = null,
)

/** UI ↔ PlaybackService 연결 (MediaController). 앱 전역에서 하나만 사용. */
class PlayerConnection(private val context: Context) {

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    var controller: MediaController? = null
        private set

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = publish(player)
        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            _state.value = _state.value.copy(error = "재생 오류: ${error.errorCodeName}")
        }
    }

    fun connect() {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            runCatching { future.get() }.onSuccess { c ->
                controller = c
                c.addListener(listener)
                publish(c)
            }.onFailure {
                _state.value = _state.value.copy(error = "플레이어 연결 실패: ${it.message}")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun publish(p: Player) {
        val md = p.mediaMetadata
        _state.value = PlayerUiState(
            connected = true,
            hasMedia = p.mediaItemCount > 0,
            isPlaying = p.isPlaying,
            title = md.title?.toString() ?: "",
            artist = md.artist?.toString() ?: "",
            durationMs = p.duration.coerceAtLeast(0),
            shuffle = p.shuffleModeEnabled,
            repeatMode = p.repeatMode,
            currentMediaId = p.currentMediaItem?.mediaId,
            error = if (p.playerError == null) null else _state.value.error,
        )
    }

    fun playQueue(tracks: List<LocalTrack>, startIndex: Int) {
        val c = controller ?: return
        val items = tracks.map { it.toMediaItem() }
        c.setMediaItems(items, startIndex, 0L)
        c.prepare()
        c.play()
    }

    fun togglePlay() { controller?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { controller?.seekToNext() }
    fun previous() { controller?.seekToPrevious() }
    fun seekTo(ms: Long) { controller?.seekTo(ms) }
    fun position(): Long = controller?.currentPosition ?: 0L
    fun setPlaybackParameters(speed: Float, pitch: Float) {
        controller?.playbackParameters = androidx.media3.common.PlaybackParameters(speed, pitch)
    }

    fun toggleShuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun cycleRepeat() {
        controller?.let {
            it.repeatMode = when (it.repeatMode) {
                Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                else -> Player.REPEAT_MODE_OFF
            }
        }
    }
}

fun LocalTrack.toMediaItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id.toString())
    .setUri(uri)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setIsPlayable(true)
            .setIsBrowsable(false)
            .setExtras(Bundle().apply { putLong("size", size) })
            .build()
    )
    .build()

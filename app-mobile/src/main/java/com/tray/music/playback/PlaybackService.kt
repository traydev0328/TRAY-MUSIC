package com.tray.music.playback

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.tray.music.MainActivity
import com.tray.music.TrayApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Media3 백그라운드 재생 서비스.
 * - 시스템 미디어 알림·잠금화면·블루투스 버튼 (MediaSessionService 기본 제공)
 * - 오디오 효과 세션 연결, 대기열/위치 영속화, 워치에 현재 곡 알림
 * - Gapless: ExoPlayer 기본 동작(인코더 지연 정보가 있는 파일)
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val container get() = (application as TrayApp).container

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()

        val sid = Util.generateAudioSessionIdV21(this)
        player.audioSessionId = sid
        container.audioFx.attach(sid)

        scope.launch {
            val p = container.settings.current()
            player.playbackParameters = PlaybackParameters(p.playbackSpeed, p.playbackPitch)
        }

        QueueStore.restore(this)?.let { (items, index, pos) ->
            player.setMediaItems(items, index, pos)
            player.prepare()   // 자동 재생은 하지 않음
        }

        player.addListener(object : Player.Listener {
            override fun onEvents(p: Player, events: Player.Events) {
                if (events.containsAny(Player.EVENT_MEDIA_ITEM_TRANSITION, Player.EVENT_TIMELINE_CHANGED,
                        Player.EVENT_IS_PLAYING_CHANGED)) {
                    QueueStore.save(this@PlaybackService, p)
                }
                if (events.containsAny(Player.EVENT_MEDIA_METADATA_CHANGED, Player.EVENT_IS_PLAYING_CHANGED)) {
                    val md = p.mediaMetadata
                    scope.launch {
                        runCatching {
                            container.watch.sendNowPlaying(md.title?.toString().orEmpty(), md.artist?.toString().orEmpty(), p.isPlaying)
                        }
                    }
                }
            }
        })

        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player).setSessionActivity(openApp).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            QueueStore.save(this@PlaybackService, player)
            player.release()
            release()
        }
        session = null
        container.audioFx.release()
        scope.cancel()
        super.onDestroy()
    }
}

/** 대기열·현재 위치 영속화 (앱 재시작 후 이어 듣기) */
object QueueStore {
    private fun file(c: Context) = File(c.filesDir, "queue.json")

    fun save(c: Context, p: Player) {
        runCatching {
            val arr = JSONArray()
            for (i in 0 until p.mediaItemCount) {
                val m = p.getMediaItemAt(i)
                arr.put(JSONObject()
                    .put("id", m.mediaId)
                    .put("uri", m.localConfiguration?.uri?.toString() ?: continue)
                    .put("title", m.mediaMetadata.title?.toString().orEmpty())
                    .put("artist", m.mediaMetadata.artist?.toString().orEmpty())
                    .put("album", m.mediaMetadata.albumTitle?.toString().orEmpty()))
            }
            val o = JSONObject().put("items", arr).put("index", p.currentMediaItemIndex).put("pos", p.currentPosition)
            val tmp = File(c.filesDir, "queue.json.tmp")
            tmp.writeText(o.toString())
            tmp.renameTo(file(c))
        }
    }

    fun restore(c: Context): Triple<List<MediaItem>, Int, Long>? = runCatching {
        val f = file(c)
        if (!f.exists()) return null
        val o = JSONObject(f.readText())
        val arr = o.getJSONArray("items")
        val items = (0 until arr.length()).map { i ->
            val j = arr.getJSONObject(i)
            MediaItem.Builder().setMediaId(j.getString("id")).setUri(Uri.parse(j.getString("uri")))
                .setMediaMetadata(MediaMetadata.Builder().setTitle(j.optString("title")).setArtist(j.optString("artist"))
                    .setAlbumTitle(j.optString("album")).setIsPlayable(true).setIsBrowsable(false).build())
                .build()
        }
        if (items.isEmpty()) null
        else Triple(items, o.optInt("index").coerceIn(0, items.size - 1), o.optLong("pos").coerceAtLeast(0))
    }.getOrNull()
}

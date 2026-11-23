package com.tray.music.watchlink

import android.content.ComponentName
import android.media.AudioManager
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.tray.music.TrayApp
import com.tray.music.playback.PlaybackService
import kotlinx.coroutines.launch
import org.json.JSONObject

/** 워치에서 오는 메시지 수신 (전송 응답, 상태, 원격 제어) */
class TrayWearListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        val c = (application as TrayApp).container
        val json = runCatching { JSONObject(String(event.data)) }.getOrDefault(JSONObject())
        when (event.path) {
            WearProtocol.STATUS, WearProtocol.RESUME, WearProtocol.DONE -> c.watch.onReply(event.path, event.sourceNodeId, json)
            WearProtocol.REMOTE -> remote(json.optString("cmd"))
            WearProtocol.NOW_PLAYING_REQ -> remote("report")
        }
    }

    /** 원격 제어: 휴대폰 MediaSession 에 명령 전달 (워치 → 휴대폰 리모컨 모드) */
    private fun remote(cmd: String) {
        if (cmd == "vol_up" || cmd == "vol_down") {
            val am = getSystemService(AudioManager::class.java)
            am.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                if (cmd == "vol_up") AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0)
            return
        }
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        val future = MediaController.Builder(this, token).buildAsync()
        future.addListener({
            val mc = runCatching { future.get() }.getOrNull() ?: return@addListener
            when (cmd) {
                "play" -> mc.play()
                "pause" -> mc.pause()
                "toggle" -> if (mc.isPlaying) mc.pause() else mc.play()
                "next" -> mc.seekToNext()
                "prev" -> mc.seekToPrevious()
            }
            val c = (application as TrayApp).container
            val md = mc.mediaMetadata
            val playing = mc.playWhenReady
            c.appScope.launch {
                runCatching { c.watch.sendNowPlaying(md.title?.toString().orEmpty(), md.artist?.toString().orEmpty(), playing) }
            }
            // 명령 반영 후 해제 (세션은 서비스가 유지)
            mc.release()
        }, ContextCompat.getMainExecutor(this))
    }
}


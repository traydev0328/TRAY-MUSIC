package com.tray.music.wear

import android.app.Application
import android.content.Context
import android.os.BatteryManager
import android.os.StatFs
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import com.tray.music.wear.data.WearDatabase
import com.tray.music.wear.link.WearProtocol
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.File

data class PhoneNowPlaying(val title: String = "", val artist: String = "", val playing: Boolean = false, val at: Long = 0)

data class StorageInfo(val free: Long, val total: Long, val used: Long, val battery: Int, val charging: Boolean)

class WearApp : Application() {
    lateinit var db: WearDatabase
        private set
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val nowPlaying = MutableStateFlow(PhoneNowPlaying())
    /** 수신 중인 전송 ID → 진행 정보 표시용 */
    val receiving = MutableStateFlow<Map<String, Long>>(emptyMap())

    override fun onCreate() {
        super.onCreate()
        db = WearDatabase.create(this)
    }

    val musicDir: File get() = File(filesDir, "music").apply { mkdirs() }
    val partDir: File get() = File(filesDir, "incoming").apply { mkdirs() }

    fun storageInfo(): StorageInfo {
        val st = StatFs(filesDir.absolutePath)
        val used = musicDir.listFiles()?.sumOf { it.length() } ?: 0L
        val bm = getSystemService(BatteryManager::class.java)
        return StorageInfo(
            free = st.availableBytes,
            total = st.totalBytes,
            used = used,
            battery = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1,
            charging = bm?.isCharging == true,
        )
    }

    /** TRAY MUSIC 휴대폰 앱이 있는 연결 노드 */
    suspend fun phoneNodeId(): String? = runCatching {
        Wearable.getCapabilityClient(this)
            .getCapability(WearProtocol.CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE).await()
            .nodes.firstOrNull()?.id
    }.getOrNull()

    suspend fun sendToPhone(path: String, json: JSONObject = JSONObject()): Boolean {
        val node = phoneNodeId() ?: return false
        return runCatching { Wearable.getMessageClient(this).sendMessage(node, path, json.toString().toByteArray()).await() }.isSuccess
    }

    companion object {
        fun from(c: Context) = c.applicationContext as WearApp
    }
}

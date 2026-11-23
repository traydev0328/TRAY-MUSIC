package com.tray.music.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "tray_settings")

/** 워치 전송 음질 프로필 (Q09) */
enum class WatchQuality(val label: String, val bitrate: Int) {
    ADAPTIVE("적응형 (권장)", 192_000),
    AAC_128("AAC 128kbps (절약)", 128_000),
    AAC_192("AAC 192kbps (균형)", 192_000),
    AAC_256("AAC 256kbps (고음질)", 256_000),
    ORIGINAL("원본 유지", 0),
}

data class UserPolicy(
    val wifiOnly: Boolean = true,
    val googleConnected: Boolean = false,
    /** 재생목록 백그라운드 자동 동기화 (Q04) */
    val autoSync: Boolean = true,
    /** VERIFIED + 권한 확인된 음원 자동 다운로드 (Q11) — 사용자 명시 동의 필요, 기본 꺼짐 */
    val autoDownload: Boolean = false,
    /** 자동 다운로드 보류 배터리 기준(%) */
    val batteryMin: Int = 25,
    /** SAF로 선택한 저장 폴더 (null = Music/TRAY MUSIC/) */
    val treeUri: String? = null,
    val watchQuality: WatchQuality = WatchQuality.ADAPTIVE,
    /** 즐겨찾기 곡 워치 자동 전송 (Q08) */
    val watchAutoFavorites: Boolean = false,
    /** 워치 가용 공간 중 음악에 쓸 최대 비율(%) */
    val watchBudgetPercent: Int = 40,
    val playbackSpeed: Float = 1f,
    val playbackPitch: Float = 1f,
)

class SettingsStore(private val context: Context) {
    private object K {
        val WIFI_ONLY = booleanPreferencesKey("wifi_only")
        val GOOGLE = booleanPreferencesKey("google_connected")
        val AUTO_SYNC = booleanPreferencesKey("auto_sync")
        val AUTO_DL = booleanPreferencesKey("auto_download")
        val BATTERY_MIN = intPreferencesKey("battery_min")
        val TREE = stringPreferencesKey("tree_uri")
        val WATCH_Q = stringPreferencesKey("watch_quality")
        val WATCH_FAV = booleanPreferencesKey("watch_auto_favorites")
        val WATCH_BUDGET = intPreferencesKey("watch_budget")
        val SPEED = floatPreferencesKey("speed")
        val PITCH = floatPreferencesKey("pitch")
    }

    val policy: Flow<UserPolicy> = context.dataStore.data.map { p ->
        UserPolicy(
            wifiOnly = p[K.WIFI_ONLY] ?: true,
            googleConnected = p[K.GOOGLE] ?: false,
            autoSync = p[K.AUTO_SYNC] ?: true,
            autoDownload = p[K.AUTO_DL] ?: false,
            batteryMin = p[K.BATTERY_MIN] ?: 25,
            treeUri = p[K.TREE],
            watchQuality = p[K.WATCH_Q]?.let { runCatching { WatchQuality.valueOf(it) }.getOrNull() } ?: WatchQuality.ADAPTIVE,
            watchAutoFavorites = p[K.WATCH_FAV] ?: false,
            watchBudgetPercent = p[K.WATCH_BUDGET] ?: 40,
            playbackSpeed = p[K.SPEED] ?: 1f,
            playbackPitch = p[K.PITCH] ?: 1f,
        )
    }

    suspend fun current(): UserPolicy = policy.first()

    private suspend fun <T> set(key: Preferences.Key<T>, v: T) { context.dataStore.edit { it[key] = v } }

    suspend fun setWifiOnly(v: Boolean) = set(K.WIFI_ONLY, v)
    suspend fun setGoogleConnected(v: Boolean) = set(K.GOOGLE, v)
    suspend fun setAutoSync(v: Boolean) = set(K.AUTO_SYNC, v)
    suspend fun setAutoDownload(v: Boolean) = set(K.AUTO_DL, v)
    suspend fun setBatteryMin(v: Int) = set(K.BATTERY_MIN, v.coerceIn(5, 90))
    suspend fun setWatchQuality(v: WatchQuality) = set(K.WATCH_Q, v.name)
    suspend fun setWatchAutoFavorites(v: Boolean) = set(K.WATCH_FAV, v)
    suspend fun setWatchBudget(v: Int) = set(K.WATCH_BUDGET, v.coerceIn(10, 80))
    suspend fun setSpeed(v: Float) = set(K.SPEED, v)
    suspend fun setPitch(v: Float) = set(K.PITCH, v)
    suspend fun setTreeUri(v: String?) {
        context.dataStore.edit { if (v == null) it.remove(K.TREE) else it[K.TREE] = v }
    }
}

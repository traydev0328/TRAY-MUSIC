package com.tray.music.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "tray_settings")

data class UserPolicy(
    /** true = Wi-Fi 등 비종량 네트워크에서만 다운로드 (기본값) */
    val wifiOnly: Boolean = true,
    val googleConnected: Boolean = false,
)

class SettingsStore(private val context: Context) {
    private val WIFI_ONLY = booleanPreferencesKey("wifi_only")
    private val GOOGLE_CONNECTED = booleanPreferencesKey("google_connected")

    val policy: Flow<UserPolicy> = context.dataStore.data.map {
        UserPolicy(
            wifiOnly = it[WIFI_ONLY] ?: true,
            googleConnected = it[GOOGLE_CONNECTED] ?: false,
        )
    }

    suspend fun current(): UserPolicy = policy.first()

    suspend fun setWifiOnly(v: Boolean) = context.dataStore.edit { it[WIFI_ONLY] = v }
    suspend fun setGoogleConnected(v: Boolean) = context.dataStore.edit { it[GOOGLE_CONNECTED] = v }
}

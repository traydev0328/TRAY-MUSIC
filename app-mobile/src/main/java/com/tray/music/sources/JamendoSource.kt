package com.tray.music.sources

import com.tray.music.BuildConfig
import com.tray.music.matching.CatalogTrack
import com.tray.music.net.SafeHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import org.json.JSONObject

/**
 * Jamendo 공식 API v3.0 (https://developer.jamendo.com/v3.0/tracks)
 * - client_id 는 developer.jamendo.com 에서 무료 발급 → secrets.properties 의 JAMENDO_CLIENT_ID
 * - audiodownload_allowed 값을 그대로 권한 판단 근거로 사용
 */
class JamendoSource {

    val isConfigured get() = BuildConfig.JAMENDO_CLIENT_ID.isNotBlank()

    suspend fun search(title: String, artist: String?): List<CatalogTrack> = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext emptyList()
        val url = "https://api.jamendo.com/v3.0/tracks/".toHttpUrl().newBuilder()
            .addQueryParameter("client_id", BuildConfig.JAMENDO_CLIENT_ID)
            .addQueryParameter("format", "json")
            .addQueryParameter("limit", "10")
            .addQueryParameter("namesearch", title)
            .addQueryParameter("audiodlformat", "mp32")
            .apply { if (!artist.isNullOrBlank()) addQueryParameter("artist_name", artist) }
            .build()
        val body = SafeHttp.apiClient.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) throw IllegalStateException("Jamendo API 오류 ${r.code}")
            r.body?.string().orEmpty()
        }
        val json = JSONObject(body)
        val header = json.optJSONObject("headers")
        if (header?.optString("status") == "failed") {
            throw IllegalStateException("Jamendo: ${header.optString("error_message")}")
        }
        val arr = json.optJSONArray("results") ?: return@withContext emptyList()
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            CatalogTrack(
                source = "jamendo",
                id = o.optString("id"),
                title = o.optString("name"),
                artist = o.optString("artist_name"),
                durationSec = o.optInt("duration"),
                downloadUrl = o.optString("audiodownload").takeIf { it.startsWith("https://") },
                downloadAllowed = o.optBoolean("audiodownload_allowed", false),
                licenseUrl = o.optString("license_ccurl").ifBlank { null },
            )
        }
    }
}

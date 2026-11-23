package com.tray.music.youtube

import android.content.Context
import android.content.pm.PackageManager
import com.tray.music.BuildConfig
import com.tray.music.data.db.YoutubePlaylistEntity
import com.tray.music.data.db.YoutubePlaylistItemEntity
import com.tray.music.net.SafeHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import org.json.JSONObject
import java.security.MessageDigest

class YouTubeApiException(val code: Int, message: String) : Exception(message)

/**
 * YouTube Data API v3 — 메타데이터 조회 전용 (오디오/영상 다운로드 기능 없음).
 * accessToken 이 있으면 OAuth, 없으면 API 키(공개 데이터)로 호출.
 */
class YouTubeApi(private val context: Context) {

    private val base = "https://www.googleapis.com/youtube/v3/".toHttpUrl()

    /** Android 앱 제한이 걸린 API 키는 이 두 헤더가 있어야 통과한다 */
    private val certSha1: String? by lazy { signingCertSha1() }

    suspend fun myPlaylists(token: String): List<YoutubePlaylistEntity> {
        val result = mutableListOf<YoutubePlaylistEntity>()
        var pageToken: String? = null
        do {
            val url = base.newBuilder().addPathSegment("playlists")
                .addQueryParameter("part", "snippet,contentDetails")
                .addQueryParameter("mine", "true")
                .addQueryParameter("maxResults", "50")
                .apply { pageToken?.let { addQueryParameter("pageToken", it) } }
                .build()
            val json = get(url, token)
            val items = json.optJSONArray("items")
            for (i in 0 until (items?.length() ?: 0)) {
                result += parsePlaylist(items!!.getJSONObject(i), owner = "mine")
            }
            pageToken = json.optString("nextPageToken").ifEmpty { null }
        } while (pageToken != null)
        return result
    }

    suspend fun playlist(id: String, token: String?, owner: String): YoutubePlaylistEntity {
        val url = base.newBuilder().addPathSegment("playlists")
            .addQueryParameter("part", "snippet,contentDetails")
            .addQueryParameter("id", id)
            .build()
        val items = get(url, token).optJSONArray("items")
        if (items == null || items.length() == 0) {
            throw YouTubeApiException(404, "재생목록을 찾을 수 없거나 접근 권한이 없습니다. (비공개 목록이면 Google 계정을 연결하세요)")
        }
        return parsePlaylist(items.getJSONObject(0), owner)
    }

    /** 50개씩 nextPageToken 으로 전체 페이지 수집 */
    suspend fun allItems(playlistId: String, token: String?): List<YoutubePlaylistItemEntity> {
        val out = mutableListOf<YoutubePlaylistItemEntity>()
        var pageToken: String? = null
        do {
            val url = base.newBuilder().addPathSegment("playlistItems")
                .addQueryParameter("part", "snippet,contentDetails,status")
                .addQueryParameter("playlistId", playlistId)
                .addQueryParameter("maxResults", "50")
                .apply { pageToken?.let { addQueryParameter("pageToken", it) } }
                .build()
            val json = get(url, token)
            val items = json.optJSONArray("items")
            for (i in 0 until (items?.length() ?: 0)) {
                val it = items!!.getJSONObject(i)
                val sn = it.getJSONObject("snippet")
                val privacy = it.optJSONObject("status")?.optString("privacyStatus") ?: ""
                val title = sn.optString("title")
                val unavailable = privacy == "private" || privacy == "privacyStatusUnspecified" ||
                    title == "Deleted video" || title == "Private video"
                out += YoutubePlaylistItemEntity(
                    playlistItemId = it.getString("id"),
                    playlistId = playlistId,
                    videoId = it.optJSONObject("contentDetails")?.optString("videoId")
                        ?: sn.optJSONObject("resourceId")?.optString("videoId") ?: "",
                    title = title,
                    channelTitle = sn.optString("videoOwnerChannelTitle", ""),
                    position = sn.optInt("position", out.size),
                    status = if (unavailable) "UNAVAILABLE" else "AVAILABLE",
                    thumbnailUrl = thumb(sn),
                )
            }
            pageToken = json.optString("nextPageToken").ifEmpty { null }
        } while (pageToken != null)
        return out
    }

    private fun parsePlaylist(o: JSONObject, owner: String): YoutubePlaylistEntity {
        val sn = o.getJSONObject("snippet")
        return YoutubePlaylistEntity(
            id = o.getString("id"),
            ownerAccount = owner,
            title = sn.optString("title"),
            channelTitle = sn.optString("channelTitle"),
            itemCount = o.optJSONObject("contentDetails")?.optInt("itemCount") ?: 0,
            thumbnailUrl = thumb(sn),
            lastSyncedAt = 0,
            syncState = "IDLE",
            syncError = null,
        )
    }

    private fun thumb(sn: JSONObject): String? {
        val t = sn.optJSONObject("thumbnails") ?: return null
        for (k in listOf("medium", "high", "default")) {
            t.optJSONObject(k)?.optString("url")?.let { if (it.isNotEmpty()) return it }
        }
        return null
    }

    /** 429/5xx 는 제한된 지수 백오프 후 재시도, 그 외 오류는 실제 원인 메시지로 전달 */
    private suspend fun get(url0: HttpUrl, token: String?): JSONObject = withContext(Dispatchers.IO) {
        val url = if (token == null) {
            if (BuildConfig.YOUTUBE_API_KEY.isEmpty()) {
                throw YouTubeApiException(0, "API 키가 설정되지 않았습니다. Google 계정을 연결하거나 secrets.properties 에 YOUTUBE_API_KEY 를 넣고 다시 빌드하세요.")
            }
            url0.newBuilder().addQueryParameter("key", BuildConfig.YOUTUBE_API_KEY).build()
        } else url0

        var attempt = 0
        while (true) {
            val req = Request.Builder().url(url).apply {
                if (token != null) header("Authorization", "Bearer $token")
                header("X-Android-Package", context.packageName)
                certSha1?.let { header("X-Android-Cert", it) }
            }.build()
            SafeHttp.apiClient.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (resp.isSuccessful) return@withContext JSONObject(body)
                val retryable = resp.code == 429 || resp.code >= 500
                if (retryable && attempt < 4) {
                    val retryAfter = resp.header("Retry-After")?.toLongOrNull()
                    delay(retryAfter?.times(1000) ?: (1000L shl attempt))
                    attempt++
                    return@use
                }
                val reason = runCatching {
                    JSONObject(body).getJSONObject("error").getString("message")
                }.getOrDefault(body.take(200))
                throw YouTubeApiException(resp.code, "YouTube API 오류 ${resp.code}: $reason")
            }
        }
        error("unreachable")
    }

    @Suppress("DEPRECATION")
    private fun signingCertSha1(): String? = runCatching {
        val pm = context.packageManager
        val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val sig = info.signingInfo?.apkContentsSigners?.firstOrNull() ?: return null
        MessageDigest.getInstance("SHA-1").digest(sig.toByteArray())
            .joinToString("") { "%02X".format(it) }
    }.getOrNull()

    companion object {
        /** URL 또는 ID에서 재생목록 ID 추출 */
        fun parsePlaylistId(input: String): String? {
            val s = input.trim()
            if (s.isEmpty()) return null
            Regex("[?&]list=([A-Za-z0-9_-]+)").find(s)?.let { return it.groupValues[1] }
            if (Regex("^[A-Za-z0-9_-]{10,64}$").matches(s)) return s
            return null
        }
    }
}

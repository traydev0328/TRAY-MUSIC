package com.tray.music.matching

import com.tray.music.data.SettingsStore
import com.tray.music.data.db.MatchDao
import com.tray.music.data.db.TrackMatchEntity
import com.tray.music.data.db.YoutubePlaylistItemEntity
import com.tray.music.downloads.DownloadRepository
import com.tray.music.sources.JamendoSource
import kotlinx.coroutines.delay

class MatchingRepository(
    private val dao: MatchDao,
    private val jamendo: JamendoSource,
    private val downloads: DownloadRepository,
    private val settings: SettingsStore,
) {
    val matches = dao.observeAll()
    val isConfigured get() = jamendo.isConfigured

    /**
     * 재생목록 항목들을 허가 카탈로그와 매칭.
     * 7일 이내에 확인한 항목은 건너뜀. 자동 다운로드 동의 시 VERIFIED 만 대기열에 추가.
     * @return 이번에 새로 판정한 개수
     */
    suspend fun matchItems(items: List<YoutubePlaylistItemEntity>, force: Boolean = false): Int {
        if (!jamendo.isConfigured) return 0
        val policy = settings.current()
        var count = 0
        for (it in items.filter { it.status == "AVAILABLE" }.distinctBy { it.videoId }) {
            val existing = dao.get(it.videoId)
            val fresh = existing != null && System.currentTimeMillis() - existing.checkedAt < 7L * 24 * 3600 * 1000
            if (fresh && !force) {
                if (existing!!.status == MatchStatus.VERIFIED.name && policy.autoDownload) enqueue(existing, auto = true)
                continue
            }
            val parsed = Matcher.parseYouTube(it.title, it.channelTitle)
            val decision = try {
                val cands = jamendo.search(parsed.title, parsed.artist).ifEmpty {
                    if (parsed.artist != null) jamendo.search(parsed.title, null) else emptyList()
                }
                Matcher.decide(parsed, it.durationSec, cands)
            } catch (e: Exception) {
                // 네트워크 오류는 판정하지 않고 다음 동기화에 재시도
                continue
            }
            val entity = TrackMatchEntity(
                videoId = it.videoId,
                status = decision.status.name,
                source = "jamendo",
                sourceTrackId = decision.track?.id,
                title = decision.track?.title,
                artist = decision.track?.artist,
                durationSec = decision.track?.durationSec ?: 0,
                downloadUrl = decision.track?.downloadUrl,
                licenseUrl = decision.track?.licenseUrl,
                evidence = decision.evidence,
                checkedAt = System.currentTimeMillis(),
            )
            dao.upsert(entity)
            count++
            if (decision.status == MatchStatus.VERIFIED && policy.autoDownload) enqueue(entity, auto = true)
            delay(250) // 출처 이용 제한 배려
        }
        return count
    }

    /** 사용자가 NEEDS_REVIEW 항목을 직접 확인·승인했을 때 */
    suspend fun approve(videoId: String): String? {
        val m = dao.get(videoId) ?: return "매칭 정보가 없습니다."
        if (m.downloadUrl == null) return "다운로드 가능한 파일이 없습니다(권한 없음)."
        return enqueue(m, auto = false)
    }

    private suspend fun enqueue(m: TrackMatchEntity, auto: Boolean): String? {
        val url = m.downloadUrl ?: return "다운로드 URL 없음"
        val note = "Jamendo #${m.sourceTrackId} audiodownload_allowed=true" + (m.licenseUrl?.let { ", 라이선스 $it" } ?: "")
        val name = listOfNotNull(m.artist, m.title).joinToString(" - ").ifBlank { "jamendo_${m.sourceTrackId}" }
        return downloads.enqueueMatched(url, "$name.mp3", note, m.videoId, auto)
    }
}

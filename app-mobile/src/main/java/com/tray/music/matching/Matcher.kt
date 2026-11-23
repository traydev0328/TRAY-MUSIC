package com.tray.music.matching

import java.text.Normalizer
import kotlin.math.abs

/** 외부 허가 카탈로그의 후보 음원 */
data class CatalogTrack(
    val source: String,
    val id: String,
    val title: String,
    val artist: String,
    val durationSec: Int,
    val downloadUrl: String?,
    val downloadAllowed: Boolean,
    val licenseUrl: String?,
)

enum class MatchStatus { VERIFIED, NEEDS_REVIEW, DIFFERENT_VERSION, UNAVAILABLE, RIGHTS_BLOCKED }

data class MatchDecision(val status: MatchStatus, val track: CatalogTrack?, val evidence: String)

/** YouTube 제목에서 추출한 검색용 곡 정보 */
data class ParsedTitle(val artist: String?, val title: String, val versionTags: Set<String>)

/**
 * 보수적 동일 녹음본 판정.
 * 유사도 점수만으로 VERIFIED 를 주지 않고, 정규화 제목·아티스트 완전 일치 + 길이 ±3초 + 버전 태그 일치를 모두 요구한다.
 */
object Matcher {

    private val VERSION_WORDS = listOf(
        "live", "remix", "cover", "acoustic", "instrumental", "inst", "karaoke", "remaster", "remastered",
        "sped up", "slowed", "nightcore", "edit", "version", "ver", "demo", "mix", "라이브", "커버", "리믹스",
    )
    private val NOISE = Regex(
        "\\((?:official|offical|mv|m/v|music video|lyric[s]?|lyric video|audio|visualizer|hd|4k|teaser)[^)]*\\)|" +
            "\\[(?:official|mv|m/v|music video|lyric[s]?|audio|visualizer|hd|4k|teaser)[^]]*]",
        RegexOption.IGNORE_CASE,
    )

    fun normalize(s: String): String {
        val n = Normalizer.normalize(s, Normalizer.Form.NFKC).lowercase()
        return n.replace(Regex("\\s*(feat\\.?|ft\\.?|featuring)\\s.*$"), "")
            .replace(Regex("[\\p{Punct}\\p{IsPunctuation}“”‘’「」『』]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun versionTags(s: String): Set<String> {
        val l = s.lowercase()
        return VERSION_WORDS.filter { Regex("(^|[^\\p{L}])${Regex.escape(it)}([^\\p{L}]|$)").containsMatchIn(l) }
            .map { if (it == "remastered") "remaster" else if (it == "inst") "instrumental" else it }
            .toSet()
    }

    fun parseYouTube(title: String, channel: String): ParsedTitle {
        val tags = versionTags(title)
        val clean = title.replace(NOISE, " ").replace(Regex("\\s+"), " ").trim()
        val dash = Regex("\\s[-–—]\\s").find(clean)
        val ch = channel.replace(Regex("\\s*-\\s*Topic$", RegexOption.IGNORE_CASE), "")
            .replace(Regex("VEVO$", RegexOption.IGNORE_CASE), "").trim()
        return if (dash != null) {
            ParsedTitle(clean.substring(0, dash.range.first).trim(), clean.substring(dash.range.last + 1).trim(), tags)
        } else {
            ParsedTitle(ch.ifBlank { null }, clean, tags)
        }
    }

    fun decide(yt: ParsedTitle, ytDurationSec: Int, candidates: List<CatalogTrack>): MatchDecision {
        if (candidates.isEmpty()) return MatchDecision(MatchStatus.UNAVAILABLE, null, "허가 카탈로그에서 후보 없음")
        val nt = normalize(yt.title)
        val na = yt.artist?.let(::normalize)

        var best: MatchDecision? = null
        for (c in candidates) {
            val ct = normalize(c.title)
            val ca = normalize(c.artist)
            val titleEq = ct == nt
            val titleNear = !titleEq && (ct.contains(nt) || nt.contains(ct)) && nt.length >= 3
            val artistEq = na != null && ca == na
            val durKnown = ytDurationSec > 0 && c.durationSec > 0
            val durDiff = if (durKnown) abs(ytDurationSec - c.durationSec) else -1
            val tagsEq = versionTags(c.title) == yt.versionTags
            val ev = "제목=${if (titleEq) "일치" else if (titleNear) "부분" else "불일치"}, " +
                "아티스트=${if (artistEq) "일치" else "불일치/미상"}, " +
                "길이차=${if (durKnown) "${durDiff}초" else "확인불가"}, 버전태그=${if (tagsEq) "일치" else "다름"}"

            val decision = when {
                titleEq && artistEq && durKnown && durDiff <= 3 && tagsEq ->
                    if (c.downloadAllowed && c.downloadUrl != null) MatchDecision(MatchStatus.VERIFIED, c, ev)
                    else MatchDecision(MatchStatus.RIGHTS_BLOCKED, c, "$ev, 다운로드 비허용")
                (titleEq || titleNear) && artistEq && !tagsEq -> MatchDecision(MatchStatus.DIFFERENT_VERSION, c, ev)
                (titleEq || titleNear) && (artistEq || (durKnown && durDiff <= 3)) -> MatchDecision(MatchStatus.NEEDS_REVIEW, c, ev)
                else -> null
            }
            if (decision != null && (best == null || rank(decision.status) < rank(best.status))) best = decision
        }
        return best ?: MatchDecision(MatchStatus.UNAVAILABLE, null, "제목·아티스트가 일치하는 후보 없음 (${candidates.size}개 검토)")
    }

    private fun rank(s: MatchStatus) = when (s) {
        MatchStatus.VERIFIED -> 0; MatchStatus.RIGHTS_BLOCKED -> 1; MatchStatus.NEEDS_REVIEW -> 2
        MatchStatus.DIFFERENT_VERSION -> 3; MatchStatus.UNAVAILABLE -> 4
    }
}

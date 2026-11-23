package com.tray.music

import com.tray.music.lyrics.LrcParser
import com.tray.music.matching.CatalogTrack
import com.tray.music.matching.MatchStatus
import com.tray.music.matching.Matcher
import com.tray.music.youtube.YouTubeApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MatcherLyricsTest {

    private fun cand(title: String, artist: String, dur: Int, allowed: Boolean = true) =
        CatalogTrack("jamendo", "1", title, artist, dur, if (allowed) "https://example.com/a.mp3" else null, allowed, null)

    @Test fun parsesYouTubeTitle() {
        val p = Matcher.parseYouTube("Artist Name - Song Title (Official Music Video)", "Artist Name - Topic")
        assertEquals("Artist Name", p.artist)
        assertEquals("Song Title", p.title)
        assertTrue(p.versionTags.isEmpty())
    }

    @Test fun usesChannelWhenNoDash() {
        val p = Matcher.parseYouTube("Song Title", "Artist Name - Topic")
        assertEquals("Artist Name", p.artist)
    }

    @Test fun verifiedRequiresAllEvidence() {
        val yt = Matcher.parseYouTube("Artist - Song", "x")
        assertEquals(MatchStatus.VERIFIED, Matcher.decide(yt, 200, listOf(cand("Song", "Artist", 202))).status)
        // 길이 차이 큼 → 검증 불가, 리뷰 필요
        assertEquals(MatchStatus.NEEDS_REVIEW, Matcher.decide(yt, 200, listOf(cand("Song", "Artist", 260))).status)
        // 길이 정보 없음 → 자동 확정 금지
        assertEquals(MatchStatus.NEEDS_REVIEW, Matcher.decide(yt, 0, listOf(cand("Song", "Artist", 200))).status)
    }

    @Test fun coverAndLiveAreDifferentVersion() {
        val yt = Matcher.parseYouTube("Artist - Song", "x")
        assertEquals(MatchStatus.DIFFERENT_VERSION, Matcher.decide(yt, 200, listOf(cand("Song (Live)", "Artist", 200))).status)
    }

    @Test fun rightsBlockedWhenDownloadNotAllowed() {
        val yt = Matcher.parseYouTube("Artist - Song", "x")
        assertEquals(MatchStatus.RIGHTS_BLOCKED, Matcher.decide(yt, 200, listOf(cand("Song", "Artist", 200, allowed = false))).status)
    }

    @Test fun differentArtistIsNotVerified() {
        val yt = Matcher.parseYouTube("Artist - Song", "x")
        assertFalse(Matcher.decide(yt, 200, listOf(cand("Song", "Someone Else", 230))).status == MatchStatus.VERIFIED)
        assertEquals(MatchStatus.UNAVAILABLE, Matcher.decide(yt, 200, emptyList()).status)
    }

    @Test fun parsesIsoDuration() {
        assertEquals(203, YouTubeApi.parseIsoDuration("PT3M23S"))
        assertEquals(3723, YouTubeApi.parseIsoDuration("PT1H2M3S"))
        assertEquals(45, YouTubeApi.parseIsoDuration("PT45S"))
        assertEquals(0, YouTubeApi.parseIsoDuration("garbage"))
    }

    @Test fun parsesLrc() {
        val l = LrcParser.parse("[ti:x]\n[offset:500]\n[00:01.00]first\n[00:05.50][00:10.00]repeat\n[00:03.2]second")
        assertTrue(l.synced)
        assertEquals(500, l.fileOffsetMs)
        assertEquals(listOf(1000L, 3200L, 5500L, 10000L), l.lines.map { it.timeMs })
        assertEquals(-1, LrcParser.indexAt(l, 0, -600))
        assertEquals(1, LrcParser.indexAt(l, 3000, 0))     // 3000 + 500 offset = 3500 → "second"
        assertEquals(3, LrcParser.indexAt(l, 20000, 0))
    }

    @Test fun plainLyricsAreUnsynced() {
        val l = LrcParser.parse("line one\nline two")
        assertFalse(l.synced)
        assertEquals(2, l.lines.size)
    }
}

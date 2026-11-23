package com.tray.music

import com.tray.music.net.SafeHttp
import com.tray.music.net.UnsafeUrlException
import com.tray.music.youtube.YouTubeApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress

class PureLogicTest {

    @Test fun parsesPlaylistIdFromUrls() {
        assertEquals("PL1234567890abc", YouTubeApi.parsePlaylistId("https://www.youtube.com/playlist?list=PL1234567890abc"))
        assertEquals("PLabcdefghij_-", YouTubeApi.parsePlaylistId("https://youtube.com/watch?v=xyz&list=PLabcdefghij_-&index=2"))
        assertEquals("PLrawid1234", YouTubeApi.parsePlaylistId("  PLrawid1234 "))
        assertNull(YouTubeApi.parsePlaylistId("https://example.com/nothing"))
        assertNull(YouTubeApi.parsePlaylistId(""))
    }

    @Test(expected = UnsafeUrlException::class)
    fun rejectsHttp() { SafeHttp.validate("http://example.com/a.mp3") }

    @Test(expected = UnsafeUrlException::class)
    fun rejectsLocalhost() { SafeHttp.validate("https://localhost/a.mp3") }

    @Test fun acceptsHttps() {
        assertEquals("example.com", SafeHttp.validate("https://example.com/a.mp3").host)
    }

    @Test fun blocksPrivateAddresses() {
        listOf("127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.5", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1")
            .forEach { assertTrue(it, SafeHttp.isBlockedAddress(InetAddress.getByName(it))) }
        assertFalse(SafeHttp.isBlockedAddress(InetAddress.getByName("8.8.8.8")))
    }
}

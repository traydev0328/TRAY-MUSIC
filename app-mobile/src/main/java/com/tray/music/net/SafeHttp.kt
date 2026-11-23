package com.tray.music.net

import okhttp3.Dns
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import java.net.Inet6Address
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

class UnsafeUrlException(message: String) : Exception(message)

/**
 * 사용자 입력 URL 보안 검사
 * - https 만 허용
 * - 로컬/사설/링크로컬/멀티캐스트 주소 차단 (연결 시점 DNS 결과에도 적용 → DNS 리바인딩 방지)
 * - 리디렉션은 자동으로 따라가지 않고, 매 단계 다시 검사 (DownloadWorker 에서 처리)
 */
object SafeHttp {

    fun validate(raw: String): HttpUrl {
        val url = raw.trim().toHttpUrlOrNull() ?: throw UnsafeUrlException("올바른 URL 형식이 아닙니다.")
        if (url.scheme != "https") throw UnsafeUrlException("보안을 위해 https:// 주소만 허용합니다.")
        val host = url.host.lowercase()
        if (host == "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
            throw UnsafeUrlException("로컬/내부 네트워크 주소는 허용하지 않습니다.")
        }
        return url
    }

    fun isBlockedAddress(a: InetAddress): Boolean {
        if (a.isAnyLocalAddress || a.isLoopbackAddress || a.isLinkLocalAddress ||
            a.isSiteLocalAddress || a.isMulticastAddress
        ) return true
        val b = a.address
        if (a is Inet6Address) {
            // fc00::/7 고유 로컬 주소
            if ((b[0].toInt() and 0xFE) == 0xFC) return true
        } else if (b.size == 4) {
            val first = b[0].toInt() and 0xFF
            val second = b[1].toInt() and 0xFF
            if (first == 100 && second in 64..127) return true   // CGNAT 100.64.0.0/10
            if (first == 0) return true
        }
        return false
    }

    private val safeDns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            val all = Dns.SYSTEM.lookup(hostname)
            val allowed = all.filterNot(::isBlockedAddress)
            if (allowed.isEmpty()) throw UnknownHostException("차단된 내부 네트워크 주소로 해석됩니다: $hostname")
            return allowed
        }
    }

    /** 다운로드용 클라이언트: 리디렉션 수동 처리 + 안전 DNS */
    val downloadClient: OkHttpClient = OkHttpClient.Builder()
        .dns(safeDns)
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Google API 호출용 일반 클라이언트 */
    val apiClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
}

package com.tray.music.auth

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import kotlinx.coroutines.tasks.await

/**
 * Google 권한 승인 (AuthorizationClient).
 * - 비밀번호를 앱이 받지 않음. 토큰을 디스크에 저장하지 않고 필요할 때마다 요청한다.
 * - 이미 승인된 경우 UI 없이 바로 accessToken 을 받는다(백그라운드 동기화에서도 사용 가능).
 * - 승인 필요 시 pendingIntent 를 돌려주며, Activity 가 이를 실행해 사용자 동의를 받는다.
 */
sealed interface AuthOutcome {
    data class Token(val accessToken: String) : AuthOutcome
    data class NeedsConsent(val pendingIntent: PendingIntent) : AuthOutcome
    data class Failed(val message: String) : AuthOutcome
}

class GoogleAuth(private val context: Context) {

    private val request = AuthorizationRequest.builder()
        .setRequestedScopes(listOf(Scope(YOUTUBE_READONLY)))
        .build()

    suspend fun authorize(): AuthOutcome = try {
        val result = Identity.getAuthorizationClient(context).authorize(request).await()
        val pi = result.pendingIntent
        val token = result.accessToken
        when {
            result.hasResolution() && pi != null -> AuthOutcome.NeedsConsent(pi)
            token != null -> AuthOutcome.Token(token)
            else -> AuthOutcome.Failed("Google에서 액세스 토큰을 받지 못했습니다.")
        }
    } catch (e: Exception) {
        AuthOutcome.Failed(explain(e))
    }

    /** 동의 화면에서 돌아온 결과 처리 */
    fun handleConsentResult(activity: Activity, data: Intent?): AuthOutcome = try {
        val r = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
        r.accessToken?.let { AuthOutcome.Token(it) } ?: AuthOutcome.Failed("권한이 승인되지 않았습니다.")
    } catch (e: Exception) {
        AuthOutcome.Failed(explain(e))
    }

    private fun explain(e: Exception): String {
        val msg = e.message ?: e.javaClass.simpleName
        return when {
            msg.contains("10:") || msg.contains("DEVELOPER_ERROR") ->
                "OAuth 설정 불일치(DEVELOPER_ERROR). Google Cloud의 Android OAuth 클라이언트에 패키지명 com.tray.music 과 이 APK의 SHA-1 이 등록됐는지 확인하세요."
            msg.contains("16:") || msg.contains("CANCELED", ignoreCase = true) -> "사용자가 승인을 취소했습니다."
            msg.contains("7:") || msg.contains("NETWORK_ERROR") -> "네트워크 오류로 Google 인증에 실패했습니다."
            else -> "Google 인증 실패: $msg"
        }
    }

    companion object {
        const val YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly"
    }
}

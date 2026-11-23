package com.tray.music

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.tray.music.auth.AuthOutcome
import com.tray.music.ui.TrayRoot
import com.tray.music.ui.theme.TrayTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {

    /** 공유 인텐트로 받은 YouTube 링크 */
    val sharedText = MutableStateFlow<String?>(null)

    private var pendingConsent: CompletableDeferred<AuthOutcome>? = null

    private val consentLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        val container = (application as TrayApp).container
        val outcome = container.auth.handleConsentResult(this, result.data)
        pendingConsent?.complete(outcome)
        pendingConsent = null
    }

    /** Google 동의 화면 실행 후 결과를 기다림 */
    suspend fun requestConsent(needs: AuthOutcome.NeedsConsent): AuthOutcome {
        val d = CompletableDeferred<AuthOutcome>()
        pendingConsent = d
        consentLauncher.launch(IntentSenderRequest.Builder(needs.pendingIntent.intentSender).build())
        return d.await()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        (application as TrayApp).container.player.connect()
        handleIntent(intent)
        setContent {
            TrayTheme { TrayRoot(this) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(i: Intent?) {
        if (i?.action == Intent.ACTION_SEND) {
            sharedText.value = i.getStringExtra(Intent.EXTRA_TEXT)
        }
    }
}

package com.tray.music.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tray.music.AppContainer
import com.tray.music.BuildConfig
import com.tray.music.MainActivity
import com.tray.music.ui.theme.Bad
import com.tray.music.ui.theme.Ok
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(activity: MainActivity, container: AppContainer, library: LibraryHolder, rescan: () -> Unit) {
    val scope = rememberCoroutineScope()
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    var message by remember { mutableStateOf<String?>(null) }
    val hasAudioPerm = ContextCompat.checkSelfPermission(activity, audioPermission()) == PackageManager.PERMISSION_GRANTED

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
        SectionTitle("설정")

        SettingsGroup("Google 계정") {
            Text(if (policy?.googleConnected == true) "연결됨 (youtube.readonly 권한)" else "연결 안 됨",
                color = if (policy?.googleConnected == true) Ok else MaterialTheme.colorScheme.onSurfaceVariant)
            Row {
                OutlinedButton(onClick = {
                    scope.launch { message = describe(connectGoogle(activity, container)) }
                }) { Text("연결 / 재승인") }
                OutlinedButton(onClick = {
                    scope.launch { container.youtube.disconnect(); message = "앱 내 Google 데이터 삭제 및 연결 해제 완료" }
                }, Modifier.padding(start = 8.dp)) { Text("연결 해제") }
            }
            OutlinedButton(onClick = {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://myaccount.google.com/permissions")))
            }) { Text("Google 계정에서 권한 완전 철회") }
            Text("API 키: ${if (BuildConfig.YOUTUBE_API_KEY.isNotEmpty()) "설정됨" else "없음 (공개 URL 조회는 Google 연결 필요)"}",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("네트워크 · 다운로드 정책") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Wi-Fi에서만 다운로드")
                    Text("끄면 모바일 데이터 요금이 발생할 수 있습니다. 새로 추가·재개하는 작업부터 적용됩니다.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = policy?.wifiOnly ?: true, onCheckedChange = { v -> scope.launch { container.settings.setWifiOnly(v) } })
            }
            Text("동시 다운로드 최대 3개 · 파일당 최대 1GiB · 저장 공간 부족 시 대기",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("저장소 · 권한") {
            Text("기본 저장 위치: 내장 저장소/Music/TRAY MUSIC/")
            Text("오디오 접근 권한: ${if (hasAudioPerm) "허용됨" else "거부됨 (앱이 저장한 파일만 표시)"}",
                color = if (hasAudioPerm) Ok else Bad)
            Text("보관함: ${library.tracks.size}곡", style = MaterialTheme.typography.bodySmall)
            Row {
                OutlinedButton(onClick = rescan) { Text("보관함 다시 검색") }
                OutlinedButton(onClick = {
                    activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}")))
                }, Modifier.padding(start = 8.dp)) { Text("앱 권한 설정 열기") }
            }
            Text("다른 폴더 선택(SAF)은 P1 단계에서 구현 예정입니다.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("Galaxy Watch") {
            Text("워치 연동·전송·독립 재생은 P2 단계 기능으로 아직 구현되지 않았습니다.",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("앱 정보") {
            Text("TRAY MUSIC ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Text("YouTube 데이터는 YouTube API 서비스를 통해 제공됩니다.", style = MaterialTheme.typography.bodySmall)
        }

        message?.let { Text(it, Modifier.padding(16.dp)) }
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        content()
    }
    HorizontalDivider(Modifier.padding(top = 8.dp))
}

package com.tray.music.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
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
import com.tray.music.sync.SyncWorker
import com.tray.music.ui.theme.Bad
import com.tray.music.ui.theme.Ok
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    activity: MainActivity, container: AppContainer, library: LibraryHolder, rescan: () -> Unit, onOpenWatch: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    var message by remember { mutableStateOf<String?>(null) }
    var consentDialog by remember { mutableStateOf(false) }
    val hasAudioPerm = ContextCompat.checkSelfPermission(activity, audioPermission()) == PackageManager.PERMISSION_GRANTED
    val p = policy

    val treePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            runCatching {
                activity.contentResolver.takePersistableUriPermission(
                    uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }.onSuccess {
                scope.launch { container.settings.setTreeUri(uri.toString()); message = "저장 폴더를 변경했습니다." }
            }.onFailure { message = "이 폴더는 사용할 수 없습니다: ${it.message}" }
        }
    }

    if (consentDialog) {
        AlertDialog(
            onDismissRequest = { consentDialog = false },
            title = { Text("자동 다운로드 동의") },
            text = {
                Text("YouTube 재생목록의 곡과 '동일 녹음본'으로 검증되고(VERIFIED), 출처(Jamendo)가 다운로드를 허용한 음원만 자동으로 받습니다. " +
                    "커버/라이브/불확실한 곡은 자동으로 받지 않습니다. Wi-Fi 정책과 배터리 ${p?.batteryMin ?: 25}% 기준이 적용됩니다. 언제든 끌 수 있습니다.")
            },
            confirmButton = {
                TextButton(onClick = { scope.launch { container.settings.setAutoDownload(true) }; consentDialog = false }) { Text("동의") }
            },
            dismissButton = { TextButton(onClick = { consentDialog = false }) { Text("취소") } },
        )
    }

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
        SectionTitle("설정")

        SettingsGroup("Google 계정") {
            Text(if (p?.googleConnected == true) "연결됨 (youtube.readonly 권한)" else "연결 안 됨",
                color = if (p?.googleConnected == true) Ok else MaterialTheme.colorScheme.onSurfaceVariant)
            Row {
                OutlinedButton(onClick = { scope.launch { message = describe(connectGoogle(activity, container)) } }) { Text("연결 / 재승인") }
                OutlinedButton(onClick = {
                    scope.launch { container.youtube.disconnect(); message = "앱 내 Google 데이터 삭제 및 연결 해제 완료" }
                }, Modifier.padding(start = 8.dp)) { Text("연결 해제") }
            }
            OutlinedButton(onClick = {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://myaccount.google.com/permissions")))
            }) { Text("Google 계정에서 권한 완전 철회") }
            Text("API 키: ${if (BuildConfig.YOUTUBE_API_KEY.isNotEmpty()) "설정됨" else "없음 (공개 URL 조회는 Google 연결 필요)"} · " +
                "Jamendo: ${if (BuildConfig.JAMENDO_CLIENT_ID.isNotEmpty()) "설정됨" else "없음 (허가 음원 매칭 비활성)"}",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("자동 동기화 · 자동 다운로드") {
            ToggleRow("재생목록 자동 동기화", "약 1시간 간격(절전 모드 6시간). 실제 실행 시점은 Android가 결정합니다.", p?.autoSync ?: true) { v ->
                scope.launch { container.settings.setAutoSync(v); SyncWorker.schedule(activity, v) }
            }
            OutlinedButton(onClick = { SyncWorker.runNow(activity); message = "동기화를 예약했습니다(네트워크 연결 시 실행)." }) { Text("지금 전체 동기화") }
            ToggleRow("허가 음원 자동 다운로드", "VERIFIED + 다운로드 허용 음원만. 기본 꺼짐.", p?.autoDownload ?: false) { v ->
                if (v) consentDialog = true else scope.launch { container.settings.setAutoDownload(false) }
            }
            var battery by remember(p?.batteryMin) { mutableFloatStateOf((p?.batteryMin ?: 25).toFloat()) }
            Text("자동 다운로드 보류 배터리 기준: ${battery.toInt()}% (충전 중엔 무시)", style = MaterialTheme.typography.bodySmall)
            Slider(battery, { battery = it }, valueRange = 5f..90f,
                onValueChangeFinished = { scope.launch { container.settings.setBatteryMin(battery.toInt()) } })
        }

        SettingsGroup("네트워크 · 다운로드 정책") {
            ToggleRow("Wi-Fi에서만 다운로드", "끄면 모바일 데이터 요금이 발생할 수 있습니다. 새로 추가·재개하는 작업부터 적용.", p?.wifiOnly ?: true) { v ->
                scope.launch { container.settings.setWifiOnly(v) }
            }
            Text("동시 다운로드 최대 3개 · 파일당 최대 1GiB · 저장 공간 부족 시 대기",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        SettingsGroup("저장소 · 권한") {
            val tree = p?.treeUri
            Text("저장 위치: ${if (tree != null) Uri.parse(tree).lastPathSegment ?: tree else "내장 저장소/Music/TRAY MUSIC/ (기본)"}")
            Row {
                OutlinedButton(onClick = { treePicker.launch(null) }) { Text("폴더 선택") }
                if (tree != null) OutlinedButton(onClick = {
                    scope.launch { container.settings.setTreeUri(null); message = "기본 폴더로 되돌렸습니다." }
                }, Modifier.padding(start = 8.dp)) { Text("기본값") }
            }
            Text("오디오 접근 권한: ${if (hasAudioPerm) "허용됨" else "거부됨 (앱이 저장한 파일만 표시)"}",
                color = if (hasAudioPerm) Ok else Bad)
            Text("보관함: ${library.tracks.size}곡", style = MaterialTheme.typography.bodySmall)
            Row {
                OutlinedButton(onClick = rescan) { Text("보관함 다시 검색") }
                OutlinedButton(onClick = {
                    activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}")))
                }, Modifier.padding(start = 8.dp)) { Text("앱 권한 설정") }
            }
        }

        SettingsGroup("Galaxy Watch") {
            Text("워치 연결·승인, 전송 음질, 즐겨찾기 자동 전송, 전송 상태")
            OutlinedButton(onClick = onOpenWatch) { Text("워치 관리 열기") }
        }

        SettingsGroup("앱 정보") {
            Text("TRAY MUSIC ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Text("YouTube 데이터는 YouTube API 서비스를 통해 제공됩니다. 허가 음원은 Jamendo API를 사용합니다.",
                style = MaterialTheme.typography.bodySmall)
        }

        message?.let { Text(it, Modifier.padding(16.dp)) }
    }
}

@Composable
fun ToggleRow(title: String, desc: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title)
            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun SettingsGroup(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        content()
    }
    HorizontalDivider(Modifier.padding(top = 8.dp))
}

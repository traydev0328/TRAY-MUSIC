package com.tray.music.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tray.music.AppContainer
import com.tray.music.data.WatchQuality
import com.tray.music.ui.theme.Bad
import com.tray.music.ui.theme.Ok
import com.tray.music.ui.theme.Warn
import com.tray.music.watchlink.WatchNode
import kotlinx.coroutines.launch

@Composable
fun WatchScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    val statuses by container.watch.status.collectAsStateWithLifecycle()
    val transfers by container.watch.transfers.collectAsStateWithLifecycle(emptyList())
    var nodes by remember { mutableStateOf<List<WatchNode>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var qualityMenu by remember { mutableStateOf(false) }

    suspend fun refresh() {
        loading = true
        runCatching { container.watch.nodes() }
            .onSuccess { list ->
                nodes = list
                message = if (list.isEmpty()) "TRAY MUSIC 워치 앱이 설치된 연결 기기가 없습니다. 워치에 TRAY_MUSIC_WEAR.apk 를 설치하세요." else null
                list.filter { it.approved }.forEach { runCatching { container.watch.refreshStatus(it.id) } }
            }
            .onFailure { message = "Wear OS 연결 확인 실패: ${it.message}" }
        loading = false
    }
    LaunchedEffect(Unit) { refresh() }

    LazyColumn(Modifier.fillMaxWidth()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, "뒤로") }
                Text("Galaxy Watch", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                IconButton(onClick = { scope.launch { refresh() } }) { Icon(Icons.Filled.Refresh, "새로고침") }
            }
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            message?.let { Text(it, Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall) }
        }
        items(nodes, key = { it.id }) { n ->
            val st = statuses[n.id]
            Card(Modifier.fillMaxWidth().padding(12.dp, 4.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(n.name, fontWeight = FontWeight.Bold)
                            Text(if (n.nearby) "직접 연결됨" else "클라우드/간접 연결", style = MaterialTheme.typography.bodySmall)
                        }
                        Text(if (n.approved) "승인됨" else "미승인", color = if (n.approved) Ok else Warn)
                        Switch(n.approved, { v ->
                            container.watch.setApproved(n.id, v)
                            scope.launch { refresh() }
                        }, Modifier.padding(start = 8.dp))
                    }
                    if (st != null) {
                        val used = st.totalBytes - st.freeBytes
                        Text("저장공간: 여유 ${formatBytes(st.freeBytes)} / 전체 ${formatBytes(st.totalBytes)} · TRAY ${formatBytes(st.trayUsedBytes)} (${st.trackCount}곡)",
                            style = MaterialTheme.typography.bodySmall)
                        if (st.totalBytes > 0) LinearProgressIndicator(progress = { used.toFloat() / st.totalBytes }, modifier = Modifier.fillMaxWidth())
                        Text("배터리 ${st.battery}%${if (st.charging) " (충전 중)" else ""}" +
                            if (st.battery in 0 until 30 && !st.charging) " — 자동 대량 전송 보류" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (st.battery in 0 until 30 && !st.charging) Warn else MaterialTheme.colorScheme.onSurface)
                    } else if (n.approved) {
                        Text("상태 응답 없음 (워치 앱을 한 번 실행해 보세요)", style = MaterialTheme.typography.bodySmall, color = Warn)
                    }
                }
            }
        }
        item {
            SettingsGroup("전송 정책") {
                Text("전송 음질")
                Column {
                    TextButton(onClick = { qualityMenu = true }) { Text(policy?.watchQuality?.label ?: "") }
                    DropdownMenu(qualityMenu, { qualityMenu = false }) {
                        WatchQuality.entries.forEach { q ->
                            DropdownMenuItem(text = { Text(q.label) }, onClick = {
                                scope.launch { container.settings.setWatchQuality(q) }; qualityMenu = false
                            })
                        }
                    }
                }
                Text("무손실(FLAC/WAV)만 AAC로 변환합니다. MP3·AAC 등 손실 음원은 재압축하지 않고 원본을 보냅니다.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ToggleRow("즐겨찾기 자동 전송", "승인된 워치로 즐겨찾기 곡을 자동 동기화합니다.", policy?.watchAutoFavorites ?: false) { v ->
                    scope.launch { container.settings.setWatchAutoFavorites(v) }
                }
                var budget by remember(policy?.watchBudgetPercent) { mutableFloatStateOf((policy?.watchBudgetPercent ?: 40).toFloat()) }
                Text("워치 음악 예산: 가용 공간의 ${budget.toInt()}% · 항상 최소 512MiB(또는 10%) 여유 유지", style = MaterialTheme.typography.bodySmall)
                Slider(budget, { budget = it }, valueRange = 10f..80f,
                    onValueChangeFinished = { scope.launch { container.settings.setWatchBudget(budget.toInt()) } })
                Text("워치 배터리 30% 미만이면 전송을 보류합니다(충전 중 제외).", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = {
                    scope.launch {
                        message = runCatching { "즐겨찾기 ${container.watch.syncFavorites()}건 전송 예약" }
                            .getOrElse { "실패: ${it.message}" }
                    }
                }) { Text("즐겨찾기 지금 워치로 동기화") }
            }
        }
        item { SectionTitle("전송 목록") }
        if (transfers.isEmpty()) item {
            Text("전송 기록이 없습니다. 내 음악에서 곡을 길게 눌러 '워치로 보내기'를 선택하세요.",
                Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(transfers, key = { it.transferId }) { t ->
            Column(Modifier.fillMaxWidth().padding(16.dp, 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(t.title, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val (label, color) = when (t.state) {
                        "COMPLETED" -> "완료" to Ok
                        "FAILED" -> "실패" to Bad
                        "CANCELLED" -> "취소" to Bad
                        "SENDING" -> "전송 중" to MaterialTheme.colorScheme.primary
                        "VERIFYING" -> "워치 검증 중" to MaterialTheme.colorScheme.primary
                        "PREPARING" -> "준비(변환) 중" to MaterialTheme.colorScheme.primary
                        else -> "대기" to Warn
                    }
                    StatusChip(label, color)
                }
                if (t.size > 0 && t.state != "COMPLETED") {
                    LinearProgressIndicator(progress = { (t.bytesAcked.toFloat() / t.size).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                }
                Text("${formatBytes(t.bytesAcked)} / ${formatBytes(t.size)} · ${t.profile}" + (t.payloadMime?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall)
                t.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (t.state == "COMPLETED") Ok else Warn) }
                Row {
                    if (t.state == "FAILED" || t.state == "CANCELLED") TextButton(onClick = { scope.launch { container.watch.retry(t.transferId) } }) { Text("다시 시도") }
                    if (t.state !in setOf("COMPLETED", "FAILED", "CANCELLED")) TextButton(onClick = { scope.launch { container.watch.cancel(t.transferId) } }) { Text("취소") }
                    if (t.state in setOf("COMPLETED", "FAILED", "CANCELLED")) TextButton(onClick = { scope.launch { container.watch.remove(t.transferId) } }) { Text("기록 삭제") }
                }
            }
        }
    }
}

package com.tray.music.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tray.music.AppContainer
import com.tray.music.data.db.DownloadJobEntity
import com.tray.music.data.db.DownloadState
import com.tray.music.ui.theme.Bad
import com.tray.music.ui.theme.Ok
import com.tray.music.ui.theme.Warn
import kotlinx.coroutines.launch

private enum class Filter(val label: String, val states: Set<DownloadState>?) {
    ALL("전체", null),
    ACTIVE("진행", setOf(DownloadState.QUEUED, DownloadState.WAITING_NETWORK, DownloadState.WAITING_BATTERY, DownloadState.DOWNLOADING,
        DownloadState.VERIFYING, DownloadState.COMMITTING, DownloadState.FAILED_RETRYABLE)),
    DONE("완료", setOf(DownloadState.COMPLETED, DownloadState.DUPLICATE)),
    FAILED("실패", setOf(DownloadState.FAILED_PERMANENT)),
    HOLD("보류", setOf(DownloadState.PAUSED, DownloadState.CANCELLED)),
}

@Composable
fun DownloadsScreen(container: AppContainer, onCompleted: () -> Unit) {
    val scope = rememberCoroutineScope()
    val jobs by container.downloads.jobs.collectAsStateWithLifecycle(emptyList())
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    var url by remember { mutableStateOf("") }
    var rights by remember { mutableStateOf("") }
    var confirmed by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf(Filter.ALL) }

    // 완료 개수가 늘면 보관함 재검색
    val completedCount = jobs.count { it.state == DownloadState.COMPLETED.name }
    LaunchedEffect(completedCount) { if (completedCount > 0) onCompleted() }

    // 속도 계산: 실제 관측된 바이트 변화로만 계산 (추정 불가면 표시 안 함)
    val lastSample = remember { mutableStateMapOf<String, Pair<Long, Long>>() }
    val speeds = remember { mutableStateMapOf<String, Long>() }
    LaunchedEffect(jobs) {
        val now = System.currentTimeMillis()
        jobs.filter { it.state == DownloadState.DOWNLOADING.name }.forEach { j ->
            val prev = lastSample[j.jobId]
            if (prev != null && now - prev.first >= 400 && j.bytesDone >= prev.second) {
                speeds[j.jobId] = (j.bytesDone - prev.second) * 1000 / (now - prev.first)
            }
            lastSample[j.jobId] = now to j.bytesDone
        }
    }

    LazyColumn(Modifier.fillMaxWidth()) {
        item { SectionTitle("다운로드 센터") }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                OutlinedTextField(url, { url = it }, label = { Text("음악 파일 직접 URL (https)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(rights, { rights = it },
                    label = { Text("이용 권한 근거 (예: 본인 소유, CC BY 4.0 + 출처 링크)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(confirmed, { confirmed = it })
                    Text("이 파일을 다운로드할 권리가 있음을 확인합니다.", style = MaterialTheme.typography.bodySmall)
                }
                Button(
                    enabled = confirmed && url.isNotBlank() && rights.isNotBlank(),
                    onClick = {
                        scope.launch {
                            val err = container.downloads.enqueue(url, rights)
                            message = err ?: "대기열에 추가했습니다."
                            if (err == null) { url = ""; confirmed = false }
                        }
                    },
                ) { Text("다운로드 추가") }
                Text(
                    if (policy?.wifiOnly != false) "현재 정책: Wi-Fi(비종량 네트워크)에서만 다운로드 · 저장 위치 Music/TRAY MUSIC/"
                    else "현재 정책: 모바일 데이터 허용 · 저장 위치 Music/TRAY MUSIC/",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
        item {
            LazyRow(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Spacer(Modifier.padding(start = 8.dp)) }
                items(Filter.entries) { f ->
                    FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) })
                }
            }
        }
        val shown = jobs.filter { j -> filter.states?.contains(DownloadState.valueOf(j.state)) ?: true }
        if (shown.isEmpty()) {
            item { Text("항목이 없습니다.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(shown, key = { it.jobId }) { j ->
            JobCard(j, speeds[j.jobId],
                onPause = { scope.launch { container.downloads.pause(j.jobId) } },
                onResume = { scope.launch { container.downloads.resume(j.jobId) } },
                onCancel = { scope.launch { container.downloads.cancel(j.jobId) } },
                onRemove = { scope.launch { container.downloads.removeRecord(j.jobId) } },
            )
        }
    }
}

@Composable
private fun JobCard(
    j: DownloadJobEntity, speed: Long?,
    onPause: () -> Unit, onResume: () -> Unit, onCancel: () -> Unit, onRemove: () -> Unit,
) {
    val st = DownloadState.valueOf(j.state)
    val (label, color) = when (st) {
        DownloadState.QUEUED -> "대기" to Warn
        DownloadState.WAITING_NETWORK -> "네트워크 대기" to Warn
        DownloadState.WAITING_BATTERY -> "배터리 대기" to Warn
        DownloadState.DOWNLOADING -> "다운로드 중" to MaterialTheme.colorScheme.primary
        DownloadState.VERIFYING -> "검증 중" to MaterialTheme.colorScheme.primary
        DownloadState.COMMITTING -> "저장 중" to MaterialTheme.colorScheme.primary
        DownloadState.COMPLETED -> "완료" to Ok
        DownloadState.DUPLICATE -> "중복(이미 있음)" to Ok
        DownloadState.PAUSED -> "일시정지" to Warn
        DownloadState.FAILED_RETRYABLE -> "재시도 대기" to Warn
        DownloadState.FAILED_PERMANENT -> "실패" to Bad
        DownloadState.CANCELLED -> "취소됨" to Bad
    }
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(j.displayName, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                StatusChip(label, color)
            }
            if (st == DownloadState.DOWNLOADING || st == DownloadState.PAUSED || st == DownloadState.WAITING_NETWORK) {
                Spacer(Modifier.height(6.dp))
                if (j.totalBytes > 0) {
                    LinearProgressIndicator(progress = { j.bytesDone.toFloat() / j.totalBytes }, modifier = Modifier.fillMaxWidth())
                } else if (st == DownloadState.DOWNLOADING) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                val parts = buildList {
                    add("${formatBytes(j.bytesDone)} / ${if (j.totalBytes > 0) formatBytes(j.totalBytes) else "크기 알 수 없음"}")
                    if (st == DownloadState.DOWNLOADING && speed != null && speed > 0) {
                        add("${formatBytes(speed)}/s")
                        if (j.totalBytes > 0) add("남은 시간 약 ${formatDuration((j.totalBytes - j.bytesDone) * 1000 / speed)}")
                    }
                }
                Text(parts.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            j.errorMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (st == DownloadState.DUPLICATE) Ok else Bad) }
            if (j.isAuto) Text("자동 매칭 다운로드", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Text("권한 근거: ${j.rightsNote}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row {
                when {
                    st == DownloadState.PAUSED || st == DownloadState.FAILED_PERMANENT || st == DownloadState.CANCELLED ->
                        TextButton(onClick = onResume) { Text(if (st == DownloadState.PAUSED) "재개" else "다시 시도") }
                    st.isActive -> TextButton(onClick = onPause) { Text("일시정지") }
                    else -> {}
                }
                if (st.isActive || st == DownloadState.PAUSED) TextButton(onClick = onCancel) { Text("취소") }
                if (!st.isActive) TextButton(onClick = onRemove) { Text("기록 삭제") }
            }
        }
    }
}


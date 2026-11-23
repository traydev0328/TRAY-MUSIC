package com.tray.music.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import com.tray.music.MainActivity
import com.tray.music.auth.AuthOutcome
import com.tray.music.ui.theme.Bad
import com.tray.music.ui.theme.Ok
import com.tray.music.ui.theme.Warn
import com.tray.music.youtube.SyncResult
import kotlinx.coroutines.launch

/** 동의가 필요하면 동의 화면을 띄운 뒤 한 번 더 시도 */
suspend fun connectGoogle(activity: MainActivity, container: AppContainer): SyncResult {
    val first = container.youtube.connectAndFetchMine()
    if (first !is SyncResult.NeedsConsent) return first
    return when (val o = activity.requestConsent(first.outcome)) {
        is AuthOutcome.Token -> {
            container.settings.setGoogleConnected(true)
            container.youtube.fetchMine(o.accessToken)
        }
        is AuthOutcome.Failed -> SyncResult.Failed(o.message)
        is AuthOutcome.NeedsConsent -> SyncResult.Failed("권한 승인이 완료되지 않았습니다.")
    }
}

fun describe(r: SyncResult): String = when (r) {
    is SyncResult.Ok -> "완료: ${r.count}개"
    is SyncResult.Failed -> r.message
    is SyncResult.NeedsConsent -> "Google 권한 승인이 필요합니다."
}

@Composable
fun YouTubeScreen(activity: MainActivity, container: AppContainer, onOpenPlaylist: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val playlists by container.youtube.playlists.collectAsStateWithLifecycle(emptyList())
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    val shared by activity.sharedText.collectAsStateWithLifecycle()

    var url by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(shared) {
        shared?.let { url = it; activity.sharedText.value = null }
    }

    LazyColumn(Modifier.fillMaxWidth()) {
        item { SectionTitle("YouTube 재생목록") }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text(
                    "곡 정보(메타데이터)만 가져오며, 재생은 YouTube 공식 앱/웹으로 연결됩니다. YouTube 오디오 추출·다운로드는 지원하지 않습니다.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = url, onValueChange = { url = it },
                    label = { Text("재생목록 URL 또는 ID") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(enabled = !busy && url.isNotBlank(), onClick = {
                        scope.launch {
                            busy = true; message = "불러오는 중…"
                            val r = container.youtube.addByUrl(url)
                            message = describe(r); busy = false
                            if (r is SyncResult.Ok) url = ""
                        }
                    }) { Text("등록·동기화") }
                    OutlinedButton(enabled = !busy, onClick = {
                        scope.launch {
                            busy = true; message = "Google 계정 연결 중…"
                            message = describe(connectGoogle(activity, container)); busy = false
                        }
                    }) { Text(if (policy?.googleConnected == true) "내 목록 새로고침" else "Google 연결") }
                    if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                }
                message?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { HorizontalDivider(Modifier.padding(vertical = 12.dp)) }
        if (playlists.isEmpty()) {
            item { Text("등록된 재생목록이 없습니다.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(playlists, key = { it.id }) { p ->
            Row(
                Modifier.fillMaxWidth().clickable { onOpenPlaylist(p.id) }.padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(p.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
                    Text("${if (p.ownerAccount == "mine") "내 계정" else "공개 URL"} · ${p.itemCount}곡 · ${formatTime(p.lastSyncedAt)}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                when (p.syncState) {
                    "OK" -> StatusChip("동기화됨", Ok)
                    "FAILED" -> StatusChip("실패", Bad)
                    "SYNCING" -> StatusChip("진행 중", Warn)
                    else -> StatusChip("미동기화", Warn)
                }
            }
        }
    }
}

@Composable
fun PlaylistDetailScreen(activity: MainActivity, container: AppContainer, id: String, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val playlist by remember(id) { container.youtube.playlist(id) }.collectAsStateWithLifecycle(null)
    val items by remember(id) { container.youtube.items(id) }.collectAsStateWithLifecycle(emptyList())
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun open(uri: String) = activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))

    LazyColumn(Modifier.fillMaxWidth()) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로") }
                Text(playlist?.title ?: "", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleLarge)
                IconButton(enabled = !busy, onClick = {
                    scope.launch { busy = true; message = describe(container.youtube.sync(id)); busy = false }
                }) { Icon(Icons.Filled.Refresh, contentDescription = "동기화") }
                IconButton(onClick = { open("https://www.youtube.com/playlist?list=$id") }) {
                    Icon(Icons.Filled.OpenInNew, contentDescription = "YouTube에서 열기")
                }
                IconButton(onClick = { scope.launch { container.youtube.remove(id); onBack() } }) {
                    Icon(Icons.Filled.Delete, contentDescription = "목록 등록 해제")
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                playlist?.let {
                    Text("${items.size}곡 · 마지막 동기화 ${formatTime(it.lastSyncedAt)}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    it.syncError?.let { e -> Text("최근 오류: $e", color = Bad, style = MaterialTheme.typography.bodySmall) }
                }
                if (busy) Text("동기화 중…", style = MaterialTheme.typography.bodySmall)
                message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                Text("허가된 음원 자동 매칭(Jamendo 등)은 P1 단계 기능으로 아직 구현되지 않았습니다.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(items, key = { it.playlistItemId }) { it2 ->
            Row(
                Modifier.fillMaxWidth()
                    .clickable(enabled = it2.status == "AVAILABLE") {
                        open("https://www.youtube.com/watch?v=${it2.videoId}&list=$id")
                    }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${it2.position + 1}", Modifier.padding(end = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(Modifier.weight(1f)) {
                    Text(it2.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(it2.channelTitle, maxLines = 1, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (it2.status == "AVAILABLE") StatusChip("유튜브 온라인 재생", Ok) else StatusChip("현재 접근 불가", Bad)
            }
        }
    }
}

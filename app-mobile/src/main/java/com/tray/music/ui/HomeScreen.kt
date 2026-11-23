package com.tray.music.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tray.music.AppContainer
import com.tray.music.data.db.DownloadState

@Composable
fun HomeScreen(container: AppContainer, library: LibraryHolder, onOpen: (String) -> Unit) {
    val playlists by container.youtube.playlists.collectAsStateWithLifecycle(emptyList())
    val jobs by container.downloads.jobs.collectAsStateWithLifecycle(emptyList())
    val recentFiles by remember { container.musicFiles.observeRecent(5) }.collectAsStateWithLifecycle(emptyList())

    val active = jobs.count { DownloadState.valueOf(it.state).isActive }
    val failed = jobs.count { it.state == DownloadState.FAILED_PERMANENT.name }

    LazyColumn(Modifier.fillMaxWidth()) {
        item { SectionTitle("TRAY MUSIC") }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("내 음악", "${library.tracks.size}곡", Modifier.weight(1f)) { onOpen("library") }
                StatCard("YouTube 목록", "${playlists.size}개", Modifier.weight(1f)) { onOpen("youtube") }
                StatCard("다운로드", if (failed > 0) "진행 $active · 실패 $failed" else "진행 $active", Modifier.weight(1f)) { onOpen("downloads") }
            }
        }
        item { SectionTitle("최근 다운로드") }
        if (recentFiles.isEmpty()) {
            item {
                Text("아직 다운로드한 파일이 없습니다. '다운로드' 탭에서 이용 권한이 있는 음악 URL을 추가하세요.",
                    Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(recentFiles, key = { it.fileId }) { f ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(f.displayName, style = MaterialTheme.typography.bodyLarge)
                Text("${formatBytes(f.size)} · ${formatTime(f.createdAt)}", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { SectionTitle("동기화 상태") }
        items(playlists.take(5), key = { it.id }) { p ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(p.title, style = MaterialTheme.typography.bodyLarge)
                Text("${p.syncState} · 마지막 동기화 ${formatTime(p.lastSyncedAt)}", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier, onClick: () -> Unit) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

package com.tray.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import com.tray.music.AppContainer
import com.tray.music.library.LocalTrack
import com.tray.music.playback.PlayerConnection
import com.tray.music.ui.theme.Accent
import kotlinx.coroutines.delay

private enum class LibGroup(val label: String) { ALL("전체 곡"), TRAY("TRAY 폴더"), ARTIST("아티스트"), ALBUM("앨범") }

@Composable
fun LibraryScreen(container: AppContainer, library: LibraryHolder, rescan: () -> Unit, onOpenPlayer: () -> Unit) {
    val ps by container.player.state.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf(LibGroup.ALL) }
    var selectedKey by remember { mutableStateOf<String?>(null) }

    val base = library.tracks.filter {
        query.isBlank() || it.title.contains(query, true) || it.artist.contains(query, true) || it.album.contains(query, true)
    }

    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("내 음악", Modifier.weight(1f))
            IconButton(onClick = rescan) { Icon(Icons.Filled.Refresh, contentDescription = "다시 검색") }
        }
        OutlinedTextField(query, { query = it }, label = { Text("제목·아티스트·앨범 검색") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp))
        LazyRow(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Spacer(Modifier.padding(start = 8.dp)) }
            items(LibGroup.entries) { g ->
                FilterChip(selected = group == g, onClick = { group = g; selectedKey = null }, label = { Text(g.label) })
            }
        }
        if (library.scanning) LinearProgressIndicator(Modifier.fillMaxWidth())
        library.error?.let { Text(it, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) }

        val list: List<LocalTrack> = when (group) {
            LibGroup.ALL -> base
            LibGroup.TRAY -> base.filter { it.isTrayFolder }
            LibGroup.ARTIST -> if (selectedKey == null) emptyList() else base.filter { it.artist == selectedKey }
            LibGroup.ALBUM -> if (selectedKey == null) emptyList() else base.filter { it.album == selectedKey }
        }

        if ((group == LibGroup.ARTIST || group == LibGroup.ALBUM) && selectedKey == null) {
            val keys = base.groupBy { if (group == LibGroup.ARTIST) it.artist else it.album }.toSortedMap()
            LazyColumn {
                items(keys.entries.toList(), key = { it.key }) { (k, v) ->
                    Row(Modifier.fillMaxWidth().clickable { selectedKey = k }.padding(16.dp, 12.dp)) {
                        Text(k.ifBlank { "(알 수 없음)" }, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${v.size}곡", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            return@Column
        }
        selectedKey?.let {
            Text("← $it", Modifier.clickable { selectedKey = null }.padding(16.dp, 4.dp), color = Accent)
        }
        if (list.isEmpty() && !library.scanning) {
            Text(
                "표시할 곡이 없습니다. 오디오 접근 권한을 허용했는지 확인하거나, 다운로드 탭에서 음악을 추가하세요.",
                Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyColumn {
            itemsIndexed(list, key = { _, t -> t.id }) { idx, t ->
                val playing = ps.currentMediaId == t.id.toString()
                Row(
                    Modifier.fillMaxWidth()
                        .clickable { container.player.playQueue(list, idx); onOpenPlayer() }
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.MusicNote, null, tint = if (playing) Accent else MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = if (playing) Accent else MaterialTheme.colorScheme.onSurface)
                        Text("${t.artist} · ${formatDuration(t.durationMs)}", maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
fun PlayerScreen(player: PlayerConnection, onBack: () -> Unit) {
    val s by player.state.collectAsStateWithLifecycle()
    var position by remember { mutableLongStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }

    // 재생 중일 때만 위치 갱신 (불필요한 리컴포지션 방지)
    LaunchedEffect(s.isPlaying, s.currentMediaId) {
        position = player.position()
        while (s.isPlaying) {
            position = player.position()
            delay(250)
        }
    }

    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth()) {
            IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로") }
        }
        Box(
            Modifier.fillMaxWidth(0.8f).aspectRatio(1f)
                .background(Brush.linearGradient(listOf(Accent, MaterialTheme.colorScheme.surfaceVariant)), RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.MusicNote, null, Modifier.size(96.dp)) }
        Spacer(Modifier.height(24.dp))
        if (!s.hasMedia) {
            Text("재생 중인 곡이 없습니다. '내 음악'에서 곡을 선택하세요.", textAlign = TextAlign.Center)
            return@Column
        }
        Text(s.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
            maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        Text(s.artist, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        val dur = s.durationMs.coerceAtLeast(1)
        Slider(
            value = if (dragging) dragValue else (position.toFloat() / dur).coerceIn(0f, 1f),
            onValueChange = { dragging = true; dragValue = it },
            onValueChangeFinished = {
                player.seekTo((dragValue * dur).toLong()); position = (dragValue * dur).toLong(); dragging = false
            },
        )
        Row(Modifier.fillMaxWidth()) {
            Text(formatDuration(if (dragging) (dragValue * dur).toLong() else position), style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.weight(1f))
            Text(formatDuration(s.durationMs), style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconButton(onClick = player::toggleShuffle) {
                Icon(Icons.Filled.Shuffle, "셔플", tint = if (s.shuffle) Accent else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = player::previous) { Icon(Icons.Filled.SkipPrevious, "이전", Modifier.size(36.dp)) }
            FilledIconButton(onClick = player::togglePlay, modifier = Modifier.size(72.dp)) {
                Icon(if (s.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "재생/일시정지", Modifier.size(40.dp))
            }
            IconButton(onClick = player::next) { Icon(Icons.Filled.SkipNext, "다음", Modifier.size(36.dp)) }
            IconButton(onClick = player::cycleRepeat) {
                Icon(
                    if (s.repeatMode == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat, "반복",
                    tint = if (s.repeatMode == Player.REPEAT_MODE_OFF) MaterialTheme.colorScheme.onSurfaceVariant else Accent,
                )
            }
        }
        s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
    }
}

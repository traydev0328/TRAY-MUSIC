package com.tray.music.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import com.tray.music.AppContainer
import com.tray.music.data.db.FavoriteEntity
import com.tray.music.library.LocalTrack
import com.tray.music.lyrics.LrcParser
import com.tray.music.lyrics.Lyrics
import com.tray.music.ui.theme.Accent
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.ln
import kotlin.math.pow

private enum class LibGroup(val label: String) {
    ALL("전체 곡"), FAV("즐겨찾기"), TRAY("TRAY 폴더"), ARTIST("아티스트"), ALBUM("앨범")
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LibraryScreen(container: AppContainer, library: LibraryHolder, rescan: () -> Unit, onOpenPlayer: () -> Unit) {
    val scope = rememberCoroutineScope()
    val ps by container.player.state.collectAsStateWithLifecycle()
    val favs by container.favorites.observeAll().collectAsStateWithLifecycle(emptyList())
    val favIds = remember(favs) { favs.map { it.mediaId }.toSet() }
    var query by remember { mutableStateOf("") }
    var group by remember { mutableStateOf(LibGroup.ALL) }
    var selectedKey by remember { mutableStateOf<String?>(null) }
    var menuFor by remember { mutableStateOf<LocalTrack?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

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
        message?.let { Text(it, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall) }

        val list: List<LocalTrack> = when (group) {
            LibGroup.ALL -> base
            LibGroup.FAV -> base.filter { it.id in favIds }
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
                if (group == LibGroup.FAV) "즐겨찾기한 곡이 없습니다. 곡을 길게 눌러 추가하세요."
                else "표시할 곡이 없습니다. 오디오 접근 권한을 허용했는지 확인하거나, 다운로드 탭에서 음악을 추가하세요.",
                Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        LazyColumn {
            itemsIndexed(list, key = { _, t -> t.id }) { idx, t ->
                val playing = ps.currentMediaId == t.id.toString()
                Box {
                    Row(
                        Modifier.fillMaxWidth()
                            .combinedClickable(
                                onClick = { container.player.playQueue(list, idx); onOpenPlayer() },
                                onLongClick = { menuFor = t },
                            )
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
                        if (t.id in favIds) Icon(Icons.Filled.Favorite, "즐겨찾기", tint = Accent, modifier = Modifier.size(18.dp))
                    }
                    DropdownMenu(expanded = menuFor?.id == t.id, onDismissRequest = { menuFor = null }) {
                        DropdownMenuItem(
                            text = { Text(if (t.id in favIds) "즐겨찾기 해제" else "즐겨찾기 추가") },
                            onClick = {
                                scope.launch {
                                    if (t.id in favIds) container.favorites.remove(t.id)
                                    else container.favorites.add(FavoriteEntity(t.id, t.title, System.currentTimeMillis()))
                                }
                                menuFor = null
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("워치로 보내기") },
                            onClick = {
                                menuFor = null
                                scope.launch {
                                    message = runCatching {
                                        val nodes = container.watch.nodes().filter { it.approved }
                                        if (nodes.isEmpty()) "승인된 워치가 없습니다. 설정 → 워치에서 연결·승인하세요."
                                        else {
                                            nodes.forEach { n -> container.watch.enqueue(n.id, t.id, t.title, t.artist) }
                                            "'${t.title}' 워치 전송 대기열에 추가 (${nodes.size}대)"
                                        }
                                    }.getOrElse { "워치 확인 실패: ${it.message}" }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

private enum class Panel { ART, LYRICS, FX }

@Composable
fun PlayerScreen(container: AppContainer, onBack: () -> Unit) {
    val player = container.player
    val s by player.state.collectAsStateWithLifecycle()
    val favs by container.favorites.observeAll().collectAsStateWithLifecycle(emptyList())
    val scope = rememberCoroutineScope()
    var position by remember { mutableLongStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var dragValue by remember { mutableFloatStateOf(0f) }
    var panel by remember { mutableStateOf(Panel.ART) }
    val mediaId = s.currentMediaId
    val isFav = mediaId?.toLongOrNull()?.let { id -> favs.any { it.mediaId == id } } == true

    LaunchedEffect(s.isPlaying, s.currentMediaId) {
        position = player.position()
        while (s.isPlaying) {
            position = player.position()
            delay(200)
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = "뒤로") }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { panel = if (panel == Panel.LYRICS) Panel.ART else Panel.LYRICS }, enabled = mediaId != null) {
                Icon(Icons.Filled.Lyrics, "가사", tint = if (panel == Panel.LYRICS) Accent else MaterialTheme.colorScheme.onSurface)
            }
            IconButton(onClick = { panel = if (panel == Panel.FX) Panel.ART else Panel.FX }) {
                Icon(Icons.Filled.Tune, "이퀄라이저·효과", tint = if (panel == Panel.FX) Accent else MaterialTheme.colorScheme.onSurface)
            }
            IconButton(enabled = mediaId?.toLongOrNull() != null, onClick = {
                val id = mediaId?.toLongOrNull()
                if (id != null) scope.launch {
                    if (isFav) container.favorites.remove(id)
                    else container.favorites.add(FavoriteEntity(id, s.title, System.currentTimeMillis()))
                }
            }) {
                Icon(if (isFav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "즐겨찾기",
                    tint = if (isFav) Accent else MaterialTheme.colorScheme.onSurface)
            }
        }

        Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            when (panel) {
                Panel.ART -> ArtAndVisualizer(container, s.isPlaying)
                Panel.LYRICS -> if (mediaId != null) LyricsPanel(container, mediaId, position) { player.seekTo(it); position = it }
                Panel.FX -> FxPanel(container)
            }
        }

        if (!s.hasMedia) {
            Text("재생 중인 곡이 없습니다. '내 음악'에서 곡을 선택하세요.", textAlign = TextAlign.Center)
            Spacer(Modifier.height(24.dp))
            return@Column
        }
        Text(s.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        Text(s.artist, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
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
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconButton(onClick = player::toggleShuffle) {
                Icon(Icons.Filled.Shuffle, "셔플", tint = if (s.shuffle) Accent else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = player::previous) { Icon(Icons.Filled.SkipPrevious, "이전", Modifier.size(36.dp)) }
            FilledIconButton(onClick = player::togglePlay, modifier = Modifier.size(68.dp)) {
                Icon(if (s.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "재생/일시정지", Modifier.size(38.dp))
            }
            IconButton(onClick = player::next) { Icon(Icons.Filled.SkipNext, "다음", Modifier.size(36.dp)) }
            IconButton(onClick = player::cycleRepeat) {
                Icon(
                    if (s.repeatMode == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat, "반복",
                    tint = if (s.repeatMode == Player.REPEAT_MODE_OFF) MaterialTheme.colorScheme.onSurfaceVariant else Accent,
                )
            }
        }
        s.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(12.dp))
    }
}

/** 앨범아트 자리 + 실시간 스펙트럼 (RECORD_AUDIO 허용 + 재생 중 + 화면 표시 중일 때만 동작) */
@Composable
private fun ArtAndVisualizer(container: AppContainer, playing: Boolean) {
    val ctx = LocalContext.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    }
    var enabled by remember { mutableStateOf(false) }
    var mags by remember { mutableStateOf(FloatArray(0)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        if (ok) enabled = true
    }

    DisposableEffect(enabled, granted, playing) {
        val v = if (enabled && granted && playing) container.audioFx.startVisualizer { mags = it } else null
        onDispose { runCatching { v?.enabled = false; v?.release() } }
    }

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth(0.78f).aspectRatio(1f)
                .background(Brush.linearGradient(listOf(Accent, MaterialTheme.colorScheme.surfaceVariant)), RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) {
            if (enabled && granted && mags.isNotEmpty()) {
                val data = mags
                Canvas(Modifier.fillMaxSize().padding(16.dp)) {
                    val bars = 32
                    val usable = data.size.coerceAtLeast(2)
                    val bw = size.width / bars
                    for (b in 0 until bars) {
                        // 로그 스케일 주파수 구간
                        val from = (usable * (2.0.pow(b * 9.0 / bars) - 1) / 511).toInt().coerceIn(1, usable - 1)
                        val to = (usable * (2.0.pow((b + 1) * 9.0 / bars) - 1) / 511).toInt().coerceIn(from + 1, usable)
                        var m = 0f
                        for (k in from until to) m = maxOf(m, data[k])
                        val h = (ln(1f + m) / ln(181f)).coerceIn(0f, 1f) * size.height
                        drawRect(
                            color = Color.White.copy(alpha = 0.85f),
                            topLeft = Offset(b * bw + bw * 0.15f, size.height - h),
                            size = Size(bw * 0.7f, h),
                        )
                    }
                }
            } else {
                Icon(Icons.Filled.MusicNote, null, Modifier.size(96.dp))
            }
        }
        TextButton(onClick = {
            if (!granted) launcher.launch(Manifest.permission.RECORD_AUDIO) else enabled = !enabled
        }) {
            Icon(Icons.Filled.GraphicEq, null)
            Text(if (enabled && granted) " 시각화 끄기" else " 오디오 시각화 켜기")
        }
        if (!granted) Text("시각화는 재생 출력 분석을 위해 '마이크' 권한이 필요합니다(녹음하지 않음).",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@Composable
private fun LyricsPanel(container: AppContainer, mediaId: String, position: Long, onSeek: (Long) -> Unit) {
    var lyrics by remember(mediaId) { mutableStateOf<Lyrics?>(container.lyrics.load(mediaId)) }
    var offset by remember(mediaId) { mutableLongStateOf(container.lyrics.userOffset(mediaId)) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching { container.lyrics.import(mediaId, uri) }
                .onSuccess { lyrics = it; error = null }
                .onFailure { error = it.message }
        }
    }
    val l = lyrics
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        if (l == null) {
            Spacer(Modifier.weight(1f))
            Text("가사가 없습니다.", style = MaterialTheme.typography.titleMedium)
            Text("직접 가지고 있는 .lrc(동기화) 또는 .txt 가사 파일을 가져올 수 있습니다.",
                style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            TextButton(onClick = { picker.launch(arrayOf("text/*", "application/octet-stream")) }) { Text("가사 파일 가져오기") }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.weight(1f))
            return@Column
        }
        val current = LrcParser.indexAt(l, position, offset)
        val listState = rememberLazyListState()
        LaunchedEffect(current) { if (current >= 0) listState.animateScrollToItem((current - 3).coerceAtLeast(0)) }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, horizontalAlignment = Alignment.CenterHorizontally) {
            itemsIndexed(l.lines) { i, line ->
                Text(
                    line.text.ifBlank { "♪" },
                    modifier = Modifier.fillMaxWidth()
                        .clickable(enabled = l.synced) { onSeek((line.timeMs - l.fileOffsetMs - offset).coerceAtLeast(0)) }
                        .padding(vertical = 6.dp),
                    textAlign = TextAlign.Center,
                    style = if (i == current) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                    fontWeight = if (i == current) FontWeight.Bold else FontWeight.Normal,
                    color = if (i == current) Accent else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (l.synced) Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { offset -= 500; container.lyrics.setUserOffset(mediaId, offset) }) { Text("-0.5초") }
            Text("싱크 ${"%+.1f".format(offset / 1000f)}초", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { offset += 500; container.lyrics.setUserOffset(mediaId, offset) }) { Text("+0.5초") }
            TextButton(onClick = { container.lyrics.remove(mediaId); lyrics = null; offset = 0 }) { Text("삭제") }
        }
    }
}

@Composable
private fun FxPanel(container: AppContainer) {
    val fx by container.audioFx.state.collectAsStateWithLifecycle()
    val policy by container.settings.policy.collectAsStateWithLifecycle(null)
    val scope = rememberCoroutineScope()
    var presetMenu by remember { mutableStateOf(false) }
    var speed by remember(policy?.playbackSpeed) { mutableFloatStateOf(policy?.playbackSpeed ?: 1f) }
    var pitch by remember(policy?.playbackPitch) { mutableFloatStateOf(policy?.playbackPitch ?: 1f) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        if (!fx.available) {
            Text(fx.error ?: "곡을 재생하면 이 기기의 이퀄라이저를 사용할 수 있습니다.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("이퀄라이저 (기기 제공 ${fx.bands.size}밴드)", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                Switch(fx.enabled, { container.audioFx.setEnabled(it) })
            }
            Box {
                TextButton(onClick = { presetMenu = true }, enabled = fx.presets.isNotEmpty()) {
                    Text("프리셋: ${fx.presets.getOrNull(fx.currentPreset) ?: "사용자 설정"}")
                }
                DropdownMenu(presetMenu, { presetMenu = false }) {
                    fx.presets.forEachIndexed { i, name ->
                        DropdownMenuItem(text = { Text(name) }, onClick = { container.audioFx.usePreset(i); presetMenu = false })
                    }
                }
            }
            fx.bands.forEach { b ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (b.centerHz >= 1000) "${b.centerHz / 1000}k" else "${b.centerHz}", Modifier.size(width = 44.dp, height = 20.dp),
                        style = MaterialTheme.typography.bodySmall)
                    Slider(
                        value = b.levelMb.toFloat(),
                        onValueChange = { container.audioFx.setBand(b.index, it.toInt()) },
                        valueRange = fx.minMb.toFloat()..fx.maxMb.toFloat(),
                        enabled = fx.enabled, modifier = Modifier.weight(1f),
                    )
                    Text("${"%+.1f".format(b.levelMb / 100f)}dB", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (fx.bassSupported) {
                Text("베이스 부스트")
                Slider(fx.bassStrength.toFloat(), { container.audioFx.setBass(it.toInt()) }, valueRange = 0f..1000f, enabled = fx.enabled)
            }
            Text("음량 보정 (+${"%.1f".format(fx.loudnessGainMb / 100f)}dB)")
            Slider(fx.loudnessGainMb.toFloat(), { container.audioFx.setLoudness(it.toInt()) }, valueRange = 0f..1200f, enabled = fx.enabled)
        }
        Spacer(Modifier.height(8.dp))
        Text("재생 속도 ${"%.2f".format(speed)}x", fontWeight = FontWeight.Bold)
        Slider(speed, { speed = it }, valueRange = 0.5f..2f, onValueChangeFinished = {
            container.player.setPlaybackParameters(speed, pitch); scope.launch { container.settings.setSpeed(speed) }
        })
        Text("피치 ${"%.2f".format(pitch)}")
        Slider(pitch, { pitch = it }, valueRange = 0.5f..2f, onValueChangeFinished = {
            container.player.setPlaybackParameters(speed, pitch); scope.launch { container.settings.setPitch(pitch) }
        })
        TextButton(onClick = {
            speed = 1f; pitch = 1f; container.player.setPlaybackParameters(1f, 1f)
            scope.launch { container.settings.setSpeed(1f); container.settings.setPitch(1f) }
        }) { Text("속도·피치 초기화") }
        Text("크로스페이드는 미구현입니다(단일 플레이어 구조상 이중 디코딩 필요). Gapless 는 파일 정보가 있을 때 자동 적용됩니다.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

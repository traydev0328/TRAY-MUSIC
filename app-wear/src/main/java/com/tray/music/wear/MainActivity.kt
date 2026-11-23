package com.tray.music.wear

import android.media.AudioManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SdStorage
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.Watch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.tray.music.wear.link.WearProtocol
import com.tray.music.wear.playback.WearPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

private val TrayColors = Colors(primary = Color(0xFF7C6CFF), secondary = Color(0xFF4FD1FF))

class MainActivity : ComponentActivity() {
    private lateinit var player: WearPlayer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        player = WearPlayer(this).also { it.connect() }
        setContent { MaterialTheme(colors = TrayColors) { WearRoot(this, player) } }
    }

    override fun onDestroy() { player.release(); super.onDestroy() }

    fun adjustVolume(up: Boolean) {
        getSystemService(AudioManager::class.java).adjustStreamVolume(
            AudioManager.STREAM_MUSIC, if (up) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
    }
}

@Composable
private fun WearRoot(activity: MainActivity, player: WearPlayer) {
    val nav = rememberSwipeDismissableNavController()
    SwipeDismissableNavHost(navController = nav, startDestination = "home") {
        composable("home") { Home(activity, player) { nav.navigate(it) } }
        composable("library") { Library(activity, player) { nav.navigate("player") } }
        composable("player") { PlayerScreen(activity, player) }
        composable("storage") { Storage(activity) }
        composable("remote") { Remote(activity) }
    }
}

@Composable
private fun ListScreen(content: androidx.wear.compose.foundation.lazy.ScalingLazyListScope.() -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(timeText = { TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = state) }) {
        ScalingLazyColumn(Modifier.fillMaxSize(), state = state, content = content)
    }
}

@Composable
private fun Home(activity: MainActivity, player: WearPlayer, go: (String) -> Unit) {
    val s by player.state.collectAsStateWithLifecycle()
    ListScreen {
        item { ListHeader { Text("TRAY MUSIC") } }
        if (s.hasMedia) item {
            Chip(onClick = { go("player") }, label = { Text("지금 재생", maxLines = 1) },
                secondaryLabel = { Text(s.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                icon = { Icon(if (s.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null) },
                modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = { go("library") }, label = { Text("워치 음악 (독립 재생)") },
                icon = { Icon(Icons.Filled.LibraryMusic, null) }, modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = { player.stop(); go("remote") }, label = { Text("휴대폰 리모컨") },
                secondaryLabel = { Text("휴대폰 재생 제어") },
                icon = { Icon(Icons.Filled.PhoneAndroid, null) }, colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth())
        }
        item {
            Chip(onClick = { go("storage") }, label = { Text("전송·저장공간") },
                icon = { Icon(Icons.Filled.SdStorage, null) }, colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun Library(activity: MainActivity, player: WearPlayer, openPlayer: () -> Unit) {
    val app = WearApp.from(activity)
    val tracks by app.db.dao().observeTracks().collectAsStateWithLifecycle(emptyList())
    val s by player.state.collectAsStateWithLifecycle()
    ListScreen {
        item { ListHeader { Text("워치 음악 ${tracks.size}곡") } }
        if (tracks.isEmpty()) item {
            Text("저장된 곡이 없습니다.\n휴대폰 TRAY MUSIC에서 '워치로 보내기'를 사용하세요.",
                textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp))
        }
        items(tracks, key = { it.sha256 }) { t ->
            Chip(
                onClick = { player.play(tracks, tracks.indexOf(t)); openPlayer() },
                label = { Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(t.artist.ifBlank { "${t.size shr 20}MB" }, maxLines = 1) },
                colors = if (s.currentId == t.sha256) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PlayerScreen(activity: MainActivity, player: WearPlayer) {
    val s by player.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.playing) { while (s.playing) { player.refreshPosition(); delay(1000) } }
    Scaffold(timeText = { TimeText() }) {
        Column(Modifier.fillMaxSize().padding(horizontal = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text(if (s.hasMedia) s.title else "재생 중인 곡 없음", maxLines = 2, overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center, style = MaterialTheme.typography.title3)
            Text(s.artist, maxLines = 1, style = MaterialTheme.typography.caption2, color = MaterialTheme.colors.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Button(onClick = player::prev, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.SkipPrevious, "이전") }
                Button(onClick = player::toggle, modifier = Modifier.size(56.dp)) {
                    Icon(if (s.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, "재생/일시정지") }
                Button(onClick = player::next, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.SkipNext, "다음") }
            }
            Spacer(Modifier.height(4.dp))
            VolumeRow(activity)
            if (s.durationMs > 0) Text("${fmt(s.positionMs)} / ${fmt(s.durationMs)}", style = MaterialTheme.typography.caption3)
        }
    }
}

@Composable
private fun VolumeRow(activity: MainActivity) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { activity.adjustVolume(false) }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(32.dp)) {
            Icon(Icons.Filled.VolumeDown, "볼륨 낮추기") }
        Button(onClick = { activity.adjustVolume(true) }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(32.dp)) {
            Icon(Icons.Filled.VolumeUp, "볼륨 높이기") }
    }
}

@Composable
private fun Remote(activity: MainActivity) {
    val app = WearApp.from(activity)
    val np by app.nowPlaying.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var connected by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(Unit) {
        connected = app.phoneNodeId() != null
        app.sendToPhone(WearProtocol.NOW_PLAYING_REQ)
    }
    fun cmd(c: String) = scope.launch { connected = app.sendToPhone(WearProtocol.REMOTE, JSONObject().put("cmd", c)) }

    Scaffold(timeText = { TimeText() }) {
        Column(Modifier.fillMaxSize().padding(horizontal = 14.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Icon(Icons.Filled.PhoneAndroid, null, modifier = Modifier.size(18.dp))
            when (connected) {
                null -> CircularProgressIndicator(Modifier.size(24.dp))
                false -> Text("휴대폰 연결 안 됨", color = Color(0xFFFF5D73), textAlign = TextAlign.Center)
                true -> {
                    Text(np.title.ifBlank { "휴대폰 재생 정보 없음" }, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center, style = MaterialTheme.typography.title3)
                    Text(np.artist, maxLines = 1, style = MaterialTheme.typography.caption2)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Button(onClick = { cmd("prev") }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.SkipPrevious, "이전") }
                Button(onClick = { cmd("toggle") }, modifier = Modifier.size(56.dp)) {
                    Icon(if (np.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, "재생/일시정지") }
                Button(onClick = { cmd("next") }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Filled.SkipNext, "다음") }
            }
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { cmd("vol_down") }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Filled.VolumeDown, "휴대폰 볼륨 낮추기") }
                Button(onClick = { cmd("vol_up") }, colors = ButtonDefaults.secondaryButtonColors(), modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Filled.VolumeUp, "휴대폰 볼륨 높이기") }
            }
        }
    }
}

@Composable
private fun Storage(activity: MainActivity) {
    val app = WearApp.from(activity)
    val dao = app.db.dao()
    val tracks by dao.observeTracks().collectAsStateWithLifecycle(emptyList())
    val offers by dao.observeOffers().collectAsStateWithLifecycle(emptyList())
    val receiving by app.receiving.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var info by remember { mutableStateOf(app.storageInfo()) }
    var confirmDelete by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(tracks.size, offers.size) { info = app.storageInfo() }

    ListScreen {
        item { ListHeader { Text("저장공간") } }
        item {
            Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("여유 ${info.free shr 20}MB / ${info.total shr 20}MB", style = MaterialTheme.typography.caption1)
                Text("TRAY 음악 ${info.used shr 20}MB · ${tracks.size}곡", style = MaterialTheme.typography.caption2)
                Text("배터리 ${info.battery}%${if (info.charging) " 충전 중" else ""}", style = MaterialTheme.typography.caption2)
                Text("30% 미만이면 휴대폰이 전송을 보류합니다", style = MaterialTheme.typography.caption3,
                    color = MaterialTheme.colors.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
        if (offers.isNotEmpty()) item { ListHeader { Text("수신 중/대기 ${offers.size}") } }
        items(offers, key = { it.id }) { o ->
            val got = File(app.partDir, "${o.id}.part").length()
            Chip(onClick = {}, label = { Text(o.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text("${got * 100 / o.size.coerceAtLeast(1)}%${if (o.id in receiving) " 수신 중" else " 대기"}") },
                icon = { Icon(Icons.Filled.Watch, null) }, colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth())
        }
        item { ListHeader { Text("곡 삭제 (두 번 눌러 확인)") } }
        items(tracks, key = { "d_" + it.sha256 }) { t ->
            Chip(
                onClick = {
                    if (confirmDelete == t.sha256) {
                        scope.launch {
                            File(t.path).delete(); dao.deleteTrack(t.sha256); confirmDelete = null; info = app.storageInfo()
                        }
                    } else confirmDelete = t.sha256
                },
                label = { Text(if (confirmDelete == t.sha256) "삭제하려면 다시 누르기" else t.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text("${t.size shr 20}MB") },
                icon = { Icon(Icons.Filled.Delete, null) },
                colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun fmt(ms: Long): String { val s = ms / 1000; return "%d:%02d".format(s / 60, s % 60) }

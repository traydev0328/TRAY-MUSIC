package com.tray.music.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlaylistPlay
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tray.music.MainActivity
import com.tray.music.TrayApp
import com.tray.music.library.LocalTrack
import kotlinx.coroutines.launch

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab("home", "홈", Icons.Filled.Home),
    Tab("youtube", "YouTube", Icons.Filled.PlaylistPlay),
    Tab("downloads", "다운로드", Icons.Filled.Download),
    Tab("library", "내 음악", Icons.Filled.LibraryMusic),
    Tab("settings", "설정", Icons.Filled.Settings),
)

/** 화면 간에 공유하는 보관함 스캔 상태 */
class LibraryHolder {
    var tracks by mutableStateOf<List<LocalTrack>>(emptyList())
    var scanning by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

fun audioPermission(): String =
    if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
    else Manifest.permission.READ_EXTERNAL_STORAGE

@Composable
fun TrayRoot(activity: MainActivity) {
    val container = (activity.application as TrayApp).container
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val library = remember { LibraryHolder() }

    val rescan: () -> Unit = {
        scope.launch {
            library.scanning = true
            library.error = null
            runCatching { container.library.scan() }
                .onSuccess { library.tracks = it }
                .onFailure { library.error = "음악 검색 실패: ${it.message}" }
            library.scanning = false
        }
    }

    // 첫 실행: 알림(13+) + 오디오 읽기 권한 요청 후 스캔. 거부해도 앱이 저장한 파일은 보인다.
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { rescan() }
    LaunchedEffect(Unit) {
        val perms = buildList {
            add(audioPermission())
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permLauncher.launch(perms.toTypedArray())
    }

    // 공유로 들어온 링크 → YouTube 화면
    val shared by activity.sharedText.collectAsStateWithLifecycle()
    LaunchedEffect(shared) { if (shared != null) nav.navigate("youtube") { launchSingleTop = true } }

    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            Column {
                if (route != "player") MiniPlayer(container.player) { nav.navigate("player") }
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    tabs.forEach { t ->
                        NavigationBarItem(
                            selected = route == t.route,
                            onClick = { nav.navigateTab(t.route) },
                            icon = { Icon(t.icon, contentDescription = t.label) },
                            label = { Text(t.label, maxLines = 1) },
                        )
                    }
                }
            }
        },
    ) { pad ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(pad).fillMaxSize()) {
            composable("home") { HomeScreen(container, library, onOpen = { nav.navigateTab(it) }) }
            composable("youtube") { YouTubeScreen(activity, container, onOpenPlaylist = { nav.navigate("playlist/$it") }) }
            composable("playlist/{id}") { e ->
                PlaylistDetailScreen(activity, container, e.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
            }
            composable("downloads") { DownloadsScreen(container, onCompleted = rescan) }
            composable("library") { LibraryScreen(container, library, rescan, onOpenPlayer = { nav.navigate("player") }) }
            composable("settings") { SettingsScreen(activity, container, library, rescan) }
            composable("player") { PlayerScreen(container.player, onBack = { nav.popBackStack() }) }
        }
    }
}

private fun NavHostController.navigateTab(route: String) = navigate(route) {
    popUpTo("home") { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@Composable
private fun MiniPlayer(player: com.tray.music.playback.PlayerConnection, onOpen: () -> Unit) {
    val s by player.state.collectAsStateWithLifecycle()
    if (!s.hasMedia) return
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.weight(1f)) {
            Column {
                Text(s.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
                Text(s.artist, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        IconButton(onClick = player::togglePlay) {
            Icon(if (s.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = "재생/일시정지")
        }
        IconButton(onClick = player::next) { Icon(Icons.Filled.SkipNext, contentDescription = "다음 곡") }
    }
}

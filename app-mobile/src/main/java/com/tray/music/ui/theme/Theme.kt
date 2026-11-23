package com.tray.music.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Accent = Color(0xFF7C6CFF)
val Surface0 = Color(0xFF0E0F13)
val Surface1 = Color(0xFF171920)
val Surface2 = Color(0xFF20232C)
val Ok = Color(0xFF3DDC97)
val Warn = Color(0xFFFFB648)
val Bad = Color(0xFFFF5D73)

private val scheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    secondary = Color(0xFF4FD1FF),
    background = Surface0,
    onBackground = Color(0xFFECEDF2),
    surface = Surface1,
    onSurface = Color(0xFFECEDF2),
    surfaceVariant = Surface2,
    onSurfaceVariant = Color(0xFFA6A9B6),
    surfaceContainer = Surface1,
    surfaceContainerHigh = Surface2,
    error = Bad,
)

/** 기획서 기준: 기본 다크 테마 */
@Composable
fun TrayTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, content = content)
}

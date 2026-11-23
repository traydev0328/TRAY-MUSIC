package com.tray.music.lyrics

import android.content.Context
import android.net.Uri
import java.io.File

data class LyricLine(val timeMs: Long, val text: String)

data class Lyrics(val lines: List<LyricLine>, val synced: Boolean, val fileOffsetMs: Long)

/** LRC 파서: [mm:ss.xx] 여러 태그, [offset:±ms], 시간 없는 일반 텍스트(비동기 가사) 지원 */
object LrcParser {
    private val TAG = Regex("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?]")
    private val OFFSET = Regex("\\[offset:\\s*([+-]?\\d+)]", RegexOption.IGNORE_CASE)

    fun parse(text: String): Lyrics {
        var offset = 0L
        val out = mutableListOf<LyricLine>()
        val plain = mutableListOf<String>()
        for (raw in text.lineSequence()) {
            val line = raw.trim().removePrefix("﻿")
            OFFSET.find(line)?.let { offset = it.groupValues[1].toLong(); return@let }
            val tags = TAG.findAll(line).toList()
            if (tags.isEmpty()) {
                if (line.isNotBlank() && !Regex("^\\[[a-zA-Z]+:.*]$").matches(line)) plain += line
                continue
            }
            val body = line.substring(tags.last().range.last + 1).trim()
            for (t in tags) {
                val min = t.groupValues[1].toLong()
                val sec = t.groupValues[2].toLong()
                val fracStr = t.groupValues[3]
                val frac = when (fracStr.length) { 0 -> 0L; 1 -> fracStr.toLong() * 100; 2 -> fracStr.toLong() * 10; else -> fracStr.take(3).toLong() }
                out += LyricLine(min * 60_000 + sec * 1000 + frac, body)
            }
        }
        return if (out.isNotEmpty()) Lyrics(out.sortedBy { it.timeMs }, true, offset)
        else Lyrics(plain.map { LyricLine(-1, it) }, false, 0)
    }

    /** 현재 위치에 해당하는 줄 인덱스 (LRC offset 양수 = 가사를 앞당김) */
    fun indexAt(l: Lyrics, positionMs: Long, userOffsetMs: Long): Int {
        if (!l.synced) return -1
        val t = positionMs + l.fileOffsetMs + userOffsetMs
        var lo = 0; var hi = l.lines.size - 1; var ans = -1
        while (lo <= hi) {
            val mid = (lo + hi) / 2
            if (l.lines[mid].timeMs <= t) { ans = mid; lo = mid + 1 } else hi = mid - 1
        }
        return ans
    }
}

/** 곡별 가사 저장소 (사용자가 가져온 LRC/텍스트만 사용 — 외부 크롤링 없음) */
class LyricsStore(private val context: Context) {
    private val dir get() = File(context.filesDir, "lyrics").apply { mkdirs() }
    private val prefs = context.getSharedPreferences("lyrics_offset", Context.MODE_PRIVATE)

    fun load(mediaId: String): Lyrics? {
        val f = File(dir, "$mediaId.lrc")
        return if (f.exists()) LrcParser.parse(f.readText()) else null
    }

    fun import(mediaId: String, uri: Uri): Lyrics {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IllegalStateException("파일을 열 수 없습니다.")
        if (bytes.size > 512 * 1024) throw IllegalStateException("가사 파일이 너무 큽니다.")
        val text = String(bytes, Charsets.UTF_8)
        val parsed = LrcParser.parse(text)
        if (parsed.lines.isEmpty()) throw IllegalStateException("가사 내용이 없습니다.")
        File(dir, "$mediaId.lrc").writeText(text)
        return parsed
    }

    fun remove(mediaId: String) { File(dir, "$mediaId.lrc").delete(); prefs.edit().remove(mediaId).apply() }
    fun userOffset(mediaId: String): Long = prefs.getLong(mediaId, 0)
    fun setUserOffset(mediaId: String, ms: Long) = prefs.edit().putLong(mediaId, ms).apply()
}

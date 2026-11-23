package com.tray.music.audiofx

import android.content.Context
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Visualizer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class EqBand(val index: Short, val centerHz: Int, val levelMb: Int)

data class AudioFxState(
    val available: Boolean = false,
    val enabled: Boolean = false,
    val bands: List<EqBand> = emptyList(),
    val minMb: Int = -1500,
    val maxMb: Int = 1500,
    val presets: List<String> = emptyList(),
    val currentPreset: Int = -1,
    val bassSupported: Boolean = false,
    val bassStrength: Int = 0,          // 0..1000
    val loudnessGainMb: Int = 0,        // 0..1500 (음량 보정)
    val error: String? = null,
)

/**
 * 기기 내장 오디오 효과 (Equalizer/BassBoost/LoudnessEnhancer).
 * 밴드 수는 기기마다 다르며(보통 5밴드), 정확한 10밴드는 보장하지 않는다 → 기기가 제공하는 밴드만 표시.
 * 설정값은 SharedPreferences 에 저장해 다음 재생 세션에 다시 적용한다.
 */
class AudioFx(context: Context) {
    private val prefs = context.getSharedPreferences("audiofx", Context.MODE_PRIVATE)
    private var eq: Equalizer? = null
    private var bass: BassBoost? = null
    private var loud: LoudnessEnhancer? = null
    private val _state = MutableStateFlow(AudioFxState())
    val state: StateFlow<AudioFxState> = _state.asStateFlow()
    var sessionId: Int = 0
        private set

    @Synchronized
    fun attach(audioSessionId: Int) {
        if (audioSessionId == 0 || audioSessionId == sessionId) return
        release()
        sessionId = audioSessionId
        try {
            val e = Equalizer(0, audioSessionId)
            eq = e
            val range = e.bandLevelRange
            bass = runCatching { BassBoost(0, audioSessionId) }.getOrNull()
            loud = runCatching { LoudnessEnhancer(audioSessionId) }.getOrNull()
            val enabled = prefs.getBoolean("enabled", false)
            val preset = prefs.getInt("preset", -1)
            if (preset in 0 until e.numberOfPresets) e.usePreset(preset.toShort())
            for (i in 0 until e.numberOfBands) {
                val saved = prefs.getInt("band_$i", Int.MIN_VALUE)
                if (preset < 0 && saved != Int.MIN_VALUE) e.setBandLevel(i.toShort(), saved.toShort())
            }
            bass?.let { b -> if (b.strengthSupported) b.setStrength(prefs.getInt("bass", 0).toShort()) }
            loud?.setTargetGain(prefs.getInt("loud", 0))
            applyEnabled(enabled)
            _state.value = AudioFxState(
                available = true,
                enabled = enabled,
                bands = readBands(e),
                minMb = range[0].toInt(),
                maxMb = range[1].toInt(),
                presets = (0 until e.numberOfPresets).map { e.getPresetName(it.toShort()) },
                currentPreset = preset,
                bassSupported = bass?.strengthSupported == true,
                bassStrength = prefs.getInt("bass", 0),
                loudnessGainMb = prefs.getInt("loud", 0),
            )
        } catch (t: Throwable) {
            release()
            _state.value = AudioFxState(available = false, error = "이 기기/세션에서 오디오 효과를 사용할 수 없습니다: ${t.message}")
        }
    }

    private fun readBands(e: Equalizer) = (0 until e.numberOfBands).map {
        EqBand(it.toShort(), e.getCenterFreq(it.toShort()) / 1000, e.getBandLevel(it.toShort()).toInt())
    }

    private fun applyEnabled(on: Boolean) {
        eq?.enabled = on
        bass?.enabled = on && prefs.getInt("bass", 0) > 0
        loud?.enabled = on && prefs.getInt("loud", 0) > 0
    }

    @Synchronized fun setEnabled(on: Boolean) {
        prefs.edit().putBoolean("enabled", on).apply()
        runCatching { applyEnabled(on) }
        _state.value = _state.value.copy(enabled = on)
    }

    @Synchronized fun setBand(index: Short, mb: Int) {
        val e = eq ?: return
        runCatching { e.setBandLevel(index, mb.toShort()) }
        prefs.edit().putInt("band_$index", mb).putInt("preset", -1).apply()
        _state.value = _state.value.copy(bands = readBands(e), currentPreset = -1)
    }

    @Synchronized fun usePreset(p: Int) {
        val e = eq ?: return
        runCatching { e.usePreset(p.toShort()) }
        prefs.edit().putInt("preset", p).apply()
        _state.value = _state.value.copy(bands = readBands(e), currentPreset = p)
    }

    @Synchronized fun setBass(strength: Int) {
        prefs.edit().putInt("bass", strength).apply()
        bass?.let { runCatching { it.setStrength(strength.toShort()); it.enabled = _state.value.enabled && strength > 0 } }
        _state.value = _state.value.copy(bassStrength = strength)
    }

    @Synchronized fun setLoudness(gainMb: Int) {
        prefs.edit().putInt("loud", gainMb).apply()
        loud?.let { runCatching { it.setTargetGain(gainMb); it.enabled = _state.value.enabled && gainMb > 0 } }
        _state.value = _state.value.copy(loudnessGainMb = gainMb)
    }

    @Synchronized fun release() {
        runCatching { eq?.release() }; runCatching { bass?.release() }; runCatching { loud?.release() }
        eq = null; bass = null; loud = null; sessionId = 0
    }

    /**
     * 실시간 스펙트럼. RECORD_AUDIO 권한 필요(Android 규정) — 마이크 녹음은 하지 않고 재생 출력만 분석.
     * 화면이 보일 때만 start, 사라지면 stop 해서 배터리 소모를 막는다.
     */
    fun startVisualizer(onFft: (FloatArray) -> Unit): Visualizer? = try {
        Visualizer(sessionId).apply {
            captureSize = Visualizer.getCaptureSizeRange()[1].coerceAtMost(1024)
            setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                override fun onWaveFormDataCapture(v: Visualizer?, w: ByteArray?, rate: Int) {}
                override fun onFftDataCapture(v: Visualizer?, fft: ByteArray?, rate: Int) {
                    if (fft == null) return
                    val n = fft.size / 2
                    val mags = FloatArray(n)
                    for (k in 1 until n) {
                        val re = fft[2 * k].toFloat(); val im = fft[2 * k + 1].toFloat()
                        mags[k] = kotlin.math.hypot(re, im)
                    }
                    onFft(mags)
                }
            }, Visualizer.getMaxCaptureRate() / 2, false, true)
            enabled = true
        }
    } catch (t: Throwable) { null }
}

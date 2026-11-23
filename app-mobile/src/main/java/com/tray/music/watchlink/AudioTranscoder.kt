package com.tray.music.watchlink

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.abs

/**
 * 휴대폰에서 MediaCodec 으로 오디오 → AAC-LC(.m4a) 변환 (워치 공간 최적화, Q09).
 * 파이프라인: MediaExtractor → 디코더(PCM 16bit) → AAC 인코더 → MediaMuxer(MP4)
 * 실패 시 예외를 던지고, 호출자는 원본을 그대로 전송한다(원본 파일은 절대 수정하지 않음).
 */
object AudioTranscoder {

    data class SourceInfo(val mime: String, val bitrate: Int, val sampleRate: Int, val channels: Int, val durationUs: Long)

    fun probe(context: Context, uri: Uri): SourceInfo {
        val ex = MediaExtractor()
        try {
            ex.setDataSource(context, uri, null)
            for (i in 0 until ex.trackCount) {
                val f = ex.getTrackFormat(i)
                val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
                if (!mime.startsWith("audio/")) continue
                return SourceInfo(
                    mime = mime,
                    bitrate = if (f.containsKey(MediaFormat.KEY_BIT_RATE)) f.getInteger(MediaFormat.KEY_BIT_RATE) else 0,
                    sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE),
                    channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT),
                    durationUs = if (f.containsKey(MediaFormat.KEY_DURATION)) f.getLong(MediaFormat.KEY_DURATION) else 0,
                )
            }
            throw IllegalStateException("오디오 트랙 없음")
        } finally { ex.release() }
    }

    /** 손실 압축 포맷은 재압축하지 않는다(품질 저하). 무손실/PCM 만 변환 대상 */
    fun isLossless(mime: String) = mime == "audio/flac" || mime == "audio/raw" || mime.contains("wav") ||
        mime == "audio/alac" || mime == "audio/x-flac"

    fun transcode(context: Context, src: Uri, out: File, bitrate: Int, onProgress: (Float) -> Unit = {}) {
        val ex = MediaExtractor()
        var decoder: MediaCodec? = null
        var encoder: MediaCodec? = null
        var muxer: MediaMuxer? = null
        var muxStarted = false
        val tmp = File(out.parentFile, out.name + ".tmp").apply { delete() }
        try {
            ex.setDataSource(context, src, null)
            val track = (0 until ex.trackCount).firstOrNull {
                ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: throw IllegalStateException("오디오 트랙 없음")
            ex.selectTrack(track)
            val inFmt = ex.getTrackFormat(track)
            val durationUs = if (inFmt.containsKey(MediaFormat.KEY_DURATION)) inFmt.getLong(MediaFormat.KEY_DURATION) else 0L

            decoder = MediaCodec.createDecoderByType(inFmt.getString(MediaFormat.KEY_MIME)!!)
            decoder.configure(inFmt, null, null, 0)
            decoder.start()
            muxer = MediaMuxer(tmp.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

            val info = MediaCodec.BufferInfo()
            var sampleRate = 0
            var channels = 0
            var muxTrack = -1
            var extDone = false; var decDone = false; var encInDone = false; var encDone = false
            val pcm = ArrayDeque<ByteArray>()
            var pcmHeadPos = 0
            var pcmAvailable = 0L
            var framesFed = 0L

            while (!encDone) {
                // 1) 추출기 → 디코더
                if (!extDone) {
                    val i = decoder.dequeueInputBuffer(5_000)
                    if (i >= 0) {
                        val buf = decoder.getInputBuffer(i)!!
                        val n = ex.readSampleData(buf, 0)
                        if (n < 0) {
                            decoder.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); extDone = true
                        } else {
                            decoder.queueInputBuffer(i, 0, n, ex.sampleTime, 0); ex.advance()
                        }
                    }
                }
                // 2) 디코더 → PCM 큐 (첫 출력 포맷 확인 후 인코더 생성)
                if (!decDone) {
                    val o = decoder.dequeueOutputBuffer(info, 5_000)
                    if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        val f = decoder.outputFormat
                        if (f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                            f.getInteger(MediaFormat.KEY_PCM_ENCODING) != AudioFormat.ENCODING_PCM_16BIT) {
                            throw IllegalStateException("16bit 이외 PCM 출력은 변환 미지원")
                        }
                        sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                        if (channels !in 1..2) throw IllegalStateException("${channels}채널은 변환 미지원")
                        if (encoder == null) {
                            val ef = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels).apply {
                                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                                setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
                                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
                            }
                            encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
                            encoder.configure(ef, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                            encoder.start()
                        }
                    } else if (o >= 0) {
                        if (info.size > 0) {
                            val b = decoder.getOutputBuffer(o)!!
                            b.position(info.offset); b.limit(info.offset + info.size)
                            val arr = ByteArray(info.size); b.get(arr)
                            pcm.addLast(arr); pcmAvailable += arr.size
                        }
                        decoder.releaseOutputBuffer(o, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) decDone = true
                    }
                }
                val enc = encoder ?: continue
                // 3) PCM 큐 → 인코더
                if (!encInDone && (pcmAvailable > 0 || decDone)) {
                    val i = enc.dequeueInputBuffer(5_000)
                    if (i >= 0) {
                        val buf: ByteBuffer = enc.getInputBuffer(i)!!
                        buf.clear()
                        val frameBytes = 2 * channels
                        var room = (buf.capacity() / frameBytes) * frameBytes
                        var written = 0
                        while (room > 0 && pcm.isNotEmpty()) {
                            val head = pcm.first()
                            val take = minOf(room, head.size - pcmHeadPos)
                            buf.put(head, pcmHeadPos, take)
                            pcmHeadPos += take; written += take; room -= take; pcmAvailable -= take
                            if (pcmHeadPos >= head.size) { pcm.removeFirst(); pcmHeadPos = 0 }
                        }
                        val pts = framesFed * 1_000_000L / sampleRate
                        framesFed += written / frameBytes
                        val eos = decDone && pcmAvailable == 0L
                        enc.queueInputBuffer(i, 0, written, pts, if (eos) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
                        if (eos) encInDone = true
                        if (durationUs > 0) onProgress((pts.toFloat() / durationUs).coerceIn(0f, 1f))
                    }
                }
                // 4) 인코더 → 먹서
                val o = enc.dequeueOutputBuffer(info, 5_000)
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    muxTrack = muxer.addTrack(enc.outputFormat); muxer.start(); muxStarted = true
                } else if (o >= 0) {
                    val b = enc.getOutputBuffer(o)!!
                    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0 && muxStarted) {
                        b.position(info.offset); b.limit(info.offset + info.size)
                        muxer.writeSampleData(muxTrack, b, info)
                    }
                    enc.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) encDone = true
                }
            }
            muxer.stop(); muxStarted = false
            muxer.release(); muxer = null

            // 결과 재검증: AAC 트랙 존재 + 길이 오차 1초 이내
            val v = probe(context, Uri.fromFile(tmp))
            if (v.mime != MediaFormat.MIMETYPE_AUDIO_AAC) throw IllegalStateException("출력 코덱 불일치: ${v.mime}")
            if (durationUs > 0 && v.durationUs > 0 && abs(v.durationUs - durationUs) > 1_000_000) {
                throw IllegalStateException("출력 길이 불일치")
            }
            if (!tmp.renameTo(out)) throw IllegalStateException("출력 파일 저장 실패")
            onProgress(1f)
        } finally {
            runCatching { decoder?.stop() }; runCatching { decoder?.release() }
            runCatching { encoder?.stop() }; runCatching { encoder?.release() }
            runCatching { if (muxStarted) muxer?.stop() }; runCatching { muxer?.release() }
            ex.release()
            tmp.delete()
        }
    }
}

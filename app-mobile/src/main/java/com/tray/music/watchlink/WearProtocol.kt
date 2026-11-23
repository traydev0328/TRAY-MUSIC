package com.tray.music.watchlink

/** 휴대폰 ↔ 워치 메시지 경로. app-wear 의 동일 파일과 반드시 같은 값이어야 한다. */
object WearProtocol {
    const val CAPABILITY_WATCH = "tray_music_watch"
    const val CAPABILITY_PHONE = "tray_music_phone"

    /** phone→watch {id,name,mime,size,sha,title,artist} */
    const val OFFER = "/tray/offer"
    /** watch→phone {id, offset} 또는 {id, error} */
    const val RESUME = "/tray/resume"
    /** ChannelClient 경로 접두사 + 전송 ID */
    const val DATA_PREFIX = "/tray/data/"
    /** watch→phone {id, ok, error, offset} */
    const val DONE = "/tray/done"
    /** phone→watch 상태 요청 / watch→phone 상태 {free,total,used,battery,charging,count} */
    const val STATUS_REQ = "/tray/status_req"
    const val STATUS = "/tray/status"
    /** phone→watch {title,artist,playing} */
    const val NOW_PLAYING = "/tray/now_playing"
    /** watch→phone {cmd: play|pause|toggle|next|prev|vol_up|vol_down} */
    const val REMOTE = "/tray/remote"
    /** watch→phone 현재 곡 요청 */
    const val NOW_PLAYING_REQ = "/tray/now_playing_req"
}

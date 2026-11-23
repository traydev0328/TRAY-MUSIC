package com.tray.music.wear.link

/** app-mobile 의 com.tray.music.watchlink.WearProtocol 과 반드시 같은 값 */
object WearProtocol {
    const val CAPABILITY_WATCH = "tray_music_watch"
    const val CAPABILITY_PHONE = "tray_music_phone"
    const val OFFER = "/tray/offer"
    const val RESUME = "/tray/resume"
    const val DATA_PREFIX = "/tray/data/"
    const val DONE = "/tray/done"
    const val STATUS_REQ = "/tray/status_req"
    const val STATUS = "/tray/status"
    const val NOW_PLAYING = "/tray/now_playing"
    const val REMOTE = "/tray/remote"
    const val NOW_PLAYING_REQ = "/tray/now_playing_req"
}

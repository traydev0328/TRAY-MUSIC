package com.tray.music.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        YoutubePlaylistEntity::class,
        YoutubePlaylistItemEntity::class,
        DownloadJobEntity::class,
        MusicFileEntity::class,
        TrackMatchEntity::class,
        FavoriteEntity::class,
        WatchTransferEntity::class,
        AudioConversionEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun youtubeDao(): YoutubeDao
    abstract fun downloadDao(): DownloadDao
    abstract fun musicFileDao(): MusicFileDao
    abstract fun matchDao(): MatchDao
    abstract fun favoriteDao(): FavoriteDao
    abstract fun watchDao(): WatchDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "tray_music.db")
                // v1(P0 시험판, 공개 배포 전) → v2: 캐시성 데이터만 재생성. 음악 파일(MediaStore)은 영향 없음.
                // v2 이후 스키마 변경은 반드시 Migration + MigrationTestHelper 테스트를 추가한다.
                .fallbackToDestructiveMigrationFrom(1)
                .build()
    }
}

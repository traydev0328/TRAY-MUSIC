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
    ],
    version = 1,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun youtubeDao(): YoutubeDao
    abstract fun downloadDao(): DownloadDao
    abstract fun musicFileDao(): MusicFileDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "tray_music.db")
                // P1부터는 스키마 변경 시 반드시 Migration + MigrationTestHelper 테스트를 추가한다.
                .build()
    }
}

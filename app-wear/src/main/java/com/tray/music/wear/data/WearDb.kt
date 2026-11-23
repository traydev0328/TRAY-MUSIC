package com.tray.music.wear.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/** 워치에 저장된 곡 (SHA-256 이 ID) */
@Entity(tableName = "tracks")
data class WatchTrack(
    @PrimaryKey val sha256: String,
    val title: String,
    val artist: String,
    val path: String,
    val mime: String,
    val size: Long,
    val addedAt: Long,
)

/** 수신 대기/진행 중인 전송 (체크포인트 = part 파일 길이) */
@Entity(tableName = "offers")
data class Offer(
    @PrimaryKey val id: String,
    val nodeId: String,
    val name: String,
    val mime: String,
    val size: Long,
    val sha256: String,
    val title: String,
    val artist: String,
    val createdAt: Long,
)

@Dao
interface WearDao {
    @Query("SELECT * FROM tracks ORDER BY title COLLATE NOCASE")
    fun observeTracks(): Flow<List<WatchTrack>>

    @Query("SELECT * FROM tracks WHERE sha256 = :sha")
    suspend fun track(sha: String): WatchTrack?

    @Query("SELECT COUNT(*) FROM tracks")
    suspend fun count(): Int

    @Upsert suspend fun putTrack(t: WatchTrack)

    @Query("DELETE FROM tracks WHERE sha256 = :sha")
    suspend fun deleteTrack(sha: String)

    @Query("SELECT * FROM offers WHERE id = :id")
    suspend fun offer(id: String): Offer?

    @Query("SELECT * FROM offers ORDER BY createdAt")
    fun observeOffers(): Flow<List<Offer>>

    @Upsert suspend fun putOffer(o: Offer)

    @Query("DELETE FROM offers WHERE id = :id")
    suspend fun deleteOffer(id: String)
}

@Database(entities = [WatchTrack::class, Offer::class], version = 1, exportSchema = true)
abstract class WearDatabase : RoomDatabase() {
    abstract fun dao(): WearDao

    companion object {
        fun create(c: Context) = Room.databaseBuilder(c, WearDatabase::class.java, "tray_wear.db").build()
    }
}

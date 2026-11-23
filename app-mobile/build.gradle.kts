import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

// 비밀값은 저장소 밖 파일에서 읽는다 (secrets.properties / keystore.properties 는 .gitignore 처리됨)
fun loadProps(name: String): Properties = Properties().apply {
    val f = rootProject.file(name)
    if (f.exists()) f.inputStream().use { load(it) }
}
val secrets = loadProps("secrets.properties")
val keystoreProps = loadProps("keystore.properties")

android {
    namespace = "com.tray.music"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tray.music"
        minSdk = 29          // MediaStore RELATIVE_PATH / IS_PENDING 사용
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.0"

        val apiKey = secrets.getProperty("YOUTUBE_API_KEY", "")
        buildConfigField("String", "YOUTUBE_API_KEY", "\"$apiKey\"")
        val jamendo = secrets.getProperty("JAMENDO_CLIENT_ID", "")
        buildConfigField("String", "JAMENDO_CLIENT_ID", "\"$jamendo\"")
    }

    signingConfigs {
        // 휴대폰/워치 APK가 같은 키를 써야 하므로 개인 릴리스 키는 한 번 만들고 안전하게 백업한다.
        if (keystoreProps.getProperty("storeFile") != null) {
            create("tray") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("tray")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.work.runtime.ktx)
    implementation(libs.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.play.services.auth)
    implementation(libs.coroutines.android)
    implementation(libs.coroutines.play.services)
    implementation(libs.play.services.wearable)
    implementation(libs.documentfile)

    testImplementation(libs.junit)
}

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TRAY-MUSIC"

// P0: 휴대폰 앱만 포함. P2 단계에서 ":app-wear", ":core-protocol"을 추가한다.
include(":app-mobile")

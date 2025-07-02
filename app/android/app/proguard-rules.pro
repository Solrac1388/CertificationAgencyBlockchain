-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.swmansion.** { *; }
-keep class io.realm.react.** { *; }
-dontwarn com.facebook.react.**
-dontwarn java.nio.file.*
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement

# React Native RSA
-keep class com.RNRSA.** { *; }
-dontwarn com.RNRSA.**

# SQLite
-keep class io.liteglue.** { *; }
-keep class org.pgsqlite.** { *; }

# Crypto
-keep class org.spongycastle.** { *; }
-dontwarn org.spongycastle.**
#!/bin/bash

# Environment Setup
export PATH="/Users/dipanudas/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export JAVA_HOME="/Users/dipanudas/Library/Java/JavaVirtualMachines/jdk-17.0.2+8/Contents/Home"
export ANDROID_HOME="/Users/dipanudas/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools"

echo "=== System Check ==="
echo "Node version: $(node -v)"
echo "Java Home: $JAVA_HOME"
echo "Android SDK: $ANDROID_HOME"

# Clear stale bundles
echo "=== Clearing Bundles ==="
echo "Removing old bundles..."
rm -rf android/app/src/main/assets/index.android.bundle
rm -rf android/app/src/main/res/drawable-*
rm -rf android/app/src/main/res/raw/*

# Run Prebuild to sync native code and app.json version
echo "=== Running Expo Prebuild ==="
/Users/dipanudas/.nvm/versions/node/v24.14.0/bin/npx expo prebuild --platform android --no-install

# Navigate to android directory
cd "/Users/dipanudas/Desktop/PDF_convertor/LuminaScanApp/android"

# Run Clean and Assemble Release
echo "=== Clearing Gradle Caches ==="
./gradlew clean

echo "=== Starting Gradle Build (Release APK) ==="
./gradlew assembleRelease --no-daemon --no-build-cache --rerun-tasks

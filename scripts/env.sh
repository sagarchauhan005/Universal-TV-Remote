# Android SDK (required for adb and Gradle)
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Java 17 for React Native Android build (Homebrew)
if [ -d /opt/homebrew/opt/openjdk@17 ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  export PATH="$JAVA_HOME/bin:$PATH"
elif [ -d /usr/local/opt/openjdk@17 ]; then
  export JAVA_HOME="/usr/local/opt/openjdk@17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

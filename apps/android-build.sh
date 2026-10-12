#!/usr/bin/env bash
# Builds the signed Shiftwise Android APK. Run from apps/ after `npm install` and build-www.mjs.
# Needs: JDK 21, Android SDK (ANDROID_HOME), and signing env vars:
#   ANDROID_KEYSTORE_B64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(node -p 'require("./package.json").version')
IFS=. read -r MAJ MIN PAT <<<"$VERSION"
VERSION_CODE=$((MAJ * 10000 + MIN * 100 + PAT))

rm -rf android
npx cap add android

RES=android/app/src/main/res
# Brand icons and launch screen (drop the template's per-orientation splash images).
find "$RES" -name 'splash.png' -delete
cp -R android-res/. "$RES"/

MANIFEST=android/app/src/main/AndroidManifest.xml
# Privacy: no Android cloud backup or device-transfer copies of app data.
sed -i 's/android:allowBackup="true"/android:allowBackup="false" android:dataExtractionRules="@xml\/data_extraction_rules"/' "$MANIFEST"
mkdir -p "$RES/xml"
cat > "$RES/xml/data_extraction_rules.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup><exclude domain="root" /><exclude domain="file" /><exclude domain="database" /><exclude domain="sharedpref" /><exclude domain="external" /></cloud-backup>
    <device-transfer><exclude domain="root" /><exclude domain="file" /><exclude domain="database" /><exclude domain="sharedpref" /><exclude domain="external" /></device-transfer>
</data-extraction-rules>
XML
grep -q 'android:allowBackup="false"' "$MANIFEST"

GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE"
grep -q "versionCode ${VERSION_CODE}" "$GRADLE"

npx cap sync android
(cd android && ./gradlew --no-daemon assembleRelease)

UNSIGNED=$(ls android/app/build/outputs/apk/release/*-unsigned.apk)
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
mkdir -p dist
"$BT/zipalign" -f -p 4 "$UNSIGNED" dist/aligned.apk
"$BT/zipalign" -c -p 4 dist/aligned.apk
"$BT/aapt2" dump badging dist/aligned.apk | head -12

sign() { # keystore password alias in out
  KS_PASS="$2" "$BT/apksigner" sign --ks "$1" --ks-key-alias "$3" --ks-pass env:KS_PASS --key-pass env:KS_PASS --out "$5" "$4"
  "$BT/apksigner" verify --verbose --print-certs "$5"
}
if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  # Release key from repository secrets.
  echo "$ANDROID_KEYSTORE_B64" | base64 -d > dist/release.keystore
  sign dist/release.keystore "$ANDROID_KEYSTORE_PASSWORD" "$ANDROID_KEY_ALIAS" dist/aligned.apk "dist/Shiftwise-${VERSION}-android.apk"
  rm -f dist/release.keystore
  cp "dist/Shiftwise-${VERSION}-android.apk" dist/smoke-test.apk
else
  # No release key configured: keep the unsigned APK for signing outside CI,
  # and sign a throwaway copy only so the emulator test can install it.
  echo "::warning::ANDROID_KEYSTORE_B64 is not set; producing an unsigned release APK."
  cp dist/aligned.apk "dist/Shiftwise-${VERSION}-android-unsigned.apk"
  keytool -genkeypair -keystore dist/throwaway.keystore -storetype PKCS12 -alias smoke -keyalg RSA -keysize 2048 -validity 2 -storepass smoketest -keypass smoketest -dname "CN=Smoke test only" >/dev/null 2>&1
  sign dist/throwaway.keystore smoketest smoke dist/aligned.apk dist/smoke-test.apk
  rm -f dist/throwaway.keystore
fi
rm -f dist/aligned.apk
ls -la dist

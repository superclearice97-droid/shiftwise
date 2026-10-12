#!/usr/bin/env bash
# Installs an APK on a running emulator, launches Shiftwise and records evidence.
# Fails if the app does not stay running or the page logs an uncaught error.
set -euo pipefail
APK="$1"; OUT="${2:-android-smoke}"; PKG=io.github.superclearice97droid.shiftwise
mkdir -p "$OUT"
adb wait-for-device
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 30
adb exec-out screencap -p > "$OUT/vault-screen.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1 || true
adb logcat -d > "$OUT/logcat.txt" || true
adb shell pidof "$PKG" || { echo "Shiftwise is not running"; exit 1; }
if grep -E "Capacitor/Console.*(Uncaught|ERROR)|FATAL EXCEPTION" "$OUT/logcat.txt"; then echo "Errors in log"; exit 1; fi
grep -qi "vault passphrase" "$OUT/ui.xml" && echo "Vault screen text found" || echo "::warning::vault text not found in accessibility dump (see screenshot)"
echo "Android smoke test passed"

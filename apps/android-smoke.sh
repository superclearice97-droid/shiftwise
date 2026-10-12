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
# Create a vault through the real form using the keyboard: passphrase (autofocused), age,
# confirm, acknowledge checkbox, submit. Then capture the unlocked city view.
key() { adb shell input keyevent "$1"; sleep 1; }
adb shell input text "smoke%stest%spassphrase%sonly"; sleep 1; key 61
adb shell input text "30"; sleep 1; key 61
adb shell input text "smoke%stest%spassphrase%sonly"; sleep 1; key 61
key 62; key 61; key 66
sleep 40
adb exec-out screencap -p > "$OUT/unlocked.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1 || true
adb logcat -d > "$OUT/logcat.txt" || true
HERE=$(dirname "$0")
fail() { echo "$1" >> "$OUT/logcat.txt"; grep -E "Capacitor|chromium|AndroidRuntime|$PKG" "$OUT/logcat.txt" | tail -60 > "$OUT/fail.txt"; echo "$1" >> "$OUT/fail.txt"; "$HERE/annotate.sh" error "Android smoke" "$OUT/fail.txt"; exit 1; }
adb shell pidof "$PKG" || fail "Shiftwise is not running"
if grep -E "Capacitor/Console.*(Uncaught|ERROR)|FATAL EXCEPTION" "$OUT/logcat.txt"; then fail "Errors in log"; fi
grep -o 'text="[^"]\{3,80\}"' "$OUT/ui.xml" 2>/dev/null | head -25 > "$OUT/texts.txt" || true
grep -E "Capacitor|$PKG" "$OUT/logcat.txt" | grep -viE "verbose" | tail -15 >> "$OUT/texts.txt" || true
if grep -qi "passphrase" "$OUT/ui.xml"; then "$HERE/annotate.sh" notice "Android smoke passed: vault screen shown" "$OUT/texts.txt"; else "$HERE/annotate.sh" warning "Android smoke: app running, vault text not in accessibility dump" "$OUT/texts.txt"; fi
echo "Android smoke test passed"

# Installing Shiftwise

Get the files from the **Downloads** page: https://github.com/superclearice97-droid/shiftwise/releases/latest
Scroll to **Assets** and tap the file for your device.

## Android phone or tablet

1. Tap **Shiftwise-…-android.apk** to download it.
2. Open the downloaded file (from the notification, or your Files / Downloads app).
3. If Android says the browser isn't allowed to install apps, tap **Settings**, turn on **Allow from this source**, then go back.
4. Tap **Install**, then **Open**.

If Play Protect shows a warning about an unknown app, tap **More details → Install anyway**. This appears because Shiftwise isn't from the Play Store.

**Updating:** download the newer APK and install it the same way. Your records stay.

## Linux computer

Choose one:

- **AppImage (easiest):** download **Shiftwise-…-linux-x86_64.AppImage**. Right-click it → **Properties → Permissions** → tick **Allow executing as program**, then double-click it. (In a terminal: `chmod +x Shiftwise-*.AppImage && ./Shiftwise-*.AppImage`.) If it doesn't start on Arch-based systems such as CachyOS, install `fuse2` (`sudo pacman -S fuse2`) or use the pacman package below.
- **Arch / CachyOS / Manjaro:** download the **.pacman** file and run `sudo pacman -U Shiftwise-*-linux-x64.pacman`. Shiftwise then appears in your app menu.
- **Ubuntu / Debian / Mint:** download the **.deb** file and open it with Software Install, or run `sudo apt install ./Shiftwise-*-linux-amd64.deb`.
- **Zip:** unzip **Shiftwise-…-linux-x64.zip** anywhere and run the `shiftwise` program inside.

## First launch

1. Make up a **vault passphrase** of at least 16 characters, such as four or five random words. Write it down somewhere safe. **It cannot be reset.**
2. Enter your age (you must be 18 or older) and tick the box to confirm you saved the passphrase.
3. Your records are encrypted and stay on this device only.

## Keep a backup

Shiftwise has no account or cloud copy. If the device is lost or the app is removed, the records go with it.
Open **Pay settings → Export encrypted backup** every so often, and keep the file somewhere safe. It needs your passphrase to open.

## Checking a download (optional)

Each release lists SHA-256 checksums in `SHA256SUMS.txt`. The Android app's signing certificate SHA-256 fingerprint (v0.3.0 and later) is:
`70:A9:90:B5:3A:85:13:98:D2:27:02:8B:C7:5A:98:B6:51:12:71:EF:F9:77:63:1B:CF:DF:AD:33:09:D9:89:3E`

Versions 0.2.0 and 0.2.1 were signed with an older key (`0D:20:36:8B…`). Android will not update those installs in place: export an encrypted backup from **Pay settings**, uninstall the old app, install the new one, then restore the backup.

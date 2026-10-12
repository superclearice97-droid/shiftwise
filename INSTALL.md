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

Each release lists SHA-256 checksums in `SHA256SUMS.txt`. The Android app's signing certificate SHA-256 fingerprint is:
`0D:20:36:8B:51:9B:28:5C:87:47:D7:01:A2:8B:F8:A6:46:88:0D:A8:C3:57:B2:FA:B4:D6:0C:CE:0A:DB:4F:60`

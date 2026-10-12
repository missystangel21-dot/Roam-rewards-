# Android development build container

This project includes a reproducible Ubuntu container with Java 17, Node.js 22, pnpm 9.12, Android command-line tools, Android SDK platform 35, build-tools 35.0.0, platform-tools, and the Expo native project dependencies.

## Option 1: Docker CLI

From the repository root:

```bash
docker build -f Dockerfile.android -t roam-rewards-android .

docker run --rm -it \
  --name roam-rewards-android \
  -v "$PWD:/workspace/roam-rewards" \
  -v roam-rewards-gradle:/workspace/.gradle \
  -p 8081:8081 \
  -p 3000:3000 \
  roam-rewards-android
```

Inside the container:

```bash
cd /workspace/roam-rewards
pnpm install --frozen-lockfile
pnpm exec expo run:android
pnpm exec expo start
```

## Development and production environments

`Dockerfile.android` defines separate, explicit environment inputs for the Expo build. The `EXPO_PUBLIC_*` values are intentionally public and are compiled into the mobile bundle; never put passwords, signing keys, database URLs, JWT secrets, Redis credentials, or webhook tokens in them.

The example files are [`.env.docker.development.example`](../.env.docker.development.example) and [`.env.docker.production.example`](../.env.docker.production.example). Copy one to a local, ignored file and review the endpoint values before building:

```bash
cp .env.docker.development.example .env.docker.development
set -a && source .env.docker.development && set +a

docker build -f Dockerfile.android \
  --build-arg APP_ENV="$APP_ENV" \
  --build-arg EXPO_PUBLIC_API_BASE_URL="$EXPO_PUBLIC_API_BASE_URL" \
  --build-arg EXPO_PUBLIC_OAUTH_SERVER_URL="$EXPO_PUBLIC_OAUTH_SERVER_URL" \
  --build-arg EXPO_PUBLIC_ENABLE_DEV_MENU="$EXPO_PUBLIC_ENABLE_DEV_MENU" \
  -t roam-rewards-android:development .
```

For production, use HTTPS endpoints and disable development UI:

```bash
cp .env.docker.production.example .env.docker.production
set -a && source .env.docker.production && set +a

docker build -f Dockerfile.android \
  --build-arg APP_ENV="$APP_ENV" \
  --build-arg EXPO_PUBLIC_API_BASE_URL="$EXPO_PUBLIC_API_BASE_URL" \
  --build-arg EXPO_PUBLIC_OAUTH_SERVER_URL="$EXPO_PUBLIC_OAUTH_SERVER_URL" \
  --build-arg EXPO_PUBLIC_ENABLE_DEV_MENU="$EXPO_PUBLIC_ENABLE_DEV_MENU" \
  -t roam-rewards-android:production .
```

The selected `APP_ENV`, `NODE_ENV`, API base URL, OAuth server URL, and development-menu flag are also exposed through Expo `extra` configuration. Runtime-only server values such as `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, and `METRICS_TOKEN` must be injected at runtime from a secret manager or an untracked `--env-file`; they are not part of the Android image build.

## Physical Android devices and ADB

The container includes `adb`, but a physical device must be visible to the container. Enable **Developer options** and **USB debugging** on the device, accept the RSA prompt, and verify the host can see it with `adb devices` before using the container.

### Linux

Linux Docker Engine can pass a USB device through when the host identifies it with `lsusb`:

```bash
lsusb
adb devices
```

Start the container with the matching bus/device path (replace the example values):

```bash
docker run --rm -it \
  --name roam-rewards-android \
  --device=/dev/bus/usb/001/002 \
  -v "$PWD:/workspace/roam-rewards" \
  -v roam-rewards-gradle:/workspace/.gradle \
  -p 8081:8081 \
  -p 3000:3000 \
  roam-rewards-android
```

If permissions prevent access, add a host udev rule for the device vendor ID or run the Docker command through the host's configured device permissions. Avoid `--privileged` unless it is an isolated development machine and USB access still cannot be granted narrowly.

### macOS

Docker Desktop does not generally expose arbitrary USB devices directly to Linux containers. Use the host's ADB server and connect the container to it over TCP:

```bash
adb start-server
adb devices

docker run --rm -it \
  --name roam-rewards-android \
  -e ADB_SERVER_SOCKET=tcp:host.docker.internal:5037 \
  --add-host=host.docker.internal:host-gateway \
  -v "$PWD:/workspace/roam-rewards" \
  -v roam-rewards-gradle:/workspace/.gradle \
  -p 8081:8081 \
  -p 3000:3000 \
  roam-rewards-android
```

If the container cannot reach the host ADB server, expose the host server only on the local development interface according to your Docker Desktop version, or use a network-connected Android device with `adb connect <device-ip>:5555`.

### Windows with Docker Desktop

Use PowerShell and the host ADB server; direct USB passthrough depends on whether Docker Desktop uses WSL 2 or Hyper-V:

```powershell
adb start-server
adb devices

docker run --rm -it `
  --name roam-rewards-android `
  -e ADB_SERVER_SOCKET=tcp:host.docker.internal:5037 `
  -v "${PWD}:/workspace/roam-rewards" `
  -v roam-rewards-gradle:/workspace/.gradle `
  -p 8081:8081 `
  -p 3000:3000 `
  roam-rewards-android
```

For WSL 2 USB passthrough, attach the device to WSL with `usbipd-win`, confirm `adb devices` inside WSL, and pass the resulting USB device through to Docker. Hyper-V users should prefer the host ADB-server method because direct USB mapping is not consistently available.

Once ADB is reachable from the container, install the development build with:

```bash
pnpm exec expo run:android --device
```

For an emulator, run the emulator on the host and point the container at the host ADB server, or run the emulator in a separate Android-capable environment. The container itself does not provide hardware acceleration or an Android GUI emulator.

## Option 2: VS Code Dev Container

1. Install Docker and the VS Code **Dev Containers** extension.
2. Open this repository in VS Code.
3. Run **Dev Containers: Reopen in Container**.
4. The container builds from `Dockerfile.android` and runs `pnpm install --frozen-lockfile` automatically.
5. Use the integrated terminal:

```bash
pnpm exec expo run:android
pnpm exec expo start
```

The container forwards Expo Metro on port `8081` and the project API on port `3000`.

## Rebuilding after native changes

Run the clean prebuild before rebuilding after changing native dependencies or app configuration:

```bash
pnpm exec expo prebuild --clean
pnpm exec expo run:android
```

The clean prebuild regenerates `android/` and `ios/`; commit or stash unrelated native edits before running it.

## SDK environment

The image sets:

```text
ANDROID_HOME=/opt/android-sdk
ANDROID_SDK_ROOT=/opt/android-sdk
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

This avoids relying on a host-specific Android SDK location such as `$HOME/Android/Sdk`.

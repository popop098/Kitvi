<p align="center"><img src="assets/kitvi-mascot.png" width="200" alt="Kitvi's SD fox mascot"></p>
<h1 align="center">Kitvi</h1>
<p align="center">Your PC at a glance. More tools through plugins.</p>
<p align="center"><a href="README.md">한국어</a> · <strong>English</strong><br><a href="https://github.com/popop098/Kitvi/releases/download/v0.4.0/Kitvi-Setup-0.4.0-x64.exe">Windows x64 installer</a> · <a href="https://github.com/popop098/Kitvi/releases/tag/v0.4.0">Release / portable ZIP</a></p>

Kitvi is a Windows PC dashboard for live CPU, memory and GPU usage, hardware, Windows uptime, storage, monitors and devices. **0.4.0 Preview** adds GitHub Releases updates and sandboxed community plugins. The application UI is currently Korean.

This public repository contains releases, documentation and issues; the application source remains private. The [YT Downloader example and plugin guide](https://github.com/popop098/kitvi-YT-downloader) are public separately.

![Actual Windows dashboard](assets/kitvi-dashboard.png)

## Get started

1. Download and run the [0.4.0 installer](https://github.com/popop098/Kitvi/releases/download/v0.4.0/Kitvi-Setup-0.4.0-x64.exe).
2. Launch Kitvi. No separate Node.js, .NET or WebView2 installation is needed.
3. PC metrics work offline. Update checks can be configured in Settings.

**0.3.0 users must manually install this release once.** The [portable ZIP](https://github.com/popop098/Kitvi/releases/download/v0.4.0/Kitvi-0.4.0-win-x64.zip) must be fully extracted to a new folder. Portable builds check versions but do not update in place.

Windows 11 x64 has been tested. Windows 10 22H2 x64 is a compatibility target and has not been separately tested on hardware. This Preview is unsigned; verify files using [SHA256SUMS.txt](https://github.com/popop098/Kitvi/releases/download/v0.4.0/SHA256SUMS.txt). Updates use TLS/checksums, without publisher code-signature verification.

## Features

- CPU, memory and per-GPU usage every second with 60-second graphs; 64-bit dedicated VRAM and driver versions.
- Windows information/uptime, storage every five seconds, monitor/device inventory every fifteen seconds.
- GPU selector, explicit missing values, device search and filtering. Device status is Windows-reported status, not a Bluetooth connectivity guess.
- Pretendard, light/dark appearance and custom frameless window controls.
- Startup/manual release checks; explicit download and restart installation. Active media work blocks update restart.
- Plugin permission preview, install from GitHub Releases or local ZIP, enable/disable/remove.

## Plugins

Enter `popop098/kitvi-YT-downloader` in Plugins, fetch it and review permissions before installing. The example uses the host's official yt-dlp engine to save a public single YouTube video as a combined video file or original audio. It includes progress and cancellation, without stream merging, MP3 conversion, login or cookies. The engine binary is fetched from upstream only on request and its SHA256 is verified.

The [SDK 1 authoring guide](https://github.com/popop098/kitvi-YT-downloader/blob/main/PLUGIN_GUIDE.md) covers manifests, isolated HTML/CSS/JS, scoped host capabilities, packaging and Release distribution. Arbitrary Node backends, executables and shell commands are not supported by this SDK.

## Data and network

Hardware and metric history are not uploaded. Graph history stays in memory; settings, plugins and error logs stay in `%LOCALAPPDATA%\Kitvi`. Update/plugin/engine operations contact GitHub. Video operations contact YouTube and its CDNs. The plugin ZIP bundles no engine executable.

## Feedback and licenses

[Report an issue](https://github.com/popop098/Kitvi/issues/new) with Kitvi/Windows versions, relevant hardware, steps and observed behavior. Redact personal paths or sensitive information from logs and screenshots.

Kitvi and its branding are not open-source licensed. Third-party licenses are included with releases and summarized in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The example plugin's original code is MIT-licensed separately.

<p align="center">
  <img src="assets/kitvi-mascot.png" width="200" alt="Kitvi's chibi fox mascot">
</p>

<h1 align="center">Kitvi · 킷비</h1>

<p align="center">Your PC, at a glance.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square" alt="Windows x64">
  <img src="https://img.shields.io/badge/v0.3.0-Preview-E8A44C?style=flat-square" alt="v0.3.0 Preview">
  <img src="https://img.shields.io/badge/Works-offline-4D8D78?style=flat-square" alt="Works offline">
</p>

<p align="center">
  <a href="README.md">한국어</a> · <strong>English</strong><br>
  <a href="https://github.com/popop098/Kitvi/releases/download/v0.3.0/Kitvi-0.3.0-win-x64.zip">Download for Windows x64</a> ·
  <a href="https://github.com/popop098/Kitvi/releases/tag/v0.3.0">Release</a> ·
  <a href="https://github.com/popop098/Kitvi/issues/new">Report an issue</a>
</p>

Kitvi is an **offline PC dashboard for Windows** that brings CPU, memory, and GPU usage together with hardware, Windows, storage, and device information. Extract the archive and run the app; there is no installer.

**v0.3.0 is the first public preview.** Some information may be unavailable depending on your hardware and drivers. This repository hosts releases, documentation, and issues. The application source code is private.

![The Kitvi dashboard running on a real Windows PC](assets/kitvi-dashboard.png)

*An actual app screenshot. Devices and readings will vary between PCs.*

## Get started

1. Download [Kitvi-0.3.0-win-x64.zip](https://github.com/popop098/Kitvi/releases/download/v0.3.0/Kitvi-0.3.0-win-x64.zip).
2. Extract the **entire ZIP** into a new folder. Keep all of its files together.
3. Run **`Kitvi.exe`** from the extracted folder.

You do not need to install Node.js, .NET, or WebView2 separately. After downloading, the app works without an internet connection.

The current app interface is in Korean. Documentation is available in Korean and English.

| Environment | Validation |
| --- | --- |
| Windows 11 x64 | App launch and main features tested |
| Windows 10 22H2 x64 | Compatibility target; not yet validated on a separate machine |

This preview is unsigned, so Windows may show a security warning. Check the file name and [SHA256SUMS.txt](https://github.com/popop098/Kitvi/releases/download/v0.3.0/SHA256SUMS.txt) on the [official release](https://github.com/popop098/Kitvi/releases/tag/v0.3.0) before deciding whether to run it.

## What you can see

| Area | Included information |
| --- | --- |
| Live usage | CPU, memory, and GPU readings every second, with a 60-second history graph |
| Hardware | CPU and memory specifications, GPU name, dedicated VRAM, and driver details. Select a GPU when more than one is present |
| Windows | Operating system information and uptime |
| Storage | Capacity and usage for each drive, refreshed every 5 seconds |
| Monitors and devices | GPU inventory, monitors, and devices refreshed every 15 seconds. Search devices by name or manufacturer and filter by type |
| Appearance and window | Light and dark themes, a custom window frame, move, resize, minimize, and maximize controls |

Dedicated VRAM is read as a 64-bit value, including capacities above 4GB. Duplicate entries from indirect displays and software adapters are filtered out. Multiple physical GPUs of the same model remain separate.

## Your data stays on your PC

Kitvi does not upload hardware information or measurement history to external servers. Graph history stays in memory while the app is running. Settings and error logs are stored locally; logs do not include hardware snapshots or device inventories.

## Frequently asked questions

**Why do GPU usage or other values show `—`?**<br>
The value is unavailable in your environment or has not been collected yet. Kitvi does not replace missing readings with 0%. On startup, graphs begin with the samples actually collected.

**Why does GPU usage differ from Task Manager?**<br>
Kitvi shows the busiest engine on the selected GPU. Sampling time and Task Manager's engine settings can produce different momentary readings.

**A device says it is working, but my Bluetooth peripheral is disconnected.**<br>
Device status is the status reported by Windows. It does not indicate a peripheral's actual power or Bluetooth connection state.

**Are updates or other tools included?**<br>
This preview does not include automatic updates, Steam integration, external plugins, or sound tools. Temperature, fan speed, and power consumption are not measured. Check the [releases page](https://github.com/popop098/Kitvi/releases) for new versions.

## Report an issue

When [opening an issue](https://github.com/popop098/Kitvi/issues/new), please include:

- Your Kitvi and Windows versions
- CPU and GPU models, and the affected screen
- Steps to reproduce, expected behavior, and actual behavior
- A redacted screenshot or error message, if useful

Do not upload passwords, tokens, serial numbers, or other sensitive information. Check screenshots and logs for user names and private file paths before sharing them.

## Licensing and distribution

Kitvi's application source code is private, and Kitvi itself is not released under an open-source license. For questions about redistributing the app or branding assets, please [open an issue](https://github.com/popop098/Kitvi/issues/new).

Third-party components retain their respective licenses. See [Third-party notices](THIRD_PARTY_NOTICES.md) and the notices included with the release.

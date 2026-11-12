# 제3자 라이선스 고지 · Third-party notices

Kitvi가 작성한 소스 코드는 [MIT](LICENSE)이며, 외부 구성 요소의 저작권·라이선스는 각 권리자에게 남습니다. 아래 요약은 외부 구성 요소를 재라이선스하지 않습니다. 전체 고지는 [`licenses/`](licenses/)와 배포 파일에 포함합니다. 브랜딩은 [BRANDING.md](BRANDING.md)를 참고하세요.

Kitvi-authored source code is [MIT-licensed](LICENSE). Third-party components retain their copyrights and licenses; this summary does not relicense them. Full notices are included in [`licenses/`](licenses/) and releases. Branding is described separately in [BRANDING.md](BRANDING.md).

| 구성 요소 / Component | 라이선스 / License | 원본 / Source |
| --- | --- | --- |
| Electron | MIT; Chromium 및 내장 구성 요소의 개별 고지 / additional embedded-component notices | [electron/electron](https://github.com/electron/electron) |
| electron-updater, builder-util-runtime, yauzl, semver 및 런타임 의존성 / runtime dependencies | 개별 MIT·ISC 등, `licenses/npm/` 참고 / individual notices | [shipped versions and notices](licenses/npm/dependencies.json) |
| React / React DOM | MIT | [facebook/react](https://github.com/facebook/react) |
| Astryx core / Neutral theme / CLI | MIT | [meta/astryx](https://github.com/meta/astryx) |
| StyleX runtime | MIT | [facebook/stylex](https://github.com/facebook/stylex) |
| StyleQ | MIT | [necolas/styleq](https://github.com/necolas/styleq) |
| Lucide | ISC | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| Pretendard | SIL Open Font License 1.1 | [orioncactus/pretendard](https://github.com/orioncactus/pretendard) |
| .NET runtime / System.Management | MIT; .NET 제3자 고지 / additional .NET notices | [dotnet/runtime](https://github.com/dotnet/runtime) |
| Microsoft.Windows.SDK.NET / WinRT.Runtime | Microsoft Windows SDK 사용 조건 / license terms | [official license](https://aka.ms/WinSDKLicenseURL) |

Astryx CLI는 개발 도구이며 앱 렌더러에 포함하지 않습니다. Astryx Neutral의 Lucide 아이콘에도 포함된 ISC 고지가 적용됩니다. Electron의 `LICENSE.electron.txt`, `LICENSES.chromium.html`은 실행 파일 옆에 배포합니다. 런타임 의존성의 정확한 버전과 고지는 `licenses/npm/dependencies.json` 및 개별 라이선스 파일을 참고하세요.

Astryx CLI is a development tool, not part of the renderer. The bundled Lucide icons in Astryx Neutral retain their ISC notice. Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html` are distributed beside the application. See `licenses/npm/dependencies.json` and the individual files for runtime dependency versions and notices.

yt-dlp는 Kitvi나 예제 플러그인에 번들하지 않습니다. 사용자의 요청으로 공식 배포처에서 Windows 바이너리를 받아 SHA256을 대조합니다. 이 바이너리에는 [별도 upstream 라이선스](https://github.com/yt-dlp/yt-dlp#license)가 적용됩니다.

yt-dlp is not bundled in Kitvi or the example plugin. On user request, the host obtains the official Windows binary and checks SHA256. Its [separate upstream license](https://github.com/yt-dlp/yt-dlp#license) applies.

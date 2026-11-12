<p align="center"><img src="assets/branding/mascot-fox-v1.png" width="200" alt="Kitvi SD 여우 마스코트"></p>
<h1 align="center">Kitvi · 킷비</h1>
<p align="center">내 PC의 지금을, 한눈에. 필요한 기능은 플러그인으로.</p>
<p align="center"><img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square" alt="Windows x64"> <img src="https://img.shields.io/badge/v0.6.0-Preview-E8A44C?style=flat-square" alt="0.6.0 Preview"></p>
<p align="center"><strong>한국어</strong> · <a href="README.en.md">English</a><br><a href="https://github.com/popop098/Kitvi/releases">다운로드·릴리스</a> · <a href="docs/plugin-guide.md">플러그인 제작</a> · <a href="https://github.com/popop098/Kitvi/issues/new">문제 제보</a></p>

Kitvi는 CPU·메모리·GPU와 Windows, 저장공간, 모니터, 장치를 확인하는 Windows용 PC 대시보드입니다. 앱 화면은 현재 한국어입니다. **0.6.0 Preview**는 커뮤니티 플러그인을 기본으로 꺼 두고, 사용 전 경고와 플러그인별 제작자·연락처·출처·권한 확인을 제공합니다.

이 저장소에서 Kitvi 소스, 빌드 방법, 릴리스와 이슈를 공개합니다. Kitvi가 작성한 소스 코드는 [MIT 라이선스](LICENSE)를 따릅니다. 브랜딩과 외부 구성 요소의 조건은 [브랜딩 안내](BRANDING.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)에 따로 정리했습니다.

![실제 Kitvi Windows PC 상태 화면](assets/kitvi-dashboard.png)

## 시작하기

1. [Releases](https://github.com/popop098/Kitvi/releases)에서 사용할 버전의 `Kitvi-Setup-<버전>-x64.exe`를 받아 설치합니다.
2. Kitvi를 실행합니다. 배포 파일에는 Electron과 자체 포함 .NET 수집기가 있으므로 Node.js·.NET·WebView2를 따로 설치하지 않아도 됩니다.
3. PC 상태는 오프라인에서도 확인합니다. 설정에서 앱·플러그인 새 버전 자동 확인을 끌 수 있습니다.

포터블 `Kitvi-<버전>-win-x64.zip`은 전체를 새 폴더에 풀어 실행하세요. 포터블은 버전 확인만 지원하며 앱 안에서 새 버전을 설치하지 않습니다. 설치형은 **설정 → 새 버전 확인 → 다운로드 → 다시 시작하여 설치**로 업데이트합니다. 진행 중인 미디어 작업이 있으면 설치를 위한 재시작을 막습니다. 기존 0.3.0 또는 포터블 사용자가 앱 내 설치를 사용하려면 설치형을 한 번 직접 설치해야 합니다.

Windows 11 x64에서 주요 동작을 검증해 왔습니다. Windows 10 22H2 x64는 호환성 대상이며 별도 실기 검증 전입니다. 각 릴리스의 검증 범위는 릴리스 노트를 확인하세요. 현재 **코드 서명이 없는 Preview**입니다. 릴리스에 첨부된 `SHA256SUMS.txt`로 파일을 대조할 수 있지만, 체크섬은 게시자의 신원이나 안전성을 보증하지 않습니다. 앱 업데이트에는 TLS·체크섬을 사용하며 게시자 코드 서명 검증은 제공하지 않습니다.

## PC 상태

| 영역 | 제공하는 내용 |
| --- | --- |
| 실시간 사용률 | CPU·메모리·GPU를 1초마다 측정, 최근 60초 그래프 |
| 하드웨어 | CPU·물리 메모리, GPU별 전용 VRAM·드라이버·사용률 |
| Windows | 운영체제 정보와 가동 시간 |
| 저장공간 | 드라이브별 용량·사용량을 5초마다 갱신 |
| 모니터·장치 | 모니터 모델·해상도·주사율, Windows 장치 상태를 15초마다 갱신 |
| 화면 | Pretendard, 밝게·어둡게, 직접 제작한 창 헤더 |

GPU가 여러 개면 선택할 수 있으며 누락된 값은 `—`로 표시합니다. GPU 사용률은 해당 어댑터의 가장 바쁜 엔진을 기준으로 집계합니다. 장치의 정상 표시는 Windows가 보고한 상태이며 Bluetooth 주변 기기의 실제 연결을 추정하지 않습니다.

## 플러그인

커뮤니티 플러그인 사용은 기본으로 꺼져 있습니다. 처음 켤 때 위험 안내를 읽고 동의해야 합니다. 전역 사용 동의와 개별 플러그인 확인은 별도입니다. 플러그인 화면에서 GitHub 저장소를 입력하거나 로컬 `.kitvi-plugin.zip`을 선택한 뒤, 설치·활성화 전에 **제작자, 이메일, 출처, 요청 권한**을 확인하고 동의하세요. 이메일이 없는 기존 SDK 1 플러그인은 **미등록**으로 표시합니다.

제작자와 이메일은 패키지 제작자가 적은 정보이며 Kitvi가 신원을 확인한 정보가 아닙니다. GitHub 출처나 체크섬, 공개 소스도 안전성 보증이나 Kitvi의 추천을 뜻하지 않습니다. 신뢰할 수 있는 출처의 필요한 플러그인만 선택하세요. [보안 경계와 제보 방법](docs/security.md)을 참고하세요.

플러그인 UI는 sandbox iframe 안의 정적 HTML/CSS/JavaScript로 실행합니다. SDK 1은 Node, 직접 파일 시스템, shell, 임의 실행 파일·네이티브 백엔드를 제공하지 않습니다. 호스트가 활성 상태·권한·요청 인수를 확인하고 허용된 API만 처리합니다.

플러그인 사용이 켜져 있을 때 GitHub 플러그인의 새 버전을 자동으로 확인하며, 자동 확인을 켠 경우 시작 시와 6시간 간격으로 조회합니다. 확인 단계에서는 릴리스 정보만 조회하고 목록에서 직접 업데이트합니다. 같은 GitHub 출처·제작자·연락처·권한의 업데이트는 동의와 사용 여부를 유지합니다. 제작자·연락처·권한 변경이나 로컬 ZIP 교체는 비활성화 후 다시 동의해야 합니다. 저장한 설정은 보존하며 미디어 작업 중에는 교체를 막습니다.

[YT Downloader 예제](https://github.com/popop098/kitvi-YT-downloader)는 공식 yt-dlp 엔진을 별도로 설치해 공개 YouTube 영상 한 편을 단일 영상 파일 또는 원본 오디오로 저장합니다. 진행률·취소를 지원하며 FFmpeg 병합·MP3 변환·로그인·쿠키는 지원하지 않습니다. 제작자는 이 저장소의 [SDK 1 가이드](docs/plugin-guide.md)와 예제 저장소를 함께 참고할 수 있습니다. `authorEmail`을 사용하는 플러그인은 `minKitviVersion`을 `0.6.0` 이상으로 지정해야 합니다.

## 소스에서 빌드하기

**Windows x64, Node.js 24 이상, .NET 10 SDK**가 필요합니다. 저장소 하나만으로 빌드할 수 있으며 이전 Kitvi 버전의 소스나 도구 폴더는 필요하지 않습니다.

```powershell
git clone https://github.com/popop098/Kitvi.git
cd Kitvi
npm ci --no-audit --no-fund
npm run setup:electron
npm run typecheck
npm test
npm run test:native
npm start
```

`npm run setup:electron`은 Electron 바이너리를 설치합니다. 네이티브 빌드는 `DOTNET_EXE` 환경 변수, 저장소 안 `.tools/dotnet/dotnet.exe`, PATH의 `dotnet` 순서로 SDK를 선택합니다. `.tools`는 저장소에 포함하지 않으며 자동으로 SDK를 설치하지 않습니다. 설치한 .NET 10 SDK를 PATH에서 사용할 수 없다면 `DOTNET_EXE`에 실행 파일 경로를 지정하세요.

| 명령 | 용도 |
| --- | --- |
| `npm run typecheck` / `npm test` | TypeScript 검사 / JavaScript·호스트 로직 테스트 |
| `npm run test:native` | .NET 수집기 검사 |
| `npm run build` | 타입 검사와 UI·수집기 전체 빌드 |
| `npm start` | 전체 빌드 후 실제 PC 대시보드 실행 |
| `npm run design:preview` / `npm run design:dev` | 수집기를 시작하지 않는 디자인 작업실 / UI 변경 감시 |
| `npm run package` | NSIS 설치형·포터블 ZIP·업데이트 메타데이터 생성, 자동 게시 없음 |

Electron 실행부는 `electron/`, React 화면은 `renderer/`, 공통 계약은 `shared/`, .NET 수집기는 `native/`, 빌드 스크립트는 `scripts/`에 있습니다. 생성 결과는 `build/`, `native/publish/`, `release/`에 저장됩니다.

## 데이터와 연결

PC 하드웨어와 측정 이력은 외부 서버로 보내지 않습니다. 그래프는 실행 중 메모리에만 보관합니다. 앱 설정·플러그인·엔진·오류 로그는 `%LOCALAPPDATA%\Kitvi`에 저장하며 공개 0.4.0 이후의 데이터 경로를 공유합니다. 디자인 작업실은 저장소 안 `.cache/design-profile`을 사용합니다.

새 버전 확인·플러그인 가져오기·엔진 설치에는 GitHub 통신이, 영상 조회·저장에는 YouTube와 영상 CDN 통신이 발생합니다. 엔진은 요청할 때 공식 배포처에서 받고 SHA256을 대조하며 Kitvi나 예제 플러그인 ZIP에 번들하지 않습니다.

## 기여와 문제 제보

일반 오류와 개선 제안은 [이슈](https://github.com/popop098/Kitvi/issues/new)에 Kitvi·Windows 버전, 관련 장치 모델, 재현 순서, 예상·실제 동작을 적어 주세요. 로그와 화면에서 개인 경로·민감한 정보를 가려 주세요. 보안 취약점은 공개 이슈에 세부 재현 방법을 올리기 전에 [보안 제보 안내](docs/security.md)를 확인하세요.

수정은 목적이 분명한 작은 Pull Request로 보내 주세요. 동작을 바꾼 경우 관련 테스트와 검증 결과를 함께 적고, UI 변경에는 스크린샷을 붙여 주세요. 플러그인 권한·호스트 API 계약 변경은 먼저 이슈에서 논의해 주세요. 기여하는 원본 코드는 저장소의 MIT 라이선스로 제공하며, 외부 코드·자산의 출처와 라이선스를 보존해야 합니다.

## 라이선스

Kitvi가 작성한 소스 코드는 [MIT](LICENSE)입니다. Kitvi 이름·여우 마스코트·아이콘 등 브랜딩에는 이 코드 라이선스를 적용하지 않습니다. 해당 자산의 범위는 [BRANDING.md](BRANDING.md)를 참고하세요. 외부 구성 요소는 각자의 라이선스를 유지하며 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [`licenses/`](licenses/), 배포 파일의 고지를 확인할 수 있습니다.

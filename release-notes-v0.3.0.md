# Kitvi v0.3.0 · 첫 공개 프리뷰

Kitvi(킷비)의 첫 공개 프리뷰입니다. Windows PC의 사용률과 하드웨어 상태를 오프라인으로 확인하는 포터블 대시보드입니다.

## 다운로드

- [Kitvi-0.3.0-win-x64.zip](https://github.com/popop098/Kitvi/releases/download/v0.3.0/Kitvi-0.3.0-win-x64.zip)
- [SHA256SUMS.txt](https://github.com/popop098/Kitvi/releases/download/v0.3.0/SHA256SUMS.txt)
- [한국어 사용 안내](https://github.com/popop098/Kitvi/blob/v0.3.0/README.md) · [English guide](https://github.com/popop098/Kitvi/blob/v0.3.0/README.en.md)

ZIP 전체를 새 폴더에 압축 해제한 뒤 `Kitvi.exe`를 실행하세요. Node.js·.NET·WebView2의 별도 설치는 필요하지 않습니다. 다운로드 후에는 인터넷 연결 없이 사용할 수 있습니다.

다운로드한 파일의 SHA-256은 PowerShell에서 아래 명령으로 확인하고, `SHA256SUMS.txt`의 같은 파일명에 기록된 값과 비교할 수 있습니다.

```powershell
Get-FileHash .\Kitvi-0.3.0-win-x64.zip -Algorithm SHA256
```

## 포함된 기능

- CPU·메모리·GPU 사용률을 1초마다 수집하고 최근 60초를 그래프로 표시합니다.
- CPU·메모리 사양, GPU·전용 VRAM·드라이버, Windows 정보와 가동 시간을 확인합니다. 여러 GPU 중 표시할 GPU를 선택할 수 있습니다.
- 전용 VRAM을 64비트 값으로 읽습니다. 간접 디스플레이·소프트웨어 어댑터의 중복 항목을 걸러내고, 같은 모델의 실제 GPU 여러 개는 유지합니다.
- 저장공간은 5초, GPU 목록·모니터·장치는 15초마다 갱신합니다. 장치 이름·제조사 검색과 종류 필터를 제공합니다.
- 라이트·다크 테마와 전용 창 프레임을 제공합니다. 새 Kitvi 이름과 여우 마스코트·아이콘을 적용했습니다.
- 하드웨어 정보나 측정 이력을 외부로 전송하지 않습니다. 하드웨어 스냅샷·장치 목록은 로그에 기록하지 않습니다.

## 프리뷰 참고 사항

- Windows 11 x64에서 검증했습니다. Windows 10 22H2 x64는 호환성 대상이며 별도 실기 검증은 아직 수행하지 않았습니다.
- 코드 서명이 없는 배포 파일입니다. Windows 경고가 나타나면 공식 릴리스와 SHA-256을 확인해 실행 여부를 판단하세요.
- 제공되지 않는 측정값은 `—`로 표시합니다. 누락 값을 0으로 채우지 않으며, 그래프는 실제로 수집한 구간부터 시작합니다.
- GPU 사용률은 선택한 어댑터의 가장 바쁜 엔진 기준입니다. 장치 상태는 Windows가 보고하는 상태이며, Bluetooth 주변 기기의 실제 연결 상태를 뜻하지 않습니다.
- 온도·팬 속도·소비전력, Steam 연동, 외부 플러그인, 사운드 도구, 자동 업데이트는 포함하지 않습니다.

문제가 있으면 [이슈](https://github.com/popop098/Kitvi/issues/new)에 Kitvi·Windows 버전, 하드웨어 모델과 재현 순서를 남겨 주세요. 비밀번호·토큰·시리얼 번호나 개인 경로가 드러나지 않도록 확인해 주세요.

---

## English

**Kitvi v0.3.0 is the first public preview** of an offline, portable PC dashboard for Windows.

Download the ZIP above, extract the entire archive, and run `Kitvi.exe`. No separate Node.js, .NET, or WebView2 installation is needed. The app works offline after downloading. Compare the ZIP's SHA-256 with `SHA256SUMS.txt`; the PowerShell command above computes the local hash.

### Included

- CPU, memory, and GPU usage sampled every second, with 60-second graphs.
- CPU and memory specifications, GPU selection, dedicated VRAM and driver information, Windows details, and uptime.
- 64-bit VRAM readings. Duplicate indirect-display and software-adapter entries are filtered; identical physical GPU models remain separate.
- Storage refreshed every 5 seconds; GPU inventory, monitors, and devices every 15 seconds. Device search and type filters are included.
- Light and dark themes, custom window controls, and the Kitvi name, fox mascot, and icon.
- Hardware information and measurement history stay local. Logs do not include hardware snapshots or device inventories.

### Preview limitations

- Tested on Windows 11 x64. Windows 10 22H2 x64 is a compatibility target and has not been validated on a separate machine.
- This release is unsigned. If Windows shows a warning, check the official release and SHA-256 before deciding whether to run it.
- Unavailable values display as `—`, not zero. Graphs start with samples actually collected.
- GPU usage represents the selected adapter's busiest engine. Windows device status does not indicate a Bluetooth peripheral's actual connection state.
- Temperature, fan speed, power consumption, Steam integration, external plugins, sound tools, and automatic updates are not included.

Please [report issues](https://github.com/popop098/Kitvi/issues/new) with your Kitvi and Windows versions, hardware models, and reproduction steps. Remove secrets, serial numbers, and private paths before sharing screenshots or logs.

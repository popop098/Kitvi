<p align="center">
  <img src="assets/kitvi-mascot.png" width="200" alt="Kitvi의 SD 여우 마스코트">
</p>

<h1 align="center">Kitvi · 킷비</h1>

<p align="center">내 PC의 지금을, 한눈에.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square" alt="Windows x64">
  <img src="https://img.shields.io/badge/v0.3.0-Preview-E8A44C?style=flat-square" alt="v0.3.0 Preview">
  <img src="https://img.shields.io/badge/Works-offline-4D8D78?style=flat-square" alt="오프라인 실행">
</p>

<p align="center">
  <strong>한국어</strong> · <a href="README.en.md">English</a><br>
  <a href="https://github.com/popop098/Kitvi/releases/download/v0.3.0/Kitvi-0.3.0-win-x64.zip">Windows x64 다운로드</a> ·
  <a href="https://github.com/popop098/Kitvi/releases/tag/v0.3.0">릴리스</a> ·
  <a href="https://github.com/popop098/Kitvi/issues/new">문제 제보</a>
</p>

Kitvi는 CPU·메모리·GPU 사용률과 하드웨어, Windows, 저장공간, 연결 장치를 한 화면에서 확인하는 **Windows용 오프라인 PC 대시보드**입니다. 설치 프로그램 없이 압축을 풀어 실행합니다.

**v0.3.0은 첫 공개 프리뷰입니다.** 하드웨어와 드라이버에 따라 일부 정보를 읽지 못할 수 있습니다. 이 저장소는 배포 파일·사용 안내·이슈를 관리하며, 앱 소스 코드는 비공개입니다.

![Kitvi의 실제 Windows PC 대시보드 화면](assets/kitvi-dashboard.png)

*실제 앱 실행 화면입니다. 표시되는 장치와 측정값은 PC마다 다릅니다.*

## 시작하기

1. [Kitvi-0.3.0-win-x64.zip](https://github.com/popop098/Kitvi/releases/download/v0.3.0/Kitvi-0.3.0-win-x64.zip)을 다운로드합니다.
2. ZIP **전체를** 새 폴더에 압축 해제합니다. 폴더 안의 파일을 함께 보관하세요.
3. 압축을 푼 폴더에서 **`Kitvi.exe`**를 실행합니다.

Node.js·.NET·WebView2를 따로 설치할 필요가 없습니다. 다운로드 후에는 인터넷 연결 없이 사용할 수 있습니다.

현재 앱 화면은 한국어이며, 사용 문서는 한국어와 영어로 제공합니다.

| 환경 | 확인 범위 |
| --- | --- |
| Windows 11 x64 | 실행 및 주요 기능 검증 |
| Windows 10 22H2 x64 | 호환성 대상이며, 별도 실기 검증은 아직 수행하지 않음 |

현재 배포 파일은 코드 서명이 없는 프리뷰이므로 Windows 보안 경고가 나타날 수 있습니다. [공식 릴리스](https://github.com/popop098/Kitvi/releases/tag/v0.3.0)의 파일명과 [SHA256SUMS.txt](https://github.com/popop098/Kitvi/releases/download/v0.3.0/SHA256SUMS.txt)를 확인해 실행 여부를 판단하세요.

## 확인할 수 있는 정보

| 영역 | 제공하는 내용 |
| --- | --- |
| 실시간 사용률 | CPU·메모리·GPU를 1초마다 측정하고 최근 60초를 그래프로 표시 |
| 하드웨어 | CPU·메모리 사양, GPU 이름·전용 VRAM 용량·드라이버 정보. GPU가 여러 개면 선택 가능 |
| Windows | 운영체제 정보와 가동 시간 |
| 저장공간 | 드라이브별 용량·사용량을 5초마다 갱신 |
| 모니터·장치 | GPU 목록·모니터·장치를 15초마다 갱신. 장치 이름·제조사 검색과 종류 필터 제공 |
| 화면·창 | 라이트·다크 테마, 전용 창 프레임, 창 이동·크기 조절·최소화·최대화 |

전용 VRAM 용량은 64비트 값으로 읽어 4GB를 넘는 GPU도 표시합니다. 간접 디스플레이·소프트웨어 어댑터로 인한 중복 GPU 항목은 걸러내며, 같은 모델의 실제 GPU가 여러 개라면 각각 유지합니다.

## 데이터는 PC 안에서

하드웨어 정보와 측정 이력을 외부 서버로 전송하지 않습니다. 그래프 이력은 실행 중 메모리에만 보관하며, 설정과 오류 로그는 로컬에 저장합니다. 하드웨어 스냅샷과 장치 목록은 로그에 저장하지 않습니다.

## 자주 묻는 질문

**GPU 사용률이나 일부 정보가 `—`로 나와요.**<br>
해당 환경에서 값을 제공하지 않거나 아직 수집하지 못한 상태입니다. Kitvi는 누락 값을 0%로 바꾸지 않습니다. 실행 직후의 그래프도 수집한 구간부터 그립니다.

**GPU 사용률이 작업 관리자와 달라요.**<br>
Kitvi는 선택한 GPU의 가장 바쁜 엔진을 기준으로 사용률을 표시합니다. 수집 시점이나 작업 관리자의 엔진 설정에 따라 순간 값이 다를 수 있습니다.

**장치가 정상인데 Bluetooth 기기가 연결되지 않았어요.**<br>
장치 상태는 Windows가 보고하는 상태입니다. 주변 기기의 실제 전원이나 Bluetooth 연결 여부를 뜻하지 않습니다.

**자동 업데이트나 다른 도구도 있나요?**<br>
이번 프리뷰에는 자동 업데이트, Steam 연동, 외부 플러그인, 사운드 도구가 없습니다. 온도·팬 속도·소비전력도 측정하지 않습니다. 새 버전은 [릴리스 페이지](https://github.com/popop098/Kitvi/releases)에서 직접 확인해 주세요.

## 문제 제보

[이슈를 남길 때](https://github.com/popop098/Kitvi/issues/new)는 다음 정보를 함께 적어 주세요.

- Kitvi 버전과 Windows 버전
- CPU·GPU 모델, 문제가 발생한 화면
- 재현 순서와 기대한 동작, 실제로 나타난 동작
- 필요하다면 민감한 내용을 가린 스크린샷이나 오류 내용

비밀번호·토큰·시리얼 번호 등 민감한 정보는 올리지 마세요. 스크린샷과 로그에 사용자 이름이나 개인 경로가 포함되어 있는지도 확인해 주세요.

## 라이선스와 배포

Kitvi 앱의 소스 코드는 비공개이며, Kitvi 자체는 오픈소스 라이선스로 배포하지 않습니다. 앱·브랜딩 자산의 재배포에 관한 문의는 [이슈](https://github.com/popop098/Kitvi/issues/new)로 남겨 주세요.

함께 사용하는 외부 구성 요소에는 각각의 라이선스가 적용됩니다. [제3자 라이선스 고지](THIRD_PARTY_NOTICES.md)와 배포 파일에 포함된 고지를 확인해 주세요.

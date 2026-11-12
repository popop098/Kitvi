# Kitvi 0.4.0 · Preview

## 새 기능

- 시작 시 GitHub Releases의 새 버전 확인. 설정에서 자동 확인 설정과 수동 확인 제공.
- 설치형에서는 업데이트 다운로드 후 사용자가 다시 시작해 설치. 다운로드 중인 작업이 있으면 재시작 설치를 막습니다.
- 플러그인 관리: GitHub Releases 또는 로컬 `.kitvi-plugin.zip` 가져오기, 권한 확인 후 설치, 켜기·끄기·삭제.
- SDK 1: 격리된 웹 화면과 `storage`·`downloads`·`media` 호스트 API. 플러그인에 Node나 임의 명령 실행 API를 제공하지 않습니다.
- [YT Downloader 예제와 제작 가이드](https://github.com/popop098/kitvi-YT-downloader). 공식 yt-dlp 엔진 설치, 공개 YouTube 영상 정보 조회, 단일 영상/원본 오디오 저장, 진행률과 취소.

## 설치 및 업데이트

자동 업데이트를 사용하려면 **Kitvi-Setup-0.4.0-x64.exe**를 설치하세요. 기존 0.3.0에는 업데이트 기능이 없어 이번 설치 파일을 한 번 직접 실행해야 합니다. 포터블 ZIP도 버전 확인은 가능하지만 앱 안에서 설치할 수는 없습니다.

`latest.yml`, 설치 EXE, blockmap은 다음 업데이트를 위한 배포 메타데이터입니다. 다운로드와 재시작은 사용자 선택이며 실행 중인 작업을 강제로 종료하지 않습니다.

코드 서명이 없는 Preview입니다. TLS 및 배포 체크섬 검증을 사용하지만 게시자 코드 서명 검증은 제공하지 않습니다. SHA256SUMS.txt로 파일을 대조할 수 있습니다.

PC 상태는 로컬에서 처리합니다. 버전 확인·플러그인 가져오기·엔진 설치에는 GitHub, 영상 조회·저장에는 YouTube 및 영상 CDN 통신이 발생합니다. PC 하드웨어 정보나 측정 이력을 업로드하지 않습니다.

Windows 11 x64에서 검증했습니다. Windows 10 22H2 x64는 호환성 대상이며 별도 실기 검증 전입니다. 설치된 이전 버전에서 실제 다음 버전으로 교체하는 장기 업데이트 경로는 후속 릴리스에서 계속 검증합니다.

## English

Adds startup/manual GitHub Release checks, an NSIS installer with explicit download/restart updates, sandboxed SDK 1 plugin management, and the public YT Downloader example. Install the Setup EXE once to migrate from 0.3.0 or portable ZIP. Portable builds check versions but do not update in place.

The example downloads official yt-dlp only on request and verifies its upstream SHA256. It supports public single YouTube videos, combined video files or original audio, progress and cancellation. No cookies, playlists, FFmpeg merging or MP3 conversion. The app source remains private; the example plugin and guide are public.

Unsigned Preview; TLS/checksums are provided, publisher signing is not. PC metrics stay local. Update/plugin/engine operations contact GitHub; video operations contact YouTube/CDNs. Windows 11 x64 tested; Windows 10 22H2 x64 remains a compatibility target.

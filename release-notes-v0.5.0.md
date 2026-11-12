# Kitvi 0.5.0 · Preview

설치한 플러그인의 새 버전을 자동으로 확인하고 목록의 **업데이트** 버튼으로 적용할 수 있습니다.

- GitHub 출처 플러그인을 앱 시작 시와 6시간 간격으로 확인합니다. 설정에서 자동 확인을 끄거나 목록에서 수동 확인할 수 있습니다.
- 자동 확인은 릴리스 정보만 읽습니다. 파일 다운로드·교체는 업데이트 버튼을 눌렀을 때 수행합니다.
- 추가 권한이 없으면 바로 적용하고, 권한이 추가되면 확인 화면을 표시합니다.
- 설정과 사용/미사용 상태를 유지합니다. 진행 중인 미디어 작업이 있으면 교체를 막으며, 검증에 실패하면 기존 플러그인을 유지합니다.
- 로컬 ZIP 설치는 새 ZIP을 직접 선택하도록 안내합니다.

0.4.0 설치형 사용자는 **설정 → 새 버전 확인 → 업데이트 다운로드 → 다시 시작하여 설치**로 적용할 수 있습니다. 기존 플러그인과 yt-dlp 엔진은 유지됩니다. 포터블 ZIP은 새 버전 전체를 별도 폴더에 풀어 실행하세요.

플러그인 제작자는 GitHub 안정 릴리스의 태그를 매니페스트 버전과 같은 `v1.2.3` 또는 `1.2.3` 형식으로 게시해야 합니다. 기존 ZIP·SHA256 검증과 설치 출처 제한은 유지합니다. 자세한 방법은 [제작 가이드](https://github.com/popop098/kitvi-YT-downloader/blob/main/PLUGIN_GUIDE.md)에 있습니다.

코드 서명이 없는 Preview입니다. Windows 11 x64에서 검사하며 Windows 10 22H2 x64는 별도 실기 검증 전입니다. PC 정보는 로컬에서 처리하고 업데이트 확인은 GitHub에 연결합니다. 앱 소스는 비공개이며 이 저장소에는 배포·사용 문서만 제공합니다.

## English

Adds automatic plugin release checks at startup/every six hours, manual checking, and Update buttons in the installed list. Checks fetch metadata only. Applying an update verifies the package, preserves settings and enabled state, and asks for review when permissions grow. Active media work blocks replacement; local ZIP plugins require a new ZIP.

Installed 0.4.0 users can check/download/restart from Settings. Existing plugins and the yt-dlp engine are retained. Plugin release tags must be full versions matching the manifest. This remains an unsigned Windows x64 Preview; Windows 11 tested, Windows 10 22H2 remains a compatibility target.

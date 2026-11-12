# Kitvi 0.7.0 · Preview

커뮤니티가 테마 플러그인을 제작·공유·설치하고 앱 전체에 적용할 수 있도록 API와 SDK를 확장했습니다.

- SDK1 도구는 계속 지원합니다. 새 SDK2 테마는 HTML 없이도 JSON과 로컬 자산으로 동작합니다.
- 밝게/어둡게 색상, 배경 이미지·로컬 글꼴, 카드 순서·선택 표시·열 수, 간격과 모서리를 지정합니다.
- 설정에서 미리보기·적용·취소·기본값 복원을 제공하고 헤더에 복원 버튼을 유지합니다.
- 재생 권한을 별도로 안내합니다. 패키지 오디오는 실제 BGM으로, YouTube는 보이는 공식 플레이어로 재생합니다.
- 음악은 사용자 재생 버튼에서 시작합니다. YouTube는 숨김·잘림·최소화 시 일시정지하고 다시 보이거나 앱을 재시작해도 자동으로 재개하지 않습니다.
- 전역·개별 플러그인 동의, 패키지/자산 검증과 실행 격리를 유지합니다. 기능 끄기·제거·무결성 오류 시 기본 테마로 복귀하고 음악을 정리합니다.
- SDK 타입·브라우저 bridge·공유 패키징 도구를 제공합니다. [Cozy Desk](https://github.com/popop098/kitvi-theme-cozy-desk)와 [Midnight Grid](https://github.com/popop098/kitvi-theme-midnight-grid)는 별도 플러그인 저장소와 안정 릴리스로 배포합니다. 플러그인 화면에 해당 `popop098/저장소명`을 입력해 최신 안정 릴리스를 설치하거나 각 Releases의 ZIP을 선택하세요. 자세한 규격은 [테마 제작 가이드](docs/theme-sdk.md)를 참고하세요.

검증: 타입 검사·단위 테스트·실제 Electron 호스트의 설치/동의/적용/복원, 실제 패키지 WAV와 공식 YouTube 영상 재생, 플레이어 세션 격리·최소화·해제, 작은 창 밝게/어둡게·글꼴·네이티브 영역 가림 처리를 확인했습니다. 배포 EXE 창과 수집기 실행/종료를 확인합니다. Windows junction 검사는 실행 환경 제한으로 제외했습니다.

코드 서명 없는 Windows x64 Preview입니다. Windows10 별도 실기 검증 전이며 영상별 YouTube 임베드 허용과 네트워크 조건은 달라질 수 있습니다. YouTube 음원 추출·숨김 재생은 제공하지 않습니다.

## English

Adds declarative SDK2 themes while keeping SDK1 tools: semantic light/dark tokens, packaged backgrounds/fonts, card layout and host-owned BGM. Settings supports preview/apply/cancel/reset; recovery stays in the header. Packaged audio supports background playback. YouTube uses a visible official player in an isolated temporary session and pauses when hidden, clipped or minimized. Activation/restart never starts music. Existing consent and package/resource validation remain in force.

Reusable bridge/types and a generic theme packager are included. [Cozy Desk](https://github.com/popop098/kitvi-theme-cozy-desk) and [Midnight Grid](https://github.com/popop098/kitvi-theme-midnight-grid) have separate plugin repositories and stable releases. Enter their `popop098/repository-name` in Plugins to install the latest stable release, or choose a ZIP from their Releases. Typecheck, unit tests, actual host install/apply/reset, real WAV/YouTube playback and compact light/dark UI were checked. One Windows junction test is skipped by environment restrictions. Unsigned Preview; Windows10 hardware validation remains outstanding.

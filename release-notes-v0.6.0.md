# Kitvi 0.6.0 · Preview

플러그인 사용 전 두 단계 안내를 도입하고 애플리케이션 소스를 공개합니다.

- 플러그인 사용은 기본 꺼짐이며 최초 사용 동의를 로컬에 보관합니다.
- 개별 활성화 전 제작자·선택 이메일·실제 출처·권한을 확인합니다. 제작자 정보는 직접 기재한 정보입니다.
- 전역·개별 동의 전에는 플러그인 화면, 리소스와 API 실행을 차단합니다.
- 제작자·연락처·권한 변경 또는 로컬 ZIP 교체는 다시 활성화에 동의해야 합니다. 같은 GitHub 출처·제작자·연락처·권한의 업데이트는 기존 동의와 사용 선택을 유지합니다.
- 전체 기능을 끄면 화면과 진행 중인 작업·업데이트 확인을 중지합니다. 설치·설정·개별 선택은 보존하며 다시 켜도 과거 다운로드를 재실행하지 않습니다.
- SDK 1을 유지하며 authorEmail은 선택 사항입니다. 해당 필드를 쓰는 패키지는 minKitviVersion을0.6.0이상으로 지정하세요.
- Kitvi 작성 소스는 MIT로 공개하며 브랜딩과 제3자 구성 요소는 별도 고지를 따릅니다.

검증: TypeScript 검사, JavaScript/호스트 단위 테스트97개 통과(Windows junction1개 제외), 네이티브 수집기 검사10개 통과. 실제 Electron 호스트에서 두 동의 전 리소스/API 차단·활성화·전체 끄기/다시 켜기를 확인했습니다. 작은 창의 밝게/어둡게·취소·Escape·초점 복귀도 확인했습니다.

Windows11 x64에서 확인한 코드 서명 없는 Preview입니다. Windows10 22H2는 별도 실기 검증 전입니다. 경고와 공개 소스가 플러그인의 안전성을 보증하지는 않습니다.

## English

Adds a persistent first-use notice for the plugin system and separate publisher/contact/source/permission consent before activating each plugin. Both gates protect resources, frames and host APIs. Global off stops workers and plugin release checks while preserving installed data and choices. Equivalent GitHub updates retain consent; publisher/contact/permission changes and local ZIP replacements require fresh activation. SDK1 remains supported. Kitvi-authored source is published under MIT with separate branding and third-party notices.

Validation: typecheck;97 JavaScript/host tests passed,1 Windows junction test skipped;10 native checks passed; actual Electron host gating and compact light/dark consent UI checked. Unsigned Preview; Windows10 hardware validation remains outstanding.

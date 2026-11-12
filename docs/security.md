# 보안과 취약점 제보 · Security

## 현재 배포와 신뢰 범위

Kitvi는 코드 서명이 없는 Preview입니다. 앱 업데이트와 GitHub 플러그인 설치에는 TLS와 SHA256 확인을 사용하지만 게시자 코드 서명을 검증하지 않습니다. 체크섬은 받은 파일이 제공된 해시와 일치하는지 확인할 뿐, 게시자 신원·선의·안전성을 보증하지 않습니다. 공개 소스를 직접 살펴볼 수 있지만 소스 공개나 검토가 취약점 부재 또는 배포 바이너리와 소스의 재현 가능한 일치를 보증하지는 않습니다.

커뮤니티 플러그인 사용은 기본으로 꺼져 있습니다. 처음 켤 때 전역 위험 안내에 동의하고, 설치·활성화할 각 플러그인의 제작자·이메일·출처·권한을 별도로 확인하세요. 이름과 이메일은 제작자의 자기 기재 정보이며 Kitvi가 검증한 신원이 아닙니다. 이메일이 없는 기존 SDK 1 플러그인은 미등록으로 표시합니다. Kitvi는 플러그인 카탈로그 심사, 서명된 제작자 인증, 사용 기간 만료 제도를 제공하지 않습니다.

## 플러그인 실행 경계

0.7.0의 SDK2 테마는 검증한 JSON과 패키지 자산을 호스트가 해석합니다. `theme`과 `playback` 권한은 별도이며 기존 SDK1 도구의 실행 경계는 유지합니다. YouTube 플레이어는 호스트가 소유한 별도 임시 세션에서 공식 임베드만 사용하고 일반 플러그인에는 네트워크나 부모 DOM 접근을 제공하지 않습니다. 기능 끄기·테마 해제·종료는 재생을 정리합니다. 패키지 오디오와 YouTube의 가시성/백그라운드 동작은 [테마 가이드](theme-sdk.md)에 구분했습니다.

- SDK 1 UI는 sandbox iframe의 정적 HTML/CSS/JavaScript입니다. 직접 Node, Electron IPC, 파일 시스템, shell, 네이티브 모듈·실행 파일 플러그인을 제공하지 않습니다.
- 호스트는 설치·활성 상태, 선언 권한, 호출 프레임과 요청 인수를 확인합니다. 저장소·선택 폴더·미디어 작업은 플러그인별로 구분합니다.
- 패키지 경로·파일 형식·크기를 검사하며 GitHub 패키지는 릴리스의 체크섬과 대조합니다. 설치한 리소스에도 무결성 검사를 적용합니다.
- 현재 권한은 `storage`, `downloads`, `media`입니다. 미디어 API는 호스트가 관리하는 엔진과 고정된 호출 형식을 사용하며 임의 프로세스·CLI 인수·일반 네트워크 프록시를 제공하지 않습니다.

이 경계는 위험을 줄이는 장치이며, 악성 플러그인이나 호스트·Electron·브라우저 엔진 취약점에 대한 완전한 안전 보증이 아닙니다. 권한이 적어도 출처와 동작을 살펴보고 필요하지 않은 플러그인은 끄거나 삭제하세요.

## 취약점 제보

현재 최신 Preview와 저장소 기본 브랜치에서 재현 여부를 알려 주세요. 과거 버전에 대한 보안 수정이나 대응 기한을 보장하는 지원 정책은 아직 없습니다.

1. 저장소의 [Security](https://github.com/popop098/Kitvi/security)에서 **Report a vulnerability**가 제공되면 GitHub의 비공개 취약점 제보 기능을 사용하세요.
2. 그 기능이 없으면 [일반 이슈](https://github.com/popop098/Kitvi/issues/new)에 “보안 문제를 비공개로 전달할 연락 경로가 필요합니다”라는 요청만 남겨 주세요. 공개 이슈에는 공격 코드, 민감한 데이터, 상세한 악용 절차를 넣지 마세요. 관리자가 비공개 경로를 안내하면 그곳으로 세부 정보를 전달하세요.
3. 비공개 제보에는 영향받는 Kitvi·Windows 버전, 소스 커밋 또는 릴리스, 재현 조건·단계, 예상 영향, 가능한 최소 재현 자료를 포함하세요. 개인 경로, 계정 정보, 토큰·쿠키·키는 제거하세요.

일반 사용 오류나 개선 제안은 공개 이슈로 보내 주세요. 제보 접수·수정·공개 일정은 확인 후 조율하며, 이 문서는 특정 응답 시간이나 수정 완료를 약속하지 않습니다.

## English

SDK2 themes in0.7 use host-validated JSON and packaged assets, with separate theme/playback capabilities. SDK1 tool isolation remains. The official YouTube player uses a host-owned temporary session; plugins receive no general network or parent-DOM API. Disabling/revoking a theme stops its playback. See [theme SDK](theme-sdk.md) for the different visibility/background behavior of packaged audio and YouTube.

Kitvi is an unsigned Preview. App updates and GitHub plugin installation use TLS and SHA256, without publisher code-signature verification. Checksums establish consistency with a supplied hash, not publisher identity or safety. Published source allows inspection; it does not guarantee freedom from vulnerabilities or a reproducible match to distributed binaries.

Community plugins are off by default. First-use feature consent is separate from reviewing and accepting each plugin's author, email, source and permissions before installation or activation. Names and emails are self-declared and unverified; legacy packages without an email display “미등록” (unregistered). There is no curated approval catalog, signed author identity or expiry policy.

SDK 1 uses static sandboxed web UI. The host validates the installed active plugin, frame, permissions and arguments, scopes storage/folders/jobs by plugin, and checks package/resource integrity. It exposes no direct Node, Electron IPC, filesystem, shell, arbitrary executable/native backend, generic network proxy or CLI argument API. These controls reduce risk and do not guarantee protection against malicious plugins or vulnerabilities in the host and its dependencies.

To report a vulnerability, use **Report a vulnerability** on the repository's [Security page](https://github.com/popop098/Kitvi/security) if available. Otherwise [open an issue](https://github.com/popop098/Kitvi/issues/new) requesting a private reporting channel, without exploit details or sensitive data. Wait for a private channel before sending details. Include affected Kitvi/Windows versions, commit or release, prerequisites, reproduction steps, impact and a minimal reproducer with secrets and personal information removed. Check the latest Preview and default branch where possible. There is no guaranteed backport, response or fix deadline; disclosure timing can be coordinated after review.

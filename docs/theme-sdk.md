# 커스텀 테마와 BGM 제작 · Kitvi 0.7

Kitvi 0.7.0은 색상·배경·글꼴, PC 상태 카드 배치와 BGM 위젯을 테마 플러그인으로 제공합니다. 기존 `apiVersion:1` 도구는 그대로 지원합니다. **새 선언형 테마만 `apiVersion:2`**를 사용합니다. 앱의 보안 안내와 창 버튼은 호스트가 관리합니다.

## 바로 시작하기

1. 별도 플러그인 저장소인 [Cozy Desk](https://github.com/popop098/kitvi-theme-cozy-desk)의 `kitvi-plugin.json`, `theme.json`, `assets/`를 새 폴더에 복사합니다. [Midnight Grid](https://github.com/popop098/kitvi-theme-midnight-grid)는 YouTube 위젯과 다른 배치를 보여 줍니다. 소스와 자산의 라이선스·생성 안내는 각 테마 저장소에서 확인하세요.
2. 매니페스트와 테마의 `id`를 같은 고유 ID로 바꾸고 `name`, `author`, 버전을 수정합니다. 문의 이메일 `authorEmail`은 선택 사항이며 제작자가 직접 기재한 정보입니다.
3. 저장소 루트에서 패키징합니다.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
git clone https://github.com/popop098/kitvi-theme-cozy-desk.git ../kitvi-theme-cozy-desk
npm run package:theme -- ../kitvi-theme-cozy-desk .cache/cozy-desk.kitvi-plugin.zip
```

`npm run package:theme -- <테마 폴더> <출력.kitvi-plugin.zip>`은 임의의 테마 소스 폴더를 받습니다. `node sdk/tools/package-theme.mjs <테마 폴더> <출력.kitvi-plugin.zip>`으로 직접 실행할 수도 있습니다. 출력 파일은 소스 폴더 밖에 지정하세요.

배포된 테마는 **플러그인 → GitHub 저장소**에 `popop098/kitvi-theme-cozy-desk` 또는 `popop098/kitvi-theme-midnight-grid`를 입력해 최신 안정 릴리스를 설치합니다. 각 테마 저장소의 Releases에서 `.kitvi-plugin.zip`을 받거나 직접 패키징한 ZIP은 **플러그인 → ZIP 파일 선택 → 설치**로 가져옵니다. 플러그인 사용을 켜고 배포자·권한에 동의해 활성화한 뒤 **설정 → 앱 테마**에서 미리보기·적용·취소·기본값 복원을 선택합니다. 음악은 직접 재생 버튼을 눌러 시작합니다. 테마만 설치하거나 적용해도 음악이 시작되지 않습니다.

## 패키지 계약

```json
{
  "apiVersion": 2,
  "kind": "theme",
  "id": "example.my-theme",
  "name": "My theme",
  "version": "1.0.0",
  "minKitviVersion": "0.7.0",
  "description": "사용자에게 보여 줄 테마 설명",
  "author": "Example publisher",
  "authorEmail": "publisher@example.com",
  "theme": "theme.json",
  "permissions": ["theme", "playback"]
}
```

`theme` 권한은 전역 화면 꾸미기입니다. BGM이 있는 패키지는 별도 `playback` 권한도 선언해야 합니다. `media`는 기존 영상 다운로드 기능이며 BGM에 필요하지 않습니다. 선언형 테마는 HTML·JavaScript가 없어도 설치됩니다. 필요하면 `entry:"ui/index.html"`을 넣어 격리된 설정 화면을 제공할 수 있습니다.

## theme.json

완전한 예시는 [Cozy Desk theme.json](https://github.com/popop098/kitvi-theme-cozy-desk/blob/main/theme.json)에 있습니다. 스키마는 [`shared/theme-schema.ts`](../shared/theme-schema.ts), 타입은 [`sdk/types/themes.d.ts`](../sdk/types/themes.d.ts)를 기준으로 합니다.

| 항목 | 허용 범위 |
| --- | --- |
| `schemaVersion`, `id`, `name` | 스키마 1, 매니페스트와 같은 ID, 표시 이름 |
| `modes.light`, `modes.dark` | `canvas`, `panel`, `surface`, `text`, `muted`, `border`, `accent`, `accentText`, `accentSoft`, `cpu`, `memory`, `gpu`를 모두 지정 |
| 색상 | `#RRGGBB` 또는 `#RRGGBBAA`. 글자와 바탕의 대비를 확인하세요. |
| `typography` | `fontFamily`: `pretendard`, `system`, `custom`. 본문 `baseSize`:14–20. custom은 패키지 `fontAsset` 필요 |
| `shape` | 모서리 `radius`:0–20, 여백 배율 `spacing`:0.8–1.3 |
| `background` | 로컬 PNG/JPEG/GIF/WebP, `opacity`:0–1, `fit`:cover/contain |
| `layout` | `order`, `hidden`, `columns`:1/2/3 |
| 카드 ID | summary, performance, storage, displays, devices, bgm. 생략한 순서는 기본 위치에 덧붙임 |
| 숨김 | storage/displays/devices/bgm. 핵심 summary/performance와 호스트 경고는 숨길 수 없음 |

폰트는 WOFF/WOFF2/TTF/OTF를 지원합니다. 사용할 권리와 고지를 패키지에 포함하세요. 파일은 일반4MiB, 폰트2MiB, ZIP·전체 리소스16MiB, 최대256항목입니다. 외부 URL·원시 CSS·호스트 스크립트 삽입·경로 탈출은 허용하지 않습니다. 생성 도구는 `.git`, `.env*`, node_modules와 빌드 캐시를 제외하지만 게시 전 ZIP에 개인 파일이 없는지 확인하세요.

## BGM 소스와 수명

```json
{
  "bgm": {
    "title": "내 작업 공간",
    "tracks": [
      {"id":"local-loop","title":"직접 만든 배경음","source":{"type":"asset","path":"assets/loop.ogg"}},
      {"id":"youtube-demo","title":"공식 API 예제 영상","source":{"type":"youtube","videoId":"M7lc1UVf-VE"}}
    ],
    "volume": 25,
    "loop": true
  }
}
```

로컬 MP3/OGG/WAV/M4A는 페이지를 바꾸거나 창을 최소화해도 재생할 수 있습니다. 브라우저가 해당 코덱을 지원해야 합니다. Cozy Desk의 짧은 WAV는 직접 합성한 자산이며 생성 방법과 라이선스는 [테마 저장소](https://github.com/popop098/kitvi-theme-cozy-desk)에 있습니다. 제3자 음악을 배포할 때 필요한 권리를 확보하세요.

YouTube는 화면에 보이는 **공식 동영상 플레이어**입니다. 화면에서 플레이어가 가려지거나 잘리거나 다른 페이지로 이동하거나 창을 최소화하면 일시정지합니다. 최소200×200이며 UI는 전체가 보이는 경우에만 재생을 시작합니다. 음원만 추출하거나 숨겨서 재생하는 기능은 제공하지 않습니다. 공식 플레이어의 브랜딩·광고·컨트롤을 가리지 마세요. [YouTube 정책 안내](https://developers.google.com/youtube/terms/developer-policies-guide), [플레이어 요구사항](https://developers.google.com/youtube/terms/required-minimum-functionality)

주어진 영상 ID/URL 재생에는 Data API 키나 로그인이 필요하지 않습니다. 검색·계정 연동은 이번 규격에 포함하지 않습니다. 네트워크는 호스트가 분리한 임시 세션에서 사용합니다. 앱 식별 Referer는 실제 설치 앱 ID인 `https://com.popop098.kitvi/`이며 일반 플러그인 네트워크 권한을 열지 않습니다. 네트워크 오류, 외부 재생 금지, 오류153, 자동재생 차단은 상태로 전달합니다. 테마·플러그인 기능을 끄거나 앱을 종료하면 정리하고, 재시작·재활성화 때 음악을 재개하지 않습니다.

## 선택적 설정 UI용 SDK

`sdk/kitvi-sdk.js`를 패키지 설정 UI에 복사해 일반 `<script>`로 불러오고 `window.kitviPlugin.ready()`를 호출합니다. [`kitvi-sdk.d.ts`](../sdk/kitvi-sdk.d.ts)와 `sdk/types/`를 함께 사용하면 타입을 참조할 수 있습니다. 타입은 공통 모델에서 빌드 시 생성합니다.

```javascript
const sdk = window.kitviPlugin;
sdk.ready();
const ownTheme = await sdk.theme.getState();
const player = await sdk.playback.getState();
await sdk.playback.requestTrack('local-loop'); // 호스트에서 선택만 요청. 자동 재생하지 않음
await sdk.playback.setVolume(30);
await sdk.playback.pause();
```

재생 API는 현재 적용한 테마의 `playback` 권한으로만 동작합니다. 일반 도구·다른 테마의 재생 상태에 접근할 수 없습니다. 실제 재생 시작, YouTube URL 선택, 네이티브 플레이어 위치 제어는 호스트 UI 전용입니다. 기존 `request('storage.get',…)` 등의 SDK1 bridge는 유지합니다.

## 배포와 호환성

GitHub 안정 릴리스에 매니페스트 버전과 같은 태그, `.kitvi-plugin.zip`, `SHA256SUMS.txt`를 게시합니다. [기존 배포 가이드](plugin-guide.md)의 출처·업데이트 규칙을 따릅니다. 같은 출처·제작자·권한의 업데이트는 기존 동의를 유지하고, 계약/권한 변경과 로컬 교체는 다시 동의합니다. 꺼짐·제거·무결성 오류 시 기본 테마로 복귀합니다.

밝게/어둡게, 최소 창 크기, 여러 카드 순서, 글꼴 실패, BGM 오류, 페이지 이동·최소화·플러그인 끄기와 재시작을 확인하세요. 예제는 제작 출발점이며 YouTube 영상별 외부 재생 허용·네트워크 조건까지 보장하지 않습니다.

## English

Kitvi0.7 adds declarative SDK2 theme packages while preserving SDK1 tools. Themes define semantic light/dark colors, packaged images/fonts, bounded geometry, dashboard section layout and optional BGM. [Cozy Desk](https://github.com/popop098/kitvi-theme-cozy-desk) and [Midnight Grid](https://github.com/popop098/kitvi-theme-midnight-grid) are separate plugin repositories with their own stable releases and asset licenses. In Plugins, enter `popop098/kitvi-theme-cozy-desk` or `popop098/kitvi-theme-midnight-grid` to install the latest stable release, or choose a ZIP downloaded from that repository's Releases. Accept both consent gates, then preview/apply from Settings.

For authoring, clone a theme separately and use `npm run package:theme -- <theme-folder> <output.kitvi-plugin.zip>` from the Kitvi root. The underlying `node sdk/tools/package-theme.mjs` tool accepts any theme source folder; keep its output outside that folder. No arbitrary host CSS/JavaScript or general network API is exposed.

Packaged audio may play in the background. YouTube uses a visible official player in an isolated temporary session and pauses when hidden/clipped, minimized or revoked. Playback never starts from theme activation/restart; plugins can request a track selection but trusted host controls start it. No audio extraction is used. API keys/search/account access are not part of this contract. See the linked official YouTube policies and the generated SDK types for the precise interface.

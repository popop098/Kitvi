# 플러그인 제작 가이드 · SDK 1

Kitvi 0.6.0은 기존 **`apiVersion: 1`** 정적 웹 플러그인 계약을 유지합니다. 이 문서는 0.6.0의 제작자 연락처와 사용자 동의 안내를 설명합니다. 실행 가능한 예제·SDK bridge·전체 API 예시는 [kitvi-YT-downloader](https://github.com/popop098/kitvi-YT-downloader)와 그 [제작 가이드](https://github.com/popop098/kitvi-YT-downloader/blob/main/PLUGIN_GUIDE.md)에 있습니다. 호스트가 검사하는 실제 계약은 [`shared/plugin-schema.ts`](../shared/plugin-schema.ts)와 [`shared/features.ts`](../shared/features.ts)를 참고하세요.

## 패키지와 매니페스트

ZIP 최상위에 `kitvi-plugin.json`을 둡니다. UI는 패키지 안의 HTML/CSS/JavaScript와 정적 자산으로 구성하며, 실행 파일·네이티브 모듈·백엔드 시작 스크립트를 넣을 수 없습니다.

```text
kitvi-plugin.json
kitvi-sdk.js
ui/
  index.html
  styles.css
  app.js
LICENSE
THIRD_PARTY_NOTICES.md
```

```json
{
  "apiVersion": 1,
  "id": "example.my-tool",
  "name": "My Tool",
  "version": "1.0.0",
  "minKitviVersion": "0.6.0",
  "description": "이 플러그인이 수행하는 동작을 설명합니다.",
  "author": "Example author",
  "authorEmail": "author@example.com",
  "entry": "ui/index.html",
  "permissions": ["storage"]
}
```

`id`는 고유한 소문자 dotted ID이며 배포 후에도 유지하세요. `version`과 `minKitviVersion`은 완전한 의미적 버전으로 지정합니다. `entry`는 패키지 안 HTML의 상대 경로입니다. 필요한 권한만 선언하고, 위 계약에 없는 필드를 추가하지 마세요.

**`authorEmail`은 선택 항목입니다.** 이메일이 없는 기존 SDK 1 패키지도 계속 사용할 수 있고 앱에는 **미등록**으로 표시합니다. 이메일을 제공한다면 공개해도 되는 연락처를 쓰세요. 앱은 해당 주소를 확인·인증하지 않으며 제작자 이름과 함께 자기 기재 정보로 표시합니다. **`authorEmail`을 추가한 패키지는 `minKitviVersion`을 `0.6.0` 이상으로 지정해야 합니다.** 0.5.0 이하의 SDK 1 검사기는 이 새 필드를 알 수 없는 필드로 거절합니다. 이 추가 항목 때문에 `apiVersion`을 2로 바꾸지 마세요.

출처는 사용자가 선택한 GitHub 저장소 또는 로컬 ZIP 경로 유형을 호스트가 표시합니다. 매니페스트에 `source`를 추가해 출처를 주장하지 마세요. 제작자·이메일·출처 표시가 공식 검증이나 추천을 뜻하지 않습니다.

## 사용자 동의와 활성 상태

커뮤니티 플러그인은 기본으로 꺼져 있습니다. 사용자는 처음 기능을 켤 때 위험 안내에 동의하고, 개별 플러그인의 제작자·이메일·출처·권한도 설치·활성화 전에 별도로 확인합니다. 이 절차는 제작자 신원을 검증하거나 패키지를 심사하는 제도가 아닙니다. 별도 카탈로그 등록, 제작자 서명, 사용 기간 만료는 요구하지 않습니다.

비활성화된 플러그인은 API를 사용할 수 없습니다. UI를 열자마자 엔진 설치·폴더 선택·다운로드를 요청하지 말고 사용자의 명확한 버튼 동작에 연결하세요. 오류를 사용자에게 보여 주고 중복 실행을 막으세요.

## SDK 연결과 권한

예제의 `kitvi-sdk.js`를 패키지에 포함하고 UI에서 불러옵니다. 먼저 상태를 구독한 뒤 준비 신호를 보냅니다.

```javascript
const sdk = window.kitviPlugin;
const unsubscribe = sdk.onState((state) => {
  document.documentElement.dataset.theme = state.appearance;
});
sdk.ready();
const saved = await sdk.request('storage.get', { key: 'settings' });
```

| 권한 | 메서드 | 범위 |
| --- | --- | --- |
| `storage` | `storage.get`, `storage.set` | 플러그인 ID별 작은 JSON 설정 |
| `downloads` | `downloads.chooseFolder`, `downloads.openFolder` | 호스트 대화상자로 선택한 해당 플러그인의 폴더 |
| `media` | `media.status`, `media.installEngine`, `media.analyze`, `media.cancel` | 호스트가 관리하는 엔진과 해당 플러그인의 미디어 작업 |
| `media` + `downloads` | `media.start` | `{ url, mode: "video" 또는 "audio" }`로 단일 작업 시작 |

`request(method, params)`는 Promise이고 실패하면 `Error`로 거절합니다. 상태와 반환 형식의 전체 계약은 예제 가이드를 참고하세요. 자체 bridge를 만들면 `event.source === parent`와 요청 ID를 확인하세요. 호스트는 활성 프레임에 플러그인 신원을 연결하며 자식 프레임이 보낸 ID를 권한 근거로 사용하지 않습니다.

API에는 임의 파일 읽기·쓰기, 프로세스 실행, shell, 임의 CLI 인수, 범용 네트워크 프록시가 없습니다. 저장소에 비밀번호·토큰·쿠키를 넣지 마세요. 미디어는 공개 YouTube 개별 HTTPS 영상의 단일 파일 영상·원본 오디오만 지원하며 FFmpeg 병합·변환, 재생목록·라이브·로그인·쿠키·DRM 옵션은 제공하지 않습니다.

SDK 1의 iframe은 `allow-forms`를 제공하지 않습니다. 호스트 API 호출은 `type="button"` 클릭으로 처리하고, 필요한 Enter 키 동작은 입력 핸들러에서 처리하세요. 실제 Kitvi sandbox 안에서 입력과 버튼을 확인하세요.

## 패키징과 업데이트

경로는 `/`로 구분한 상대 경로를 쓰며 절대 경로, `..`, 심볼릭 링크, 대소문자 충돌을 넣지 마세요. ZIP과 확장한 내용의 합계는 각각 최대 16 MiB, 항목 수는 256개, 일반 파일은 4 MiB, 글꼴은 2 MiB입니다. 외부 CDN 대신 정적 UI 자산을 패키지에 포함하세요.

예제 저장소의 Node 24 이상용 테스트·패키징 스크립트를 참고할 수 있습니다. GitHub의 안정 릴리스에 **정확히 하나의 `*.kitvi-plugin.zip`과 `SHA256SUMS.txt`**를 함께 올립니다. 체크섬 형식은 다음과 같습니다.

```text
<64자리 SHA256>  my-tool-1.0.0.kitvi-plugin.zip
```

자동 확인을 사용하려면 릴리스 태그를 매니페스트 `version`과 같은 `v1.0.0` 또는 `1.0.0`으로 지정하세요. Draft·사전 릴리스는 자동 업데이트 대상으로 사용하지 않습니다. 플러그인 사용이 켜져 있을 때만 업데이트를 확인합니다. 앱은 확인 단계에 릴리스 정보만 조회하고, 적용 시 ZIP·ID·버전·최소 Kitvi 버전·권한·SHA256을 다시 확인합니다. 같은 GitHub 출처·제작자·연락처·권한은 기존 동의와 사용 여부를 유지합니다. 제작자·연락처·권한 변경이나 로컬 ZIP 교체는 비활성화 후 다시 동의해야 합니다. 저장한 설정은 보존합니다.

밝게·어둡게, 좁은 화면, 기능 꺼짐·개별 비활성화, 권한 부족, 폴더 선택 취소, 엔진 미설치·실패, 잘못된 URL, 네트워크 실패, 작업 취소, 업데이트를 실제로 확인하세요. 검증하지 않은 조건은 릴리스 노트에 남기세요. 소스 공개와 체크섬은 투명성과 무결성 확인 수단이며 안전성 보증은 아닙니다.

## English reference

SDK 1 remains `apiVersion: 1`. Packages contain static sandboxed HTML/CSS/JavaScript with `kitvi-plugin.json` at the ZIP root. The manifest example above is the 0.6.0 contract. `authorEmail` is optional; legacy packages without it remain supported and display “미등록” (unregistered). Names and emails are self-declared and unverified. Use a contact address suitable for public display. **Adding `authorEmail` requires `minKitviVersion` of `0.6.0` or later**, because earlier SDK 1 validators reject the field. Do not change `apiVersion` to 2 for this addition.

Community plugins are off by default. First-use feature consent and individual review of author, email, source and permissions are separate. The host supplies the source; do not add a manifest `source` field. There is no catalog registration, author-signing or expiry requirement. Disabled plugins cannot use host APIs.

Load the example SDK, subscribe with `onState`, call `ready`, then use Promise-based `request(method, params)`. The host binds identity to the active installed frame and validates permissions and arguments. The API table above and the [example authoring guide](https://github.com/popop098/kitvi-YT-downloader/blob/main/PLUGIN_GUIDE.md) describe available calls. There is no direct Node/filesystem/shell/native backend, generic network proxy or CLI argument API. Treat engine installation, folder selection and downloads as explicit user actions.

Publish one `*.kitvi-plugin.zip` and one `SHA256SUMS.txt` in a stable GitHub Release whose `v1.0.0` or `1.0.0` tag matches the manifest version. Use `<SHA256><two spaces><exact ZIP filename>`. ZIP and expanded content each have a 16 MiB limit, with 256 entries, 4 MiB ordinary files and 2 MiB fonts. Keep paths portable and relative and exclude executables, native modules and links. Added permissions require review, active media work prevents replacement, and local packages update through a new ZIP. Test in the actual sandbox and report unverified cases honestly.

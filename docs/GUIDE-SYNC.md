# 개념 가이드 ↔ 컨피규레이터 동기화 규약

**대상 문서:** Core System 개념 가이드 (`docs/service-concept-guide.html`)
**소비처:** 컨피규레이터 (`public/index.html` → 슬라이드오버 iframe → `public/guide.html`)
**현재 반영 버전:** v3.3 · 2026-07-29

---

## 1. 원칙 — 복사가 아니라 생성

가이드 본문은 이 레포에 **단 한 벌**만 존재합니다.

```
docs/service-concept-guide.html      ← 정본(SSOT). 사람이 갱신하는 유일한 파일.
        │  node scripts/build-guide.cjs
        ▼
public/guide.html                    ← 생성물. 직접 수정 금지.
        │  <iframe src="guide.html">
        ▼
public/index.html (컨피규레이터)      ← 본문을 품지 않고 가리키기만 함.
        │  node scripts/build-b2a.cjs
        ▼
dist/b2a-configurator.html           ← B2a 미러(생성물). 프로젝트 문서 `claude/b2a-configurator.html`.
```

미러도 손으로 복사하지 않습니다. 라이브에서 **생성**하며, 달라지는 지점은 가이드 URL 하나뿐입니다 —
프로젝트 문서로 열리면 옆에 `guide.html` 이 없으므로 상대경로 대신
`https://greeny-ds.vercel.app/guide.html` 절대 URL 을 씁니다. 문서 샌드박스가 iframe 을
막는 경우를 대비해 드로어 헤더의 `새 탭에서 열기 ↗` 링크와 하단 안내 바를 함께 주입합니다
(딥링크 해시는 두 링크에도 그대로 전달됩니다).

iframe 로드 실패는 자동 감지하지 않습니다. 404 페이지도 CSP 차단 프레임도 `load` 이벤트를
그대로 발생시키고 교차 출처라 내부를 들여다볼 수 없어, "실패"를 신뢰성 있게 판정할 방법이
없기 때문입니다. 감지 대신 안내를 상시 노출합니다.

컨피규레이터에는 가이드 문장이 한 줄도 들어 있지 않습니다. 상단 바 `개념 가이드` 버튼과
패널 그룹 헤더의 `?` 버튼이 `data-guide="#앵커"` 로 **가리키기만** 합니다.
따라서 가이드가 갱신돼도 컨피규레이터는 손대지 않습니다.

생성기가 하는 일은 본문 변경이 아니라 크롬 주입뿐입니다 —
① 상단 복귀 스트립(← 컨피규레이터로 / 버전 배지 / 새 탭에서 열기)
② 스트립 44px 만큼의 sticky·scroll-margin 보정 CSS
③ iframe 안이면 복귀 링크 대신 새 탭 링크로 바꾸는 임베드 모드 스크립트

버전 배지는 손으로 적지 않고 정본 푸터의 `개념 가이드 vX.Y · YYYY-MM-DD` 를 파싱합니다.
도장이 없으면 빌드가 하드 실패합니다(정본이 아닌 파일을 배포하지 않기 위해).

## 2. 갱신 절차 (3단계, 2분)

가이드를 고칠 일이 생겼을 때:

1. **정본 교체** — 새 버전 HTML을 `docs/service-concept-guide.html` 에 통째로 덮어씁니다.
   푸터의 버전 도장(`개념 가이드 vX.Y · YYYY-MM-DD`)을 반드시 함께 올립니다.
   Cowork 아티팩트에서 내려받은 파일이면 최상단의 `<script id="cowork-artifact-meta">`
   블록을 제거한 뒤 넣습니다(설명 필드가 옛 버전을 달고 다닙니다).
2. **재생성** — `node scripts/build-guide.cjs`
3. **커밋 + 푸시** — `public/guide.html` 이 함께 커밋됩니다. Vercel 이 `public/` 를
   그대로 정적 배포하므로 별도 설정 없이 `/guide.html` 이 즉시 최신본이 됩니다.

## 3. 잊었을 때 잡아주는 장치

CI(`.github/workflows/build-tokens.yml`) 마지막 단계:

```
node scripts/build-guide.cjs --check
```

정본만 고치고 2단계를 잊으면 `guide DRIFT` 로 **빌드가 실패**합니다.
`build-css.cjs --check` 와 동일한 드리프트 게이트 방식입니다.
즉 "사본이 낡은 채로 배포되는" 경로가 구조적으로 막혀 있습니다.

## 4. 트리거 주체

| 사건 | 트리거 | 실행 |
|---|---|---|
| 가이드 내용 갱신 필요 판단 | **진아(총괄)** | 정본 HTML 갱신 |
| 정본 → 배포본 재생성 + 커밋 | **HQ** (요청 시) 또는 진아 로컬 | `node scripts/build-guide.cjs` |
| 재생성 누락 감지 | **CI** (자동) | `--check` 실패 |
| 앵커 구조 변경(섹션 id 추가·삭제) 시 딥링크 갱신 | **HQ** | `public/index.html` 의 `data-guide` 9개 재매핑 |
| 컨피규레이터 UI 변경 → B2a 미러 반영 | **HQ** | `node scripts/build-b2a.cjs` + **게시 2곳 모두 교체**(아래) |
| 미러 재생성 누락 감지 | **CI** (자동) | `build-b2a.cjs --check` 실패 |

### 4-1. 미러 게시처는 두 곳이다 (둘 다 바꿔야 한다)

`dist/b2a-configurator.html` 은 서로 다른 저장소 두 군데에 게시됩니다. 한쪽만 바꾸면
다른 쪽을 여는 사람에게는 **옛 버전이 계속 보입니다** — CI 로도 잡히지 않습니다.

| 게시처 | 갱신 방법 |
|---|---|
| 프로젝트 문서 `claude/b2a-configurator.html` | `Projects project_write` |
| Cowork 아티팩트 `b2a-configurator` | `SendUserFile` → `update_artifact` (`file_uuid` 전달) |

2026-07-29 실제로 ①만 갱신하고 ②를 빠뜨려, 진아가 갤러리에서 연 컨피규레이터에
가이드 진입점이 하나도 보이지 않는 일이 있었습니다. 미러를 재생성했다면
**두 줄을 한 세트로** 실행하세요.

가이드 갱신이 **결정 사항**(예: Q-011 확정, `selected` 승격 결론)에서 비롯된 경우,
`PROJECT-STATE.md` 결정 기록 → 가이드 갱신 → 재생성 순서를 지킵니다.
결정이 문서보다 먼저 확정되어야 문서가 결정을 뒤따를 수 있습니다.

## 5. 딥링크 매핑 (컨피규레이터 패널 그룹 → 가이드 앵커)

| 컨피규레이터 그룹 | 앵커 | 가이드 위치 |
|---|---|---|
| ④ 브랜드 | `#ref-color` | color · 색 (램프 구성) |
| ① 자동 스케일 | `#s-layers` | 3계층 한눈에 — 원재료 계층 |
| ③ 갈림길 (다크·회색 톤) | `#s6` | 시나리오 B · 다크 모드가 생기는 법 |
| ② 기본값 조정 (AAA/AA) | `#s7` | 시나리오 C · 접근성 자동 보장 |
| ② 간격 · 모서리 | `#ref-space` | spatial · 여백 |
| ② 상태색 | `#s10` | Semantic 사전 — 역할 전체 목록 |
| ④ 글자 (타이포) | `#ref-type` | typo · 글자 |
| ② 그림자 · 모션 | `#ref-shape` | visual · 모서리 / 그림자 |
| 프리셋 갤러리 | `#s2` | 값이 아니라 값을 만드는 엔진 |

앵커 id 를 바꾸는 편집을 하면 이 표와 `public/index.html` 의 `data-guide` 를 함께 고쳐야 합니다.
(앵커 결손은 CI 가 잡지 못합니다 — 링크가 깨져도 페이지 최상단으로 갈 뿐이라 조용히 실패합니다.)

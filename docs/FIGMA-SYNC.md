# FIGMA-SYNC.md — Figma 변수 재동기화 규약 (결정 #40 Phase ④)

> 이 문서가 Figma 변수 동기화의 SSOT다. 값·이름은 여기 적지 않는다 — 전부 생성기가 만든다.
> 짝 문서: `docs/GUIDE-SYNC.md`(가이드·미러 동기화) · `docs/kdx-alignment-map.md`(어휘 마이그레이션).

---

## 0. 왜 생성기인가

Figma 변수를 손으로 옮기면 반드시 어긋난다. 근거는 이 프로젝트 안에 이미 두 번 있다 —
BC-26(프로젝트 문서와 아티팩트가 갈라짐) · BC-37(빌드가 치환하지 않는 문자열이 v0.5에 화석으로 남음).
그래서 개념 가이드(결정 #29)와 B2a 미러(BC-25)를 생성물로 바꿨고, Figma 변수도 같은 원리로 다룬다.

**규칙: 사람이 만드는 것은 판단이고, 이름·값·별칭은 전부 `scripts/gen-figma-vars.cjs` 가 만든다.**

---

## 1. 산출물

| 파일 | 무엇 | 갱신 |
|---|---|---|
| `build/figma/variables.json` | 컬렉션·모드·변수·별칭 전량 페이로드 | `node scripts/gen-figma-vars.cjs` |
| `build/figma/naming-decisions.json` | 이름 세그먼트마다 "그룹/camelCase 중 무엇을 왜 골랐는가" 전건 기록 | 위와 동시 |
| `docs/figma-rename-map.json` | 구(pre-KDX) → 신 변수 이름 대조표 + **병합 목록** | `node scripts/figma-rename-map.cjs <구-tokens-디렉터리>` |
| `tokens/tokens.semantic-ext.json` | 시맨틱 **전체** 인벤토리(기본 + 주입 8역할) | `node scripts/gen-component.cjs --emit-semantic-ext` |

선행 순서는 하나뿐이다 — `--emit-semantic-ext` 를 먼저 돌려야 `gen-figma-vars` 가 돈다(없으면 하드 실패).

---

## 2. 구조 — 컬렉션은 계층축, 패밀리는 그룹

| 컬렉션 | 모드 | 최상위 그룹 |
|---|---|---|
| **Primitive** | Default | `color/` · `typo/` · `dimension/` · `spatial/`(size) · `motion/` |
| **Semantic** | **Light · Dark** | `color/` · `spatial/` · `visual/` · `motion/` |
| **Component** | Default | 컴포넌트 15종 이름 |

**왜 계층이 컬렉션 축인가.** `naming-delivery-guideline.md` §4.3-b 가 primitive `size.*` 와 시맨틱 `size.*` 의
이름 충돌을 "Figma 는 **컬렉션이 달라** 충돌 없음"으로 해소했다 — 이 문장이 성립하려면 두 계층이 서로 다른
컬렉션이어야 한다. 같은 문서 §2-A 의 "5 패밀리 = 컬렉션 축" 표현과는 어긋나므로, **패밀리는 컬렉션 안의
최상위 그룹으로 실현**한다(§3.3 의 `typo → font / size / xs` 같은 그룹 계층은 그대로 성립).
→ ⚠ **이 한 줄은 총괄 확인 대상이다**(BC-44 미결 ①).

**왜 light/dark 가 경로가 아니라 모드인가.** Tokens Studio 공식 문서상 Theme Group→컬렉션, Theme→모드로
매핑되고(상호운용 런 #2), 컴포넌트 레이어가 이미 모드중립 경로(`semantic.color.bg.…`)로 시맨틱을 참조한다.
소스 JSON 만 `semantic.color.light.…` 로 모드를 경로에 두고 있어, 생성기가 그 세그먼트를 걷어 모드로 접는다.

**운영 전제(문서 확정 — 상호운용 런 #2):** 다중 모드는 **유료 Figma 플랜**(무료 1모드) + **Project 안 파일**
(Drafts 불가)에서만 만들어진다. Tokens Studio 경로로 갈 경우 **Pro** 필요.

---

## 3. 이름 규칙 — 결정 #28 §3 "Figma 하이픈 0"

- 점 경로 → `/` 그룹. **leaf 에 하이픈 0** (현재 산출물 실측: 세 컬렉션 전부 하이픈 0건).
- 하이픈 복합어의 그룹/camelCase 판정은 §4.2(c) 세칙을 **기계로** 적용한다 —
  *형제 2개 이상이 같은 접두를 공유 + 그 접두가 같은 층의 leaf 가 아님 + 전치사가 아님* → `/` 그룹, 아니면 camelCase.
  판정 결과와 근거는 `naming-decisions.json` 에 전건 남는다(사람 눈이 아니라 표로 감사한다).
  - 예: `action-primary|secondary|ghost` → `action/primary` (형제 3)
  - 예: `surface-raised` → `surfaceRaised` (`surface` 가 leaf 로 존재 — 그룹으로 쪼개면 충돌)
  - 예: `on-action` → `onAction` (`on` 은 전치사)
- 단위는 이름에 없다(결정 #28 ④-1). Figma 는 unitless 저장이라 애초에 들어갈 자리가 없다.

---

## 4. 변수가 되지 않는 것 — 스타일로 간다

| 대상 | 왜 | 어디로 |
|---|---|---|
| `elevation.*` (12) | Figma 변수는 다중 레이어 그림자를 담지 못한다 | **Effect Style** `elevation/0…5`, light·dark 각각 |
| `semantic.typography.*` (18) | 합성 타이포는 변수가 아니다 | **Text Style** `역할/브레이크포인트` |
| `typography.letter-spacing.*` (11) | Figma 는 **em 자간 미지원**(%·px만) + % 자간은 변수 export 에서 skip | Text Style 안에서 `em×100 = %` 파생 |
| `dimension.rem.*` (15) · `font-size.rem.*` | Figma 는 unitless px — rem 가지는 같은 칸의 중복(Q-006 §1-Q4 실측 53/53 무손실) | 올리지 않음. rem 은 `build-css` 파생 |

빠뜨린 게 아니라 **다른 표면으로 보낸 것**이며, 페이로드의 `skipped` 배열에 이유와 함께 전건 기록된다.

---

## 5. 재동기화 절차

### 5-1. 처음 올릴 때

1. `node scripts/gen-component.cjs --emit-semantic-ext`
2. `node scripts/gen-figma-vars.cjs`
3. 대상 파일이 **Project 안**에 있는지 확인(Drafts 면 Dark 모드가 안 만들어진다).
4. Primitive → Semantic → Component 순으로 만든다. **순서가 곧 별칭 조건이다** — 참조 대상 변수가
   먼저 존재해야 alias 가 성립한다(Tokens Studio 문서 · 상호운용 런 #2).
5. Effect Style · Text Style 을 마지막에 만든다(변수 참조를 붙이려면 변수가 먼저 있어야 한다).

### 5-2. 이미 구 이름으로 올라가 있을 때 — **리네임이지 재생성이 아니다**

Figma 변수는 이름을 바꿔도 **id 가 유지되므로 바인딩이 살아남는다.** 지우고 다시 만들면 그 파일의
모든 바인딩이 끊긴다. 그래서 `docs/figma-rename-map.json` 순서로 **바꾼다**.

- ⚠ **병합 8건은 리네임이 아니다.** 사다리 통합으로 `space/2` 와 `radius/2` 가 **같은 `dimension/step/3`** 로
  간다. Figma 에서 한 이름은 한 변수만 가질 수 있으므로 **하나만 리네임하고, 나머지는 바인딩을 그 변수로
  옮긴 뒤 삭제**한다. 대상은 `figma-rename-map.json` 의 `merges[]` 에 `keep` / `retargetThenDelete` 로 적혀 있다.
- `radius/circle`(50%) → `dimension/special/full`(999px) 은 **값도 바뀐다**(Q-014). 원형이 필요한 곳은
  Figma 에서 999px 반경으로 그대로 원이 된다(999px 실측 통과 — 결정 #40).

### 5-3. 검증(BC-2 — 수치와 스크린샷은 서로를 대체하지 않는다)

- 수치: 컬렉션별 변수 수 · 별칭 수 · 하이픈 0 · 이름 중복 0 · `skipped` 사유 전건.
- 화면: 라이트/다크 모드 스위치로 Semantic 이 실제로 뒤집히는지, 컴포넌트 바인딩이 살아 있는지 눈으로.

---

## 6. 현행 수치 (2026-08-05, warm-gray ×0.05 반영본)

| | 수 |
|---|---|
| Primitive 변수 | **190** |
| Semantic 변수 | **79** (별칭 69 · 리터럴 10) |
| Component 변수 | **275** (미해결 별칭 **0**) |
| Effect Style | 20 (primitive 12 + 시맨틱 역할 8) |
| Text Style | 29 (합성 18 + 자간 11) |
| 이름 중복 · 하이픈 | **0 · 0** |
| 리네임 대조표 | 199행 (변경 55 · 불변 144 · 미매칭 **0** · 병합 8) |

---

## 7. 트리거 주체

| 일 | 주체 |
|---|---|
| 토큰 값·이름 변경 → 페이로드 재생성 | **HQ** (`gen-component --emit-semantic-ext` → `gen-figma-vars`) |
| Figma 파일에 실제 반영 | **HQ**(MCP 쓰기) 또는 진아님(플러그인 손 왕복) |
| 구 이름이 남은 파일 이행 | `figma-rename-map.json` 순서대로 — **병합 8건 주의** |
| 이름 규칙 판정이 이상해 보일 때 | `naming-decisions.json` 의 `why` 를 먼저 읽는다. 규칙이 틀렸으면 §4.2(c) 를 고치고 재생성 |

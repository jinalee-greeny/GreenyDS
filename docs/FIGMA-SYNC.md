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

## 2. 구조 — **컬렉션 축은 5 패밀리** (진아님 확정 2026-08-06)

| 컬렉션 | 모드 | 최상위 그룹 |
|---|---|---|
| **color** | **Light · Dark** | `brand/` `coolGray/` `warmGray/` `red/` `amber/` `green/` `blue/` `alpha/` · `bg/` `fg/` `border/` |
| **typo** | Value | `font/size/` `font/weight/` `font/family/` · `lineHeight/` |
| **spatial** | Value | `dimension/step/` `dimension/special/` · `padding/` `gap/` `size/` |
| **visual** | Value | `radius/` `borderWidth/` · `focusOffset` |
| **motion** | Value | `duration/` `easing/` · `control/` `overlay/` `emphasis/` |

**왜 패밀리가 컬렉션 축인가.** `naming-delivery-guideline.md` §2-A 가 처음부터 그렇게 적혀 있었고,
진아님이 2026-08-06 확정했다("5패밀리 축이 맞음"). 계층(primitive/semantic)은 컬렉션이 아니라
**같은 패밀리 안의 이름 깊이**로 드러난다 — `spatial/dimension/step/5`(원시) vs `spatial/padding/md`(시맨틱).
디자이너가 Figma 에서 찾는 단위는 "이게 몇 층이냐"가 아니라 "색이냐 여백이냐"다.

**§4.3-b 와의 충돌은 어떻게 풀렸나.** 가이드라인 §4.3-b 는 원시 `size.*` 와 시맨틱 `size.*` 의 이름 충돌을
"Figma 는 **컬렉션이 달라** 충돌 없음"으로 해소했었다. 패밀리 축에서는 둘 다 `spatial` 안이라 그 해법이 성립하지 않는다.
대신 **§4.3-b 의 원래 결론(원시 `size.*` 는 출력하지 않는다)을 그대로 실행**한다 —
생성기가 원시 `size/control|icon/*` 6건을 떨어뜨리고(`dropped`), 시맨틱 쪽 같은 이름에 **값을 인라인**한다.
그래서 `spatial/size/control/md = 44`(별칭 아님)이고, 자기참조는 0건이다.
컬렉션 안 이름 충돌은 생성기의 하드 게이트로 막는다(충돌 시 `throw`).

**왜 light/dark 가 경로가 아니라 모드인가.** Tokens Studio 공식 문서상 Theme Group→컬렉션, Theme→모드로
매핑되고(상호운용 런 #2), 컴포넌트 레이어가 이미 모드중립 경로(`semantic.color.bg.…`)로 시맨틱을 참조한다.
소스 JSON 만 `semantic.color.light.…` 로 모드를 경로에 두고 있어, 생성기가 그 세그먼트를 걷어 모드로 접는다.
**모드가 필요한 패밀리는 `color` 하나뿐**이다 — 나머지 넷은 라이트/다크가 같은 값이라 단일 모드(`Value`)로 둔다.

**컴포넌트 레이어(275)는 올리지 않는다** — 결정 #28 §2 "첫 출력은 primitive + semantic". 페이로드에는
`(Component — 미배포, #28 §2)` 컬렉션으로 계산만 해두고 Figma 에는 만들지 않는다.

**운영 전제(문서 확정 — 상호운용 런 #2):** 다중 모드는 **유료 Figma 플랜**(무료 1모드) + **Project 안 파일**
(Drafts 불가)에서만 만들어진다. Tokens Studio 경로로 갈 경우 **Pro** 필요.

---

## 3. 이름 규칙 — 결정 #28 §3 "Figma 하이픈 0"

- 점 경로 → `/` 그룹. **leaf 에 하이픈 0** (현재 산출물 실측: 5 패밀리 전부 하이픈 0건 — Figma 실물 재확인 0건).
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
4. 컬렉션을 **먼저 전부 만들고 변수도 전부 만든 뒤, 두 번째 패스에서 값·별칭을 넣는다.**
   패밀리 축에서는 `visual/radius/*` → `spatial/dimension/step/*` 처럼 **컬렉션을 가로지르는 별칭**이 생겨서,
   "패밀리 하나씩 완성" 순서로는 참조 대상이 아직 없을 수 있다. 2패스면 순서 의존이 사라진다.
   별칭은 이름으로 찾되 **같은 패밀리를 먼저** 보고, 없을 때만 다른 패밀리를 본다.
5. Effect Style · Text Style 을 마지막에 만든다(변수 참조를 붙이려면 변수가 먼저 있어야 한다).

### 5-2. 이미 구 이름으로 올라가 있을 때 — **리네임이지 재생성이 아니다**

Figma 변수는 이름을 바꿔도 **id 가 유지되므로 바인딩이 살아남는다.** 지우고 다시 만들면 그 파일의
모든 바인딩이 끊긴다. 그래서 `docs/figma-rename-map.json` 순서로 **바꾼다**.

- ⚠ **병합 8건은 리네임이 아니다.** 사다리 통합으로 `space/2` 와 `radius/2` 가 **같은 `dimension/step/3`** 로
  간다. Figma 에서 한 이름은 한 변수만 가질 수 있으므로 **하나만 리네임하고, 나머지는 바인딩을 그 변수로
  옮긴 뒤 삭제**한다. 대상은 `figma-rename-map.json` 의 `merges[]` 에 `keep` / `retargetThenDelete` 로 적혀 있다.
- `radius/circle`(50%) → `dimension/special/full`(999px) 은 **값도 바뀐다**(Q-014). 원형이 필요한 곳은
  Figma 에서 999px 반경으로 그대로 원이 된다(999px 실측 통과 — 결정 #40).

### 5-3. 계층축 → 패밀리축 이행 — **shim 이지 삭제가 아니다**

`variableCollectionId` 는 읽기 전용이라 변수를 다른 컬렉션으로 **옮길 수 없다.** 지우고 다시 만들면
그 파일의 모든 바인딩이 끊긴다(Cover 페이지 한 장만 재어도 노드 바인딩 17건이 전부 P/S 직참조였다).
그래서 **새 패밀리 컬렉션을 만들고, 옛 Primitive/Semantic 변수는 새 변수를 가리키는 투명 shim 으로 남긴다.**

- shim 은 값을 갖지 않고 **별칭만** 갖는다 → 값의 SSOT 는 패밀리 컬렉션 하나뿐이다(결정 #29).
- `scopes = []` + `hiddenFromPublishing = true` → 속성 피커·라이브러리 목록에 **안 보인다.**
- 옛 이름 → 패밀리 이름 매핑은 손으로 적지 않는다. 생성기와 **같은 `FAMILY_OF` / `STRIP` 규칙**을 그대로 쓰고,
  규칙으로 안 풀리는 폐기 어휘만 표로 명시한다(`motion/duration/moderate → duration/base`,
  `motion/*/default → base|standard`, `size/radius/base → visual/radius/control`, `space/section/sm|md|lg → gap/section/mobile|tablet|desktop`).
- 타입이 다르면 shim 을 걸지 않고 **불일치로 보고**한다(실측 0건).

바인딩을 새 변수로 옮겨 붙이고 나면 그때 shim 을 지운다 — **순서가 반대면 바인딩이 죽는다.**

### 5-4. 검증(BC-2 — 수치와 스크린샷은 서로를 대체하지 않는다)

- 수치: 컬렉션별 변수 수 · 별칭 수 · 하이픈 0 · 이름 중복 0 · `skipped` 사유 전건.
- 화면: 라이트/다크 모드 스위치로 Semantic 이 실제로 뒤집히는지, 컴포넌트 바인딩이 살아 있는지 눈으로.

---

## 6. 현행 수치 (2026-08-06, 5 패밀리 이행 완료본)

**페이로드**

| 컬렉션 | 변수 | 모드 | 비고 |
|---|---|---|---|
| color | **156** | Light · Dark | 원시 107 · 시맨틱 49 |
| typo | **51** | Value | 원시만(합성 타이포는 Text Style) |
| spatial | **35** | Value | 원시 17 · 시맨틱 18 |
| visual | **9** | Value | 별칭 8 · 리터럴 1(`focusOffset`) |
| motion | **17** | Value | 별칭 8 · 리터럴 9 |
| (Component — 미배포) | 275 | — | 미해결 별칭 **0** |
| 떨어뜨린 원시 | 6 | — | `size/control|icon × sm|md|lg` (§2 참조, 값 인라인) |

**Figma 실물 (파일 `6rj43tHkCSLaJIxeeXgJPD`, 2026-08-06 정리 후)**

| | 수 |
|---|---|
| 새 패밀리 컬렉션 변수 | **268** (color 156 · typo 51 · spatial 35 · visual 9 · motion 17) |
| 끊긴 별칭(dangling) · 하이픈 · 이름 중복 · 자기참조 | **0 · 0 · 0 · 0** |
| 옛 Primitive/Semantic → shim 전환 | **277** (타입 불일치 **0**) — Primitive 193 · Semantic 84 |
| 잔여 레거시 변수 삭제 | **30** (`Semantic::font/{6역할}/{5속성}`) — 전 17페이지 노드 바인딩 **0건** 확인 후 삭제 |
| Text Style | **18** (역할×브레이크포인트, 전부 정수 px). 구 6건은 노드 375개 재타깃 후 삭제 |
| Effect Style | 20 (primitive 12 + 시맨틱 역할 8) |
| Component 컬렉션 | 103 — 구세대 이름 유지(미배포, #28 §2). 값은 Semantic shim 경유로 패밀리 컬렉션에 도달 |
| 리네임 대조표 | 199행 (변경 55 · 불변 144 · 미매칭 **0** · 병합 8) |

**레거시 삭제 순서 — 조사가 먼저다.** 변수 30건은 전 17페이지를 훑어 **노드 바인딩 0건**을 확인한 뒤 지웠다.
Text Style 6건은 반대로 **텍스트 노드 375개가 실제로 물고 있었으므로** 먼저 `역할/desktop` 18건으로 재타깃하고
(잔존 0 재확인) 그 다음 지웠다. 재타깃은 크기를 76.3→76 · 48.8→49 · 12.8→13 으로 옮긴다 — 소수점 정리(2026-08-06 지시)와 같은 방향.

**Text Style 이 무엇을 변수에 묶고 무엇을 리터럴로 두나.** `fontFamily` · `fontSize` · `fontWeight` 는 `typo`
변수에 바인딩한다. `lineHeight` 는 **묶지 않는다** — Figma 의 lineHeight 변수는 px 로 해석되는데 우리 값은
비율(1.6)이라 1.6px 이 되어 버린다. `letterSpacing` 은 애초에 변수가 되지 않는다(§4). 둘 다 `PERCENT` 리터럴로 넣는다.

**파일 안 설명문도 산출물의 일부다(BC-37).** Cover·Typography 페이지의 수치 문장이 구세대(변수 281 · 텍스트 스타일 6 ·
`Font/Display 76.3`)를 그대로 말하고 있어 함께 갱신했다. 빌드가 치환하지 않는 문자열은 반드시 화석이 된다.

---

## 6-b. 컨피규레이터 export 는 사본이 아니라 **입력**이다

브라우저가 계산한 DTCG·CSS·Figma 텍스트를 납품하면 **엔진이 둘이 된다**(결정 #2 "엔진은 하나").
그래서 컨피규레이터의 정본 산출은 **`greenyds.config.json` 한 장**이고, 산출물은 리포 파이프라인이 만든다.

```
컨피규레이터 → greenyds.config.json → apply-config → primitive · semantic · component · css · build/figma/variables.json
```

**왕복 검증(실측 2026-08-06).** 기본 설정에서 export 한 config 를 `apply-config` 에 넣으면
`tokens.primitive.json` · `tokens.semantic.json` · `tokens/component/*.json`(15) · `build/figma/variables.json` 이
리포 정본과 **바이트 동일**하다. 두 표면이 같은 엔진을 통과한다는 뜻이다 — 이 등식이 깨지면 export 가 거짓말을 하고 있는 것이다.

**config 가 여는 파라미터.** `primitive.color.ramps[].seed` · `primitive.typography.breakpoints.*` ·
`primitive.dimension.basePx` · `primitive.elevation.tint` · `semantic.neutral` · `semantic.targets` ·
`semantic.radiusTiers` · `semantic.spacingRoles` · `motion.durations`.

**규칙은 코드가 지킨다 — config 로 못 깨뜨린다.**
- `radiusTiers` · `spacingRoles` 는 **사다리 칸 번호(0~14)** 만 받는다. 임의 px 이 들어오는 길을 만들지 않는다(결정 #40).
- `motion.durations` 는 **0 시작 · 단조 증가 · 100ms 그리드**를 강제한다. 깨면 하드 실패(진아 지시 2026-08-06).

**아직 못 받는 조작은 숨기지 않는다.** 컨피규레이터가 노출하는 knob 중 파이프라인 입력이 없는 것은
export 파일의 `meta.unmapped` 에 **이유와 함께 전건 기록**된다(간격 역할 모델 불일치 · 서체 슬롯 · 그림자 강도 ·
easing 프리셋 · 다크 on/off). 조용히 떨어뜨리면 "내보냈는데 안 바뀐다"가 되고, 그건 사본을 주는 것보다 나쁘다.

---

## 7. 트리거 주체

| 일 | 주체 |
|---|---|
| 컨피규레이터 설정 → 전 산출물(Figma 포함) | **누구나** — `config (정본)` 저장 후 `node scripts/apply-config.cjs --config greenyds.config.json` |
| 토큰 값·이름 변경 → 페이로드 재생성 | **HQ** (`gen-component --emit-semantic-ext` → `gen-figma-vars`) |
| Figma 파일에 실제 반영 | **HQ**(MCP 쓰기) 또는 진아님(플러그인 손 왕복) |
| 구 이름이 남은 파일 이행 | `figma-rename-map.json` 순서대로 — **병합 8건 주의** |
| 계층축 파일 → 패밀리축 이행 | §5-3 shim. 바인딩 재연결 **전에** shim 을 지우지 않는다 |
| 이름 규칙 판정이 이상해 보일 때 | `naming-decisions.json` 의 `why` 를 먼저 읽는다. 규칙이 틀렸으면 §4.2(c) 를 고치고 재생성 |

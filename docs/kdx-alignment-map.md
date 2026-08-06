# KDX 정렬 맵 — GreenyDS 어휘·구조 마이그레이션 SSOT (결정 #40)

> 기준 문서: KDX Design Token System Brief (2026-08-04 진아 전달).
> 판정: 전면 재구성 · 충돌 어휘 KDX 전면 교체 · Category 이름 미포함 유지 · 여백 gap/padding/margin 교체.
> 이행 순서: ① 문서(가이드 v4.0 — 완료) → ② 토큰 JSON·파이프라인 → ③ 컨피규레이터 → ④ Figma 변수.

## 1. 구조 정렬

| 축 | 이전 (GreenyDS) | 이후 (KDX 정렬) |
|---|---|---|
| Primitive 그룹 | color · typo · spatial · visual · motion | **color · typo · dimension** (+ motion = GreenyDS 확장) |
| Semantic 그룹 | 동일 5패밀리 | **color · typo · spatial · visual** (+ motion 확장) |
| dimension 원천 | space.0…12 / radius.0…6 / borderWidth 분산 | **사다리 step-0…14** (0·2·4·8·12·16·20·24·32·40·48·64·80·96·128) + **special.hairline(1px)·special.full(999px)** — Q-014 방향 확정 포함 |
| Semantic spatial | inset · stack · inline · sectionGap | **gap(x·y·section) · padding · margin · w · h** |
| Semantic visual | radius · borderWidth · elevation | **radius · border · elevation** |
| 이름 구조 | {카테고리}.{역할}[.{상태}] | 동일 유지 — **Category(패밀리)는 이름 미포함** (진아 확정, KDX Path 표기와는 문서 변환표로 연결) |

## 2. 어휘 교체 (old → new)

| 묶음 | 이전 | 이후 | 비고 |
|---|---|---|---|
| 색 카테고리 | bg · fg · **stroke** | bg · fg · **border** | border 금지 축약 목록에서 해제 |
| 상태 | hover · **active** · **focus** · disabled · **invalid** | default · hover · **pressed** · **focused** · **selected · unselected** · disabled | invalid → 상태색 **error** 문맥으로. **selected/unselected 공용 승격 = 2026-08-06 실행 완료** — `color.bg.selected/unselected` · `color.fg.selected/unselected` 신설, Select.item·Tabs 리타깃. 결정 #27 폐기. ⚠ Segmented 는 raised 칩이라 이 역할을 쓰지 않고 고유 상태 + CS-1 마커 유지 |
| 상태색(Status) | **danger** · warning · success · info | **error** · warning · success · info | fg.danger → fg.error 등 전 계층 |
| 강도(Contrast) | subtle · (무표기) · strong — 3단 제한 | **faint · muted · subtlest · subtler · subtle · default · strong · stronger · strongest** — 9단 어휘 풀 | **2026-08-06 어휘 풀 등재 완료.** 실사용 기본은 subtle/default/strong — **풀에 있다고 토큰을 만들지 않는다**(소비처 없는 역할 = 고아). "3단 초과 금지" 규정 폐지 |
| 위계 | primary · secondary · **subtle** · disabled | primary · secondary · **tertiary · quaternary** | fg.subtle → **fg.tertiary**(Phase ②). **`fg.quaternary` 2026-08-06 신설** — 목표 대비 2:1, **텍스트 사용 금지**(장식·보조 기호 전용)를 이름이 아니라 `$extensions.rule` 에 박았다. disabled는 상태로 이동 |
| 크기 | sm · md · lg (3단) | **2xs · xs · sm · md · lg · xl · 2xl** (7단 풀) | 실사용은 필요한 단계만 |
| 방향 | x · y | x · y · **top · bottom · left · right · start · end** | |
| 치수 | (없음) | **w**(width) · **h**(height) | |
| Style 축 | (버튼 변형에 혼재: primary/secondary/ghost) | **solid · outline · ghost · transparent · inverse · static** | Priority와 Style 분리 — 컴포넌트 재편 시 적용 |
| 축약 허용 추가 | — | **border · comp · w · h · 2xs · 2xl** | |
| 여백 | inset → **padding** / stack → **gap.y** / inline → **gap.x** / sectionGap → **gap.section** | | margin 신설 |
| 테두리 굵기 | borderWidth(0/1/2/4) | **border** — 사다리 step-0(0) · special.hairline(1) · step-1(2) · step-2(4) | |

## 3. GreenyDS 확장 (KDX 미정의 — 유지, 비충돌)

- **motion** 패밀리 (duration·easing) — KDX 브리프에 없음. 유지.
- 타이포 역할 **title · caption** — KDX는 display/heading/body/label(+number·link). title·caption 유지, number·link는 어휘 풀 등재.
- 자동 검사 게이트 체계 (KDX의 accessibility 카테고리에 대응).

## 4. 기술 노트

- **DTCG 충돌**: `$type: "dimension"`은 예약어 — `gen-component.cjs:532`가 문자열 분기함. 그룹명 dimension 사용을 위해 **경로 인식($type vs 그룹 경로 구분) 수정 필수** (Phase ② 선행 작업).
- 사다리 old→new 매핑: space.0→step-0 · space.1→step-2 · space.2→step-3 · space.3→step-4 · space.4→step-5 · space.5→step-7 · space.6→step-8 · space.7→step-9 · space.8→step-10 · space.9→step-11 · space.10→step-12 · space.11→step-13 · space.12→step-14 (2px·20px 두 칸 신설분).
- 표기 변환 6종(Path/Dot/Kebab/Snake/Camel/Pascal)은 KDX Naming Convention 표를 기준으로 CDS_Guide 상신 건(표기 변환 표 전수화)과 병합 — 판정 완료로 처리.

---

## 5. 실행 상태 (2026-08-06 갱신)

| # | 항목 | 상태 |
|---|---|---|
| ② 상태 어휘 | active→pressed · focus→focused · invalid 폐지 | ✅ Phase ② 실행 |
| ② 상태 어휘 | **selected / unselected 공용 승격** | ✅ **2026-08-06 실행** — 시맨틱 4역할 신설 + Select·Tabs 리타깃 (결정 #27 폐기) |
| ② 상태색 | danger → error | ✅ Phase ② 실행 |
| ② 색 카테고리 | stroke → **border** (굵기는 `borderWidth`) | ✅ **결정 #42로 개정 실행** — `bdr` 은 결정 #28 ④-2 금지 축약이라 전체 단어로 |
| ② 위계 | tertiary | ✅ Phase ② / **quaternary** ✅ 2026-08-06 |
| ② 강도 | 9단 어휘 풀 | ✅ **어휘 풀 등재**(토큰은 소비처 발생 시) |
| ② 크기 | 2xs~2xl 7단 풀 | ✅ 어휘 풀 등재 |
| ② 방향 | x·y·top·bottom·left·right·start·end | ✅ 어휘 풀 등재 |
| ② 치수 | w · h | ✅ 어휘 풀 등재 |
| ② Style 축 | solid·outline·ghost·transparent·inverse·static | ✅ 어휘 풀 등재 — 컴포넌트 재편 시 적용 |
| ④ 여백 | inset/stack/inline → padding/gap | ✅ Phase ② 실행 |
| 부속 | dimension 사다리 단일 원천 | ✅ Phase ② 실행 · Figma 반영 완료(BC-44) |

**어휘 풀 등재 ≠ 토큰 발행.** 풀은 "이 단어를 쓸 수 있다"는 목록이고, 토큰은 소비처가 생겼을 때 만든다.
소비처 없는 역할을 미리 발행하면 고아 시맨틱이 되고, 그건 인벤토리가 아니라 미결 항목이다(결정 #37 (3)).

## 6. 값 정리 (2026-08-06, 진아 지시 "소수점 삭제되는 방향으로 정리")

- **폰트 크기: 정수 스냅.** `gen-tokens` 타이포 `round` 파라미터 **0.5 → 1**. 반픽셀(10.5·21.5·37.5·76.5)이 사라진다 — Figma 변수와 브라우저 렌더의 반올림 지점이 갈려 같은 토큰이 두 값으로 보이던 문제를 원천에서 없앴다.
- **행간: 소수 4자리 → 2자리.** 1.5214 → 1.52. 비율이라 소수를 없앨 수는 없고, 사람이 읽고 옮겨 적을 수 있는 자리까지만 남긴다.
- **모션: 100ms 그리드.** `0/120/200/320/480` → **`0/100/200/300/500`**. 구값은 간격이 120·80·120·160 으로 불규칙해 "그 사이 어딘가"를 발명하기 쉬웠다.
- **부수 결함 1건 해소:** `gen-semantic.cjs` 가 폰트 크기 표(`FS_PX`)를 **하드코딩 사본**으로 들고 있어 정수 스냅 후 값이 갈라졌다(caption 최소 12px 판정이 낡은 12.5 를 보고 있었다). primitive 를 직접 읽도록 교체 — 결정 #29 "복사가 아니라 생성" 과 같은 사고다.

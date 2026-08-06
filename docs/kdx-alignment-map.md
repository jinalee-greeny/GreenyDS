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
| 상태 | hover · **active** · **focus** · disabled · **invalid** | default · hover · **pressed** · **focused** · **selected · unselected** · disabled | invalid → 상태색 **error** 문맥으로. selected 공용 승격 = **Q-012 판정 번복** |
| 상태색(Status) | **danger** · warning · success · info | **error** · warning · success · info | fg.danger → fg.error 등 전 계층 |
| 강도(Contrast) | subtle · (무표기) · strong — 3단 제한 | **faint · muted · subtlest · subtler · subtle · default · strong · stronger · strongest** — 9단 어휘 풀 | 실사용 기본은 subtle/default/strong, 나머지는 풀 등재. "3단 초과 금지" 규정 폐지 |
| 위계 | primary · secondary · **subtle** · disabled | primary · secondary · **tertiary · quaternary** | fg.subtle → **fg.tertiary**. disabled는 상태로 이동 |
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

# Q-006 재상정 패키지 — rem·px 원천 보유 구조 (B1 원 선택지 복원)

**상태:** 재상정 잔여 2건 중 ①(B1 원 선택지 복원) 이행. ②(Figma 손 왕복 A~E)는 진아 지시로 후속 연기(2026-07-24).
**목적:** 결정 #12(spacing·radius·typography 크기 = rem·px 병기)의 **원천 보유 구조**를 재판정하기 위한 선택지를 복원한다. HANDOFF 상세 유실분(pipeline/HANDOFF.md) 복원.

## 배경
- 현재 원천은 **이중 병렬 트리**: `spacing.rem.space-N` + `spacing.px.space-N`(radius·typography도 동일).
- 이미 단일 원천 선례 존재: **elevation** = `$value`(rem) + `$extensions.px`(px 병기) — 한 토큰이 두 단위를 보유.
- 상호운용 런 실측(research/pipeline-interop-findings.md):
  - 단위중립 단일 원천에서 rem 트리 **53/53 무손실 재생성**(불일치 0) → 이중 트리의 rem 가지는 순수 중복.
  - Figma 변수는 unitless px 저장, Tokens Studio가 전역 base(16px)로 rem→px 변환 → 이중 트리 동시 업로드 시 같은 값 이중 변수 개연(손 왕복 미실증 — 잔여 ②).
  - Style Dictionary v4 커스텀 transform 실행 실증(런 #4) → 빌드 파생 경로 실행 가능성 리스크 해소.

## 복원된 선택지 (재판정 대상)
- **(A) 현행 이중 병렬 트리 유지.** rem·px 각각 명시. 장: 소비자 파싱 단순. 단: 값 중복(무손실 파생 가능 실측) · Figma 이중 변수 위험 · 드리프트 표면 2배.
- **(B) 단위중립 단일 원천 + 빌드 파생.** 원천은 단위중립 수치(또는 px) 단일 보유, rem은 빌드가 파생하고 `$extensions`에 병기(elevation 선례와 동형). 장: 중복 제거·드리프트 원천 차단. 단: 빌드 변환 필요 — **상호운용 런 #4에서 SD transform 실행 가능성 실증**.
- **(C) DTCG Resolver platform modifier 정렬.** 저작 구조는 단일, 빌드 시 web(rem)/native(px) 컨텍스트로 resolver가 분기. 표준 정렬. 장: 표준·미래지향(우리 `rem/`·`px/` 병렬 그룹은 사실상 자체 발명 modifier) · **정렬 타깃이 동작하는 도구로 실존**(Terrazzo resolvers 가이드·2025.10·`bundle` CLI, 07-24 확인). 단: resolver 표준 아직 draft/구현 초기("do not implement" 경고 지속, 07-26 재확인).

## 요청 세션 권고
- **(B) 또는 (C).** interop이 (B)의 무손실성·SD 실행을 실증했고, (C)는 정렬 타깃(Terrazzo)이 실존한다. **저작 구조는 (B)로 단일화하되, 빌드 시 (C) resolver 구조로 정렬 가능하게 설계**하는 "resolver 정렬안"을 기준 선택지로 포함 권장(벤치마크 07-10 §2).
- 총괄 값 판정은 **손 왕복 ②(진아 후속) 충족 후**. 그 전까지 **원천 구조 변경 금지** 유지.

> 이 문서로 재상정 잔여 ①(원 선택지 복원)을 이행. ②(Figma 손 왕복 A~E, 약 10분) 회신 시 총괄 재판정.

# GreenyDS

디자인 시스템 마스터 프리셋 — **파라미터에서 토큰을 파생하는 엔진**(고정값 세트가 아님, 결정 #2).
primitive → semantic → component 3계층을 파라미터·규칙으로 생성하고, 각 레이어의 접근성·정합성을 CI 하드 게이트로 검증한다.

## 구조
```
tokens/                 DTCG 원천·산출
  tokens.primitive.json   primitive 5레이어 (색·타이포·간격·radius·elevation) — gen-tokens 산출·SSOT
  tokens.semantic.json    시맨틱 역할 — gen-semantic 산출
  tokens.{size,border-width,motion}.json  A3 신설 primitive
  component/*.json        컴포넌트 프리셋 15종(Wave1+2 8종 + Wave3 7종) — gen-component 산출
scripts/
  gen-tokens.cjs          파라미터(DEFAULT_PARAMS) → primitive. --check로 SSOT 재현 검증
  gen-semantic.cjs        primitive + 바인딩 규칙(#16~#19) → 시맨틱 (대비 자동 해결)
  gen-component.cjs       시맨틱 → 컴포넌트 35종 + 919 검사
  perturb.cjs / presets.cjs  섭동 매트릭스 6프리셋 × 919 = 5,514 검사
  ramps.cjs               primitive 색 미러 — SSOT(primitive.json) 직접 읽기(드리프트 방지)
  build-css.cjs           primitive → build/css·json (자립 빌더, 외부 의존 없음). --check로 드리프트 검증
  validate-tokens.cjs     primitive 엔진 검증 (✗ 하드 / △ 권고)
build/                  빌드 산출 (build-css.cjs 생성)
  css/primitives.css      CSS 변수
  json/primitives.flat.json  flat 토큰 맵
.github/workflows/build-tokens.yml  CI: 재현→검증→시맨틱→컴포넌트→섭동→빌드
```

## 실행
```
node scripts/gen-tokens.cjs --check     # 파라미터→SSOT 재현 검증
node scripts/validate-tokens.cjs        # primitive 하드 게이트
node scripts/gen-semantic.cjs tokens/tokens.semantic.json
node scripts/gen-component.cjs          # 919 검사
node scripts/perturb.cjs                # 5,514 검사 (엔진 적응)
node scripts/check-mirror.cjs           # 컨피규레이터 미러 ↔ 파이프라인 값 결정 대조
node scripts/build-configurator-comps.cjs  # 레포 컴포넌트 토큰 → 컨피규레이터 표 (--check 로 드리프트 검사)
node scripts/build-css.cjs              # 공식 CSS·flat JSON 생성 (npm run build)
node scripts/build-css.cjs --check      # 커밋된 build/가 토큰과 일치하는지 드리프트 검증
```

빌드는 외부 패키지·네트워크 없이 순수 Node로 동작한다. (이전엔 Style Dictionary를 공식 빌더로 계획했으나,
값 기준 diff=0 형식을 그대로 재현하는 자립 빌더로 대체해 CI의 네트워크 의존을 제거함 — 2026-07-28.)

## 파라미터 편집
토큰 값은 손 편집이 아니라 `scripts/gen-tokens.cjs`의 `DEFAULT_PARAMS`(컨피규레이터 B2a가 UI로 노출)를 수정하고 재생성한다.
- **중립 틴트(BC-11, 2026-07-27 A안):** `color.ramps`의 gray에 `chromaScale`(쿨 0.5·웜 0.2). L·H 불변, 채도만 감쇠. 값은 엔진이 파생(하드코딩 아님).

## 인수인계
표준 도구 우선 · 조각마다 실행 문서 · 개인 종속 금지 · "왜" 기록 (결정 #14).

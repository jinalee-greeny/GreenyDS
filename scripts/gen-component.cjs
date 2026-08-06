#!/usr/bin/env node
/**
 * gen-component.cjs — 컴포넌트 레이어 DTCG JSON 생성기
 * (Wave 1+2: A3, 2026-07-21 완료 · Wave 3: CDS_Components, 2026-07-29 확장)
 *
 * 무엇: 시맨틱 역할 + 신설 primitive(size·border-width·motion) 위에서 컴포넌트 프리셋
 *      토큰을 생성한다. Wave 1+2 = Button·Input·Select·Card·Switch·Tabs·Modal·Toast(8종).
 *      Wave 3 = Checkbox·Radio·Slider·Segmented·Tooltip·Badge·Banner(7종, general-component-list.md §2).
 * 원칙(B1 계약 §7·제안서 §4, component-layer-spec.md §0 — Wave 3도 동일 승계):
 *   - 컴포넌트 $value는 "모드-중립 시맨틱 alias"만. {semantic.color.bg.action-primary}
 *     처럼 light/dark 세그먼트를 생략한 단일 문법(§4.3). 모드 해석은 gen 체인 상류(이 파일)가
 *     시맨틱을 모드별 세트로 전개해서 수행 → 컴포넌트 정의 1벌, 산출 모드 수만큼.
 *   - 예외 2종만: ⓐ 규칙 실체화 computed( $extensions.rule 필수, nesting·scale 등 ) ⓑ 센티넬(pill/circle).
 *   - 상호작용 상태는 참조 전용(재정의 금지). 컴포넌트 고유 상태(selected 등)만 규칙 실체화로 신설,
 *     2개 이상 컴포넌트에서 반복되면 시맨틱 승격 검토(컨펌 큐 경유, 독단 금지 — Q-009).
 * 어떻게: node gen-component.cjs   → tokens/component/*.json + tokens/tokens.{size,border-width,motion}.json
 *                                     + build/component.resolved.json(검증 데모용) + 검사 리포트
 * 주의: 시맨틱 resolved 값은 tokens/tokens.semantic.json(gen-semantic 산출)에서 직접 읽는다.
 *       신설 primitive는 아래 파라미터로 생성한다(값 목록이 아니라 규칙 — B1 계약 §7-8).
 * 네이밍: Q-011(하이픈 워싱) 총괄 최종 컨펌 대기 중 — 확정 전까지 기존 8종과 동일하게
 *       component-layer-spec.md §1(하이픈 세그먼트는 예약어 한정) 규칙을 Wave 3에도 그대로 적용.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
// 섭동 매트릭스: SEM 경로·중립·브랜드·출력을 프리셋으로 주입 (PRESET 미설정 시 기본 불변)
const PCFG = process.env.PRESET ? require(process.env.PRESET) : {};
const SEM_PATH = process.env.SEM_PATH || path.join(ROOT, "tokens/tokens.semantic.json");
const NEUTRAL = PCFG.neutral || "cool-gray";           // 중립 램프(웜/쿨) — placeholder·knob 해결에 사용
const SEM = require(SEM_PATH).semantic;

/* ============================================================
 * 1) 신설 primitive — 파라미터 + 생성 규칙 (DP-2)
 * ============================================================ */
const GRID = 4;                       // 4px 그리드(#9)
const REM_BASE = 16;                  // 1rem = 16px (#12 병기 기준)
const px2rem = px => +(px / REM_BASE).toFixed(4);

// size.control: 간격 엔진 재사용(선형, base×배수) — 신규 엔진 없음. sm=36, 균등 +8.
const SIZE_PARAMS = { control: { base: 36, step: 8, n: 3 }, icon: { base: 16, step: 4, n: 3 } };
const T = ["sm", "md", "lg"];
function buildSize() {
  const mk = (fam) => {
    const p = SIZE_PARAMS[fam], o = { "$extensions": { rule: { type: "linear", base: p.base, step: p.step, grid: GRID }, why: fam === "control" ? "닫힌 컨트롤 높이" : "아이콘 슬롯" } };
    T.forEach((t, i) => { const v = p.base + p.step * i;
      o[t] = { "$value": `${px2rem(v)}rem`, "$type": "dimension", "$extensions": { px: v, onGrid: v % GRID === 0, halfStep: v % 8 !== 0 } }; });
    return o;
  };
  return { "size": { "$description": "요소 치수 — 간격 엔진 재사용(4px 그리드 선형). rem·px 병기(#12 부칙).", "control": mk("control"), "icon": mk("icon") } };
}
// border-width primitive는 결정 #40으로 폐지 — dimension 사다리(step-0·1·2) + special.hairline이 원천.
// motion primitive (DP-5, A3 오너 · 게이트 M-1) — duration=ms 고정, easing=cubic-bezier 4튜플(#12 부칙). ~12개 캡.
// ms, 단조 증가 · 100ms 그리드 (진아 지시 2026-08-06 "모션도 해당 방향으로 정리").
// 구값 0/120/200/320/480 은 간격이 120·80·120·160 으로 불규칙했다. 100 그리드로 스냅해
// 사람이 외울 수 있는 사다리로 만든다 — 값을 고를 때 "그 사이 어딘가"를 발명하지 않게 된다.
const DURATION = { instant: 0, fast: 100, base: 200, slow: 300, slower: 500 };
const EASING = {                                                                 // cubic-bezier 4튜플 (x∈[0,1])
  "linear":     [0, 0, 1, 1],
  "standard":   [0.2, 0, 0, 1],       // 일반 UI 상태 전이 (ease-out 우세)
  "decelerate": [0, 0, 0.2, 1],       // 진입(entrance) — 감속
  "accelerate": [0.4, 0, 1, 1]        // 이탈(exit) — 가속
};
function buildMotion() {
  const dur = { "$description": "지속 시간 — ms 고정(#12 부칙). 0=즉시, 단조 증가." };
  for (const [k, v] of Object.entries(DURATION)) dur[`duration-${k}`] = { "$value": `${v}ms`, "$type": "duration", "$extensions": { ms: v } };
  const eas = { "$description": "가속 곡선 — cubic-bezier 4튜플. 파생 아닌 선택." };
  for (const [k, v] of Object.entries(EASING)) eas[k] = { "$value": `cubic-bezier(${v.join(", ")})`, "$type": "cubicBezier", "$extensions": { tuple: v } };
  return { "motion": { "$description": "모션 primitive (DP-5) — duration·easing. prefers-reduced-motion은 소비 레이어 책임.", "duration": dur, "easing": eas } };
}

/* ============================================================
 * 2) 시맨틱 신설(공백 5건, DP-4 §5.5) — 참조 전용을 성립시키는 선행물
 *    action-disabled·placeholder·scrim·focus-offset·icon
 *    (icon size는 §1에서 이미 생성 — 여기선 color/치수 역할만)
 * ============================================================ */
const RAMPS = require(path.join(__dirname, "ramps.cjs"));   // primitive 색 미러(공유)
const STEPS = ["50","100","200","300","400","500","600","700","800","900","950"];
const hexRgb = h => { h = h.replace('#',''); return [0,1,2].map(i=>parseInt(h.substr(i*2,2),16)); };
const lum = rgb => { const a = rgb.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return .2126*a[0]+.7152*a[1]+.0722*a[2]; };
const contrast = (h1,h2) => { const l1=lum(hexRgb(h1)),l2=lum(hexRgb(h2)); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); };
const round2 = n => Math.round(n*100)/100;
// worst-case 표면 해결기(#19 재사용) — fg.placeholder 신설용
function resolveW(ramp, surfaces, target) {
  let best=null,max=null;
  for (const s of STEPS){ const hx=RAMPS[ramp][s]; let minR=Infinity,worst=null;
    for (const [nm,bg] of Object.entries(surfaces)){ const r=contrast(hx,bg); if(r<minR){minR=r;worst=nm;} }
    if(!max||minR>max.ratio)max={step:s,hex:hx,ratio:minR,worst};
    if(minR>=target&&(!best||minR<best.ratio))best={step:s,hex:hx,ratio:minR,worst}; }
  return best||max;
}
const problems = [];
function surfacesFor(mode){ // 입력 필드가 놓이는 표면 집합
  const bg = SEM.color[mode].bg;
  const val = t => bg[t].$extensions.resolved || bg[t].$value;
  return { surface: val("surface"), subtle: val("subtle"), raised: val("surface-raised"), overlay: val("surface-overlay") };
}
// 시맨틱 JSON에 신설 역할을 주입(참조 전용 성립). 각 모드별 resolved 기록.
function injectSemanticAdditions(){
  const add = { color:{}, size:{}, "borderWidth":{}, "focus-offset":{} };
  for (const mode of ["light","dark"]) {
    const bg = SEM.color[mode].bg, fg = SEM.color[mode].fg;
    // ① bg.action-disabled — 공용 단일(세 변형 공유). 기존 action-primary.disabled를 이 값으로 통일.
    const disHex = bg["action-primary"].disabled.$extensions.resolved;
    bg["action-disabled"] = { "$value": bg["action-primary"].disabled.$value, "$type":"color", "$extensions":{ resolved: disHex, rule:{ type:"fixed", why:"disabled 공용 단일 — WCAG 대비 예외(§5.5-①)" } } };
    // ② fg.placeholder — 텍스트이므로 ≥4.5, 입력 표면 worst-case(#19). 중립 램프는 프리셋(웜/쿨)
    const ph = resolveW(NEUTRAL, surfacesFor(mode), 4.5);
    if (ph.ratio < 4.5) problems.push(`✗ fg.placeholder ${mode}: worst-case ${ph.ratio.toFixed(2)}<4.5`);
    fg["placeholder"] = { "$value": `{color.${NEUTRAL}.${ph.step}}`, "$type":"color", "$extensions":{ resolved: ph.hex, rule:{ type:"contrast", against:"worst-case(입력 표면)", target:4.5, why:"placeholder도 텍스트 — 힌트 전용(§5.5-②)" }, contrastMin: round2(ph.ratio), worstSurface: ph.worst } };
    // ③ bg.scrim — 검정 알파(다크 상향). Modal(W2) 전제, W1에 미리 확정.
    const a = mode==="light"?0.5:0.6;
    bg["scrim"] = { "$value": `rgba(0,0,0,${a})`, "$type":"color", "$extensions":{ rule:{ type:"alpha", ramp:"alpha.black", alpha:a, why:"모달 스크림 — 다크 상향(§5.5-③)" } } };

    /* ⑨ selected / unselected 공용 승격 — 결정 #40 ② 실행(진아 지시 2026-08-06 "실행").
     * 결정 #27(비승격)을 공식 폐기한다. 값은 인라인 강조 패턴(Select.item·Tabs 2건이 공유하던
     * bg.brand-subtle + fg.brand)을 기준으로 삼는다 — 3건 중 2건이 이미 이 조합이었다.
     * ⚠ Segmented 는 raised 칩(bg.surface-raised + elevation.raised)이라 이 역할을 쓰지 않는다.
     *    승격했다고 값이 다른 컴포넌트를 억지로 맞추지 않는다 — CS-1 마커로 계속 추적한다. */
    bg["selected"]   = { "$value": bg["brand-subtle"].$value, "$type":"color", "$extensions":{ resolved: bg["brand-subtle"].$extensions && bg["brand-subtle"].$extensions.resolved, rule:{ type:"fixed", why:"선택 상태 공용 — 인라인 강조 패턴(결정 #40 ② 실행)" } } };
    bg["unselected"] = { "$value": "transparent", "$type":"color", "$extensions":{ rule:{ type:"fixed", why:"비선택 상태 공용 — 배경 없음(트랙/표면이 비친다)" } } };
    fg["selected"]   = { "$value": fg["brand"].$value, "$type":"color", "$extensions":{ resolved: fg["brand"].$extensions && fg["brand"].$extensions.resolved, rule:{ type:"fixed", why:"선택 상태 텍스트 공용 — fg.brand 와 같은 단계" } } };
    fg["unselected"] = { "$value": fg["secondary"].$value, "$type":"color", "$extensions":{ resolved: fg["secondary"].$extensions && fg["secondary"].$extensions.resolved, rule:{ type:"fixed", why:"비선택 상태 텍스트 공용 — fg.secondary 와 같은 단계" } } };

    /* ⑩ fg.quaternary — 위계 4단 완성(결정 #40 ② 실행).
     * ⚠ 텍스트 금지. 목표 대비 2:1 로 WCAG 텍스트 기준을 넘지 못한다 — 구분선 옆 보조 기호·
     *    장식 아이콘처럼 "읽지 않아도 되는" 요소 전용이다. 이 제약을 이름이 아니라 규칙에 박아 둔다. */
    const q4 = resolveW(NEUTRAL, surfacesFor(mode), 2);
    fg["quaternary"] = { "$value": `{color.${NEUTRAL}.${q4.step}}`, "$type":"color", "$extensions":{ resolved: q4.hex, rule:{ type:"contrast", against:"worst-case", target:2, why:"위계 4단 — 비텍스트·장식 전용(텍스트 사용 금지)" }, contrastMin: round2(q4.ratio) } };
  }
  // ⑦ bg.control-knob — 스위치 노브(색 채움 위 물리 요소). 비텍스트 UI ≥3(검사 C-3). Wave 2 승격.
  for (const mode of ["light","dark"]) {
    const light = mode==="light";
    const hex = light ? "#ffffff" : RAMPS[NEUTRAL]["200"];
    SEM.color[mode].bg["control-knob"] = { "$value": light ? "#ffffff" : `{color.${NEUTRAL}.200}`, "$type":"color", "$extensions":{ resolved: hex, rule:{ type:"contrast", against:"track on-state(action-primary)", target:3, why:"노브는 채움 위 물리 요소 — 비텍스트 대비(§ Wave2)" } } };
  }
  // ⑧ semantic.motion 역할(합성 transition) — control/overlay-enter/overlay-exit/emphasis (DP-5)
  const mrole = (d, e, why) => ({ "$value": { duration: `{motion.duration.duration-${d}}`, delay: "0ms", timingFunction: `{motion.easing.${e}}` }, "$type":"transition", "$extensions":{ ms: DURATION[d], easing: EASING[e], why } });
  SEM["motion"] = {
    "$description":"모션 역할(#18 확장) — 지속·곡선 합성. reduced-motion 시 duration→0은 소비 레이어.",
    "control":       mrole("fast","standard","상태 전이 — 버튼 hover·스위치 노브·탭 인디케이터"),
    "overlay-enter": mrole("base","decelerate","오버레이 진입 — 모달·토스트 등장"),
    "overlay-exit":  mrole("fast","accelerate","오버레이 이탈 — 모달·토스트 퇴장"),
    "emphasis":      mrole("slow","standard","큰 전환 — 강조 이동")
  };
  // ④ semantic.size.control/icon — 신설 size primitive를 참조하는 시맨틱 역할(§3.1)
  const sizeP = buildSize().size;
  SEM["size"] = {
    "$description":"치수 역할 — 닫힌 컨트롤 높이·아이콘 슬롯(#18 부분 개정)",
    "control":{ "$extensions":{ why:"닫힌 컨트롤 고정 높이", constraint:"md≥44(ENFORCE_TOUCH_TARGET_AAA)" },
      "sm":{ "$value":"{size.control.sm}", "$type":"dimension", "$extensions":{ px:sizeP.control.sm.$extensions.px } },
      "md":{ "$value":"{size.control.md}", "$type":"dimension", "$extensions":{ px:sizeP.control.md.$extensions.px } },
      "lg":{ "$value":"{size.control.lg}", "$type":"dimension", "$extensions":{ px:sizeP.control.lg.$extensions.px } } },
    "icon":{ "$extensions":{ why:"컨트롤 sm↔아이콘 sm 정합(§5.5-⑥)" },
      "sm":{ "$value":"{size.icon.sm}", "$type":"dimension", "$extensions":{ px:sizeP.icon.sm.$extensions.px } },
      "md":{ "$value":"{size.icon.md}", "$type":"dimension", "$extensions":{ px:sizeP.icon.md.$extensions.px } },
      "lg":{ "$value":"{size.icon.lg}", "$type":"dimension", "$extensions":{ px:sizeP.icon.lg.$extensions.px } } }
  };
  // ⑤ focus-offset(px 고정) ⑥ border 상태(#16 개정)
  SEM["focus-offset"] = { "$value":"2px", "$type":"dimension", "$extensions":{ px:2, rule:{ type:"fixed", why:"포커스 링 오프셋 — 헤어라인 정밀(§5.5-⑤)" } } };
  SEM["borderWidth"] = {
    "$description":"굵기 상태 역할(#16 개정 · 결정 #40) — dimension 사다리·센티널 참조",
    "default":{ "$value":"{dimension.special.hairline}", "$type":"dimension", "$extensions":{ px:1 } },
    "selected":{ "$value":"{dimension.px.step-1}", "$type":"dimension", "$extensions":{ px:2 } },
    "focused":{ "$value":"{dimension.px.step-1}", "$type":"dimension", "$extensions":{ px:2, why:"border.focused 색과 쌍" } }
  };
}

/* ============================================================
 * 3) 컴포넌트 토큰 정의 — 모드-중립 시맨틱 alias(§4.1)
 *    a() = 참조,  computed() = 규칙 실체화
 * ============================================================ */
const a = (semPath) => ({ "$value": `{semantic.${semPath}}`, ref: semPath });
const RADIUS_PX = { control: 8, container: 12, overlay: 16, pill: 999, circle: 999 };
const SPACE_PX  = { "step-2":4, "step-3":8, "step-5":16, "step-7":24, "step-8":32 };
// primitive dimension alias → px (검증 데모 평탄화용; SSOT: tokens/*.json)
const PRIM_DIM = {
  "{dimension.rem.step-3}":8, "{dimension.rem.step-4}":12, "{dimension.rem.step-5}":16,
  "{dimension.rem.step-2}":4, "{dimension.rem.step-7}":24, "{dimension.rem.step-8}":32,
  "{dimension.special.hairline}":1, "{dimension.px.step-1}":2,
  "{size.control.sm}":36, "{size.control.md}":44, "{size.control.lg}":52,
  "{size.icon.sm}":16, "{size.icon.md}":20, "{size.icon.lg}":24,
  "{dimension.special.full}":999
};
const INSET_PX  = { sm:8, md:16, lg:24 };   // spacing.padding (step-3/5/7)
const INLINE_PX = { sm:4, md:8, lg:16 };    // spacing.gap.x (step-2/3/5)
function computedChildRadius(outerTier, insetKey){
  const v = Math.max(0, RADIUS_PX[outerTier] - INSET_PX[insetKey]);
  return { "$value": `${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"nesting", formula:`max(0, radius.${outerTier} − padding.${insetKey})`, why:"중첩 정합(#10)·padding 인자 호출(§5.2)" } } };
}

// ---- Button (변형 primary/secondary/ghost — action 3계열) ----
function buildButton(){
  const variant = (name, bgRole, fgRole, borderRole) => {
    const o = { "bg":{
        "default": a(`color.bg.${bgRole}.default`),
        "hover":   a(`color.bg.${bgRole}.hover`),
        "pressed":  a(`color.bg.${bgRole}.pressed`),
        "disabled":a(`color.bg.action-disabled`) },
      "fg": a(`color.fg.${fgRole}`),
      "fg-disabled": a(`color.fg.disabled`) };
    if (borderRole) o["border"] = a(`color.border.${borderRole}`);
    return o;
  };
  return { "component":{ "button":{
    "$description":"Button — action 3계열(primary/secondary/ghost)×상태, 높이 sm/md/lg",
    "primary":   variant("primary","action-primary","on-action"),
    "secondary": variant("secondary","action-secondary","primary","default"),
    "ghost":     variant("ghost","action-ghost","primary"),
    "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
    "icon":     { "sm":a("size.icon.sm"),"md":a("size.icon.md"),"lg":a("size.icon.lg") },
    "radius":   a("radius.control"),
    "padding-x":{ "sm":a("spacing.gap.x.md"),"md":a("spacing.gap.x.lg"),"lg":a("spacing.gap.x.lg") },
    "gap":      a("spacing.gap.x.sm"),
    "typography":a("typography.label"),
    "borderWidth":{ "focused":a("borderWidth.focused") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Input ----
function buildInput(){
  return { "component":{ "input":{
    "$description":"Input — 표면·border 3상태·placeholder, 높이 sm/md/lg",
    "bg":       { "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
    "fg":       { "default":a("color.fg.primary"), "placeholder":a("color.fg.placeholder"), "disabled":a("color.fg.disabled") },
    "border":   { "default":a("color.border.default"), "hover":a("color.border.strong"),
                  "focused":a("color.border.focused"), "error":a("color.border.error"), "disabled":a("color.border.subtle") },
    "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
    "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
    "radius":   a("radius.control"),
    "padding-x":a("spacing.padding.md"),
    "typography":a("typography.body"),
    "icon":     { "sm":a("size.icon.sm"),"md":a("size.icon.md") },
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Select (Input 초집합 + 메뉴 리스트: surface-raised + elevation.raised 쌍) ----
function buildSelect(){
  return { "component":{ "select":{
    "$description":"Select — 트리거(Input 동형) + 메뉴(raised 쌍, 중첩 정합)",
    "trigger":{
      "bg":       { "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
      "fg":       { "default":a("color.fg.primary"), "placeholder":a("color.fg.placeholder"), "disabled":a("color.fg.disabled") },
      "border":   { "default":a("color.border.default"), "hover":a("color.border.strong"), "focused":a("color.border.focused"), "disabled":a("color.border.subtle") },
      "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
      "radius":   a("radius.control"),
      "icon":     a("size.icon.md") },
    "menu":{
      "bg":       a("color.bg.surface-raised"),
      "elevation":a("elevation.raised"),
      "radius":   a("radius.container"),
      "padding":  a("spacing.padding.sm"),
      "border":   a("color.border.subtle") },
    "item":{
      "fg":       a("color.fg.primary"),
      "bg-hover": a("color.bg.action-ghost.hover"),
      "radius":   computedChildRadius("container","sm"),      // 중첩: 12−8=4
      "selected":{ "bg":a("color.bg.selected"), "fg":a("color.fg.selected"),
                   "$extensions":{ why:"공용 selected 역할 소비 — 결정 #40 ② 실행(2026-08-06)으로 고유 상태에서 승격됨" } } },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Card (열린 컨테이너: 높이 토큰 금지, 5레이어 + 중첩 공식 첫 적용처) ----
function buildCard(){
  return { "component":{ "card":{
    "$description":"Card — 열린 컨테이너(고정 높이 금지), radius 중첩 공식 첫 적용처",
    "bg":        a("color.bg.surface"),
    "bg-raised": a("color.bg.surface-raised"),
    "border":    a("color.border.subtle"),
    "radius":    a("radius.container"),
    "elevation":{ "resting":a("elevation.resting"), "raised":a("elevation.raised") },
    "padding":     a("spacing.padding.lg"),
    "gap":       a("spacing.gap.y.md"),
    "child-radius":computedChildRadius("container","lg"),     // 12−24 → clamp 0(패딩 안 자식)
    "media-radius":a("radius.container"),                     // flush 미디어는 outer 승계
    "typography":{ "title":a("typography.title"), "body":a("typography.body") }
  }}};
}

// ---- Switch (토글: 트랙 pill + 노브 슬라이드, 모션 소비) ----
const ICON_PX = { sm:16, md:20, lg:24 };
function computedKnob(trackKey){ // 노브 = 트랙높이 − 2*2px inset
  const th = ICON_PX[trackKey], v = Math.max(0, th - 4);
  return { "$value":`${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"nesting", formula:`track-height(icon.${trackKey}) − 2×2px`, why:"노브 중첩 정합(#10 사상)" } } };
}
function buildSwitch(){
  return { "component":{ "switch":{
    "$description":"Switch — 트랙(pill)+노브 슬라이드, 모션 소비(motion.control)",
    "track":{
      "bg":{ "off":a("color.bg.action-secondary.default"), "on":a("color.bg.action-primary.default"), "disabled":a("color.bg.action-disabled") },
      "radius":a("radius.pill"),
      "height":{ "sm":a("size.icon.md"), "md":a("size.icon.lg") } },   // 20 / 24
    "knob":{
      "bg":a("color.bg.control-knob"),
      "border":a("color.border.subtle"),                              // off-트랙(밝음) 위 경계
      "size":{ "sm":computedKnob("md"), "md":computedKnob("lg") },     // 16 / 20
      "motion":a("motion.control") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Tabs (인디케이터 슬라이드, selected 고유 상태) ----
function buildTabs(){
  return { "component":{ "tabs":{
    "$description":"Tabs — 탭+인디케이터 슬라이드, selected 고유 상태(승격 후보)",
    "tab":{
      "fg":{ "default":a("color.fg.unselected"), "selected":a("color.fg.selected"), "disabled":a("color.fg.disabled") },
      "bg":{ "hover":a("color.bg.action-ghost.hover") },
      "height":a("size.control.md"),
      "radius":a("radius.control"),
      "typography":a("typography.label") },
    "indicator":{
      "color":a("color.fg.brand"),
      "thickness":a("borderWidth.selected"),
      "motion":a("motion.control"),
      "$extensions":{ rule:{ type:"component-state", state:"selected", why:"Select.item.selected와 반복 — 시맨틱 승격 후보(컨펌 큐, §0.3)" } } },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Modal (스크림 + overlay 표면쌍 + 진입/이탈 모션) ----
function buildModal(){
  return { "component":{ "modal":{
    "$description":"Modal — scrim + surface-overlay(elevation.overlay 쌍) + enter/exit 모션",
    "scrim":a("color.bg.scrim"),
    "surface":a("color.bg.surface-overlay"),
    "elevation":a("elevation.overlay"),
    "border":a("color.border.subtle"),
    "radius":a("radius.overlay"),
    "padding":a("spacing.padding.lg"),
    "gap":a("spacing.gap.y.md"),
    "close-icon":a("size.icon.md"),
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") },
    "typography":{ "title":a("typography.heading"), "body":a("typography.body") }
  }}};
}
// ---- Toast (상태 4계열 + raised 표면쌍 + 진입/이탈 모션) ----
function buildToast(){
  const status = (nm) => ({ "accent-fg":a(`color.fg.${nm}`), "accent-bg":a(`color.bg.${nm}-subtle`) });
  return { "component":{ "toast":{
    "$description":"Toast — 중립 base + 상태 4계열(success/error/warning/info), raised 쌍 + 모션",
    "bg":a("color.bg.surface-raised"),
    "elevation":a("elevation.raised"),
    "border":a("color.border.subtle"),
    "radius":a("radius.container"),
    "padding":a("spacing.padding.md"),
    "gap":a("spacing.gap.x.md"),
    "fg":a("color.fg.primary"),
    "icon":a("size.icon.md"),
    "status":{ "success":status("success"), "error":status("error"), "warning":status("warning"), "info":status("info") },
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") }
  }}};
}

/* ============================================================
 * Wave 3 (CDS_Components, 2026-07-29) — Checkbox·Radio·Slider·Segmented·
 * Tooltip·Badge·Banner. general-component-list.md §2(Wave 3 백로그 7종).
 * 값 규칙(§0)·1차 아웃풋 범위 제외(§0)를 Wave 1+2와 동일 승계.
 * 새 시맨틱 역할은 신설하지 않는다 — 기존 인벤토리만 재사용.
 * 필요한데 없는 값은 computed(§0 예외ⓐ, 아래 computedScale/computedOffset)로
 * 규칙을 실체화하거나, 승격이 필요하면 컨펌 큐로 상정한다(독단 금지).
 * ============================================================ */
// computed 예외ⓐ 신규 rule type "scale" — 기존 nesting(부모−자식 감산)과 달리
// "비율 축소"가 필요한 경우(작은 컨트롤에 큰 tier 값을 그대로 못 쓸 때). 값 목록이 아니라
// 규칙(원본 alias × 배수)이 SSOT라 프리셋이 바뀌어도 자동 추종.
function computedScale(baseLabel, basePx, factor, why){
  const v = Math.max(1, Math.round(basePx*factor));
  return { "$value":`${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"scale", formula:`${baseLabel} × ${factor}`, why } } };
}
// computed 예외ⓐ nesting 재사용 — Switch.knob과 동형(부모 치수 − 2×inset)
function computedOffset(baseLabel, basePx, insetEachSide, why){
  const v = Math.max(0, basePx - 2*insetEachSide);
  return { "$value":`${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"nesting", formula:`${baseLabel} − 2×${insetEachSide}px`, why } } };
}

// ---- Checkbox (2/3상태: unchecked/checked/indeterminate, 박스 sm/md/lg) ----
function buildCheckbox(){
  return { "component":{ "checkbox":{
    "$description":"Checkbox — unchecked/checked/indeterminate×상태, 박스 sm/md/lg(아이콘 치수 재사용 — Switch 선례). 터치타깃 44px은 히트 영역(패딩) 몫 — 시각 박스 자체는 T-3 비적용(Switch 트랙과 동일 선례).",
    "box":{
      "bg":{
        "unchecked":a("color.bg.surface"),
        "unchecked-disabled":a("color.bg.subtle"),
        "checked":a("color.bg.action-primary.default"),
        "checked-hover":a("color.bg.action-primary.hover"),
        "checked-pressed":a("color.bg.action-primary.pressed"),
        "indeterminate":a("color.bg.action-primary.default"),
        "disabled":a("color.bg.action-disabled")
      },
      "border":{
        "default":a("color.border.default"),
        "hover":a("color.border.strong"),
        "focused":a("color.border.focused"),
        "error":a("color.border.error"),
        "disabled":a("color.border.subtle")
      },
      "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
      "fg":a("color.fg.on-action"),
      "fg-indeterminate":a("color.fg.on-action"),
      "size":{ "sm":a("size.icon.sm"),"md":a("size.icon.md"),"lg":a("size.icon.lg") },
      "radius":computedScale("radius.control", RADIUS_PX.control, 0.5, "박스가 16~24px로 작아 control(8px) 그대로면 과도하게 둥글다 — 새 radius 역할 발명 대신 규칙 실체화(§0 예외ⓐ)")
    },
    "label":{ "fg":{ "default":a("color.fg.primary"), "disabled":a("color.fg.disabled") }, "typography":a("typography.label"), "gap":a("spacing.gap.x.sm") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Radio (원형 컨트롤 + 내부 점, 박스 sm/md/lg) ----
function buildRadio(){
  return { "component":{ "radio":{
    "$description":"Radio — 원형(radius.circle 센티넬) + 내부 점. checked 링·점은 색 인벤토리에 border.brand가 없어 fg.brand 재사용(Tabs.indicator.color 선례와 동형).",
    "control":{
      "bg":{ "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
      "border":{
        "default":a("color.border.default"),
        "hover":a("color.border.strong"),
        "focused":a("color.border.focused"),
        "checked":a("color.fg.brand"),
        "disabled":a("color.border.subtle")
      },
      "borderWidth":{ "default":a("borderWidth.default"), "checked":a("borderWidth.selected"), "focused":a("borderWidth.focused") },
      "radius":a("radius.circle"),
      "size":{ "sm":a("size.icon.sm"),"md":a("size.icon.md"),"lg":a("size.icon.lg") }
    },
    "dot":{
      "bg":a("color.fg.brand"),
      "bg-disabled":a("color.fg.disabled"),
      "radius":a("radius.circle"),
      "size":{
        "sm":computedOffset("control.size(icon.sm)", ICON_PX.sm, 4, "내부 점 여백 확보 — Switch.knob과 동형 nesting(#10 사상)"),
        "md":computedOffset("control.size(icon.md)", ICON_PX.md, 4, "내부 점 여백 확보 — Switch.knob과 동형 nesting(#10 사상)"),
        "lg":computedOffset("control.size(icon.lg)", ICON_PX.lg, 4, "내부 점 여백 확보 — Switch.knob과 동형 nesting(#10 사상)")
      }
    },
    "label":{ "fg":{ "default":a("color.fg.primary"), "disabled":a("color.fg.disabled") }, "typography":a("typography.label"), "gap":a("spacing.gap.x.sm") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Slider (트랙+필+섬, 단일 크기 — 밀도 변형은 1차 범위 밖) ----
function buildSlider(){
  return { "component":{ "slider":{
    "$description":"Slider — 트랙(비활성)+fill(진행, action-primary)+thumb(control-knob 재사용, Switch 선례). sm/md/lg 밀도 변형은 1차 범위 밖(단일 크기로 축소 — Toast·Modal·Card 선례와 동일하게 전 컴포넌트가 3단 변형을 갖지는 않음).",
    "track":{
      "bg":a("color.bg.action-secondary.default"),
      "bg-disabled":a("color.bg.action-disabled"),
      "radius":a("radius.pill"),
      "height":computedScale("size.icon.sm", ICON_PX.sm, 0.25, "트랙 두께 — 컨트롤 치수 대비 비례 축소, 새 치수 역할 발명 대신 규칙 실체화(§0 예외ⓐ)")
    },
    "fill":{ "bg":a("color.bg.action-primary.default"), "bg-disabled":a("color.bg.action-disabled") },
    "thumb":{
      "bg":a("color.bg.control-knob"),
      "border":a("color.border.subtle"),
      "radius":a("radius.circle"),
      "size":a("size.icon.md"),
      "motion":a("motion.control")
    },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Segmented (그룹 트랙 + 세그먼트, 선택 세그먼트=raised 칩) ----
// ⚠ selected 고유 상태 — Select.item.selected(1차)·Tabs.tab.selected(2차)에 이은 3번째 반복.
// Q-009(컨펌 큐, 2026-07-24 보류 판정)가 "3번째 반복 시 재상정"을 명시 조건으로 걸어 둔 바로 그 사례.
// 값은 이전 2건(bg.brand-subtle+fg.brand)과 다르게 raised 칩(bg.surface-raised+elevation.raised)으로
// 설계했다 — 실물 세그먼트 컨트롤 관행(Primer SegmentedControl 등, 선택 세그먼트=카드형 칩) 반영.
// 이 파일은 값을 정의할 뿐 승격 여부를 결정하지 않는다 — 신규 Q 발급은 CONFIRM-QUEUE.md 몫(독단 금지).
function buildSegmented(){
  return { "component":{ "segmented":{
    "$description":"Segmented — 그룹 트랙(action-secondary) + 세그먼트, 선택 세그먼트는 raised 칩(E-1 쌍: bg.surface-raised+elevation.raised). selected 고유상태 3번째 반복 — Q-009 재상정 트리거(신규 Q, 총괄 판정 전까지 승격 미실행).",
    "container":{ "bg":a("color.bg.action-secondary.default"), "radius":a("radius.pill"), "padding":a("spacing.padding.sm") },
    "segment":{
      "fg":{ "default":a("color.fg.secondary"), "disabled":a("color.fg.disabled") },
      "bg":{ "hover":a("color.bg.action-ghost.hover") },
      "selected":{
        "bg":a("color.bg.surface-raised"),
        "fg":a("color.fg.primary"),
        "elevation":a("elevation.raised"),
        "$extensions":{ rule:{ type:"component-state", state:"selected", why:"Select.item.selected(1차)·Tabs.tab.selected(2차) 반복의 3번째 사례 — Q-009(2026-07-24 보류, '3번째 반복 시 확정' 조건부) 재상정 트리거 충족. 값은 이번엔 raised 칩으로 이전 2건과 다르게 설계(실물 세그먼트 컨트롤 관행) — 승격 여부는 컨펌 큐 신규 Q로 상정, 이 생성기는 판정하지 않는다." } }
      },
      "height":{ "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
      "radius":a("radius.pill"),
      "typography":a("typography.label"),
      "motion":a("motion.control")
    },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Tooltip (소형 오버레이 버블) ----
function buildTooltip(){
  return { "component":{ "tooltip":{
    "$description":"Tooltip — 소형 오버레이 버블(surface-overlay+elevation.overlay 쌍, Modal과 동형이나 radius.control로 축소). 반전(inverted, 라이트에서도 다크 버블) 스타일은 bg.inverse 시맨틱 부재 — 새로 발명하지 않고 1차 범위 밖으로 기록(향후 승격 후보).",
    "bg":a("color.bg.surface-overlay"),
    "elevation":a("elevation.overlay"),
    "border":a("color.border.subtle"),
    "radius":a("radius.control"),
    "fg":a("color.fg.primary"),
    "padding":a("spacing.padding.sm"),
    "typography":a("typography.caption"),
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") }
  }}};
}
// ---- Badge (인라인 상태 라벨, 비인터랙티브 — 높이·포커스 토큰 없음) ----
function buildBadge(){
  const status = (nm) => ({ "bg":a(`color.bg.${nm}-subtle`), "fg":a(`color.fg.${nm}`) });
  return { "component":{ "badge":{
    "$description":"Badge — 중립 base + 상태 4계열(Toast 패턴 재사용). 비인터랙티브 정적 표시 요소라 Toast처럼 focus·height 토큰 없음(S-3 동형 — 열린 요소에 고정 높이 금지).",
    "base":{ "bg":a("color.bg.subtle"), "fg":a("color.fg.secondary") },
    "status":{ "success":status("success"), "error":status("error"), "warning":status("warning"), "info":status("info") },
    "radius":a("radius.pill"),
    "padding":a("spacing.padding.sm"),
    "icon":a("size.icon.sm"),
    "typography":a("typography.caption")
  }}};
}
// ---- Banner (페이지 인라인 상태 배너 — Toast와 의도적 차별화) ----
function buildBanner(){
  const status = (nm) => ({ "bg":a(`color.bg.${nm}-subtle`), "fg":a(`color.fg.${nm}`), "border":a("color.border.subtle") });
  return { "component":{ "banner":{
    "$description":"Banner — 페이지 흐름 내 인라인 배너(비-플로팅, elevation 없음). 상태 4계열은 Toast(중립 bg+강조색만)와 달리 배경 전체를 상태색으로 물들인다(실물 alert 컴포넌트 관행) — border는 색 인벤토리에 success/warning/info 전용이 없어 전 상태 border.subtle로 통일(Toast와 동일 절제).",
    "base":{ "bg":a("color.bg.subtle"), "fg":a("color.fg.primary"), "border":a("color.border.subtle") },
    "status":{ "success":status("success"), "error":status("error"), "warning":status("warning"), "info":status("info") },
    "radius":a("radius.container"),
    "padding":a("spacing.padding.md"),
    "gap":a("spacing.gap.x.md"),
    "icon":a("size.icon.md"),
    "dismiss-icon":a("size.icon.sm"),
    "typography":{ "title":a("typography.label"), "body":a("typography.body") }
  }}};
}

/* ============================================================
 * 4) 검사 매트릭스 (제안서 §6.1 — Wave 1+2 적용분)
 * ============================================================ */
function resolveSem(mode, ref){ // 모드-중립 semantic 경로 → 실측값
  const parts = ref.split(".");
  let node = SEM;
  // color.* 는 모드 분기 주입
  if (parts[0]==="color"){ node = SEM.color[mode]; parts.shift(); }
  else node = SEM[parts.shift()];
  for (const p of parts){ if(node==null) return undefined; node = node[p]; }
  if (node==null) return undefined;
  if (node.$extensions && node.$extensions.resolved) return { kind:"color", hex:node.$extensions.resolved };
  if (node.$type==="color") return { kind:"color", hex:node.$value };
  if (node.$type==="dimension"){ let px = node.$extensions && node.$extensions.px;
    if (px==null && typeof node.$value==="string"){ px = PRIM_DIM[node.$value]; }
    return { kind:"dim", px, val: px!=null?px+"px":node.$value }; }
  if (node.$type==="typography") return { kind:"type", node };
  if (node.$type==="shadow") return { kind:"shadow" };
  if (node.$type==="transition") return { kind:"motion", ms:node.$extensions&&node.$extensions.ms, easing:node.$extensions&&node.$extensions.easing };
  if (node.$type==="duration") return { kind:"dur", ms:node.$extensions&&node.$extensions.ms };
  if (node.$type==="cubicBezier") return { kind:"bezier", tuple:node.$extensions&&node.$extensions.tuple };
  // 그룹(elevation.raised has light/dark) — 존재만 확인
  if (node.light || node.dark || node.$value) return { kind:"group" };
  return { kind:"unknown", node };
}
const checks = [];
function ck(id, ok, msg, sev="✗"){ checks.push({ id, ok, sev, msg }); if(!ok) problems.push(`${sev} [${id}] ${msg}`); }

function runChecks(comps){
  // A-1: 참조 무결성 — 모든 alias가 모드-중립 semantic 경로로 실존, primitive 직참·raw·모드명시 0
  const walkRefs = (node, pathArr) => {
    for (const [k,v] of Object.entries(node)){
      if (k.startsWith("$")) continue;
      if (v && typeof v==="object"){
        if (v.ref){ // alias
          if (/\.(light|dark)\./.test(v.ref) || v.ref.startsWith("color.light")||v.ref.startsWith("color.dark"))
            ck("A-1", false, `모드 명시 참조 금지: ${v.ref}`);
          const rl = resolveSem("light", v.ref), rd = resolveSem("dark", v.ref);
          ck("A-1", !!rl && !!rd, `끊긴 alias: semantic.${v.ref}`);
        } else if (v.$value && !v.$extensions?.rule && typeof v.$value==="string" && v.$value.startsWith("{semantic.")){
          // alias 형태이나 ref 미표기 — 정상(직접 정의). 경로 검증
          const p = v.$value.slice(1,-1).replace(/^semantic\./,"");
          ck("A-1", !!resolveSem("light",p), `끊긴 alias: ${v.$value}`);
        } else if (v.$value && typeof v.$value==="string"){
          const raw = v.$value;
          const okForm = raw.startsWith("{semantic.") || (v.$extensions && v.$extensions.rule) ;
          if (!okForm && !/^\{semantic\./.test(raw))
            ck("A-1", false, `raw/비-semantic 값: ${pathArr.join(".")}.${k} = ${raw}`);
        }
        walkRefs(v, [...pathArr,k]);
      }
    }
  };
  comps.forEach(c=>walkRefs(c,[Object.keys(c.component)[0]]));

  for (const mode of ["light","dark"]){
    // C-2: Button primary fg(on-action) × bg(action-primary 상태) ≥ 4.5
    for (const st of ["default","hover","pressed"]){
      const fg = resolveSem(mode,"color.fg.on-action").hex;
      const bg = resolveSem(mode,`color.bg.action-primary.${st}`).hex;
      ck("C-2", contrast(fg,bg)>=4.5, `${mode} button.primary ${st}: on-action×fill ${round2(contrast(fg,bg))}<4.5`);
    }
    // C-1: Input fg.primary × bg.surface ≥ 7 (본문 텍스트), placeholder ≥ 4.5
    const surf = resolveSem(mode,"color.bg.surface").hex;
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7, `${mode} input fg×surface <7`);
    ck("C-1", contrast(resolveSem(mode,"color.fg.placeholder").hex,surf)>=4.5, `${mode} input placeholder×surface <4.5`);
    // C-1: Card title fg.primary × surface ≥ 7
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7, `${mode} card title <7`);
    // W-1: border.focused 비텍스트 대비 ≥ 3 (시맨틱이 이미 보장 — 승계 검증)
    const fmin = SEM.color[mode].border.focused.$extensions.contrastMin;
    ck("W-1", fmin>=3, `${mode} border.focused contrastMin ${fmin}<3`);
    // E-1: Select menu·Card 는 surface-raised ↔ elevation.raised 쌍
    ck("E-1", !!resolveSem(mode,"color.bg.surface-raised") && !!SEM.elevation.raised, `${mode} raised 쌍 결손`);
  }
  // T-3: 컨트롤 높이 — sm≥24 항상, md≥44(ENFORCE on)
  const sz = buildSize().size.control;
  ck("T-3", sz.sm.$extensions.px>=24, `control.sm ${sz.sm.$extensions.px}<24 (WCAG 2.5.8)`);
  ck("T-3", sz.md.$extensions.px>=44, `control.md ${sz.md.$extensions.px}<44 (터치타깃 AAA, ENFORCE on)`);
  // S-1: 높이 4px 그리드
  T.forEach(t=>ck("S-1", sz[t].$extensions.px%GRID===0, `control.${t} not on ${GRID}px grid`, sz[t].$extensions.px%GRID===0?"✗":"△"));
  // R-2: 중첩 정합 재계산 — Select item(container−padding.sm)·Card(container−padding.lg)
  const selItem = computedChildRadius("container","sm");
  ck("R-2", selItem.$extensions.px===Math.max(0,RADIUS_PX.container-INSET_PX.sm), `select.item.radius 재계산 불일치`);
  const cardChild = computedChildRadius("container","lg");
  ck("R-2", cardChild.$extensions.px===Math.max(0,RADIUS_PX.container-INSET_PX.lg), `card.child-radius 재계산 불일치`);
  // S-3: 열린 컨테이너(Card)에 고정 높이 토큰 금지
  const card = buildCard().component.card;
  ck("S-3", !("height"in card), `card에 고정 높이 토큰 존재(§3.1 위반)`);

  // ===== Wave 2 검사 =====
  // M-1: 모션 유효성 — duration 비음수·정수·단조 증가, easing 4튜플·x∈[0,1]
  const durs = Object.values(DURATION);
  ck("M-1", durs.every(v=>Number.isInteger(v)&&v>=0), `duration에 음수/비정수`);
  ck("M-1", durs.every((v,i)=>i===0||v>durs[i-1]), `duration 단조 증가 위반`);
  ck("M-1", Object.values(EASING).every(t=>t.length===4 && t[0]>=0&&t[0]<=1 && t[2]>=0&&t[2]<=1), `easing x제어점 [0,1] 이탈`);
  // 시맨틱 모션 역할이 유효 primitive 참조
  for (const [k,v] of Object.entries(SEM.motion)){ if(k.startsWith("$"))continue;
    ck("M-1", v.$extensions.ms!=null && v.$extensions.easing, `motion.${k} primitive 참조 결손`); }
  for (const mode of ["light","dark"]){
    // C-3: 스위치 노브 vs on-트랙(action-primary) 비텍스트 대비 ≥3
    const knob = resolveSem(mode,"color.bg.control-knob").hex;
    const onTrack = resolveSem(mode,"color.bg.action-primary.default").hex;
    ck("C-3", contrast(knob,onTrack)>=3, `${mode} switch knob×on-track ${round2(contrast(knob,onTrack))}<3`);
    // C-4: Toast 상태 강조색 vs raised 표면 ≥4.5 (텍스트/아이콘)
    const raised = resolveSem(mode,"color.bg.surface-raised").hex;
    for (const s of ["success","error","warning","info"]){
      const fg = resolveSem(mode,`color.fg.${s}`).hex;
      ck("C-4", contrast(fg,raised)>=4.5, `${mode} toast.${s} accent×raised ${round2(contrast(fg,raised))}<4.5`);
    }
    // E-1(모달): surface-overlay ↔ elevation.overlay 쌍
    ck("E-1", !!resolveSem(mode,"color.bg.surface-overlay") && !!SEM.elevation.overlay, `${mode} overlay 쌍 결손`);
    // C-2(모달 제목): heading fg.primary × surface-overlay ≥7 (worst-case #19가 overlay 포함)
    const ov = resolveSem(mode,"color.bg.surface-overlay").hex;
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,ov)>=7, `${mode} modal title×overlay <7`);
    // A-2(scrim): 스크림 알파 존재
    const scrim = SEM.color[mode].bg.scrim;
    ck("A-2", scrim && scrim.$extensions.rule.type==="alpha", `${mode} scrim 알파 규칙 결손`);
  }

  // ===== Wave 3 검사 (Checkbox·Radio·Slider·Segmented·Tooltip·Badge·Banner) =====
  for (const mode of ["light","dark"]){
    // C-2(checkbox): checked fill vs on-action 아이콘 ≥4.5 (Button primary와 동일 페어 재검증)
    for (const st of ["checked","checked-hover","checked-pressed"]){
      const bgRole = st==="checked" ? "default" : st.replace("checked-","");
      const fg = resolveSem(mode,"color.fg.on-action").hex;
      const bg = resolveSem(mode,`color.bg.action-primary.${bgRole}`).hex;
      ck("C-2", contrast(fg,bg)>=4.5, `${mode} checkbox.box ${st}: on-action×fill ${round2(contrast(fg,bg))}<4.5`);
    }
    // C-3(radio): dot/ring(fg.brand) vs control bg(surface) 비텍스트 ≥3
    const surf = resolveSem(mode,"color.bg.surface").hex;
    const brandFg = resolveSem(mode,"color.fg.brand").hex;
    ck("C-3", contrast(brandFg,surf)>=3, `${mode} radio dot×surface ${round2(contrast(brandFg,surf))}<3`);
    // C-3(slider): thumb(control-knob) vs fill(action-primary) 비텍스트 ≥3 (Switch C-3와 동일 페어)
    const knob = resolveSem(mode,"color.bg.control-knob").hex;
    const fillOn = resolveSem(mode,"color.bg.action-primary.default").hex;
    ck("C-3", contrast(knob,fillOn)>=3, `${mode} slider thumb×fill ${round2(contrast(knob,fillOn))}<3`);
    // E-1(segmented): 선택 칩 = surface-raised ↔ elevation.raised 쌍
    ck("E-1", !!resolveSem(mode,"color.bg.surface-raised") && !!SEM.elevation.raised, `${mode} segmented selected-chip raised 쌍 결손`);
    // C-1(segmented): 선택 세그먼트 fg.primary × surface-raised ≥7 (raised 칩 위 본문급 텍스트)
    const raisedHex = resolveSem(mode,"color.bg.surface-raised").hex;
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,raisedHex)>=7, `${mode} segmented.selected fg×surface-raised <7`);
    // CS-1(governance): segmented.segment.selected가 component-state 마커를 보유 — Q-009 3번째 반복 추적
    const segSel = buildSegmented().component.segmented.segment.selected;
    const marker = segSel.$extensions && segSel.$extensions.rule;
    ck("CS-1", !!marker && marker.type==="component-state" && marker.state==="selected", `segmented.selected component-state 마커 결손 — Q-009 반복 추적 불가`);
    // E-1(tooltip): surface-overlay ↔ elevation.overlay 쌍 (Modal과 동일 페어 재검증)
    ck("E-1", !!resolveSem(mode,"color.bg.surface-overlay") && !!SEM.elevation.overlay, `${mode} tooltip overlay 쌍 결손`);
    // C-1(tooltip): fg.primary × surface-overlay ≥7
    const ovHex = resolveSem(mode,"color.bg.surface-overlay").hex;
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,ovHex)>=7, `${mode} tooltip fg×overlay <7`);
    // C-4(badge): base fg.secondary × bg.subtle ≥4.5, 상태 4종 fg.<s> × bg.<s>-subtle ≥4.5(자기-worst-case #19 재검증)
    const subtleHex = resolveSem(mode,"color.bg.subtle").hex;
    ck("C-4", contrast(resolveSem(mode,"color.fg.secondary").hex,subtleHex)>=4.5, `${mode} badge.base fg×subtle <4.5`);
    for (const s of ["success","error","warning","info"]){
      const sFg = resolveSem(mode,`color.fg.${s}`).hex;
      const sBg = resolveSem(mode,`color.bg.${s}-subtle`).hex;
      ck("C-4", contrast(sFg,sBg)>=4.5, `${mode} badge.status.${s} fg×own-subtle-bg ${round2(contrast(sFg,sBg))}<4.5`);
    }
    // C-1(banner): base fg.primary × bg.subtle ≥7 (본문급 텍스트)
    ck("C-1", contrast(resolveSem(mode,"color.fg.primary").hex,subtleHex)>=7, `${mode} banner.base fg×subtle <7`);
    // C-4(banner): 상태 4종 fg.<s> × bg.<s>-subtle ≥4.5 (badge와 동일 자기-페어링)
    for (const s of ["success","error","warning","info"]){
      const sFg = resolveSem(mode,`color.fg.${s}`).hex;
      const sBg = resolveSem(mode,`color.bg.${s}-subtle`).hex;
      ck("C-4", contrast(sFg,sBg)>=4.5, `${mode} banner.status.${s} fg×own-subtle-bg ${round2(contrast(sFg,sBg))}<4.5`);
    }
  }
  // S-3: 비인터랙티브 열린 요소(Badge·Banner)에 고정 높이 토큰 금지
  const badge = buildBadge().component.badge, banner = buildBanner().component.banner;
  ck("S-3", !("height" in badge), `badge에 고정 높이 토큰 존재`);
  ck("S-3", !("height" in banner), `banner에 고정 높이 토큰 존재`);
  // R-2(checkbox): radius scale 재계산 대조 — control(8)×0.5=4
  const cbRadius = computedScale("radius.control", RADIUS_PX.control, 0.5, "재계산 대조");
  ck("R-2", cbRadius.$extensions.px===Math.round(RADIUS_PX.control*0.5), `checkbox.box.radius 재계산 불일치`);
  // R-2(radio): dot offset 재계산 대조 — icon.md(20)−2×4=12
  const dotMd = computedOffset("icon.md", ICON_PX.md, 4, "재계산 대조");
  ck("R-2", dotMd.$extensions.px===Math.max(0,ICON_PX.md-8), `radio.dot.size.md 재계산 불일치`);
  // R-2(slider): track height scale 재계산 대조 — icon.sm(16)×0.25=4
  const trackH = computedScale("icon.sm", ICON_PX.sm, 0.25, "재계산 대조");
  ck("R-2", trackH.$extensions.px===Math.round(ICON_PX.sm*0.25), `slider.track.height 재계산 불일치`);
}

/* ============================================================
 * 5) 실행 — 주입 → 빌드 → 검사 → 출력
 * ============================================================ */
injectSemanticAdditions();
const size = buildSize(), motion = buildMotion();
const comps = [buildButton(), buildInput(), buildSelect(), buildCard(),
               buildSwitch(), buildTabs(), buildModal(), buildToast(),
               buildCheckbox(), buildRadio(), buildSlider(), buildSegmented(),
               buildTooltip(), buildBadge(), buildBanner()];
runChecks(comps);

// 출력물 (프리셋 런은 OUT_DIR로 격리 — 기준 tokens/ 미오염)
const OUT = process.env.OUT_DIR ? path.join(ROOT, process.env.OUT_DIR) : ROOT;
fs.mkdirSync(path.join(OUT, "tokens/component"), { recursive:true });
const outDir = path.join(OUT, "tokens/component");
const names = ["button","input","select","card","switch","tabs","modal","toast",
               "checkbox","radio","slider","segmented","tooltip","badge","banner"];
comps.forEach((c,i)=>fs.writeFileSync(path.join(outDir, names[i]+".json"), JSON.stringify(c,null,2)));
fs.writeFileSync(path.join(OUT,"tokens/tokens.size.json"), JSON.stringify(size,null,2));
fs.writeFileSync(path.join(OUT,"tokens/tokens.motion.json"), JSON.stringify(motion,null,2));

/* 확장 시맨틱 방출 (결정 #40 Phase ④ — Figma 재동기화 선행)
 * 왜: injectSemanticAdditions()가 만드는 8역할(bg.action-disabled·fg.placeholder·bg.scrim·
 *     bg.control-knob·semantic.motion·semantic.size·focus-offset·border)은 결정 #17·#21이
 *     "시맨틱 인벤토리"로 확정한 것인데 지금까지 이 프로세스 메모리에만 존재했다.
 *     tokens/tokens.semantic.json 에는 없으므로 그 파일만 보고 Figma Semantic 컬렉션을 만들면
 *     컴포넌트가 참조하는 역할이 통째로 빠진다(실측: 컴포넌트 별칭 61건 미해결).
 * 무엇: 기본 시맨틱 + 주입분의 합본을 별도 파일로 낸다. 기본 출력·게이트(358·2,148)는 불변 —
 *     플래그가 있을 때만 쓴다.
 */
if (process.argv.includes("--emit-semantic-ext")) {
  fs.writeFileSync(path.join(OUT,"tokens/tokens.semantic-ext.json"),
    JSON.stringify({ "$description":"AUTO-GENERATED by gen-component.cjs --emit-semantic-ext — 직접 수정 금지. gen-semantic 산출 + injectSemanticAdditions() 주입분 합본(시맨틱 전체 인벤토리).", semantic: SEM }, null, 2));
}

// 모드별 전개(검증 데모용 resolved 세트)
function expand(mode){
  const out = {};
  const walk = (node, dst) => {
    for (const [k,v] of Object.entries(node)){
      if (k.startsWith("$")) continue;
      if (v && typeof v==="object"){
        if (v.ref){ const r=resolveSem(mode,v.ref);
          dst[k]= r?(r.hex||r.px||r.val||(r.kind==="motion"?`${r.ms}ms ${r.easing?"cubic-bezier("+r.easing.join(",")+")":""}`:"·")):("? "+v.ref); }
        else if (v.$value && typeof v.$value==="string" && v.$value.startsWith("{semantic.")){ const p=v.$value.slice(1,-1).replace(/^semantic\./,""); const r=resolveSem(mode,p); dst[k]=r?(r.hex||r.px||r.val):("?"); }
        else if (v.$extensions && v.$extensions.rule && v.$extensions.px!=null){ dst[k]=v.$extensions.px+"px"; }
        else if (v.$value!=null && typeof v.$value!=="object"){ dst[k]=v.$value; }
        else { dst[k]={}; walk(v,dst[k]); }
      }
    }
  };
  comps.forEach(c=>{ const nm=Object.keys(c.component)[0]; out[nm]={}; walk(c.component[nm],out[nm]); });
  return out;
}
const resolved = { light: expand("light"), dark: expand("dark"),
  semantic: {
    light: flatSem("light"), dark: flatSem("dark") },
  size: { control: {sm:36,md:44,lg:52}, icon:{sm:16,md:20,lg:24} } };
function flatSem(mode){
  const bg=SEM.color[mode].bg, fg=SEM.color[mode].fg, sk=SEM.color[mode].border;
  const g=(o,k)=> (o[k].$extensions&&o[k].$extensions.resolved)||o[k].$value;
  return {
    surface:g(bg,"surface"), "surface-raised":g(bg,"surface-raised"), subtle:g(bg,"subtle"),
    "action-primary":g(bg["action-primary"],"default"), "action-primary-hover":g(bg["action-primary"],"hover"),
    "action-secondary":g(bg["action-secondary"],"default"), "action-disabled":g(bg,"action-disabled"),
    "brand-subtle":g(bg,"brand-subtle"), "control-knob":g(bg,"control-knob"),
    "surface-overlay":g(bg,"surface-overlay"), "scrim":bg.scrim.$value,
    "error-subtle":g(bg,"error-subtle"), "success-subtle":g(bg,"success-subtle"),
    "warning-subtle":g(bg,"warning-subtle"), "info-subtle":g(bg,"info-subtle"),
    "fg-primary":g(fg,"primary"), "fg-secondary":g(fg,"secondary"), "fg-placeholder":g(fg,"placeholder"),
    "fg-on-action":g(fg,"on-action"), "fg-brand":g(fg,"brand"), "fg-disabled":g(fg,"disabled"),
    "fg-success":g(fg,"success"), "fg-error":g(fg,"error"), "fg-warning":g(fg,"warning"), "fg-info":g(fg,"info"),
    "border-default":g(sk,"default"), "border-strong":g(sk,"strong"), "border-focused":g(sk,"focused"),
    "border-subtle":g(sk,"subtle"), "border-error":g(sk,"error")
  };
}
fs.mkdirSync(path.join(OUT,"build"),{recursive:true});
fs.writeFileSync(path.join(OUT,"build/component.resolved.json"), JSON.stringify(resolved,null,2));
fs.writeFileSync(path.join(OUT,"build/checks.json"), JSON.stringify(checks,null,2));

// 리포트
const fail = checks.filter(c=>!c.ok);
const byId = {}; checks.forEach(c=>{ (byId[c.id]=byId[c.id]||{pass:0,fail:0})[c.ok?"pass":"fail"]++; });
console.log("=== A3 Wave 1 검사 리포트 ===");
Object.entries(byId).forEach(([id,r])=>console.log(`  ${id}: ${r.fail===0?"✓":"✗"} (${r.pass} pass / ${r.fail} fail)`));
console.log(`컴포넌트 ${comps.length}종(Wave1+2 8종 + Wave3 7종) → tokens/component/*.json · 신설 primitive 2종(size·motion) — border-width는 결정 #40으로 dimension에 흡수 · 검증셋 → build/component.resolved.json`);
if (fail.length){ console.error("\n검사 실패:\n"+fail.map(f=>`  ${f.sev} [${f.id}] ${f.msg}`).join("\n")); process.exit(1); }
console.log("전 검사 ✗ 0건 — Wave 1+2+3 아키텍처 통과 ✓");

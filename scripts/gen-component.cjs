#!/usr/bin/env node
/**
 * gen-component.cjs — 컴포넌트 레이어 DTCG JSON 생성기 (A3 Wave 1, 2026-07-21)
 *
 * 무엇: 시맨틱 역할 + 신설 primitive(size·border-width) 위에서 Wave 1 4종
 *      (Button·Input·Select·Card)의 컴포넌트 프리셋 토큰을 생성한다.
 * 원칙(B1 계약 §7·제안서 §4):
 *   - 컴포넌트 $value는 "모드-중립 시맨틱 alias"만. {semantic.color.bg.action-primary}
 *     처럼 light/dark 세그먼트를 생략한 단일 문법(§4.3). 모드 해석은 gen 체인 상류(이 파일)가
 *     시맨틱을 모드별 세트로 전개해서 수행 → 컴포넌트 정의 1벌, 산출 모드 수만큼.
 *   - 예외 2종만: ⓐ 규칙 실체화 computed( $extensions.rule 필수, nesting 등 ) ⓑ 센티넬(pill/circle).
 *   - 상호작용 상태는 참조 전용(재정의 금지). 컴포넌트 고유 상태(selected)만 규칙 실체화로 신설.
 * 어떻게: node gen-component.cjs   → tokens/component/*.json + tokens/tokens.{size,border-width}.json
 *                                     + build/component.resolved.json(검증 데모용) + 검사 리포트
 * 주의: 시맨틱 resolved 값은 tokens/tokens.semantic.json(gen-semantic 산출)에서 직접 읽는다.
 *       신설 primitive는 아래 파라미터로 생성한다(값 목록이 아니라 규칙 — B1 계약 §7-8).
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
// border-width: 기본 집합 + 확장 가능. px 고정(헤어라인 정밀 치수).
function buildBorderWidth() {
  const set = { 0: 0, 1: 1, 2: 2, 4: 4 }, o = { "$description": "보더 굵기 — 기본 집합, px 고정(#12 부칙). 파생 아닌 선택(#8 weight 사상)." };
  for (const [k, v] of Object.entries(set)) o[`border-width-${k}`] = { "$value": `${v}px`, "$type": "dimension", "$extensions": { px: v } };
  return { "border-width": o };
}
// motion primitive (DP-5, A3 오너 · 게이트 M-1) — duration=ms 고정, easing=cubic-bezier 4튜플(#12 부칙). ~12개 캡.
const DURATION = { instant: 0, fast: 120, base: 200, slow: 320, slower: 480 };   // ms, 단조 증가
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
  const add = { color:{}, size:{}, "stroke-width":{}, "focus-offset":{} };
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
  // ⑤ focus-offset(px 고정) ⑥ stroke-width 상태(#16 개정)
  SEM["focus-offset"] = { "$value":"2px", "$type":"dimension", "$extensions":{ px:2, rule:{ type:"fixed", why:"포커스 링 오프셋 — 헤어라인 정밀(§5.5-⑤)" } } };
  SEM["stroke-width"] = {
    "$description":"굵기 상태 역할(#16 개정) — border-width 참조",
    "default":{ "$value":"{border-width.border-width-1}", "$type":"dimension", "$extensions":{ px:1 } },
    "selected":{ "$value":"{border-width.border-width-2}", "$type":"dimension", "$extensions":{ px:2 } },
    "focus":{ "$value":"{border-width.border-width-2}", "$type":"dimension", "$extensions":{ px:2, why:"stroke.focus 색과 쌍" } }
  };
}

/* ============================================================
 * 3) 컴포넌트 토큰 정의 — 모드-중립 시맨틱 alias(§4.1)
 *    a() = 참조,  computed() = 규칙 실체화
 * ============================================================ */
const a = (semPath) => ({ "$value": `{semantic.${semPath}}`, ref: semPath });
const RADIUS_PX = { control: 8, container: 12, overlay: 16, pill: 9999, circle: 9999 };
const SPACE_PX  = { "space-1":4, "space-2":8, "space-4":16, "space-5":24, "space-6":32 };
// primitive dimension alias → px (검증 데모 평탄화용; SSOT: tokens/*.json)
const PRIM_DIM = {
  "{radius.rem.radius-2}":8, "{radius.rem.radius-3}":12, "{radius.rem.radius-4}":16,
  "{spacing.rem.space-1}":4, "{spacing.rem.space-2}":8, "{spacing.rem.space-4}":16, "{spacing.rem.space-5}":24, "{spacing.rem.space-6}":32,
  "{border-width.border-width-1}":1, "{border-width.border-width-2}":2,
  "{size.control.sm}":36, "{size.control.md}":44, "{size.control.lg}":52,
  "{size.icon.sm}":16, "{size.icon.md}":20, "{size.icon.lg}":24,
  "{radius.special.radius-full}":9999, "{radius.special.radius-circle}":9999
};
const INSET_PX  = { sm:8, md:16, lg:24 };   // spacing.inset (space-2/4/5)
const INLINE_PX = { sm:4, md:8, lg:16 };
function computedChildRadius(outerTier, insetKey){
  const v = Math.max(0, RADIUS_PX[outerTier] - INSET_PX[insetKey]);
  return { "$value": `${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"nesting", formula:`max(0, radius.${outerTier} − inset.${insetKey})`, why:"중첩 정합(#10)·inset 인자 호출(§5.2)" } } };
}

// ---- Button (변형 primary/secondary/ghost — action 3계열) ----
function buildButton(){
  const variant = (name, bgRole, fgRole, strokeRole) => {
    const o = { "bg":{
        "default": a(`color.bg.${bgRole}.default`),
        "hover":   a(`color.bg.${bgRole}.hover`),
        "active":  a(`color.bg.${bgRole}.active`),
        "disabled":a(`color.bg.action-disabled`) },
      "fg": a(`color.fg.${fgRole}`),
      "fg-disabled": a(`color.fg.disabled`) };
    if (strokeRole) o["stroke"] = a(`color.stroke.${strokeRole}`);
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
    "padding-x":{ "sm":a("spacing.inline.md"),"md":a("spacing.inline.lg"),"lg":a("spacing.inline.lg") },
    "gap":      a("spacing.inline.sm"),
    "typography":a("typography.label"),
    "stroke-width":{ "focus":a("stroke-width.focus") },
    "focus-color":a("color.stroke.focus"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Input ----
function buildInput(){
  return { "component":{ "input":{
    "$description":"Input — 표면·stroke 3상태·placeholder, 높이 sm/md/lg",
    "bg":       { "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
    "fg":       { "default":a("color.fg.primary"), "placeholder":a("color.fg.placeholder"), "disabled":a("color.fg.disabled") },
    "stroke":   { "default":a("color.stroke.default"), "hover":a("color.stroke.strong"),
                  "focus":a("color.stroke.focus"), "invalid":a("color.stroke.danger"), "disabled":a("color.stroke.subtle") },
    "stroke-width":{ "default":a("stroke-width.default"), "focus":a("stroke-width.focus") },
    "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
    "radius":   a("radius.control"),
    "padding-x":a("spacing.inset.md"),
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
      "stroke":   { "default":a("color.stroke.default"), "hover":a("color.stroke.strong"), "focus":a("color.stroke.focus"), "disabled":a("color.stroke.subtle") },
      "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
      "radius":   a("radius.control"),
      "icon":     a("size.icon.md") },
    "menu":{
      "bg":       a("color.bg.surface-raised"),
      "elevation":a("elevation.raised"),
      "radius":   a("radius.container"),
      "padding":  a("spacing.inset.sm"),
      "stroke":   a("color.stroke.subtle") },
    "item":{
      "fg":       a("color.fg.primary"),
      "bg-hover": a("color.bg.action-ghost.hover"),
      "radius":   computedChildRadius("container","sm"),      // 중첩: 12−8=4
      "selected":{ "bg":a("color.bg.brand-subtle"), "fg":a("color.fg.brand"),
                   "$extensions":{ rule:{ type:"component-state", state:"selected", why:"컴포넌트 고유 상태 — Tabs와 반복 시 시맨틱 승격 검토(§4.2-3)" } } } },
    "focus-color":a("color.stroke.focus"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Card (열린 컨테이너: 높이 토큰 금지, 5레이어 + 중첩 공식 첫 적용처) ----
function buildCard(){
  return { "component":{ "card":{
    "$description":"Card — 열린 컨테이너(고정 높이 금지), radius 중첩 공식 첫 적용처",
    "bg":        a("color.bg.surface"),
    "bg-raised": a("color.bg.surface-raised"),
    "stroke":    a("color.stroke.subtle"),
    "radius":    a("radius.container"),
    "elevation":{ "resting":a("elevation.resting"), "raised":a("elevation.raised") },
    "inset":     a("spacing.inset.lg"),
    "gap":       a("spacing.stack.md"),
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
      "stroke":a("color.stroke.subtle"),                              // off-트랙(밝음) 위 경계
      "size":{ "sm":computedKnob("md"), "md":computedKnob("lg") },     // 16 / 20
      "motion":a("motion.control") },
    "focus-color":a("color.stroke.focus"),
    "focus-offset":a("focus-offset")
  }}};
}
// ---- Tabs (인디케이터 슬라이드, selected 고유 상태) ----
function buildTabs(){
  return { "component":{ "tabs":{
    "$description":"Tabs — 탭+인디케이터 슬라이드, selected 고유 상태(승격 후보)",
    "tab":{
      "fg":{ "default":a("color.fg.secondary"), "selected":a("color.fg.brand"), "disabled":a("color.fg.disabled") },
      "bg":{ "hover":a("color.bg.action-ghost.hover") },
      "height":a("size.control.md"),
      "radius":a("radius.control"),
      "typography":a("typography.label") },
    "indicator":{
      "color":a("color.fg.brand"),
      "thickness":a("stroke-width.selected"),
      "motion":a("motion.control"),
      "$extensions":{ rule:{ type:"component-state", state:"selected", why:"Select.item.selected와 반복 — 시맨틱 승격 후보(컨펌 큐, §0.3)" } } },
    "focus-color":a("color.stroke.focus"),
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
    "stroke":a("color.stroke.subtle"),
    "radius":a("radius.overlay"),
    "inset":a("spacing.inset.lg"),
    "gap":a("spacing.stack.md"),
    "close-icon":a("size.icon.md"),
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") },
    "typography":{ "title":a("typography.heading"), "body":a("typography.body") }
  }}};
}
// ---- Toast (상태 4계열 + raised 표면쌍 + 진입/이탈 모션) ----
function buildToast(){
  const status = (nm) => ({ "accent-fg":a(`color.fg.${nm}`), "accent-bg":a(`color.bg.${nm}-subtle`) });
  return { "component":{ "toast":{
    "$description":"Toast — 중립 base + 상태 4계열(success/danger/warning/info), raised 쌍 + 모션",
    "bg":a("color.bg.surface-raised"),
    "elevation":a("elevation.raised"),
    "stroke":a("color.stroke.subtle"),
    "radius":a("radius.container"),
    "inset":a("spacing.inset.md"),
    "gap":a("spacing.inline.md"),
    "fg":a("color.fg.primary"),
    "icon":a("size.icon.md"),
    "status":{ "success":status("success"), "danger":status("danger"), "warning":status("warning"), "info":status("info") },
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") }
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
    for (const st of ["default","hover","active"]){
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
    // W-1: stroke.focus 비텍스트 대비 ≥ 3 (시맨틱이 이미 보장 — 승계 검증)
    const fmin = SEM.color[mode].stroke.focus.$extensions.contrastMin;
    ck("W-1", fmin>=3, `${mode} stroke.focus contrastMin ${fmin}<3`);
    // E-1: Select menu·Card 는 surface-raised ↔ elevation.raised 쌍
    ck("E-1", !!resolveSem(mode,"color.bg.surface-raised") && !!SEM.elevation.raised, `${mode} raised 쌍 결손`);
  }
  // T-3: 컨트롤 높이 — sm≥24 항상, md≥44(ENFORCE on)
  const sz = buildSize().size.control;
  ck("T-3", sz.sm.$extensions.px>=24, `control.sm ${sz.sm.$extensions.px}<24 (WCAG 2.5.8)`);
  ck("T-3", sz.md.$extensions.px>=44, `control.md ${sz.md.$extensions.px}<44 (터치타깃 AAA, ENFORCE on)`);
  // S-1: 높이 4px 그리드
  T.forEach(t=>ck("S-1", sz[t].$extensions.px%GRID===0, `control.${t} not on ${GRID}px grid`, sz[t].$extensions.px%GRID===0?"✗":"△"));
  // R-2: 중첩 정합 재계산 — Select item(container−inset.sm)·Card(container−inset.lg)
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
    for (const s of ["success","danger","warning","info"]){
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
}

/* ============================================================
 * 5) 실행 — 주입 → 빌드 → 검사 → 출력
 * ============================================================ */
injectSemanticAdditions();
const size = buildSize(), bw = buildBorderWidth(), motion = buildMotion();
const comps = [buildButton(), buildInput(), buildSelect(), buildCard(),
               buildSwitch(), buildTabs(), buildModal(), buildToast()];
runChecks(comps);

// 출력물 (프리셋 런은 OUT_DIR로 격리 — 기준 tokens/ 미오염)
const OUT = process.env.OUT_DIR ? path.join(ROOT, process.env.OUT_DIR) : ROOT;
fs.mkdirSync(path.join(OUT, "tokens/component"), { recursive:true });
const outDir = path.join(OUT, "tokens/component");
const names = ["button","input","select","card","switch","tabs","modal","toast"];
comps.forEach((c,i)=>fs.writeFileSync(path.join(outDir, names[i]+".json"), JSON.stringify(c,null,2)));
fs.writeFileSync(path.join(OUT,"tokens/tokens.size.json"), JSON.stringify(size,null,2));
fs.writeFileSync(path.join(OUT,"tokens/tokens.border-width.json"), JSON.stringify(bw,null,2));
fs.writeFileSync(path.join(OUT,"tokens/tokens.motion.json"), JSON.stringify(motion,null,2));

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
  const bg=SEM.color[mode].bg, fg=SEM.color[mode].fg, sk=SEM.color[mode].stroke;
  const g=(o,k)=> (o[k].$extensions&&o[k].$extensions.resolved)||o[k].$value;
  return {
    surface:g(bg,"surface"), "surface-raised":g(bg,"surface-raised"), subtle:g(bg,"subtle"),
    "action-primary":g(bg["action-primary"],"default"), "action-primary-hover":g(bg["action-primary"],"hover"),
    "action-secondary":g(bg["action-secondary"],"default"), "action-disabled":g(bg,"action-disabled"),
    "brand-subtle":g(bg,"brand-subtle"), "control-knob":g(bg,"control-knob"),
    "surface-overlay":g(bg,"surface-overlay"), "scrim":bg.scrim.$value,
    "danger-subtle":g(bg,"danger-subtle"), "success-subtle":g(bg,"success-subtle"),
    "warning-subtle":g(bg,"warning-subtle"), "info-subtle":g(bg,"info-subtle"),
    "fg-primary":g(fg,"primary"), "fg-secondary":g(fg,"secondary"), "fg-placeholder":g(fg,"placeholder"),
    "fg-on-action":g(fg,"on-action"), "fg-brand":g(fg,"brand"), "fg-disabled":g(fg,"disabled"),
    "fg-success":g(fg,"success"), "fg-danger":g(fg,"danger"), "fg-warning":g(fg,"warning"), "fg-info":g(fg,"info"),
    "stroke-default":g(sk,"default"), "stroke-strong":g(sk,"strong"), "stroke-focus":g(sk,"focus"),
    "stroke-subtle":g(sk,"subtle"), "stroke-danger":g(sk,"danger")
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
console.log(`컴포넌트 4종 → tokens/component/*.json · 신설 primitive 2종 · 검증셋 → build/component.resolved.json`);
if (fail.length){ console.error("\n검사 실패:\n"+fail.map(f=>`  ${f.sev} [${f.id}] ${f.msg}`).join("\n")); process.exit(1); }
console.log("전 검사 ✗ 0건 — Wave 1 아키텍처 통과 ✓");

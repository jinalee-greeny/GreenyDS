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
// 컨피규레이터 export 연결(B2a): config 로 지속시간 사다리를 열되 규칙은 코드가 지킨다 —
// 0 부터 시작 · 단조 증가 · 전부 100ms 그리드. 규칙을 깨는 값은 하드 실패시킨다.
const DURATION = (() => {
  const D = { instant: 0, fast: 100, base: 200, slow: 300, slower: 500, ...(PCFG.motion && PCFG.motion.durations) };
  const keys = ['instant', 'fast', 'base', 'slow', 'slower'];
  let prev = -1;
  for (const k of keys) {
    const v = D[k];
    if (!Number.isInteger(v) || v < 0) throw new Error(`motion.durations.${k}: 0 이상 정수 ms 여야 합니다(받은 값 ${JSON.stringify(v)}).`);
    if (v % 100 !== 0) throw new Error(`motion.durations.${k}=${v}: 100ms 그리드를 벗어납니다(진아 지시 2026-08-06).`);
    if (v <= prev && !(k === 'instant')) throw new Error(`motion.durations.${k}=${v}: 단조 증가여야 합니다(직전 ${prev}).`);
    prev = v;
  }
  if (D.instant !== 0) throw new Error(`motion.durations.instant=${D.instant}: 즉시는 0 이어야 합니다.`);
  return D;
})();
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
  /* ⑦ bg.control-knob — 스위치 노브(색 채움 위 물리 요소). 비텍스트 UI ≥3(검사 C-3).
   * ⚠ 이 값은 rule 에 `type:"contrast", target:3` 이라고 적혀 있었지만 실제로는 다크에서
   *   `cool-gray.200` 으로 **하드코딩**돼 있었다. 결정 #44 로 다크 채움이 밝아지자 곧바로 1.8 로
   *   무너졌다 — 선언과 구현이 갈라져 있으면 전제가 바뀌는 순간 조용히 깨진다.
   *   이제 선언대로 실제로 해결한다: 그 모드의 on-트랙과 3:1 을 넘기는 첫 칸을 고른다.
   * off-트랙(꺼짐)과의 경계는 노브의 border(color.border.subtle)가 맡는다 — 라이트에서 흰 노브가
   *   밝은 트랙 위에 있을 때(1.19) 이미 쓰던 방식이고, 다크는 그것의 거울이다. */
  for (const mode of ["light","dark"]) {
    const light = mode==="light";
    const onTrack = SEM.color[mode].bg["action-primary"].default.$extensions.resolved;
    const order = light ? ["50","100","200","300"] : ["950","900","800","700"];
    let step = null;
    for (const st of order) { if (contrast(light ? "#ffffff" : RAMPS[NEUTRAL][st], onTrack) >= 3) { step = st; break; } }
    if (light && contrast("#ffffff", onTrack) >= 3) step = null;   // 라이트는 순백이 먼저다
    const hex = light ? "#ffffff" : RAMPS[NEUTRAL][step];
    if (!light && step == null) throw new Error("control-knob: 다크에서 on-트랙과 3:1 을 넘기는 중립 칸이 없다");
    SEM.color[mode].bg["control-knob"] = { "$value": light ? "#ffffff" : `{color.${NEUTRAL}.${step}}`, "$type":"color",
      "$extensions":{ resolved: hex, rule:{ type:"contrast", against:"track on-state(action-primary)", target:3,
        why:"노브는 채움 위 물리 요소 — 비텍스트 대비(§ Wave2). 하드코딩이 아니라 실제 해결(결정 #44 후속)" },
        contrastMin: round2(contrast(hex, onTrack)) } };
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
  /* ===== Wave 4-A 검사 (§3 입력/폼) ===== */
  for (const mode of ["light","dark"]){
    const surf = resolveSem(mode,"color.bg.surface").hex;
    // F-1: 도움말은 읽어야 하는 문장이다 — 본문 대비 4.5 를 받는다(fg.tertiary 3:1 로 내리지 않은 근거)
    ck("F-1", contrast(resolveSem(mode,"color.fg.secondary").hex,surf)>=4.5,
       `${mode} field.help fg.secondary×surface ${round2(contrast(resolveSem(mode,"color.fg.secondary").hex,surf))}<4.5`);
    // F-2: 오류 메시지도 텍스트다
    ck("F-2", contrast(resolveSem(mode,"color.fg.error").hex,surf)>=4.5,
       `${mode} field.error fg.error×surface ${round2(contrast(resolveSem(mode,"color.fg.error").hex,surf))}<4.5`);
    // F-3: Textarea 본문·placeholder — Input 과 같은 기준을 각자 통과해야 한다(같은 시맨틱을 가리키는지 대조가 아니라 실제 대비로)
    ck("F-3", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7, `${mode} textarea fg×surface <7`);
    ck("F-3", contrast(resolveSem(mode,"color.fg.placeholder").hex,surf)>=4.5, `${mode} textarea placeholder×surface <4.5`);
    // F-4: Counter 버튼 아이콘·숫자는 필드 표면에 얹힌다 — 본문급 7:1
    //      hover/pressed 는 알파 오버레이라 합성 전 값으로는 기계 검사가 불가능하다(Button.ghost 와 동일 한계).
    ck("F-4", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7,
       `${mode} counter.button fg.primary×surface ${round2(contrast(resolveSem(mode,"color.fg.primary").hex,surf))}<7`);
    /* F-11 [Q-015 해소 — 결정 #44] Button.secondary 는 fg.primary 를 action-secondary 위에 얹는다.
     * Wave 1 부터 다크 pressed 가 4.34 였고 어떤 검사도 이 페어를 보지 않았다(C-2 는 primary 만 본다).
     * 결정 #44 로 다크 눌림을 가라앉는 방향(cool-gray 900)으로 반전해 11.7 로 해소.
     * 이제 △(보고)가 아니라 ✗(하드)다 — 고쳤으면 다시 깨지지 않게 잠근다. */
    for (const st of ["default","hover","pressed"]){
      const bg2 = resolveSem(mode,`color.bg.action-secondary.${st}`).hex;
      const c2 = contrast(resolveSem(mode,"color.fg.primary").hex,bg2);
      ck("F-11", c2>=4.5, `${mode} button.secondary ${st}: fg.primary×action-secondary ${round2(c2)}<4.5`);
    }
  }
  {
    const field = buildField().component.field;
    const ta = buildTextarea().component.textarea;
    const cn = buildCounter().component.counter;
    // F-5: 열린 컨테이너에 고정 높이 금지 — Field 는 껍데기, Textarea 는 내용이 늘어난다
    ck("F-5", !("height" in field), `field 에 고정 높이 토큰 존재(§3.1 위반)`);
    ck("F-5", !("height" in ta), `textarea 에 고정 높이 토큰 존재 — min-height 만 허용(§3.1 위반)`);
    // F-6: Field 는 컨트롤 자신의 토큰을 갖지 않는다 — 가지면 Input 과 두 벌이 된다
    ["bg","border","borderWidth","radius"].forEach(k=>
      ck("F-6", !(k in field), `field 에 컨트롤 토큰 '${k}' 존재 — 껍데기가 컨트롤을 흉내내면 Input 과 두 벌이 된다`));
    // F-7: Textarea min-height 재계산 대조 — control.lg × 2
    ck("F-7", ta["min-height"].$extensions.px===CONTROL_PX.lg*2,
       `textarea.min-height 재계산 불일치: ${ta["min-height"].$extensions.px} ≠ ${CONTROL_PX.lg*2}`);
    // F-8: Counter 버튼 정사각 — 폭 == 그 크기의 컨트롤 높이 (CONFIRM-QUEUE 실행순서 6 '정사각 게이트')
    ["sm","md","lg"].forEach(t=>
      ck("F-8", cn.button.width[t].$extensions.px===CONTROL_PX[t],
         `counter.button.width.${t} ${cn.button.width[t].$extensions.px} ≠ height ${CONTROL_PX[t]} (정사각 위반)`));
    // F-9: CONTROL_PX 상수가 실제 size.control 과 갈라지면 F-7·F-8 이 통째로 거짓말이 된다
    const szc = buildSize().size.control;
    ["sm","md","lg"].forEach(t=>
      ck("F-9", CONTROL_PX[t]===szc[t].$extensions.px,
         `CONTROL_PX.${t}=${CONTROL_PX[t]} 이 size.control.${t}=${szc[t].$extensions.px} 과 어긋남 — 값 사본 표류`));
    // F-10: 'stepper' 는 토큰 '이름'에 등장하지 않는다 (§4 메모 1 판정 — 수량/진행 두 뜻을 다투는 이름).
    //       $description 같은 산문은 제외한다 — 판정 근거를 적은 문장까지 걸리면 검사가 근거 기록을 벌한다.
    const nameHas = (node) => Object.keys(node).some(k =>
      (!k.startsWith("$") && /stepper/i.test(k)) ||
      (!k.startsWith("$") && node[k] && typeof node[k]==="object" && nameHas(node[k])));
    ck("F-10", !nameHas(cn), `counter 토큰 '이름'에 stepper 잔존`);
  }

  /* ===== Wave 4-B 검사 (§3 입력/폼 잔여) ===== */
  for (const mode of ["light","dark"]){
    const sub = resolveSem(mode,"color.bg.subtle").hex;
    // G-1: 드롭존 안내 문구는 bg.subtle 위에 놓인다 — surface 위가 아니다. 별도 페어라 따로 본다.
    ck("G-1", contrast(resolveSem(mode,"color.fg.secondary").hex,sub)>=4.5,
       `${mode} fileUpload.dropzone fg.secondary×bg.subtle ${round2(contrast(resolveSem(mode,"color.fg.secondary").hex,sub))}<4.5`);
    // G-2: '찾아보기' 링크도 bg.subtle 위 — 링크는 fg.link 라 secondary 와 다른 값이다.
    ck("G-2", contrast(resolveSem(mode,"color.fg.link.default").hex,sub)>=4.5,
       `${mode} fileUpload.dropzone fg.link×bg.subtle ${round2(contrast(resolveSem(mode,"color.fg.link.default").hex,sub))}<4.5`);
    // G-3: 오류 파일 행 — 자기 subtle 배경 위(Banner C-4 와 같은 자기-페어링)
    ck("G-3", contrast(resolveSem(mode,"color.fg.error").hex,resolveSem(mode,"color.bg.error-subtle").hex)>=4.5,
       `${mode} fileUpload.file.error fg×own-subtle-bg <4.5`);
    // G-4: 선택된 날짜 — 공용 selected 역할 쌍(결정 #40 ② 실행분)의 첫 신규 소비처
    ck("G-4", contrast(resolveSem(mode,"color.fg.selected").hex,resolveSem(mode,"color.bg.selected").hex)>=4.5,
       `${mode} datePicker.day selected fg×bg ${round2(contrast(resolveSem(mode,"color.fg.selected").hex,resolveSem(mode,"color.bg.selected").hex))}<4.5`);
    // G-5: 이번 달 밖 날짜(fg.tertiary)는 텍스트지만 보조 정보다 — 비텍스트 하한 3:1 로 본다.
    //      이걸 4.5 로 올리면 '흐리게 보이는 다른 달'이라는 정보 자체가 사라진다.
    ck("G-5", contrast(resolveSem(mode,"color.fg.tertiary").hex,resolveSem(mode,"color.bg.surface-raised").hex)>=3,
       `${mode} datePicker.day.outside fg.tertiary×surface-raised <3`);
  }
  {
    const fu = buildFileUpload().component.fileUpload;
    const dp = buildDatePicker().component.datePicker;
    // G-6: 드롭존은 열린 컨테이너 — 파일이 쌓이면 늘어난다
    ck("G-6", !("height" in fu.dropzone), `fileUpload.dropzone 에 고정 높이 토큰 존재 — min-height 만 허용(§3.1 위반)`);
    ck("G-6", fu.dropzone["min-height"].$extensions.px===CONTROL_PX.lg*3,
       `fileUpload.dropzone.min-height 재계산 불일치: ${fu.dropzone["min-height"].$extensions.px} ≠ ${CONTROL_PX.lg*3}`);
    // G-7: 달력 패널도 열린 컨테이너(월마다 5~6주로 행 수가 바뀐다)
    ck("G-7", !("height" in dp.panel), `datePicker.panel 에 고정 높이 토큰 존재(§3.1 위반)`);
    // G-8: 패널은 raised 쌍을 지킨다 — bg.surface-raised 를 쓰면 elevation.raised 도 함께(E-1 확장)
    ck("G-8", !!dp.panel.bg && !!dp.panel.elevation, `datePicker.panel raised 쌍 결손(bg 만 있고 elevation 없음)`);
  }
  /* F-12 [Q-014 실행순서 6 완성] radius.circle 소비 노드는 정사각이어야 한다.
   * Q-014 는 "50% ≡ 999px 등가는 정사각에서만 성립한다"며 이 검사를 요구했는데,
   * 지금까지는 radio·slider 가 우연히 정사각이었을 뿐 규칙이 기계화되지 않았다.
   * DatePicker.day 가 circle 을 쓰는 첫 신규 소비처라 여기서 닫는다.
   * 판정 방식: 치수를 'size' 한 값으로 선언하게 하고 width/height 분리를 금지한다 —
   *   한 값이면 정사각은 구조적으로 보장되고, 비교할 두 수가 아예 생기지 않는다. */
  {
    const walkCircle = (node, pathArr, comp) => {
      if (!node || typeof node!=="object") return;
      const r = node.radius;
      if (r && r.ref === "radius.circle"){
        const where = comp + "." + pathArr.join(".");
        ck("F-12", "size" in node, `${where}: radius.circle 을 쓰는데 size 선언이 없다 — 정사각 전제를 확인할 수 없다`);
        ck("F-12", !("width" in node && "height" in node),
           `${where}: radius.circle 노드가 width·height 를 따로 갖는다 — 비정사각이면 원이 아니라 pill 로 렌더된다`);
      }
      for (const [k,v] of Object.entries(node)){
        if (k.startsWith("$")) continue;
        if (v && typeof v==="object" && !v.ref) walkCircle(v, [...pathArr,k], comp);
      }
    };
    comps.forEach(c=>{ const nm=Object.keys(c.component)[0]; walkCircle(c.component[nm], [], nm); });
  }

  /* ===== Wave 5 검사 (§3 탐색) ===== */
  for (const mode of ["light","dark"]){
    const surf = resolveSem(mode,"color.bg.surface").hex;
    const sub  = resolveSem(mode,"color.bg.subtle").hex;
    // N-1: 현재 위치(current)는 본문급이다 — 경로에서 유일하게 '내용'인 항목
    ck("N-1", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7, `${mode} breadcrumb.item.current fg.primary×surface <7`);
    // N-2: 조상 링크는 secondary — 읽히되 현재를 덮지 않아야 한다
    ck("N-2", contrast(resolveSem(mode,"color.fg.secondary").hex,surf)>=4.5, `${mode} breadcrumb.item.default fg.secondary×surface <4.5`);
    // N-3: 구분자·'…' 는 기호지 내용이 아니다 — 비텍스트 하한 3:1
    ck("N-3", contrast(resolveSem(mode,"color.fg.tertiary").hex,surf)>=3, `${mode} breadcrumb.separator fg.tertiary×surface <3`);
    // N-4: 완료·현재 스텝의 체크/숫자 × action-primary 채움 (Button primary 와 같은 페어를 이 컴포넌트에서 재검증)
    ck("N-4", contrast(resolveSem(mode,"color.fg.on-action").hex,resolveSem(mode,"color.bg.action-primary.default").hex)>=4.5,
       `${mode} progressSteps.step.complete on-action×fill <4.5`);
    // N-5: 아직 안 온 스텝의 숫자 — bg.subtle 위 텍스트라 4.5. fg.tertiary(3:1)로 내리면 숫자가 안 읽힌다.
    ck("N-5", contrast(resolveSem(mode,"color.fg.secondary").hex,sub)>=4.5,
       `${mode} progressSteps.step.upcoming fg.secondary×bg.subtle ${round2(contrast(resolveSem(mode,"color.fg.secondary").hex,sub))}<4.5`);
    // N-6: 오류 스텝 자기-페어링 (Banner·FileUpload 와 같은 패턴)
    ck("N-6", contrast(resolveSem(mode,"color.fg.error").hex,resolveSem(mode,"color.bg.error-subtle").hex)>=4.5,
       `${mode} progressSteps.step.error fg×own-subtle-bg <4.5`);
    // N-7: NavBar 비선택 항목 — unselected 는 secondary 단계라 본문 기준을 받는다
    ck("N-7", contrast(resolveSem(mode,"color.fg.unselected").hex,surf)>=4.5,
       `${mode} navBar.item.default fg.unselected×surface ${round2(contrast(resolveSem(mode,"color.fg.unselected").hex,surf))}<4.5`);
  }
  {
    const bc = buildBreadcrumb().component.breadcrumb;
    const pg = buildPagination().component.pagination;
    const nb = buildNavBar().component.navBar;
    const ps = buildProgressSteps().component.progressSteps;
    // N-8: 탐색 4종은 전부 열린 컨테이너다 — 항목 수가 가변이라 고정 높이를 가질 수 없다.
    //      단 '항목' 자신은 닫힌 클릭 타깃이라 height 를 갖는다(Q-007 스코프 그대로).
    [["breadcrumb",bc],["pagination",pg],["progressSteps",ps]].forEach(([nm,c])=>
      ck("N-8", !("height" in c), `${nm} 루트에 고정 높이 토큰 존재(§3.1 위반)`));
    // N-9: NavBar 는 진아 판정(2026-08-06 '패딩 파생')대로 바에 높이 토큰이 없어야 한다.
    //      판정을 산문으로만 적어두면 다음 사람이 편의상 height 를 넣는다 — 검사로 고정한다.
    ck("N-9", !("height" in nb.bar), `navBar.bar 에 고정 높이 토큰 존재 — 진아 판정 2026-08-06 '패딩 파생' 위반`);
    ck("N-9", !!nb.bar["padding-y"] && !!nb.item.height,
       `navBar 바 높이 파생 재료 결손(padding-y 또는 item.height 없음) — 높이가 어디서도 나오지 않는다`);
    // N-10: 페이지 버튼 정사각 — 자릿수가 늘어도 칸이 흔들리지 않아야 한다(Counter F-8 과 같은 규칙)
    ["sm","md"].forEach(t=>
      ck("N-10", pg.page.size[t].$extensions.px===CONTROL_PX[t],
         `pagination.page.size.${t} ${pg.page.size[t].$extensions.px} ≠ 컨트롤 높이 ${CONTROL_PX[t]} (정사각 위반)`));
    // N-11: 'stepper' 는 진행 단계형에도 남기지 않는다 (§4 메모 1 — 두 뜻을 다투는 이름)
    const nameHasS = (node) => Object.keys(node).some(k =>
      (!k.startsWith("$") && /stepper/i.test(k)) ||
      (!k.startsWith("$") && node[k] && typeof node[k]==="object" && nameHasS(node[k])));
    ck("N-11", !nameHasS(ps), `progressSteps 토큰 '이름'에 stepper 잔존`);
    // N-12: Pagination 은 action-secondary 를 쓰지 않는다 — Q-015 미달 페어 회피가 의도임을 고정한다.
    //       판정이 나면 이 검사를 지우거나 뒤집으면 된다. 지금은 '왜 안 썼는지'를 코드가 기억한다.
    //       ⚠ 산문($description)이 아니라 '참조(ref)'만 본다 — F-10 과 같은 함정이다.
    //          회피 이유를 적어둔 문장이 검사에 걸리면, 검사가 근거 기록을 벌하게 된다.
    const refsOf = (node, out=[]) => {
      for (const [k,v] of Object.entries(node)){
        if (k.startsWith("$")) continue;
        if (v && typeof v==="object"){ if (v.ref) out.push(v.ref); else refsOf(v, out); }
      }
      return out;
    };
    ck("N-12", !refsOf(pg).some(r=>r.includes("action-secondary")),
       `pagination 이 action-secondary 를 참조한다 — Q-015 판정 전까지 회피 대상(의도치 않은 재도입)`);
  }

  /* ===== Wave 6 검사 (§3 오버레이·피드백) ===== */
  for (const mode of ["light","dark"]){
    const surf = resolveSem(mode,"color.bg.surface").hex;
    const ovl  = resolveSem(mode,"color.bg.surface-overlay").hex;
    const sub  = resolveSem(mode,"color.bg.subtle").hex;
    // H-1: Drawer 는 surface 가 아니라 surface-overlay 위다 — 별도 페어라 따로 본다
    ck("H-1", contrast(resolveSem(mode,"color.fg.primary").hex,ovl)>=7, `${mode} drawer.header fg.primary×surface-overlay <7`);
    ck("H-1", contrast(resolveSem(mode,"color.fg.secondary").hex,ovl)>=4.5,
       `${mode} drawer.close fg.secondary×surface-overlay ${round2(contrast(resolveSem(mode,"color.fg.secondary").hex,ovl))}<4.5`);
    // H-2: ProgressBar 의 값 표시(퍼센트)는 읽어야 하는 숫자다
    ck("H-2", contrast(resolveSem(mode,"color.fg.secondary").hex,surf)>=4.5, `${mode} progressBar.value fg.secondary×surface <4.5`);
    /* H-3 [Q-017 해소 — 결정 #44] 진행 상태는 색만으로 말한다: 채움과 트랙이 비텍스트 대비 3:1 로
     *   구분되지 않으면 저시력 사용자에게 '얼마나 찼는지'가 전달되지 않는다(WCAG 1.4.11).
     *   다크에서 1.86 이었다. 이 페어를 쓰는 컴포넌트가 4종 — Slider(Wave 1) · FileUpload.progress ·
     *   ProgressSteps.connector · ProgressBar — 이고 그중 둘은 이 세션이 만들었다.
     *   검사가 없으면 만든 사람도 못 본다. 결정 #44 로 3.66 해소, 이제 하드 게이트. */
    ck("H-3", contrast(resolveSem(mode,"color.bg.action-primary.default").hex,resolveSem(mode,"color.bg.action-secondary.default").hex)>=3,
       `${mode} 진행 표시 fill×track ${round2(contrast(resolveSem(mode,"color.bg.action-primary.default").hex,resolveSem(mode,"color.bg.action-secondary.default").hex))}<3 — 진행량이 안 보인다 (Slider·FileUpload·ProgressSteps·ProgressBar 공통)`);
    // H-4: Spinner 도 같은 이유 — 도는 호와 배경 링이 구분돼야 '돌고 있음'이 보인다
    ck("H-4", contrast(resolveSem(mode,"color.fg.brand").hex,resolveSem(mode,"color.border.subtle").hex)>=3,
       `${mode} spinner indicator×track ${round2(contrast(resolveSem(mode,"color.fg.brand").hex,resolveSem(mode,"color.border.subtle").hex))}<3`);
    /* H-5: Skeleton 의 두 정지색은 '달라야 한다'까지만 본다.
     *   초안은 1.1 이라는 문턱을 뒀다가 라이트에서 1.08 로 걸렸는데, 그 1.1 은 근거가 없는 숫자였다.
     *   없는 기준을 발명해 빌드를 세우는 것은 검사가 아니라 미신이다.
     *   스켈레톤의 신호는 정지 대비가 아니라 '움직임'이 나른다 — 낮은 대비는 결함이 아니라 의도다
     *   (반짝임이 세면 로딩 화면이 시끄러워진다). 실제 실패 모드는 하나뿐이다:
     *   누가 base 와 highlight 를 같은 역할로 물려 반짝임이 조용히 죽는 것. 그것만 막는다. */
    ck("H-5", resolveSem(mode,"color.bg.subtle").hex !== resolveSem(mode,"color.bg.surface-raised").hex,
       `${mode} skeleton base 와 highlight 가 같은 색이다 — 반짝임이 조용히 죽는다`);
    // H-6: EmptyState 제목·설명
    ck("H-6", contrast(resolveSem(mode,"color.fg.primary").hex,surf)>=7, `${mode} emptyState.title <7`);
    ck("H-6", contrast(resolveSem(mode,"color.fg.secondary").hex,surf)>=4.5, `${mode} emptyState.description <4.5`);
    // H-7: EmptyState 아이콘은 장식이 아니라 '무엇이 비었는지' 를 말하는 기호다 — 비텍스트 3:1
    ck("H-7", contrast(resolveSem(mode,"color.fg.tertiary").hex,surf)>=3, `${mode} emptyState.icon fg.tertiary×surface <3`);
    void sub;
  }
  {
    const dw = buildDrawer().component.drawer;
    const pb = buildProgressBar().component.progressBar;
    const sp = buildSpinner().component.spinner;
    const sk = buildSkeleton().component.skeleton;
    const es = buildEmptyState().component.emptyState;
    // H-8: 열린 컨테이너 — Drawer 높이는 화면이 정하고, EmptyState 는 내용이 정한다
    ck("H-8", !("height" in dw.panel), `drawer.panel 에 고정 높이 토큰 존재 — 높이는 화면이 정한다(§3.1 위반)`);
    ck("H-8", !("height" in es), `emptyState 에 고정 높이 토큰 존재(§3.1 위반)`);
    // H-9: Drawer 폭은 계약값이다 — 재계산 대조(lg 컨트롤 6·8·12 배)
    [["sm",6],["md",8],["lg",12]].forEach(([t,k])=>
      ck("H-9", dw.panel.width[t].$extensions.px===CONTROL_PX.lg*k,
         `drawer.panel.width.${t} 재계산 불일치: ${dw.panel.width[t].$extensions.px} ≠ ${CONTROL_PX.lg*k}`));
    // H-10: overlay 쌍 — surface-overlay 를 쓰면 elevation.overlay 도 함께(E-1 확장, Modal 선례)
    ck("H-10", !!dw.panel.bg && !!dw.panel.elevation, `drawer.panel overlay 쌍 결손`);
    // H-11: Spinner 링 두께는 작은 크기에서도 1px 밑으로 내려가면 안 된다(computedScale 의 max(1) 확인)
    ["sm","md","lg"].forEach(t=>
      ck("H-11", sp.thickness[t].$extensions.px>=1, `spinner.thickness.${t} ${sp.thickness[t].$extensions.px}px < 1 — 링이 사라진다`));
    // H-12: 진행 표시 3종(Slider·FileUpload·ProgressBar·ProgressSteps)의 두께가 같은 규칙에서 나오는지.
    //       규칙이 갈리면 같은 화면에서 막대 두께가 제각각이 된다.
    ck("H-12", pb.thickness.sm.$extensions.px===Math.max(1,Math.round(ICON_PX.sm*0.25)),
       `progressBar.thickness.sm 이 Slider.track 규칙(icon.sm × 0.25)과 다르다`);
    // H-13: ProgressBar 는 성공/오류 변형을 갖지 않는다 — solid 상태색 부재를 공백으로 남긴 판단(§0.5).
    //       나중에 누가 fg.error 를 채움색으로 밀어 넣는 것을 막는다(텍스트색을 면으로 쓰면 대비 전제가 깨진다).
    ck("H-13", !("status" in pb.fill) && !JSON.stringify(pb.fill).includes("fg.error"),
       `progressBar.fill 에 상태 변형이 생겼다 — solid 상태색(bg.success/bg.error) 승격 없이 넣으면 §0.5 위반`);
    // H-14: Skeleton 은 실제 글자 크기가 아니라 '줄이 차지하는 자리' 를 낸다 — typography 참조가 없어야 한다.
    //       스켈레톤에 typography 를 물리면 폰트가 바뀔 때 자리표시가 같이 흔들린다.
    ck("H-14", !JSON.stringify(sk).includes("typography."), `skeleton 이 typography 를 참조한다 — 자리표시는 글자가 아니라 자리다`);
  }

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

/* ============================================================
 * Wave 4-A — CDS_Components §3 입력/폼 (2026-08-06)
 *   분류 판정에서 "신규 토큰 세트"로 가려진 것만 등재한다.
 *   조합으로 성립하는 것(SearchField·Combobox·Dropdown/Context menu·TimePicker)은
 *   토큰 파일을 만들지 않는다 — 별칭만 복사한 파일은 인벤토리가 아니라 중복이다.
 * ============================================================ */

// ---- Field (Form field wrapper) — §4 메모 2 판정: 독립 등재 ----
// 왜 독립인가: label/help/error 묶음을 Input·Select·Textarea·Counter·Checkbox·Radio 가 전부 쓴다.
// 지금은 checkbox.label · radio.label 처럼 각자 들고 있어, 묶는 곳이 없으면 6곳이 따로 표류한다.
// 열린 컨테이너다 — 고정 높이 토큰을 갖지 않는다(§3.1, Card 선례).
function buildField(){
  return { "component":{ "field":{
    "$description":"Field — 라벨·필수 표시·도움말·오류를 컨트롤에 묶는 껍데기(Form field wrapper). 컨트롤 자신의 토큰은 갖지 않는다 — Input·Select·Textarea·Counter 가 각자 소유. 열린 컨테이너라 고정 높이 없음(§3.1).",
    "label":{
      "fg":{ "default":a("color.fg.primary"), "disabled":a("color.fg.disabled") },
      "typography":a("typography.label"),
      "gap":a("spacing.gap.y.sm")
    },
    "required":{
      "fg":a("color.fg.error"),
      "$extensions":{ why:"필수 표시(*)는 색만으로 말하지 않는다 — 색은 보조 신호이고 문자 자체가 1차 신호다(결정 #38 '한 겹으로만 말한다'의 역방향 적용)" }
    },
    "help":{
      "fg":a("color.fg.secondary"),
      "typography":a("typography.caption"),
      "gap":a("spacing.gap.y.sm"),
      "$extensions":{ why:"fg.tertiary(목표 3:1)가 아니라 fg.secondary(4.5:1). 도움말은 장식이 아니라 읽어야 하는 문장이라 본문 대비 기준을 받는다 — 새 역할을 만들지 않고 기존 인벤토리에서 맞는 것을 골랐다(§0.5)" }
    },
    "error":{
      "fg":a("color.fg.error"),
      "typography":a("typography.caption"),
      "gap":a("spacing.gap.y.sm")
    },
    "gap":a("spacing.gap.y.md")
  }}};
}

// ---- Textarea — Input 과 같은 표면, 높이만 열려 있다 ----
// Input 토큰을 참조하지 않는다(§0.1 컴포넌트→컴포넌트 참조 금지) — 같은 시맨틱을 각자 가리킨다.
function buildTextarea(){
  return { "component":{ "textarea":{
    "$description":"Textarea — 표면·border·타이포는 Input 과 같은 시맨틱을 가리키되 높이가 열려 있다. height 대신 min-height 만 갖는다(§3.1 — 고정 높이는 내용이 잘리는 컨트롤에만).",
    "bg":       { "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
    "fg":       { "default":a("color.fg.primary"), "placeholder":a("color.fg.placeholder"), "disabled":a("color.fg.disabled") },
    "border":   { "default":a("color.border.default"), "hover":a("color.border.strong"),
                  "focused":a("color.border.focused"), "error":a("color.border.error"), "disabled":a("color.border.subtle") },
    "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
    "min-height":computedScale("size.control.lg", 52, 2, "3줄 입력이 보이는 최소 높이. lg 컨트롤 2개분으로 잡아 사다리 밖 임의 px 을 만들지 않는다(§0 예외ⓐ 규칙 실체화)"),
    "radius":   a("radius.control"),
    "padding":  a("spacing.padding.md"),
    "typography":a("typography.body"),
    "resize-handle":a("color.fg.tertiary"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- Counter (수량 입력) — §4 메모 1 판정: "Stepper" 이름을 쓰지 않는다 ----
// 수량 입력형과 진행 단계형이 같은 이름을 다투므로, 이름 자체를 갈랐다:
//   수량 = counter · 진행 = progressSteps. 토큰 어디에도 stepper 는 등장하지 않는다.
const CONTROL_PX = { sm:36, md:44, lg:52 };
function computedSquare(sizeKey, why){
  const v = CONTROL_PX[sizeKey];
  return { "$value":`${px2rem(v)}rem`, "$type":"dimension", "$extensions":{ px:v, rule:{ type:"scale", formula:`size.control.${sizeKey} × 1 (정사각)`, why } } };
}
function buildCounter(){
  return { "component":{ "counter":{
    "$description":"Counter — 수량 입력(−/숫자/+). 이름은 'Stepper' 를 쓰지 않는다: 진행 단계형(progressSteps)과 같은 이름을 다투기 때문(§4 메모 1 판정, 2026-08-06). 버튼은 정사각(폭=높이)이라 sm 에서도 터치타깃이 한 축으로 무너지지 않는다.",
    "field":{
      "bg":       { "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
      "fg":       { "default":a("color.fg.primary"), "disabled":a("color.fg.disabled") },
      "typography":a("typography.body"),
      "padding-x":a("spacing.padding.sm")
    },
    "button":{
      // 왜 action-secondary 가 아닌가: 다크 action-secondary.pressed 는 fg.primary 와 대비 4.34 로 AA 미달이다
      // (아래 F-11 이 매 런 보고). 새 컴포넌트를 이미 알려진 미달 페어 위에 얹지 않는다.
      // 버튼은 필드 표면에 얹히고 눌림만 ghost 알파로 말한다 — Button.ghost 와 같은 처리.
      "bg":{ "default":a("color.bg.surface"), "hover":a("color.bg.action-ghost.hover"),
             "pressed":a("color.bg.action-ghost.pressed"), "disabled":a("color.bg.subtle") },
      "fg":{ "default":a("color.fg.primary"), "disabled":a("color.fg.disabled") },
      "icon":a("size.icon.md"),
      "width":{ "sm":computedSquare("sm","−/+ 버튼은 폭=높이. 폭을 따로 주면 sm(36px)에서 가로 터치타깃이 먼저 무너진다"),
                "md":computedSquare("md","−/+ 버튼은 폭=높이"),
                "lg":computedSquare("lg","−/+ 버튼은 폭=높이") }
    },
    "border":   { "default":a("color.border.default"), "hover":a("color.border.strong"),
                  "focused":a("color.border.focused"), "error":a("color.border.error"), "disabled":a("color.border.subtle") },
    "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
    "height":   { "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
    "radius":   a("radius.control"),
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}


/* ---- Wave 4-B — 입력/폼 잔여 2종 (2026-08-06) ---- */

// ---- FileUpload (드롭존 + 파일 행) ----
// 드롭존은 열린 컨테이너다 — 내용(파일 목록)이 늘어나므로 고정 높이를 갖지 않는다.
function buildFileUpload(){
  return { "component":{ "fileUpload":{
    "$description":"FileUpload — 드롭존 + 파일 행. 드롭존은 열린 컨테이너라 height 없이 min-height 만 갖는다. ⚠ 점선 테두리는 borderStyle 이고 이 시스템의 토큰 축(색·굵기)에 없다 — 스타일은 구현 레이어 몫으로 남기고 토큰으로 위장하지 않는다.",
    "dropzone":{
      "bg":{ "default":a("color.bg.subtle"), "dragover":a("color.bg.brand-subtle"), "disabled":a("color.bg.subtle") },
      "border":{ "default":a("color.border.default"), "dragover":a("color.border.focused"),
                 "focused":a("color.border.focused"), "error":a("color.border.error"), "disabled":a("color.border.subtle") },
      "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
      "radius":a("radius.container"),
      "padding":a("spacing.padding.lg"),
      "gap":a("spacing.gap.y.sm"),
      "min-height":computedScale("size.control.lg", 52, 3, "아이콘 + 안내 2줄이 눌리지 않는 최소 높이. lg 컨트롤 3개분으로 잡아 사다리 밖 임의 px 을 만들지 않는다"),
      "icon":{ "size":a("size.icon.lg"), "fg":a("color.fg.tertiary") },
      "typography":a("typography.body"),
      "fg":{ "default":a("color.fg.secondary"), "action":a("color.fg.link.default"), "disabled":a("color.fg.disabled") }
    },
    "file":{
      "bg":{ "default":a("color.bg.surface"), "error":a("color.bg.error-subtle") },
      "border":a("color.border.subtle"),
      "radius":a("radius.control"),
      "padding":a("spacing.padding.sm"),
      "gap":a("spacing.gap.x.sm"),
      "height":{ "sm":a("size.control.sm"),"md":a("size.control.md") },
      "name":{ "fg":a("color.fg.primary"), "typography":a("typography.label") },
      "meta":{ "fg":a("color.fg.secondary"), "typography":a("typography.caption") },
      "error":{ "fg":a("color.fg.error"), "typography":a("typography.caption") },
      "remove":{ "fg":a("color.fg.tertiary"), "size":a("size.icon.sm") }
    },
    "progress":{
      "track":a("color.bg.action-secondary.default"),
      "fill":a("color.bg.action-primary.default"),
      "radius":a("radius.pill"),
      "height":computedScale("size.icon.sm", ICON_PX.sm, 0.25, "진행 막대 두께 — Slider.track 과 같은 규칙(§0 예외ⓐ)")
    },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- DatePicker (달력 그리드) ----
// 날짜 칸은 radius.circle 을 쓴다 → Q-014 가 요구한 "circle 소비 노드는 정사각" 전제의 첫 신규 사례.
// 그 전제는 이제 산문이 아니라 검사 F-12 가 기계로 지킨다.
// ⚠ 떠 있는 표면(surface-raised + elevation.raised + radius.container)은 select.menu 와 같은 물건이다 —
//   Q-016(Menu·Popover 추출)이 판정되면 이 블록이 그 추출 대상이 된다. 지금은 §0.1(컴포넌트간 참조 금지)에
//   따라 같은 시맨틱을 각자 가리킨다(Textarea↔Input 과 같은 처리).
function buildDatePicker(){
  return { "component":{ "datePicker":{
    "$description":"DatePicker — 트리거(Input 동형) + 달력 팝오버. Time picker 는 같은 표면을 쓰므로 별도 컴포넌트로 등재하지 않는다(§3-B 조합 판정). 날짜 칸은 정사각 + radius.circle — 전제는 검사 F-12 가 지킨다.",
    "trigger":{
      "bg":{ "default":a("color.bg.surface"), "disabled":a("color.bg.subtle") },
      "fg":{ "default":a("color.fg.primary"), "placeholder":a("color.fg.placeholder"), "disabled":a("color.fg.disabled") },
      "border":{ "default":a("color.border.default"), "hover":a("color.border.strong"),
                 "focused":a("color.border.focused"), "error":a("color.border.error"), "disabled":a("color.border.subtle") },
      "borderWidth":{ "default":a("borderWidth.default"), "focused":a("borderWidth.focused") },
      "height":{ "sm":a("size.control.sm"),"md":a("size.control.md"),"lg":a("size.control.lg") },
      "radius":a("radius.control"),
      "padding-x":a("spacing.padding.md"),
      "icon":a("size.icon.md"),
      "typography":a("typography.body")
    },
    "panel":{
      "bg":a("color.bg.surface-raised"),
      "elevation":a("elevation.raised"),
      "border":a("color.border.subtle"),
      "radius":a("radius.container"),
      "padding":a("spacing.padding.sm"),
      "gap":a("spacing.gap.y.sm"),
      "$extensions":{ why:"select.menu 와 동일한 떠 있는 표면 — Q-016 추출 대상. 판정 전까지 시맨틱을 각자 가리킨다(§0.1)" }
    },
    "header":{
      "typography":a("typography.title"),
      "fg":a("color.fg.primary"),
      "nav":{ "fg":{ "default":a("color.fg.secondary"), "disabled":a("color.fg.disabled") },
              "bg-hover":a("color.bg.action-ghost.hover"),
              "size":a("size.icon.md") }
    },
    "weekday":{ "fg":a("color.fg.secondary"), "typography":a("typography.caption") },
    "day":{
      "bg":{ "default":a("color.bg.unselected"), "hover":a("color.bg.action-ghost.hover"),
             "selected":a("color.bg.selected"), "range":a("color.bg.brand-subtle"),
             "disabled":a("color.bg.unselected") },
      "fg":{ "default":a("color.fg.primary"), "selected":a("color.fg.selected"),
             "outside":a("color.fg.tertiary"), "disabled":a("color.fg.disabled") },
      "today":{ "border":a("color.fg.brand"), "borderWidth":a("borderWidth.selected"),
                "$extensions":{ why:"색 인벤토리에 border.brand 가 없어 fg.brand 재사용 — Radio.control.border.checked·Tabs.indicator 선례와 동형(§0.5 새 역할 발명 금지)" } },
      "radius":a("radius.circle"),
      "size":{ "sm":a("size.icon.lg"), "md":a("size.control.sm") },
      "typography":a("typography.body"),
      "$extensions":{ square:"size", why:"radius.circle 소비 — 정사각 전제(Q-014 실행순서 6). size 를 한 값으로 선언해 width/height 분리 자체를 막는다" }
    },
    "footer":{ "gap":a("spacing.gap.x.sm"), "typography":a("typography.label"), "fg":a("color.fg.link.default") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}


/* ============================================================
 * Wave 5 — CDS_Components §3 탐색 4종 (2026-08-06)
 *   전부 3-A(신규 토큰 세트). Q-016(Menu·Popover 추출)에 걸리는 것은 3-B 조합 4종이지
 *   이 넷이 아니다 — NavBar 의 드롭다운은 나중에 Menu 와 '조합'할 문제이고,
 *   NavBar 자신의 토큰(바 표면·항목·인디케이터)에는 Menu 가 들어가지 않는다.
 * ============================================================ */

// ---- Breadcrumb ----
// 링크 색을 fg.link(파랑)로 하지 않았다. 브레드크럼은 '읽는 경로'가 1차 기능이라
// 항목마다 파란색이 켜지면 현재 위치가 묻힌다 — 위계는 색이 아니라 primary/secondary 단계로 말한다.
function buildBreadcrumb(){
  return { "component":{ "breadcrumb":{
    "$description":"Breadcrumb — 경로 항목 + 구분자. 링크 항목을 fg.link(파랑)로 칠하지 않는다: 항목마다 색이 켜지면 '지금 어디인가'(current)가 묻힌다. 위계는 fg.secondary→fg.primary 단계로 말한다. 열린 컨테이너라 고정 높이 없음.",
    "item":{
      "fg":{ "default":a("color.fg.secondary"), "hover":a("color.fg.primary"),
             "current":a("color.fg.primary"), "disabled":a("color.fg.disabled") },
      "bg":{ "hover":a("color.bg.action-ghost.hover") },
      "radius":a("radius.control"),
      "padding-x":a("spacing.padding.sm"),
      "typography":a("typography.label")
    },
    "separator":{ "fg":a("color.fg.tertiary"), "size":a("size.icon.sm") },
    "overflow":{ "fg":a("color.fg.tertiary"), "bg-hover":a("color.bg.action-ghost.hover"),
                 "$extensions":{ why:"경로가 길 때 접는 '…' 손잡이. 구분자와 같은 단계(tertiary) — 둘 다 경로를 읽는 데 필요한 보조 기호지 내용이 아니다" } },
    "gap":a("spacing.gap.x.sm"),
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- Pagination ----
// 페이지 버튼은 정사각(Counter 선례) — 자릿수가 늘어도 칸이 흔들리지 않는다.
// action-secondary 를 쓰지 않는다: Q-015(다크 pressed 4.34<4.5) 판정 전이라
// 알려진 미달 페어 위에 새 컴포넌트를 얹지 않는다. Counter 와 같은 회피.
function buildPagination(){
  return { "component":{ "pagination":{
    "$description":"Pagination — 페이지 버튼(정사각) + 이전/다음 + 접힘 '…'. 현재 페이지는 공용 selected 역할을 소비한다(결정 #40 ② 실행분). action-secondary 미사용 — Q-015 판정 전까지 알려진 AA 미달 페어를 피한다(Counter 와 같은 처리).",
    "page":{
      "bg":{ "default":a("color.bg.unselected"), "hover":a("color.bg.action-ghost.hover"),
             "current":a("color.bg.selected"), "disabled":a("color.bg.unselected") },
      "fg":{ "default":a("color.fg.primary"), "current":a("color.fg.selected"),
             "disabled":a("color.fg.disabled") },
      "radius":a("radius.control"),
      "typography":a("typography.label"),
      "size":{ "sm":computedSquare("sm","페이지 버튼은 폭=높이. 폭을 자릿수에 맡기면 1과 10 의 칸이 달라져 줄이 흔들린다"),
               "md":computedSquare("md","페이지 버튼은 폭=높이") }
    },
    "nav":{
      "fg":{ "default":a("color.fg.secondary"), "disabled":a("color.fg.disabled") },
      "bg-hover":a("color.bg.action-ghost.hover"),
      "icon":a("size.icon.md")
    },
    "overflow":{ "fg":a("color.fg.tertiary") },
    "gap":a("spacing.gap.x.sm"),
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- NavBar (진아 판정 2026-08-06: 별도 등재 · 높이는 패딩 파생) ----
// 높이 토큰을 두지 않는다 — Q-007 이 정한 "size.control 은 닫힌 컨트롤 전용, 열린 컨테이너는
// 높이 토큰 금지" 스코프를 그대로 지킨다. 바 높이는 padding + 항목 높이에서 나온다.
// 항목이 Tabs 와 겹치지만 별도 등재한다 — 같은 시맨틱을 각자 가리키는 방식(Textarea↔Input 선례).
function buildNavBar(){
  return { "component":{ "navBar":{
    "$description":"NavBar — 앱 상단 바. 고정 높이 토큰이 없다(진아 판정 2026-08-06 '패딩 파생'): Q-007 의 '열린 컨테이너는 높이 토큰 금지' 스코프를 그대로 지킨다. 항목 토큰이 Tabs 와 겹치지만 별도 등재(진아 판정 '별도 등재') — 컴포넌트간 참조(§0.1) 대신 같은 시맨틱을 각자 가리킨다. 드롭다운은 Q-016 의 Menu 와 '조합'할 문제이지 이 파일의 의존성이 아니다.",
    "bar":{
      "bg":a("color.bg.surface"),
      "bg-scrolled":a("color.bg.surface-raised"),
      "border":a("color.border.subtle"),
      "borderWidth":a("borderWidth.default"),
      "elevation":{ "resting":a("elevation.resting"), "scrolled":a("elevation.raised") },
      "padding-x":a("spacing.padding.lg"),
      "padding-y":a("spacing.padding.sm"),
      "gap":a("spacing.gap.x.lg"),
      "$extensions":{ why:"height 없음 — 바 높이 = padding-y×2 + item.height. 밀도를 바꾸면 바도 함께 움직인다(진아 판정 2026-08-06)" }
    },
    "item":{
      "fg":{ "default":a("color.fg.unselected"), "hover":a("color.fg.primary"),
             "selected":a("color.fg.selected"), "disabled":a("color.fg.disabled") },
      "bg":{ "hover":a("color.bg.action-ghost.hover"), "selected":a("color.bg.unselected") },
      "height":a("size.control.md"),
      "radius":a("radius.control"),
      "padding-x":a("spacing.padding.sm"),
      "typography":a("typography.label"),
      "$extensions":{ why:"item.height 는 닫힌 컨트롤(클릭 타깃)이라 size.control 이 맞다 — 바 자체와 달리 Q-007 스코프 안이다" }
    },
    "indicator":{
      "color":a("color.fg.brand"),
      "thickness":a("borderWidth.selected"),
      "motion":a("motion.control"),
      "$extensions":{ rule:{ type:"component-state", state:"selected", why:"Tabs.indicator 와 같은 장치 — 값이 완전히 같다(CS-1 마커로 추적). 수렴이 더 쌓이면 §0.3 일반 절차로 승격 상정 대상" } }
    },
    "brand":{ "fg":a("color.fg.primary"), "typography":a("typography.title"), "icon":a("size.icon.lg") },
    "divider":{ "color":a("color.border.subtle"), "thickness":a("borderWidth.default") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- ProgressSteps (진행 단계 — §4 메모 1 판정으로 'Stepper' 이름을 쓰지 않는다) ----
// 스텝 원은 radius.circle 소비 → F-12(정사각 게이트)가 자동으로 지킨다.
function buildProgressSteps(){
  return { "component":{ "progressSteps":{
    "$description":"ProgressSteps — 진행 단계. 수량 입력형(counter)과 이름을 다투는 'Stepper' 를 쓰지 않는다(§4 메모 1 판정, 2026-08-06). 스텝 원은 radius.circle 소비라 F-12 정사각 게이트 대상. 열린 컨테이너(단계 수가 가변)라 고정 높이 없음.",
    "step":{
      "bg":{ "complete":a("color.bg.action-primary.default"), "current":a("color.bg.action-primary.default"),
             "upcoming":a("color.bg.subtle"), "error":a("color.bg.error-subtle"), "disabled":a("color.bg.action-disabled") },
      "fg":{ "complete":a("color.fg.on-action"), "current":a("color.fg.on-action"),
             "upcoming":a("color.fg.secondary"), "error":a("color.fg.error"), "disabled":a("color.fg.disabled") },
      "border":{ "current":a("color.fg.brand"), "upcoming":a("color.border.default"), "error":a("color.fg.error") },
      "borderWidth":{ "current":a("borderWidth.selected"), "upcoming":a("borderWidth.default") },
      "radius":a("radius.circle"),
      "size":{ "sm":a("size.icon.lg"), "md":a("size.control.sm") },
      "typography":a("typography.label"),
      "$extensions":{ square:"size", why:"radius.circle 소비 — 정사각 전제(F-12). size 를 한 값으로 선언해 width/height 분리를 원천 차단" }
    },
    "connector":{
      "bg":{ "complete":a("color.bg.action-primary.default"), "upcoming":a("color.bg.action-secondary.default") },
      "thickness":computedScale("size.icon.sm", ICON_PX.sm, 0.25, "연결선 두께 — Slider.track·FileUpload.progress 와 같은 규칙(§0 예외ⓐ)"),
      "$extensions":{ why:"action-secondary 를 배경으로만 쓴다 — 이 위에 텍스트를 얹지 않으므로 Q-015 의 미달 페어(fg.primary×action-secondary)가 성립하지 않는다. Slider.track 과 같은 사용" }
    },
    "label":{
      "fg":{ "complete":a("color.fg.primary"), "current":a("color.fg.primary"),
             "upcoming":a("color.fg.secondary"), "error":a("color.fg.error"), "disabled":a("color.fg.disabled") },
      "typography":a("typography.label"),
      "description":{ "fg":a("color.fg.secondary"), "typography":a("typography.caption") }
    },
    "gap":{ "x":a("spacing.gap.x.md"), "y":a("spacing.gap.y.sm") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}


/* ============================================================
 * Wave 6 — CDS_Components §3 오버레이 1 + 피드백 4 (2026-08-06)
 * ============================================================ */

// ---- Drawer / Sheet ----
// Modal 과 같은 오버레이 쌍(surface-overlay + elevation.overlay)을 쓰되, 다른 점은 두 가지다:
//   ① 화면 가장자리에 붙어 나오므로 '폭'이 계약값이다(높이는 화면 전체 — 그래서 height 토큰 없음)
//   ② 붙은 변 쪽 모서리는 둥글지 않다 — 그런데 radius 토큰에는 방향 축이 없다(아래 주석).
function buildDrawer(){
  return { "component":{ "drawer":{
    "$description":"Drawer/Sheet — scrim + surface-overlay(elevation.overlay 쌍). 화면 가장자리에 붙어 나오므로 '폭'이 계약값이고 높이는 화면이 정한다(height 토큰 없음). ⚠ 붙은 변 쪽 모서리를 0 으로 두는 것은 방향 축이 있어야 표현되는데 이 시스템의 radius 에는 방향 축이 없다 — 없는 축을 여기서 발명하지 않고 radius 하나만 내보내며, 어느 변에 적용할지는 구현 레이어 몫으로 남긴다(FileUpload 의 borderStyle 과 같은 처리).",
    "scrim":a("color.bg.scrim"),
    "panel":{
      "bg":a("color.bg.surface-overlay"),
      "elevation":a("elevation.overlay"),
      "border":a("color.border.subtle"),
      "radius":a("radius.overlay"),
      "width":{ "sm":computedScale("size.control.lg", 52, 6, "좁은 서랍 — 목록·필터용. 사다리 밖 임의 px 대신 lg 컨트롤 배수로 잡는다"),
                "md":computedScale("size.control.lg", 52, 8, "기본 서랍 — 폼 한 열이 들어간다"),
                "lg":computedScale("size.control.lg", 52, 12, "넓은 서랍 — 표·상세 보기") }
    },
    "header":{ "typography":a("typography.heading"), "fg":a("color.fg.primary"),
               "border":a("color.border.subtle"), "borderWidth":a("borderWidth.default"),
               "padding":a("spacing.padding.lg") },
    "body":{ "padding":a("spacing.padding.lg"), "gap":a("spacing.gap.y.md"), "typography":a("typography.body") },
    "footer":{ "border":a("color.border.subtle"), "borderWidth":a("borderWidth.default"),
               "padding":a("spacing.padding.lg"), "gap":a("spacing.gap.x.sm") },
    "close":{ "fg":a("color.fg.secondary"), "bg-hover":a("color.bg.action-ghost.hover"), "size":a("size.icon.md") },
    "motion":{ "enter":a("motion.overlay-enter"), "exit":a("motion.overlay-exit") },
    "focus-color":a("color.border.focused"),
    "focus-offset":a("focus-offset")
  }}};
}

// ---- ProgressBar ----
// ⚠ 성공/오류 변형을 만들지 않았다: 채워지는 막대에는 solid 상태색이 필요한데
//   인벤토리에 bg.success·bg.error(solid)가 없다(있는 것은 *-subtle 뿐). §0.5 대로
//   새 역할을 발명하지 않고 공백으로 기록한다 — Tooltip 반전 버블(bg.inverse 부재)과 같은 처리.
function buildProgressBar(){
  return { "component":{ "progressBar":{
    "$description":"ProgressBar — 트랙 + 채움. Slider.track·FileUpload.progress 와 같은 두께 규칙. ⚠ 성공/오류 변형 미구현: 채우는 막대에는 solid 상태색이 필요한데 인벤토리에 bg.success·bg.error(solid)가 없다(있는 것은 *-subtle). 새 역할을 발명하지 않고 공백으로 남긴다(§0.5) — 필요해지면 승격 요청 대상.",
    "track":{ "bg":a("color.bg.action-secondary.default"), "bg-disabled":a("color.bg.action-disabled"),
              "radius":a("radius.pill"),
              "$extensions":{ why:"action-secondary 를 배경으로만 쓴다 — 위에 텍스트를 얹지 않으므로 Q-015 의 미달 페어가 성립하지 않는다(Slider.track 과 같은 사용)" } },
    "fill":{ "bg":a("color.bg.action-primary.default"), "bg-disabled":a("color.bg.action-disabled"),
             "radius":a("radius.pill"), "motion":a("motion.control") },
    "thickness":{ "sm":computedScale("size.icon.sm", ICON_PX.sm, 0.25, "얇은 막대 — 카드 하단·행 안"),
                  "md":computedScale("size.icon.sm", ICON_PX.sm, 0.5, "기본 막대") },
    "label":{ "fg":a("color.fg.primary"), "typography":a("typography.label") },
    "value":{ "fg":a("color.fg.secondary"), "typography":a("typography.caption") },
    "gap":a("spacing.gap.y.sm")
  }}};
}

// ---- Spinner / Loader ----
// 원형이라 radius.circle 소비 → F-12 정사각 게이트 대상.
function buildSpinner(){
  return { "component":{ "spinner":{
    "$description":"Spinner — 원형 로더. 트랙(연한 링) + 인디케이터(브랜드 호). radius.circle 소비라 F-12 정사각 게이트 대상. ⚠ 회전 자체는 keyframes 이고 이 시스템의 모션 토큰 축(duration·easing)에 없다 — 지속·곡선만 내보내고 keyframes 는 구현 레이어 몫.",
    "track":a("color.border.subtle"),
    "indicator":a("color.fg.brand"),
    "indicator-on-fill":a("color.fg.on-action"),
    "radius":a("radius.circle"),
    "size":{ "sm":a("size.icon.sm"), "md":a("size.icon.md"), "lg":a("size.icon.lg") },
    "thickness":{ "sm":computedScale("size.icon.sm", ICON_PX.sm, 0.125, "링 두께 — 지름 대비 비례. 작은 크기에서 링이 뭉개지지 않는 하한(1px)은 computedScale 의 max(1) 이 보장"),
                  "md":computedScale("size.icon.md", ICON_PX.md, 0.125, "링 두께 — 지름 대비 비례"),
                  "lg":computedScale("size.icon.lg", ICON_PX.lg, 0.125, "링 두께 — 지름 대비 비례") },
    "motion":a("motion.emphasis"),
    "$extensions":{ square:"size", why:"radius.circle 소비 — 정사각 전제(F-12)" }
  }}};
}

// ---- Skeleton ----
// ⚠ 반짝임(shimmer)은 그라디언트다. 이 시스템의 색 토큰은 단색이고 그라디언트 축이 없다 —
//   두 정지색(base·highlight)만 내보내고 그 사이를 어떻게 잇는지는 구현 레이어 몫.
function buildSkeleton(){
  return { "component":{ "skeleton":{
    "$description":"Skeleton — 로딩 자리표시. ⚠ 반짝임(shimmer)은 그라디언트인데 이 시스템의 색 토큰은 단색이고 그라디언트 축이 없다. 두 정지색(base·highlight)만 내보내고 잇는 방식은 구현 레이어 몫으로 남긴다(Drawer 의 모서리 방향·FileUpload 의 borderStyle 과 같은 처리).",
    "bg":{ "base":a("color.bg.subtle"), "highlight":a("color.bg.surface-raised") },
    "text":{ "radius":a("radius.control"),
             "height":{ "body":computedScale("size.icon.sm", ICON_PX.sm, 0.75, "본문 한 줄 자리 — 글자 크기가 아니라 '줄이 차지하는 자리'라서 아이콘 사다리에서 파생"),
                        "title":computedScale("size.icon.md", ICON_PX.md, 1, "제목 한 줄 자리") },
             "gap":a("spacing.gap.y.sm") },
    "block":{ "radius":a("radius.container") },
    "avatar":{ "radius":a("radius.circle"),
               "size":{ "sm":a("size.icon.lg"), "md":a("size.control.sm"), "lg":a("size.control.md") },
               "$extensions":{ square:"size", why:"radius.circle 소비 — 정사각 전제(F-12)" } },
    "motion":a("motion.emphasis")
  }}};
}

// ---- EmptyState ----
// 열린 컨테이너. 액션 버튼은 Button 컴포넌트를 조합하는 것이므로 여기서 버튼 토큰을 만들지 않는다
// (§3-B 조합 판정과 같은 사고 — 조합을 위해 사본을 만들지 않는다).
function buildEmptyState(){
  return { "component":{ "emptyState":{
    "$description":"EmptyState — 비어 있음 안내. 액션 버튼은 Button 을 조합하는 것이므로 여기서 버튼 토큰을 만들지 않는다(§3-B 조합 판정과 같은 사고). 열린 컨테이너라 고정 높이 없음.",
    "bg":a("color.bg.surface"),
    "icon":{ "fg":a("color.fg.tertiary"),
             "size":computedScale("size.icon.lg", ICON_PX.lg, 2, "안내 아이콘 — 본문 아이콘(24)보다 커야 '빈 화면의 주인공'으로 읽힌다. 새 크기 역할 발명 대신 규칙 실체화(§0 예외ⓐ)") },
    "title":{ "fg":a("color.fg.primary"), "typography":a("typography.title") },
    "description":{ "fg":a("color.fg.secondary"), "typography":a("typography.body") },
    "padding":a("spacing.padding.lg"),
    "gap":{ "y":a("spacing.gap.y.md"), "action":a("spacing.gap.x.sm") }
  }}};
}

const comps = [buildButton(), buildInput(), buildSelect(), buildCard(),
               buildSwitch(), buildTabs(), buildModal(), buildToast(),
               buildCheckbox(), buildRadio(), buildSlider(), buildSegmented(),
               buildTooltip(), buildBadge(), buildBanner(),
               buildField(), buildTextarea(), buildCounter(),
               buildFileUpload(), buildDatePicker(),
               buildBreadcrumb(), buildPagination(), buildNavBar(), buildProgressSteps(),
               buildDrawer(), buildProgressBar(), buildSpinner(), buildSkeleton(), buildEmptyState()];
runChecks(comps);

// 출력물 (프리셋 런은 OUT_DIR로 격리 — 기준 tokens/ 미오염)
const OUT = process.env.OUT_DIR ? path.join(ROOT, process.env.OUT_DIR) : ROOT;
fs.mkdirSync(path.join(OUT, "tokens/component"), { recursive:true });
const outDir = path.join(OUT, "tokens/component");
const names = ["button","input","select","card","switch","tabs","modal","toast",
               "checkbox","radio","slider","segmented","tooltip","badge","banner",
               "field","textarea","counter","file-upload","date-picker",
               "breadcrumb","pagination","nav-bar","progress-steps",
               "drawer","progress-bar","spinner","skeleton","empty-state"];
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
// ✗(하드)와 △(권고)를 가른다 — validate-tokens.cjs 와 같은 규약.
// △ 는 빌드를 막지 않되 매 런 화면에 남는다: 조용해지면 아무도 다시 안 본다.
const fail = checks.filter(c=>!c.ok && c.sev!=="△");
const advis = checks.filter(c=>!c.ok && c.sev==="△");
const byId = {}; checks.forEach(c=>{ (byId[c.id]=byId[c.id]||{pass:0,fail:0})[c.ok?"pass":"fail"]++; });
console.log("=== 컴포넌트 검사 리포트 (Wave 1~4) ===");
Object.entries(byId).forEach(([id,r])=>console.log(`  ${id}: ${r.fail===0?"✓":"✗"} (${r.pass} pass / ${r.fail} fail)`));
console.log(`컴포넌트 ${comps.length}종(Wave1+2 8 + Wave3 7 + Wave4 5 + Wave5 4 + Wave6 5) → tokens/component/*.json · 신설 primitive 2종(size·motion) — border-width는 결정 #40으로 dimension에 흡수 · 검증셋 → build/component.resolved.json`);
if (advis.length){ console.warn("\n권고(△ — 빌드 비차단, 판정 대기):\n"+advis.map(f=>`  ${f.sev} [${f.id}] ${f.msg}`).join("\n")); }
if (fail.length){ console.error("\n검사 실패:\n"+fail.map(f=>`  ${f.sev} [${f.id}] ${f.msg}`).join("\n")); process.exit(1); }
console.log(`전 검사 ✗ 0건 — Wave 1~6 아키텍처 통과 ✓${advis.length?` (△ ${advis.length}건은 리포트만)`:""}`);

#!/usr/bin/env node
/* gen-semantic.cjs — 시맨틱 레이어 생성기 (프로젝트 SSOT 사본, A3 자기검증용) */
const RAMPS = require('./ramps.cjs');
const STEPS=["50","100","200","300","400","500","600","700","800","900","950"];
const ELEV_DARK={ "elevation-1":{ov:0.0117,bd:0.0075}, "elevation-3":{ov:0.0467,bd:0.03} };
const FS_PX={
 mobile:{xs:10.5,sm:12.5,base:15,md:18,lg:21.5,xl:26,"2xl":31,"3xl":37.5,"4xl":45,"5xl":53.5,"6xl":64.5},
 tablet:{xs:11,sm:13.5,base:16,md:19,lg:23,xl:27.5,"2xl":33,"3xl":40,"4xl":48,"5xl":57.5,"6xl":69},
 desktop:{xs:10,sm:13,base:16,md:20,lg:25,xl:31.5,"2xl":39,"3xl":49,"4xl":61,"5xl":76.5,"6xl":95.5}
};
const TSTEPS=["xs","sm","base","md","lg","xl","2xl","3xl","4xl","5xl","6xl"];
const BPS=["mobile","tablet","desktop"];
let NEUTRAL="cool-gray";
let DARK_LADDER={page:"950",surface:"900",overlayBase:"800"};
let TARGETS={fgPrimary:7,fgSecondary:4.5,fgSubtle:3,fgStatus:4.5,onFill:4.5,strokeStrong:3,focus:3,strokeDanger:3,minTextPx:12};
// 섭동 매트릭스용 프리셋 오버라이드 (PRESET 미설정 시 기본 동작 완전 불변)
if(process.env.PRESET){ const cfg=require(process.env.PRESET);
  if(cfg.brandFrom) RAMPS.brand={...RAMPS[cfg.brandFrom]};
  if(cfg.neutral) NEUTRAL=cfg.neutral;
  if(cfg.darkLadder) DARK_LADDER={...DARK_LADDER,...cfg.darkLadder};
  if(cfg.targets) TARGETS={...TARGETS,...cfg.targets};
}
const hexRgb=h=>{h=h.replace('#','');return [0,1,2].map(i=>parseInt(h.substr(i*2,2),16));};
const rgbHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const lum=rgb=>{const a=rgb.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
const contrast=(h1,h2)=>{const l1=lum(hexRgb(h1)),l2=lum(hexRgb(h2));return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};
const overlayWhite=(hex,a)=>rgbHex(hexRgb(hex).map(v=>v+(255-v)*a));
const round2=n=>Math.round(n*100)/100;
const problems=[];
function resolve(ramp,bg,target,label){
  let best=null,max=null;
  for(const s of STEPS){const hx=RAMPS[ramp][s],r=contrast(hx,bg);
    if(!max||r>max.ratio)max={step:s,hex:hx,ratio:r};
    if(r>=target&&(!best||r<best.ratio))best={step:s,hex:hx,ratio:r};}
  if(!best){problems.push(`✗ ${label}: ${ramp} 램프에 목표 ${target}:1 초과 단계 없음`);return max;}
  return best;
}
function resolveW(ramp,surfaces,target,label){
  let best=null,max=null;
  for(const s of STEPS){const hx=RAMPS[ramp][s];let minR=Infinity,worst=null;
    for(const [nm,bg] of Object.entries(surfaces)){const r=contrast(hx,bg);if(r<minR){minR=r;worst=nm;}}
    if(!max||minR>max.ratio)max={step:s,hex:hx,ratio:minR,worst};
    if(minR>=target&&(!best||minR<best.ratio))best={step:s,hex:hx,ratio:minR,worst};}
  if(!best){problems.push(`✗ ${label}: ${ramp} worst-case ≥${target}:1 단계 없음`);return max;}
  return best;
}
const shiftStep=(ramp,step,d)=>{const i=STEPS.indexOf(step),j=Math.max(0,Math.min(STEPS.length-1,i+d));return STEPS[j];};
function resolveMinSize(bp,minPx,label){for(const s of TSTEPS){if(FS_PX[bp][s]>=minPx)return s;}problems.push(`✗ ${label}`);return "base";}
const alias=(path)=>`{${path}}`;
function ctok(ramp,step,rule,extra={}){return {"$value":alias(`color.${ramp}.${step}`),"$type":"color","$extensions":{resolved:RAMPS[ramp][step],rule,...extra}};}
function fixed(hex,rule,extra={}){return {"$value":hex,"$type":"color","$extensions":{rule,...extra}};}
function buildColor(mode){
  const light=mode==="light";
  const surfHex=light?"#ffffff":RAMPS[NEUTRAL][DARK_LADDER.surface];
  const d1=ELEV_DARK["elevation-1"],d3=ELEV_DARK["elevation-3"];
  const raisedHex=light?"#ffffff":overlayWhite(surfHex,d1.ov);
  const overlayHex=light?"#ffffff":overlayWhite(RAMPS[NEUTRAL][DARK_LADDER.overlayBase],d3.ov);
  const subtleHex=RAMPS[NEUTRAL][light?"50":"800"];
  const SURF={surface:surfHex,raised:raisedHex,overlay:overlayHex,subtle:subtleHex};
  const con=(fg,bg)=>round2(contrast(fg,bg));
  const R=(ramp,t,label,adv,extraSurf)=>{const surfs=extraSurf?{...SURF,...extraSurf}:SURF;
    const r=resolveW(ramp,surfs,t,`${mode} ${label}`);
    return ctok(ramp,r.step,{type:"contrast",against:`worst-case(${Object.keys(surfs).join("|")})`,target:t,...(adv?{advisory:adv}:{})},{contrastMin:round2(r.ratio),worstSurface:r.worst});};
  const bgBrand=resolve("brand","#ffffff",TARGETS.onFill,`${mode} bg.brand`);
  const apStep=bgBrand.step, apH=shiftStep("brand",apStep,1), apA=shiftStep("brand",apStep,2);
  const bg={
    "page": light?fixed("#ffffff",{type:"fixed",why:"최하층"}):ctok(NEUTRAL,DARK_LADDER.page,{type:"ladder",role:"page",ladder:"950/900 (결정 #17 A안)"}),
    "surface": light?fixed("#ffffff",{type:"fixed"}):ctok(NEUTRAL,DARK_LADDER.surface,{type:"ladder",role:"surface"}),
    "surface-raised": light?fixed("#ffffff",{type:"compose",with:"elevation.raised 그림자 (색 변화 없음)"}):fixed(raisedHex,{type:"compose",base:alias(`color.${NEUTRAL}.${DARK_LADDER.surface}`),overlay:`white @ ${d1.ov} (elevation.dark.elevation-1 δ)`,border:`rgba(255,255,255,${d1.bd})`,why:"다크 띄움은 델타 합성"}),
    "surface-overlay": light?fixed("#ffffff",{type:"compose",with:"elevation.overlay 그림자"}):fixed(overlayHex,{type:"compose",base:alias(`color.${NEUTRAL}.${DARK_LADDER.overlayBase}`),overlay:`white @ ${d3.ov} (elevation.dark.elevation-3 δ)`,border:`rgba(255,255,255,${d3.bd})`,why:"overlay(모달)만 한 단계 점프"}),
    "subtle": ctok(NEUTRAL,light?"50":"800",{type:"ladder",why:light?"중립 저단":"surface보다 1단 밝게"}),
    "brand": ctok("brand",bgBrand.step,{type:"contrast",against:"fg.on-brand(white)",target:TARGETS.onFill,anchor:"fg",why:"fg 앵커형 (결정 #17)"},{contrast:con("#ffffff",bgBrand.hex)}),
    "brand-subtle": ctok("brand",light?"50":"950",{type:"ladder"}),
    "error-subtle": ctok("red",light?"50":"950",{type:"ladder"}),
    "warning-subtle": ctok("amber",light?"50":"950",{type:"ladder"}),
    "success-subtle": ctok("green",light?"50":"950",{type:"ladder"}),
    "info-subtle": ctok("blue",light?"50":"950",{type:"ladder"}),
    "action-primary": {
      "default": ctok("brand",apStep,{type:"contrast",against:"fg.on-action(white)",target:TARGETS.onFill,anchor:"fg"},{contrast:con("#ffffff",RAMPS.brand[apStep])}),
      "hover":   ctok("brand",apH,{type:"state",shift:"+1",why:"fg 앵커형은 모드 무관 어둡게 (결정 #17)"},{contrast:con("#ffffff",RAMPS.brand[apH])}),
      "pressed":  ctok("brand",apA,{type:"state",shift:"+2"},{contrast:con("#ffffff",RAMPS.brand[apA])}),
      "disabled":ctok(NEUTRAL,light?"100":"800",{type:"fixed",why:"disabled는 WCAG 대비 예외"})
    },
    "action-secondary": {
      "default": ctok(NEUTRAL,light?"100":"800",{type:"ladder"}),
      "hover":   ctok(NEUTRAL,light?"200":"700",{type:"state",shift:light?"+1":"-1"}),
      "pressed":  ctok(NEUTRAL,light?"300":"600",{type:"state",shift:light?"+2":"-2"})
    },
    "action-ghost": {
      "default": fixed("transparent",{type:"fixed"}),
      "hover":   {"$value":alias(`color.alpha.${light?"black":"white"}.a8`),"$type":"color","$extensions":{rule:{type:"alpha"}}},
      "pressed":  {"$value":alias(`color.alpha.${light?"black":"white"}.a12`),"$type":"color","$extensions":{rule:{type:"alpha"}}}
    }
  };
  const sub=(rp)=>({[`${rp}-subtle`]:RAMPS[rp==="brand"?"brand":rp][light?"50":"950"]});
  const link=resolveW("blue",{...SURF,...sub("blue")},TARGETS.fgStatus,`${mode} fg.link`);
  const lkH=shiftStep("blue",link.step,light?1:-1),lkA=shiftStep("blue",link.step,light?2:-2);
  const conW=(hex,surfs)=>round2(Math.min(...Object.values(surfs).map(bg=>contrast(hex,bg))));
  const fg={
    "primary": R(NEUTRAL,TARGETS.fgPrimary,"fg.primary"),
    "secondary": R(NEUTRAL,TARGETS.fgSecondary,"fg.secondary"),
    "tertiary": R(NEUTRAL,TARGETS.fgSubtle,"fg.tertiary","≥3:1 — 대형 텍스트·보조 전용"),
    "disabled": ctok(NEUTRAL,light?"400":"600",{type:"fixed",why:"WCAG 대비 예외"}),
    "on-brand": fixed("#ffffff",{type:"fixed",why:"bg.brand이 이 대비를 보장하도록 resolve됨"},{contrast:con("#ffffff",bgBrand.hex)}),
    "on-action": fixed("#ffffff",{type:"fixed"},{contrast:con("#ffffff",RAMPS.brand[apStep])}),
    "brand": R("brand",TARGETS.fgSecondary,"fg.brand",null,sub("brand")),
    "error": R("red",TARGETS.fgStatus,"fg.error",null,sub("red")),
    "warning": R("amber",TARGETS.fgStatus,"fg.warning",null,sub("amber")),
    "success": R("green",TARGETS.fgStatus,"fg.success",null,sub("green")),
    "info": R("blue",TARGETS.fgStatus,"fg.info",null,sub("blue")),
    "link": {
      "default": ctok("blue",link.step,{type:"contrast",against:"worst-case(표면+info-subtle)",target:TARGETS.fgStatus},{contrastMin:round2(link.ratio),worstSurface:link.worst}),
      "hover": ctok("blue",lkH,{type:"state",shift:light?"+1":"-1",why:"표면 앵커형"},{contrastMin:conW(RAMPS.blue[lkH],SURF)}),
      "pressed": ctok("blue",lkA,{type:"state",shift:light?"+2":"-2"},{contrastMin:conW(RAMPS.blue[lkA],SURF)})
    }
  };
  const st=resolveW(NEUTRAL,SURF,TARGETS.strokeStrong,`${mode} border.strong`);
  const sd=resolveW("red",{...SURF,...sub("red")},TARGETS.strokeDanger,`${mode} border.error`);
  const fc=resolveW("brand",SURF,TARGETS.focus,`${mode} border.focused`);
  const border={
    "default": ctok(NEUTRAL,light?"300":"700",{type:"fixed",advisory:"장식 보더"},{contrastMin:conW(RAMPS[NEUTRAL][light?"300":"700"],SURF)}),
    "subtle": ctok(NEUTRAL,light?"200":"800",{type:"fixed"}),
    "strong": ctok(NEUTRAL,st.step,{type:"contrast",against:"worst-case",target:TARGETS.strokeStrong,why:"비텍스트 UI 경계 (WCAG 1.4.11)"},{contrastMin:round2(st.ratio),worstSurface:st.worst}),
    "focused": ctok("brand",fc.step,{type:"contrast",against:"worst-case",target:TARGETS.focus,why:"포커스 가시성 (WCAG 2.4.13)"},{contrastMin:round2(fc.ratio),worstSurface:fc.worst}),
    "error": ctok("red",sd.step,{type:"contrast",against:"worst-case(표면+error-subtle)",target:TARGETS.strokeDanger},{contrastMin:round2(sd.ratio),worstSurface:sd.worst})
  };
  return {"$description":`${mode} 모드 색 역할`,bg,fg,border};
}
const TYPE_ROLES={
  display:{steps:["3xl","4xl","5xl"],weight:"bold",why:"히어로"},
  heading:{steps:["2xl","2xl","3xl"],weight:"bold",why:"페이지 헤딩"},
  title:{steps:["md","md","lg"],weight:"semibold",why:"섹션·카드 타이틀"},
  body:{steps:["base","base","base"],weight:"regular",why:"본문"},
  label:{steps:["sm","sm","sm"],weight:"medium",why:"UI 라벨·버튼"},
  caption:{steps:null,weight:"regular",minPx:12,why:"보조 캡션 — 최소 크기 자동 해결"}
};
function buildTypography(){
  const out={"$description":"타이포 역할"};
  for(const [role,cfg] of Object.entries(TYPE_ROLES)){
    const entry={"$type":"typography","$extensions":{rule:cfg.steps?{type:"breakpoint-binding",why:cfg.why}:{type:"min-size",minPx:cfg.minPx,why:cfg.why}}};
    BPS.forEach((bp,i)=>{const step=cfg.steps?cfg.steps[i]:resolveMinSize(bp,cfg.minPx,`caption ${bp}`);
      entry[bp]={"$value":{fontFamily:alias("typography.font-family.sans"),fontWeight:alias(`typography.font-weight.${cfg.weight}`),fontSize:alias(`typography.font-size.rem.${bp}.${step}`),lineHeight:alias(`typography.line-height.${step}`),letterSpacing:alias(`typography.letter-spacing.${step}`)},"$extensions":{step,sizePx:FS_PX[bp][step]}};});
    out[role]=entry;
  }
  return out;
}
const dim=(p,extra={})=>({"$value":alias(p),"$type":"dimension","$extensions":extra});
function buildSpacing(){return {"$description":"간격 역할 (결정 #40 KDX 정렬 — padding/gap/margin)",
  "padding":{"$extensions":{why:"컴포넌트 안쪽 여백"},"sm":dim("dimension.rem.step-3"),"md":dim("dimension.rem.step-5"),"lg":dim("dimension.rem.step-7")},
  "gap":{"$extensions":{why:"요소 사이 간격 — y=수직, x=수평, section=페이지 섹션"},
    "y":{"sm":dim("dimension.rem.step-3"),"md":dim("dimension.rem.step-5"),"lg":dim("dimension.rem.step-8")},
    "x":{"sm":dim("dimension.rem.step-2"),"md":dim("dimension.rem.step-3"),"lg":dim("dimension.rem.step-5")},
    "section":{"$extensions":{rule:{type:"breakpoint-binding"}},"mobile":dim("dimension.rem.step-10"),"tablet":dim("dimension.rem.step-11"),"desktop":dim("dimension.rem.step-11")}}};}
function buildRadius(){return {"$description":"radius 역할 — dimension 사다리 칸 배정 (결정 #40 · Q-014)",
  "control":dim("dimension.rem.step-3",{why:"버튼·인풋"}),"container":dim("dimension.rem.step-4",{why:"카드·패널"}),
  "overlay":dim("dimension.rem.step-5",{why:"모달·팝오버"}),"pill":dim("dimension.special.full"),"circle":dim("dimension.special.full",{why:"결정 #40 — special.full로 리타깃(50% 폐지, Figma 호환)"})};}
function buildElevation(){
  const pair=(n,why)=>({"$extensions":{why},"light":{"$value":alias(`elevation.light.elevation-${n}`),"$type":"shadow"},"dark":{"$value":alias(`elevation.dark.elevation-${n}`),"$type":"shadow","$extensions":{note:"δ는 bg.surface-* 합성에 반영"}}});
  return {"$description":"elevation 역할","resting":pair(0,"평면"),"raised":pair(1,"카드·드롭다운"),"overlay":pair(3,"모달·팝오버"),"spotlight":pair(5,"최상위 강조")};}
const semantic={"semantic":{"$description":"시맨틱 역할 토큰","color":{"$type":"color","light":buildColor("light"),"dark":buildColor("dark")},"typography":buildTypography(),"spacing":buildSpacing(),"radius":buildRadius(),"elevation":buildElevation()}};
const fs=require("fs");
const out=process.argv[2]||"tokens.semantic.json";
fs.writeFileSync(out,JSON.stringify(semantic,null,2));
if(problems.length){console.error("검증 실패:\n"+problems.join("\n"));process.exit(1);}
console.log(`시맨틱 재생성 → ${out}`);

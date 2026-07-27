/* presets.cjs — 섭동 매트릭스 프리셋. "값이 아니라 엔진"을 흔드는 6런.
 * 각 프리셋은 브랜드 시드 램프·중립(웜/쿨)·목표 대비를 바꾼다. 접근성 바닥(fgPrimary≥7)은
 * 유지 — 그건 서비스 커밋이지 섭동 축이 아니다(완화는 §보고의 별도 논점). */
module.exports = [
  { id:"base",        name:"기준 — 보라·쿨그레이",         brandFrom:"brand", neutral:"cool-gray", targets:{} },
  { id:"amber-warm",  name:"주황 브랜드 · 웜그레이",        brandFrom:"amber", neutral:"warm-gray", targets:{} },
  { id:"green-cool",  name:"초록 브랜드 · 쿨그레이",        brandFrom:"green", neutral:"cool-gray", targets:{} },
  { id:"blue-strict", name:"파랑 브랜드 · 대비 강화(보조·상태 AAA)", brandFrom:"blue", neutral:"cool-gray", targets:{ fgSecondary:7, fgStatus:7 } },
  { id:"red-warm",    name:"빨강 브랜드 · 웜그레이",        brandFrom:"red",   neutral:"warm-gray", targets:{} },
  { id:"brand-warm",  name:"보라 브랜드 · 웜그레이 스왑",   brandFrom:"brand", neutral:"warm-gray", targets:{} }
];

#!/usr/bin/env node
/*
 * gen-figma-vars.cjs — KDX 정렬 토큰(DTCG) → Figma Variables 재동기화 페이로드 (결정 #40 Phase ④)
 *
 * 무엇: tokens/*.json 을 읽어 Figma 에 그대로 올릴 수 있는 컬렉션·모드·변수·별칭 페이로드와
 *       구(pre-KDX) → 신(KDX) Figma 변수 이름 리네임 맵을 생성한다.
 * 왜:   Phase ②(토큰·파이프라인)·③(컨피규레이터)까지 KDX 어휘로 정렬됐는데 Figma 변수만
 *       구 어휘·구 구조(spacing/radius/borderWidth 3분산)로 남아 있으면 SSOT 가 갈라진다.
 *       손으로 옮기면 반드시 어긋나므로 생성기로 만든다(결정 #29 "복사가 아니라 생성"과 같은 원리).
 * 사용: node scripts/gen-figma-vars.cjs           # build/figma/ 에 생성
 *       node scripts/gen-figma-vars.cjs --check   # 생성물이 커밋본과 동일한지 검증(비생성)
 *
 * 구조 결정(근거는 README 주석 아래 §설계 노트):
 *   컬렉션 = 계층축(Primitive · Semantic · Component), 패밀리(color·typo·dimension·spatial·visual·motion)는
 *   컬렉션 안의 최상위 그룹. 모드 = light/dark (Semantic 만). 이름은 결정 #28 §3 "Figma 하이픈 0".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'figma');
const REM_BASE = 16; // 결정 #28 ④-1 — rem 파생 기준 root=16px 을 빌드 상수로 명시

/* ────────────────────────────────────────────────────────────────────────────
 * 0. 이름 변환 — 결정 #28 §3(Figma 하이픈 0) + §4.2(c) 그룹/leaf 판정 세칙
 *    "형제 2개 이상 + 그룹명이 독립 명사면 `/` 그룹, 아니면 camelCase leaf."
 *    판정을 사람 눈에 맡기지 않고 형제 집합에서 기계적으로 계산하고, 결정 근거를
 *    build/figma/naming-decisions.json 으로 전부 남긴다(감사 가능).
 * ──────────────────────────────────────────────────────────────────────────── */
const PREP_DENY = new Set(['on', 'to', 'in', 'of', 'with', 'no', 'is', 'as']); // 전치사·계사는 명사 그룹이 될 수 없다
const NAMING_LOG = [];

const camel = (s) => s.split('-').map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');

/** 한 부모 노드의 자식 키들을 Figma 세그먼트로 변환한다(형제 집합을 보고 그룹/leaf 판정). */
function segmentsFor(siblingKeys, ctx) {
  const leafSet = new Set(siblingKeys);
  const prefixCount = {};
  siblingKeys.forEach((k) => {
    const i = k.indexOf('-');
    if (i > 0) { const p = k.slice(0, i); prefixCount[p] = (prefixCount[p] || 0) + 1; }
  });
  const map = {};
  siblingKeys.forEach((k) => {
    const i = k.indexOf('-');
    if (i <= 0) { map[k] = [k]; return; }
    const pre = k.slice(0, i), rest = k.slice(i + 1);
    const asGroup = prefixCount[pre] >= 2 && !leafSet.has(pre) && !PREP_DENY.has(pre);
    map[k] = asGroup ? [pre, camel(rest)] : [camel(k)];
    NAMING_LOG.push({
      ctx, key: k, result: map[k].join('/'),
      rule: asGroup ? 'group' : 'camel',
      why: asGroup
        ? `형제 ${prefixCount[pre]}개가 "${pre}" 를 공유 · "${pre}" 는 leaf 아님 · 전치사 아님`
        : (leafSet.has(pre) ? `"${pre}" 가 같은 층 leaf 로 존재 → 그룹으로 쪼개면 충돌`
          : PREP_DENY.has(pre) ? `"${pre}" 는 전치사 — 명사 그룹 불가`
            : `"${pre}" 를 공유하는 형제가 ${prefixCount[pre] || 1}개뿐`)
    });
  });
  return map;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. DTCG 트리 평탄화 — 경로 세그먼트를 위 규칙으로 변환하며 내려간다
 * ──────────────────────────────────────────────────────────────────────────── */
function flatten(node, logical, figma, out, ctx) {
  if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, '$value')) {
    out.push({ logical: logical.join('.'), figma: figma.join('/'), value: node.$value, meta: node });
    return;
  }
  if (!node || typeof node !== 'object') return;
  const keys = Object.keys(node).filter((k) => !k.startsWith('$'));
  const segs = segmentsFor(keys, ctx + ':' + (figma.join('/') || '(root)'));
  keys.forEach((k) => flatten(node[k], logical.concat(k), figma.concat(segs[k]), out, ctx));
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. 값 변환 — Figma 는 unitless 수치 저장(상호운용 런 #2 실측)
 * ──────────────────────────────────────────────────────────────────────────── */
const px = (v) => {
  const s = String(v);
  if (/rem$/.test(s)) return Math.round(parseFloat(s) * REM_BASE * 10000) / 10000;
  if (/px$/.test(s)) return parseFloat(s);
  if (/ms$/.test(s)) return parseFloat(s);
  return null;
};

/** 논리 경로(별칭 대상) → Figma 변수 이름 색인을 만들 때 쓰는 정규화.
 *  dimension 은 rem/px 이중 트리지만 Figma 에는 사다리 1벌만 올라간다(Q-006 근거 §1-Q4).
 *  따라서 rem 가지 참조도 같은 변수로 접힌다. */
const normLogical = (p) => p.replace(/^dimension\.(rem|px)\./, 'dimension.step.').replace(/^dimension\.step\.step-/, 'dimension.step.');

/* ────────────────────────────────────────────────────────────────────────────
 * 3. 소스 로드
 * ──────────────────────────────────────────────────────────────────────────── */
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));


/* ────────────────────────────────────────────────────────────────────────────
 * 3-b. 컬렉션 축 = 5 패밀리 (진아 확정 2026-08-06 "5패밀리 축이 맞음")
 *   결정 #28 §1 이 정한 color·typo·spatial·visual·motion 을 Figma 컬렉션으로 실현한다.
 *   패밀리가 컬렉션이 되므로 이름에서 패밀리 세그먼트를 뗀다 — `color/brand/500` → `brand/500`.
 *   (#28 §3 "이름에 넣지 않는 것: 패밀리·계층·단위·모드" 를 Figma 표면에서 그대로 지킨다.)
 *
 *   ⚠ 계층(primitive/semantic)이 이름에도 컬렉션에도 없으므로 같은 패밀리 안에서
 *      두 계층이 한 이름을 쓰면 충돌한다. 실제 충돌은 `size` 한 곳뿐이며,
 *      결정 #28 §4.3-b 가 CSS 에서 쓴 해법(primitive `size.*` 미출력)을 Figma 에도 적용한다.
 * ──────────────────────────────────────────────────────────────────────────── */
const FAMILY_OF = (n) =>
  /^color\//.test(n) ? 'color'
  : /^typo\//.test(n) ? 'typo'
  : /^(dimension|spatial)\//.test(n) ? 'spatial'
  : /^visual\//.test(n) ? 'visual'
  : /^motion\//.test(n) ? 'motion' : null;
const STRIP = (n) => n.replace(/^(color|typo|visual|motion|spatial)\//, '');

function families(primVars, semVars, compVars) {
  const FAM = { color: [], typo: [], spatial: [], visual: [], motion: [] };
  const dropped = [];
  // primitive — 모드 없음. color 만 Light/Dark 컬렉션에 들어가므로 두 모드에 같은 값을 넣는다.
  for (const v of primVars) {
    const f = FAMILY_OF(v.name);
    if (!f) { dropped.push({ name: v.name, why: '패밀리 미배정' }); continue; }
    // primitive spatial/size/* 미출력 — 시맨틱 size 와 이름이 겹친다(#28 §4.3-b 를 Figma 로 확장)
    if (/^spatial\/size\//.test(v.name)) { dropped.push({ name: v.name, value: v.value, why: '시맨틱 size 와 이름 충돌 — 소비 대상은 시맨틱(#28 ④-5)' }); continue; }
    FAM[f].push({ name: STRIP(v.name), layer: 'primitive', type: v.type, value: v.value, from: v.from });
  }
  // semantic — color 만 모드별, 나머지는 모드 중립
  for (const v of semVars) {
    const f = FAMILY_OF(v.name);
    if (!f) { dropped.push({ name: v.name, why: '패밀리 미배정' }); continue; }
    const one = v.modes.Light;
    FAM[f].push(f === 'color'
      ? { name: STRIP(v.name), layer: 'semantic', type: v.type, modes: v.modes, from: v.from }
      : (() => {
        // 별칭 대상이 미출력된 원시(size)면 별칭이 자기 자신을 가리키게 된다 → 값으로 인라인한다.
        const a = one.alias ? STRIP(one.alias) : null;
        const self = a && a === STRIP(v.name);
        const inl = self ? (dropped.find((d) => STRIP(d.name) === a) || {}).value : null;
        if (self && inl == null) throw new Error('자기참조 별칭인데 인라인할 원시 값을 못 찾음: ' + v.name);
        return { name: STRIP(v.name), layer: 'semantic', type: v.type,
                 value: self ? inl : one.value, alias: self ? null : a,
                 inlinedFrom: self ? '원시 미출력 — 값 인라인' : undefined, from: v.from.Light };
      })());
  }
  // 이름 충돌 하드 게이트 — 조용히 덮어쓰지 않는다
  const collide = [];
  for (const [f, list] of Object.entries(FAM)) {
    const seen = new Set();
    for (const v of list) { if (seen.has(v.name)) collide.push(f + '::' + v.name); seen.add(v.name); }
  }
  if (collide.length) throw new Error('패밀리 컬렉션 내 이름 충돌: ' + collide.join(', '));

  return [
    { name: 'color',   modes: ['Light', 'Dark'], variables: FAM.color },
    { name: 'typo',    modes: ['Value'],         variables: FAM.typo },
    { name: 'spatial', modes: ['Value'],         variables: FAM.spatial },
    { name: 'visual',  modes: ['Value'],         variables: FAM.visual },
    { name: 'motion',  modes: ['Value'],         variables: FAM.motion },
    // 컴포넌트는 1차 아웃풋 범위 밖(#28 §2) — 페이로드에는 남기되 배포 대상 아님
    { name: '(Component — 미배포, #28 §2)', modes: ['Default'], variables: compVars, deliver: false }
  ].concat(dropped.length ? [{ name: '(dropped)', modes: [], variables: [], dropped }] : []);
}

function build() {
  NAMING_LOG.length = 0;
  const P = rd('tokens/tokens.primitive.json');
  // 시맨틱은 '확장본'이 SSOT다. tokens.semantic.json 은 gen-semantic 산출만 담고 있어
  // 결정 #17·#21이 시맨틱으로 확정한 8역할(action-disabled·placeholder·scrim·control-knob·
  // motion·size·focus-offset·border)이 빠져 있다 → gen-component --emit-semantic-ext 산출을 쓴다.
  const EXT = path.join(ROOT, 'tokens', 'tokens.semantic-ext.json');
  if (!fs.existsSync(EXT)) throw new Error('tokens/tokens.semantic-ext.json 없음 — `node scripts/gen-component.cjs --emit-semantic-ext` 를 먼저 실행하세요.');
  const S = rd('tokens/tokens.semantic-ext.json');
  const M = rd('tokens/tokens.motion.json');
  const COMP = fs.readdirSync(path.join(ROOT, 'tokens', 'component')).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), tree: rd(path.join('tokens', 'component', f)) }));

  const skipped = [];
  const primVars = [], semVars = [], compVars = [];
  const effectStyles = [], textStyles = [];

  /* ── Primitive ────────────────────────────────────────────────────────── */
  // color (alpha 포함) → COLOR
  {
    const out = []; flatten(P.color, ['color'], ['color'], out, 'primitive');
    out.forEach((t) => primVars.push({ name: t.figma, type: 'COLOR', value: t.value, from: t.logical }));
  }
  // dimension → FLOAT (사다리 15칸 + 센티널 2 — px 가지만 올린다)
  {
    const ladder = P.dimension.px, spec = P.dimension.special;
    Object.keys(ladder).filter((k) => !k.startsWith('$')).forEach((k) => {
      const n = k.replace(/^step-/, '');
      primVars.push({ name: `dimension/step/${n}`, type: 'FLOAT', value: px(ladder[k].$value), from: `dimension.px.${k}` });
    });
    Object.keys(spec).filter((k) => !k.startsWith('$')).forEach((k) => {
      primVars.push({ name: `dimension/special/${k}`, type: 'FLOAT', value: px(spec[k].$value), from: `dimension.special.${k}` });
    });
    const remCount = Object.keys(P.dimension.rem).filter((k) => !k.startsWith('$')).length;
    skipped.push({ what: `dimension.rem.* (${remCount}건)`, why: 'Figma 변수는 unitless px 저장 — rem 가지는 같은 사다리 칸의 중복. rem 은 빌드(build-css) 파생 몫. (Q-006 §1-Q4 실측: 53/53 무손실)' });
  }
  // typo → font/size(bp별) · font/weight · font/family · lineHeight
  {
    const fs_ = P.typography['font-size'].px; // px 가지만
    Object.keys(fs_).filter((k) => !k.startsWith('$')).forEach((bp) => {
      Object.keys(fs_[bp]).filter((k) => !k.startsWith('$')).forEach((step) => {
        primVars.push({ name: `typo/font/size/${bp}/${step}`, type: 'FLOAT', value: px(fs_[bp][step].$value), from: `typography.font-size.px.${bp}.${step}` });
      });
    });
    Object.keys(P.typography['font-weight']).filter((k) => !k.startsWith('$')).forEach((k) =>
      primVars.push({ name: `typo/font/weight/${k}`, type: 'FLOAT', value: P.typography['font-weight'][k].$value, from: `typography.font-weight.${k}` }));
    Object.keys(P.typography['font-family']).filter((k) => !k.startsWith('$')).forEach((k) =>
      primVars.push({ name: `typo/font/family/${k}`, type: 'STRING', value: P.typography['font-family'][k].$value[0], from: `typography.font-family.${k}` }));
    Object.keys(P.typography['line-height']).filter((k) => !k.startsWith('$')).forEach((k) =>
      primVars.push({ name: `typo/lineHeight/${k}`, type: 'FLOAT', value: P.typography['line-height'][k].$value, from: `typography.line-height.${k}` }));
    const ls = P.typography['letter-spacing'];
    Object.keys(ls).filter((k) => !k.startsWith('$')).forEach((k) =>
      textStyles.push({ axis: 'letterSpacing', name: k, em: ls[k].$value, figmaPercent: Math.round(parseFloat(ls[k].$value) * 1000) / 10 }));
    skipped.push({ what: `typography.letter-spacing.* (${Object.keys(ls).filter((k) => !k.startsWith('$')).length}건)`, why: 'Figma 는 em 자간 미지원(%·px만) + % 자간은 변수 export 에서 skip — 변수가 아니라 Typography 스타일 경유(상호운용 런 #2 문서 확정). em×100 = % 파생값을 textStyles 에 병기.' });
    skipped.push({ what: `typography.font-size.rem.* (${Object.keys(P.typography['font-size'].rem).filter((k) => !k.startsWith('$')).length}bp)`, why: 'dimension.rem 과 같은 이유 — Figma unitless px.' });
  }
  // primitive size → spatial/size/* (결정 #28 ④-5: CSS 에는 안 내보내되 Figma 컬렉션에는 존재)
  {
    const SZ = rd('tokens/tokens.size.json');
    const out = []; flatten(SZ.size, ['size'], ['spatial', 'size'], out, 'primitive.size');
    out.forEach((t) => primVars.push({ name: t.figma, type: 'FLOAT', value: px(t.value), from: t.logical }));
  }
  // motion → FLOAT(ms) / STRING(bezier)
  {
    Object.keys(M.motion.duration).filter((k) => !k.startsWith('$')).forEach((k) =>
      primVars.push({ name: `motion/duration/${k.replace(/^duration-/, '')}`, type: 'FLOAT', value: px(M.motion.duration[k].$value), from: `motion.duration.${k}` }));
    Object.keys(M.motion.easing).filter((k) => !k.startsWith('$')).forEach((k) =>
      primVars.push({ name: `motion/easing/${k}`, type: 'STRING', value: M.motion.easing[k].$value, from: `motion.easing.${k}` }));
  }
  // elevation → 변수 아님(다중 레이어 그림자) → Effect Style
  {
    ['light', 'dark'].forEach((mode) => {
      Object.keys(P.elevation[mode]).filter((k) => !k.startsWith('$')).forEach((k) => {
        effectStyles.push({ name: `elevation/${k.replace(/^elevation-/, '')}`, mode, layers: P.elevation[mode][k].$value, from: `elevation.${mode}.${k}` });
      });
    });
    skipped.push({ what: 'elevation.* (12건)', why: 'Figma Variables 는 다중 레이어 그림자를 담지 못한다 — Effect Style 로 발행(레이어 2겹 보존 여부는 손 왕복 체크리스트 B).' });
  }

  const primIndex = {}; primVars.forEach((v) => { primIndex[normLogical(v.from)] = v.name; });
  // rem 가지 별칭이 같은 사다리 칸으로 접히도록 색인 보강
  primVars.filter((v) => v.name.startsWith('dimension/step/')).forEach((v) => {
    const n = v.name.split('/').pop();
    primIndex[`dimension.rem.step-${n}`] = v.name; primIndex[`dimension.px.step-${n}`] = v.name;
  });
  primVars.filter((v) => v.name.startsWith('dimension/special/')).forEach((v) => { primIndex[`dimension.special.${v.name.split('/').pop()}`] = v.name; });
  primVars.filter((v) => v.name.startsWith('typo/font/size/')).forEach((v) => {
    const [, , , bp, step] = v.name.split('/'); primIndex[`typography.font-size.rem.${bp}.${step}`] = v.name;
  });

  /* ── Semantic (modes: Light · Dark) ───────────────────────────────────── */
  const semSeen = {};
  const pushSem = (name, mode, raw, from) => {
    const ref = typeof raw === 'string' && /^\{.+\}$/.test(raw) ? raw.slice(1, -1) : null;
    const alias = ref ? (primIndex[ref] || primIndex[normLogical(ref)] || null) : null;
    if (ref && !alias) skipped.push({ what: `semantic ${name} (${mode})`, why: `별칭 대상 ${ref} 을 Primitive 색인에서 찾지 못함 — 값으로 굳힘` });
    const rec = semSeen[name] || (semSeen[name] = { name, type: 'COLOR', modes: {}, from: {} });
    rec.modes[mode] = alias ? { alias } : { value: ref ? null : raw };
    rec.from[mode] = from;
  };
  ['light', 'dark'].forEach((mode) => {
    const out = []; flatten(S.semantic.color[mode], [], ['color'], out, 'semantic.color');
    out.forEach((t) => pushSem(t.figma, mode === 'light' ? 'Light' : 'Dark', t.value, t.logical));
  });
  Object.values(semSeen).forEach((v) => semVars.push(v));

  // 모드 중립 시맨틱: spatial(간격·치수) · visual(radius)
  const modeNeutral = [];
  {
    const out = []; flatten(S.semantic.spacing, ['spacing'], ['spatial'], out, 'semantic.spacing');
    out.forEach((t) => modeNeutral.push({ ...t, family: 'spatial' }));
  }
  {
    const out = []; flatten(S.semantic.radius, ['radius'], ['visual', 'radius'], out, 'semantic.radius');
    out.forEach((t) => modeNeutral.push({ ...t, family: 'visual' }));
  }
  {
    const out = []; flatten(S.semantic.size, ['size'], ['spatial', 'size'], out, 'semantic.size');
    out.forEach((t) => modeNeutral.push({ ...t, family: 'spatial' }));
  }
  {
    const out = []; flatten(S.semantic.borderWidth, ['borderWidth'], ['visual', 'borderWidth'], out, 'semantic.borderWidth');
    out.forEach((t) => modeNeutral.push({ ...t, family: 'visual' }));
  }
  modeNeutral.push({ logical: 'focus-offset', figma: 'visual/focusOffset', value: S.semantic['focus-offset'].$value, family: 'visual' });
  // semantic.motion 은 합성(transition) — Figma 변수는 합성을 담지 못하므로 duration/easing 두 축으로 분해한다.
  Object.keys(S.semantic.motion).filter((k) => !k.startsWith('$')).forEach((role) => {
    const v = S.semantic.motion[role].$value;
    const seg = segmentsFor(Object.keys(S.semantic.motion).filter((k) => !k.startsWith('$')), 'semantic.motion')[role].join('/');
    modeNeutral.push({ logical: `motion.${role}.duration`, figma: `motion/${seg}/duration`, value: v.duration, family: 'motion' });
    modeNeutral.push({ logical: `motion.${role}.easing`, figma: `motion/${seg}/easing`, value: v.timingFunction, family: 'motion', str: true });
  });
  modeNeutral.forEach((t) => {
    const ref = typeof t.value === 'string' && /^\{.+\}$/.test(t.value) ? t.value.slice(1, -1) : null;
    const alias = ref ? (primIndex[ref] || primIndex[normLogical(ref)] || null) : null;
    const one = alias ? { alias } : { value: t.str ? t.value : px(t.value) };
    semVars.push({ name: t.figma, type: t.str ? 'STRING' : 'FLOAT', modes: { Light: one, Dark: one }, from: { Light: t.logical, Dark: t.logical } });
  });
  // 시맨틱 elevation → Effect Style 별칭(변수 아님)
  Object.keys(S.semantic.elevation).filter((k) => !k.startsWith('$')).forEach((role) => {
    ['light', 'dark'].forEach((mode) => {
      const raw = S.semantic.elevation[role][mode].$value;
      effectStyles.push({ name: `elevation/${role}`, mode, aliasOf: raw.replace(/[{}]/g, '').replace(/^elevation\.(light|dark)\.elevation-/, 'elevation/'), from: `semantic.elevation.${role}.${mode}` });
    });
  });
  // 시맨틱 typography(합성) → Text Style
  Object.keys(S.semantic.typography).filter((k) => !k.startsWith('$')).forEach((role) => {
    Object.keys(S.semantic.typography[role]).filter((k) => !k.startsWith('$')).forEach((bp) => {
      const c = S.semantic.typography[role][bp].$value;
      textStyles.push({
        axis: 'composite', name: `${role}/${bp}`,
        fontFamily: primIndex[c.fontFamily.replace(/[{}]/g, '')] || c.fontFamily,
        fontWeight: primIndex[c.fontWeight.replace(/[{}]/g, '')] || c.fontWeight,
        fontSize: primIndex[c.fontSize.replace(/[{}]/g, '')] || c.fontSize,
        lineHeight: primIndex[c.lineHeight.replace(/[{}]/g, '')] || c.lineHeight,
        letterSpacing: c.letterSpacing.replace(/[{}]/g, '')
      });
    });
  });

  const semIndex = {};
  semVars.forEach((v) => { const src = v.from.Light || v.from.Dark; if (src) semIndex[src.replace(/^semantic\./, '')] = v.name; });
  // 컴포넌트가 참조하는 모드중립 경로(semantic.color.bg.x) 색인
  semVars.forEach((v) => {
    if (v.name.startsWith('color/')) {
      const l = v.from.Light; if (!l) return;
      semIndex[l.replace(/^(light|dark)\./, '')] = v.name; // flatten 이 mode 세그먼트를 빼고 저장
    }
  });
  Object.keys(semIndex).forEach((k) => { semIndex['color.' + k] = semIndex['color.' + k] || semIndex[k]; });

  /* ── Component (mode: Default — 참조가 모드중립이라 모드는 시맨틱이 갖는다) ── */
  COMP.forEach(({ name, tree }) => {
    const out = []; flatten(tree.component[name], [name], [name], out, 'component');
    out.forEach((t) => {
      const ref = typeof t.value === 'string' && /^\{.+\}$/.test(t.value) ? t.value.slice(1, -1) : null;
      let alias = null, styleRef = null;
      if (ref) {
        const bare = ref.replace(/^semantic\./, '');
        // 합성 토큰(타이포·그림자·트랜지션)은 Figma 변수가 아니라 스타일이다 — 미해결이 아니라 다른 표면.
        if (/^typography\./.test(bare)) styleRef = { kind: 'textStyle', name: bare.replace(/^typography\./, '') };
        else if (/^elevation\./.test(bare)) styleRef = { kind: 'effectStyle', name: 'elevation/' + bare.replace(/^elevation\./, '') };
        else if (/^motion\./.test(bare)) styleRef = { kind: 'motionPair', name: 'motion/' + bare.replace(/^motion\./, '') };
        else alias = semIndex[bare] || semIndex[ref] || primIndex[ref] || primIndex[normLogical(ref)] || null;
      }
      compVars.push({
        name: t.figma,
        type: styleRef ? 'STYLE' : ref ? 'ALIAS' : (typeof t.value === 'number' ? 'FLOAT' : 'STRING'),
        alias, styleRef, value: ref ? null : t.value, from: t.logical
      });
    });
  });
  const compUnresolved = compVars.filter((v) => v.type === 'ALIAS' && !v.alias);

  const payload = {
    $generatedBy: 'scripts/gen-figma-vars.cjs',
    $why: 'KDX 표준 정렬 Phase ④ — Figma 변수 재동기화 페이로드(결정 #40). 손으로 옮기지 않는다.',
    remBase: REM_BASE,
    collections: families(primVars, semVars, compVars),
    // 텍스트 스타일이 참조하는 변수 경로도 5패밀리 축(컬렉션명 접두 제거)으로 맞춘다 — #28 §2-A
    effectStyles,
    textStyles: textStyles.map((s) => (s.axis !== 'composite' ? s : {
      ...s,
      fontFamily: STRIP(s.fontFamily), fontWeight: STRIP(s.fontWeight),
      fontSize: STRIP(s.fontSize), lineHeight: STRIP(s.lineHeight)
    })),
    skipped,
    counts: {
      primitive: primVars.length, semantic: semVars.length, component: compVars.length,
      effectStyles: effectStyles.length, textStyles: textStyles.length,
      componentUnresolvedAlias: compUnresolved.length,
      semanticAliasToPrimitive: semVars.filter((v) => v.modes.Light && v.modes.Light.alias).length
    }
  };
  return { payload, naming: NAMING_LOG.slice(), compUnresolved };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. 리네임 맵 — 구(pre-KDX) 토큰 트리를 같은 규칙으로 변환해 old→new 대조
 *    구 트리는 인자로 받은 디렉터리에서 읽는다(git worktree 등). 없으면 생략.
 * ──────────────────────────────────────────────────────────────────────────── */
function renameMap(oldDir) {
  if (!oldDir || !fs.existsSync(oldDir)) return null;
  const rdo = (p) => JSON.parse(fs.readFileSync(path.join(oldDir, p), 'utf8'));
  const names = (tree, root, fam) => { const o = []; flatten(tree, [root], [fam], o, 'old'); return o; };
  let old = [];
  try {
    const P = rdo('tokens/tokens.primitive.json');
    if (P.color) old = old.concat(names(P.color, 'color', 'color'));
    if (P.spacing) old = old.concat(names(P.spacing, 'spacing', 'spatial'));
    if (P.radius) old = old.concat(names(P.radius, 'radius', 'visual'));
    if (P.dimension) old = old.concat(names(P.dimension, 'dimension', 'dimension'));
    try { const B = rdo('tokens/tokens.border-width.json'); old = old.concat(names(B['border-width'] || B.borderWidth || B, 'border-width', 'visual')); } catch (e) { /* 이미 폐지 */ }
    const S = rdo('tokens/tokens.semantic.json');
    ['light', 'dark'].forEach((m) => { if (S.semantic.color[m]) old = old.concat(names(S.semantic.color[m], 'color.' + m, 'color')); });
    ['spacing', 'radius'].forEach((g) => { if (S.semantic[g]) old = old.concat(names(S.semantic[g], g, g === 'spacing' ? 'spatial' : 'visual')); });
  } catch (e) { return { error: String(e.message) }; }
  return old.map((t) => ({ old: t.figma, oldLogical: t.logical }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. 실행
 * ──────────────────────────────────────────────────────────────────────────── */
const files = () => {
  const { payload, naming } = build();
  return {
    'variables.json': JSON.stringify(payload, null, 2) + '\n',
    'naming-decisions.json': JSON.stringify(naming, null, 2) + '\n'
  };
};

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const f = files(); let bad = 0;
  for (const [n, c] of Object.entries(f)) {
    const p = path.join(OUT, n);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== c) { console.error('figma-vars DRIFT: ' + n); bad++; }
  }
  if (bad) process.exit(1);
  console.log('figma-vars --check OK');
} else if (args.includes('--summary')) {
  const { payload, compUnresolved } = build();
  console.log(JSON.stringify({ counts: payload.counts, skipped: payload.skipped.map((s) => s.what), unresolved: compUnresolved.slice(0, 10).map((v) => v.name + ' ← ' + v.from) }, null, 2));
} else {
  fs.mkdirSync(OUT, { recursive: true });
  const f = files();
  for (const [n, c] of Object.entries(f)) fs.writeFileSync(path.join(OUT, n), c);
  const { payload } = build();
  console.log('figma-vars 생성: ' + Object.keys(f).join(', '));
  console.log(JSON.stringify(payload.counts, null, 2));
}
module.exports = { build, renameMap, segmentsFor };

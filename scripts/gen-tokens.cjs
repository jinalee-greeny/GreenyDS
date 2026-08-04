#!/usr/bin/env node
/**
 * gen-tokens.cjs — 파라미터 → primitive 토큰 생성기 (재구성판)
 * (프로젝트 pipeline/gen-tokens.cjs 그대로 복원 — B1 커밋묶음 작업용)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/* ================================ 파라미터 ================================ */
const DEFAULT_PARAMS = {
  color: {
    taper: 1.0,
    mode: 'even',
    ramps: [
      { id: 'brand', type: 'color', seed: '#6E56CF' },
      // 중립 틴트 (BC-11, 진아 확정 2026-07-24 → A안 엔진기준 2026-07-27):
      // 채도 감쇠 계수 chromaScale — 쿨 = 구값 대비 −50%(×0.5) · 웜 = −80%(×0.2). L·H 불변.
      { id: 'warm-gray', type: 'gray', temp: 'warm', chromaScale: 0.2 },
      { id: 'cool-gray', type: 'gray', temp: 'cool', chromaScale: 0.5 },
      { id: 'red', type: 'color', seed: '#E5484D' },
      { id: 'amber', type: 'color', seed: '#F5A524' },
      { id: 'green', type: 'color', seed: '#30A46C' },
      { id: 'blue', type: 'color', seed: '#3B82F6' },
    ],
    alphaSteps: [4, 8, 12, 16, 24, 36, 48, 64, 80, 92],
    alphaColorStep: 600,
  },
  typography: {
    breakpoints: {
      mobile: { base: 15, ratio: 1.2, round: 0.5 },
      tablet: { base: 16, ratio: 1.2, round: 0.5 },
      desktop: { base: 16, ratio: 1.25, round: 0.5 },
    },
    steps: [
      { n: 'xs', i: -2 }, { n: 'sm', i: -1 }, { n: 'base', i: 0 }, { n: 'md', i: 1 },
      { n: 'lg', i: 2 }, { n: 'xl', i: 3 }, { n: '2xl', i: 4 }, { n: '3xl', i: 5 },
      { n: '4xl', i: 6 }, { n: '5xl', i: 7 }, { n: '6xl', i: 8 },
    ],
    lhLoose: 1.6, lhTight: 1.05, lhKnee: 1,
    lsStrength: 0.006,
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    families: {
      sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
      serif: ['Georgia', 'Times New Roman', 'serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
    },
  },
  dimension: {
    basePx: 8,
    // 사다리 15칸 (결정 #40 · Q-014): 0·2·4·8·12·16·20·24·32·40·48·64·80·96·128
    multipliers: [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16],
  },
  elevation: {
    levels: [0, 2, 4, 8, 16, 24],
    keyY: 0.4, keyBlur: 0.9,
    ambY: 1.0, ambBlur: 2.2, ambSpread: 0.12,
    light: { keyAlpha: 0.16, ambAlpha: 0.1 },
    dark: { keyAlpha: 0.42, ambAlpha: 0.3, overlay: 0.14, border: 0.09 },
    tint: 0,
  },
};

/* ============================== 색 엔진 (OKLCH) ============================== */
const STEPS_COLOR = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const TARGET_L = [0.972, 0.940, 0.885, 0.810, 0.724, 0.637, 0.558, 0.474, 0.396, 0.322, 0.254];
const TAPER = [0.35, 0.50, 0.70, 0.88, 0.97, 1.00, 0.98, 0.90, 0.78, 0.62, 0.50];
const I500 = STEPS_COLOR.indexOf(500);
const clamp = (a, b, v) => Math.min(b, Math.max(a, v));

const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c) => { c = clamp(0, 1, c); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const hexToRgb = (h) => { const m = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(m.substr(i, 2), 16) / 255); };
const rgbToHex = (a) => '#' + a.map((c) => Math.round(clamp(0, 1, c) * 255).toString(16).padStart(2, '0')).join('');
function linToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
function oklabToOklch([L, a, b]) { const C = Math.hypot(a, b); let H = Math.atan2(b, a) * 180 / Math.PI; if (H < 0) H += 360; return [L, C, H]; }
function oklchToLin(L, C, H) {
  const hr = H * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b,
    m_ = L - 0.1055613458 * a - 0.0638541728 * b,
    s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const seedOklch = (hex) => oklabToOklch(linToOklab(hexToRgb(hex).map(srgbToLin)));
function inGamut(L, C, H) { const [r, g, b] = oklchToLin(L, C, H); const e = 0.0005; return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e; }
function clampChroma(L, C, H) {
  if (inGamut(L, C, H)) return C;
  let lo = 0, hi = C;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inGamut(L, m, H)) lo = m; else hi = m; }
  return lo;
}

function deriveRamp(r, p) {
  const tp = TAPER.map((t) => 1 - p.taper * (1 - t));
  let hue, baseC, offset = 0, grayTaper = false;
  if (r.type === 'gray') { hue = r.temp === 'warm' ? 70 : 260; baseC = (r.temp === 'warm' ? 0.013 : 0.015) * (r.chromaScale != null ? r.chromaScale : 1); grayTaper = true; }
  else { const s = seedOklch(r.seed); hue = s[2]; baseC = s[1]; offset = p.mode === 'anchor' ? s[0] - TARGET_L[I500] : 0; }
  return STEPS_COLOR.map((step, i) => {
    const L = clamp(0.02, 0.995, TARGET_L[i] + offset);
    const mult = grayTaper ? tp[i] * 0.4 + 0.6 : tp[i];
    const C = clampChroma(L, baseC * mult, hue);
    const lin = oklchToLin(L, C, hue);
    return { step, hex: rgbToHex(lin.map(linToSrgb)) };
  });
}

function genColor(p) {
  const out = {
    $description: 'Primitive 색 램프 (OKLCH 파생, sRGB, even anchoring, taper 1.0). 역할 없음.',
  };
  const derived = {};
  for (const r of p.ramps) {
    const ramp = deriveRamp(r, p);
    derived[r.id] = ramp;
    const node = {};
    for (const s of ramp) node[String(s.step)] = { $value: s.hex };
    node.$type = 'color';
    out[r.id] = node;
  }
  const alphaNum = (a) => String(a / 100);
  const brandRgb = hexToRgb(derived['brand'].find((s) => s.step === p.alphaColorStep).hex)
    .map((c) => Math.round(c * 255));
  const alphaGroup = (rgbStr) => Object.fromEntries(
    p.alphaSteps.map((a) => [`a${a}`, { $value: `rgba(${rgbStr},${alphaNum(a)})` }]),
  );
  out.alpha = {
    $type: 'color',
    $description: '고정 불투명도 알파 (오버레이·스크림·상태)',
    black: alphaGroup('0,0,0'),
    white: alphaGroup('255,255,255'),
    brand: alphaGroup(brandRgb.join(',')),
  };
  return out;
}

/* ============================ 타이포그래피 엔진 ============================ */
const fmt = (v, dp) => {
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return String(r);
};
const remStr = (px) => `${fmt(px / 16, 4)}rem`;
const pxStr = (px) => `${fmt(px, 2)}px`;
const roundTo = (v, step) => (step ? Math.round(v / step) * step : Math.round(v * 100) / 100);

function genTypography(p) {
  const sizes = {};
  for (const [bp, cfg] of Object.entries(p.breakpoints)) {
    sizes[bp] = p.steps.map((s) => ({ n: s.n, px: roundTo(cfg.base * Math.pow(cfg.ratio, s.i), cfg.round) }));
  }
  const sizeNode = (unit) => {
    const node = { $type: 'dimension' };
    for (const bp of Object.keys(p.breakpoints)) {
      node[bp] = Object.fromEntries(sizes[bp].map((s) => [s.n, { $value: unit === 'rem' ? remStr(s.px) : pxStr(s.px) }]));
    }
    return node;
  };
  const lh = {};
  const ls = {};
  const IMAX = Math.max(...p.steps.map((s) => s.i));
  for (const s of p.steps) {
    const t = s.i <= p.lhKnee ? 0 : (s.i - p.lhKnee) / (IMAX - p.lhKnee);
    lh[s.n] = { $value: Math.round((p.lhLoose - (p.lhLoose - p.lhTight) * t) * 10000) / 10000 };
    const v = Math.round(-p.lsStrength * s.i * 1000) / 1000;
    ls[s.n] = { $value: `${v === 0 ? '0' : String(v)}em` };
  }
  return {
    $description: 'Primitive 타이포. 크기=rem(브레이크포인트 세트), 행간=unitless, 자간=em, 굵기·패밀리=공유. 역할 없음.',
    'font-size': {
      $description: '브레이크포인트별 크기 스케일. 단위 rem·px 병기(결정 #12).',
      rem: sizeNode('rem'),
      px: sizeNode('px'),
    },
    'line-height': {
      $type: 'number',
      $description: '행간 (unitless). 본문 평평·디스플레이 조임(본문 WCAG1.5 보장)',
      ...lh,
    },
    'letter-spacing': {
      $type: 'dimension',
      $description: '자간 (em)',
      ...ls,
    },
    'font-weight': {
      $type: 'fontWeight',
      $description: '기본 포함 굵기 (서비스가 선택)',
      ...Object.fromEntries(Object.entries(p.weights).map(([k, v]) => [k, { $value: v }])),
    },
    'font-family': {
      $type: 'fontFamily',
      $description: '패밀리 슬롯 + fallback (서비스가 primary 지정)',
      ...Object.fromEntries(Object.entries(p.families).map(([k, v]) => [k, { $value: v }])),
    },
  };
}

/* ============================== dimension 사다리 (결정 #40 · Q-014) ============================== */
function genDimension(p) {
  const values = p.multipliers.map((m, i) => ({ id: `step-${i}`, px: p.basePx * m }));
  const node = (unit) => {
    const o = { $type: 'dimension' };
    for (const v of values) {
      o[v.id] = {
        $value: unit === 'rem' ? remStr(v.px) : pxStr(v.px),
        $extensions: { onGrid: v.px % 2 === 0 },
      };
    }
    return o;
  };
  return {
    $description: 'Primitive 치수 사다리 — 간격·모서리·테두리 굵기의 단일 원천 (결정 #40 · Q-014). base 8px, 2px 그리드(결정 #39). 단위 rem·px 병기(결정 #12). 값과 분리된 서수 id.',
    rem: node('rem'),
    px: node('px'),
    special: {
      $type: 'dimension',
      $description: '센티널 2개 — 사다리 밖 특수값(결정 #40)',
      'hairline': { $value: '1px', $description: '헤어라인 정밀 선 — px 고정' },
      'full': { $value: '999px', $description: '알약·원 (Figma 실측 검증)' },
    },
  };
}

/* ============================== elevation 엔진 ============================== */
function genElevation(p) {
  const maxDp = Math.max(...p.levels, 1);
  const rgb = '0,0,0';
  const layerSet = (dp, keyAlpha, ambAlpha, unit) => {
    if (dp <= 0) return [];
    const px = {
      keyY: Math.round(dp * p.keyY), keyB: Math.round(dp * p.keyBlur),
      ambY: Math.round(dp * p.ambY), ambB: Math.round(dp * p.ambBlur),
      ambS: Math.round(-dp * p.ambSpread),
    };
    const u = (v) => (unit === 'rem' ? remStr(v) : pxStr(v));
    const zero = unit === 'rem' ? '0rem' : '0px';
    return [
      { color: `rgba(${rgb},${String(keyAlpha)})`, offsetX: zero, offsetY: u(px.keyY), blur: u(px.keyB), spread: zero },
      { color: `rgba(${rgb},${String(ambAlpha)})`, offsetX: zero, offsetY: u(px.ambY), blur: u(px.ambB), spread: px.ambS === 0 ? zero : u(px.ambS) },
    ];
  };
  const modeNode = (mode) => {
    const a = mode === 'dark' ? p.dark : p.light;
    const node = {
      $type: 'shadow',
      $description: mode === 'dark'
        ? 'dark 표면 그림자(alpha↑, rem). overlay/border 알파 델타는 $extensions (표면색은 시맨틱에서 합성)'
        : 'light 표면 그림자 (rem)',
    };
    p.levels.forEach((dp, i) => {
      const t = {
        $value: layerSet(dp, a.keyAlpha, a.ambAlpha, 'rem'),
      };
      if (mode === 'light' && i === 0) t.$description = '평면';
      const ext = {};
      if (dp > 0) ext.px = layerSet(dp, a.keyAlpha, a.ambAlpha, 'px');
      if (mode === 'dark') {
        ext.overlayWhiteAlpha = Math.round(p.dark.overlay * (dp / maxDp) * 10000) / 10000;
        ext.borderWhiteAlpha = Math.round(p.dark.border * (dp / maxDp) * 10000) / 10000;
      }
      if (Object.keys(ext).length) t.$extensions = ext;
      node[`elevation-${i}`] = t;
    });
    return node;
  };
  return {
    $description: 'Primitive 고도. 다중 레이어 그림자(단위 rem, 결정 #12; px는 $extensions). 다크는 표면 밝기+보더+그림자 병행 — 다크 표면 색·기준 램프는 시맨틱에서 선택(결정 #13).',
    light: modeNode('light'),
    dark: modeNode('dark'),
  };
}

/* ================================== 조립 ================================== */
function generate(params = DEFAULT_PARAMS) {
  return {
    $description: '디자인 시스템 마스터 프리셋 — primitive 토큰 (4 그룹, 결정 #40 KDX 정렬). SSOT 실체화. 단위(결정 #12): elevation=rem, dimension·typography 크기=rem·px 병기.',
    color: genColor(params.color),
    typography: genTypography(params.typography),
    dimension: genDimension(params.dimension),
    elevation: genElevation(params.elevation),
  };
}

module.exports = { DEFAULT_PARAMS, generate, deriveRamp, seedOklch, hexToRgb, srgbToLin };

/* ============================ config 병합 (export 연결) ============================ */
// 컨피규레이터 export config(파라미터 override)를 DEFAULT_PARAMS 위에 깊은 병합.
// color.ramps는 id 기준 병합(brand.seed만 바꿔도 됨). 그 외 배열은 있으면 교체.
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (Array.isArray(base)) return over;
  if (!isObj(base)) return over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    if (k === 'ramps' && Array.isArray(base.ramps) && Array.isArray(over.ramps)) {
      out.ramps = base.ramps.map((r) => { const o = over.ramps.find((x) => x.id === r.id); return o ? { ...r, ...o } : r; });
      for (const o of over.ramps) if (!base.ramps.find((r) => r.id === o.id)) out.ramps.push(o);
    } else out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}
function paramsFromConfig(cfg) {
  // config는 { primitive: {..override..} } 또는 파라미터 override 객체 자체를 받는다.
  const override = cfg && cfg.primitive ? cfg.primitive : cfg;
  return deepMerge(DEFAULT_PARAMS, override || {});
}

/* =================================== CLI =================================== */
if (require.main !== module) return;
const root = path.join(__dirname, '..');
const argOf = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const configPath = argOf('--config');
const outArg = argOf('--out');
const outPath = outArg ? path.resolve(process.cwd(), outArg) : path.join(root, 'tokens/tokens.primitive.json');
const params = configPath ? paramsFromConfig(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), configPath), 'utf8'))) : DEFAULT_PARAMS;
const generated = generate(params);
const json = JSON.stringify(generated, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const existing = fs.readFileSync(outPath, 'utf8');
  const a = JSON.parse(existing), b = generated;
  const diffs = [];
  (function walkCmp(x, y, p) {
    if (typeof x !== typeof y) { diffs.push(`${p}: type ${typeof x} ≠ ${typeof y}`); return; }
    if (x && typeof x === 'object') {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) {
        if (!(k in x)) diffs.push(`${p}.${k}: 생성본에만 있음`);
        else if (!(k in y)) diffs.push(`${p}.${k}: SSOT에만 있음`);
        else walkCmp(x[k], y[k], `${p}.${k}`);
      }
    } else if (x !== y) diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`);
  })(a, b, '$');
  if (diffs.length) {
    console.error(`CHECK FAIL — ${diffs.length}개 불일치 (SSOT ≠ 생성본):`);
    diffs.slice(0, 40).forEach((d) => console.error(' ✗', d));
    if (diffs.length > 40) console.error(` … 외 ${diffs.length - 40}건`);
    process.exit(1);
  }
  console.log('CHECK OK — 생성본이 기존 SSOT와 완전 일치 (파라미터→토큰 재현 검증 통과)');
} else {
  fs.writeFileSync(outPath, json);
  console.log(`wrote ${path.relative(root, outPath)}`);
}

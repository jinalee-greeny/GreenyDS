#!/usr/bin/env node
/**
 * validate-tokens.cjs — 엔진 자동 검증 (✗ 하드 게이트 / △ 권고 분리)
 * (프로젝트 pipeline/validate-tokens.cjs 그대로 복원)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'tokens/tokens.primitive.json'), 'utf8'));

const results = [];
const push = (level, layer, msg) => results.push({ level, layer, msg });
const pxNum = (s) => parseFloat(String(s).replace(/px|rem/, '')) * (String(s).endsWith('rem') ? 16 : 1);
const near = (a, b) => Math.abs(a - b) < 1e-6;
const nearRounded = (a, b) => Math.abs(a - b) < 0.002;
const nearMultiple = (v, step) => step > 0 && Math.abs(v / step - Math.round(v / step)) < 1e-6;

/* ------------------------------- spacing ------------------------------- */
{
  const BASE = 8, HALF = 4;
  const px = Object.entries(T.spacing.px).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => ({ id: k, px: pxNum(v.$value) }));
  const rem = Object.fromEntries(Object.entries(T.spacing.rem).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, pxNum(v.$value)]));
  const nz = px.filter((d) => d.px > 0);

  push(nearMultiple(BASE, HALF) ? 'pass' : 'fail', 'spacing',
    `그리드 일관성 — base(${BASE}) = half(${HALF}) × ${Math.round(BASE / HALF)}`);
  const off = nz.filter((d) => !nearMultiple(d.px, HALF));
  push(off.length === 0 ? 'pass' : 'fail', 'spacing',
    off.length === 0 ? `그리드 무결성 — 모든 값이 ${HALF}px 배수` : `그리드 이탈: ${off.map((d) => d.id).join(', ')}`);
  let mono = true;
  for (let i = 1; i < px.length; i++) if (px[i].px <= px[i - 1].px) mono = false;
  push(mono ? 'pass' : 'fail', 'spacing', mono ? '스케일 단조 증가' : '인접 단계 값 역전/정체');
  const dup = nz.length !== new Set(nz.map((d) => d.px)).size;
  push(dup ? 'fail' : 'pass', 'spacing', dup ? '중복 값 존재' : '중복 없음');
  const smallest = Math.min(...nz.map((d) => d.px));
  push(smallest >= HALF ? 'pass' : 'warn', 'spacing', `최소 비영 간격 ${smallest}px ${smallest >= HALF ? '≥' : '<'} 하프스텝`);
  const maxPx = Math.max(...px.map((d) => d.px));
  push(maxPx >= 44 ? 'pass' : 'warn', 'spacing', `최대 간격 ${maxPx}px — 터치 타깃(44px, WCAG 2.5.5) ${maxPx >= 44 ? '구성 가능' : '구성 어려움'}`);
  const drift = px.filter((d) => !near(rem[d.id], d.px));
  push(drift.length === 0 ? 'pass' : 'fail', 'spacing',
    drift.length === 0 ? 'rem·px 병기 정합(rem×16 == px)' : `rem/px 드리프트: ${drift.map((d) => d.id).join(', ')}`);
}

/* -------------------------------- radius -------------------------------- */
{
  const BASE = 4;
  const px = Object.entries(T.radius.px).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => ({ id: k, px: pxNum(v.$value) }));
  const rem = Object.fromEntries(Object.entries(T.radius.rem).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, pxNum(v.$value)]));
  const nz = px.filter((d) => d.px > 0);

  const off = nz.filter((d) => !nearMultiple(d.px, BASE));
  push(off.length === 0 ? 'pass' : 'fail', 'radius',
    off.length === 0 ? `그리드 무결성 — 모든 값이 ${BASE}px 배수(간격 그리드 정렬)` : `그리드 이탈: ${off.map((d) => d.id).join(', ')}`);
  let mono = true;
  for (let i = 1; i < px.length; i++) if (px[i].px <= px[i - 1].px) mono = false;
  push(mono ? 'pass' : 'fail', 'radius', mono ? '스케일 단조 증가' : '인접 단계 값 역전/정체');
  const dup = nz.length !== new Set(nz.map((d) => d.px)).size;
  push(dup ? 'fail' : 'pass', 'radius', dup ? '중복 값 존재' : '중복 없음');
  const sp = T.radius.special;
  const hasSpecial = sp && sp['radius-full']?.$value === '9999px' && sp['radius-circle']?.$value === '50%';
  push(hasSpecial ? 'pass' : 'fail', 'radius', hasSpecial ? '특수 토큰 — full(9999px)·circle(50%) 제공' : '특수 토큰 누락');
  const outer = px.find((d) => d.id === 'radius-5')?.px ?? 0, PAD = 12;
  push(outer - PAD >= 0 ? 'pass' : 'warn', 'radius', `중첩 공식 — inner = ${outer}−${PAD} = ${outer - PAD}px ${outer - PAD >= 0 ? '≥ 0' : '< 0 (sharp 처리)'}`);
  const drift = px.filter((d) => !near(rem[d.id], d.px));
  push(drift.length === 0 ? 'pass' : 'fail', 'radius',
    drift.length === 0 ? 'rem·px 병기 정합' : `rem/px 드리프트: ${drift.map((d) => d.id).join(', ')}`);
}

/* ------------------------------ typography ------------------------------ */
{
  const lh = Object.fromEntries(Object.entries(T.typography['line-height']).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, v.$value]));
  const ls = Object.fromEntries(Object.entries(T.typography['letter-spacing']).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, parseFloat(v.$value)]));
  const weights = Object.keys(T.typography['font-weight']).filter((k) => !k.startsWith('$'));

  for (const bp of Object.keys(T.typography['font-size'].px).filter((k) => !k.startsWith('$'))) {
    const sizes = Object.entries(T.typography['font-size'].px[bp]).map(([k, v]) => ({ n: k, px: pxNum(v.$value) }));
    const remS = Object.fromEntries(Object.entries(T.typography['font-size'].rem[bp]).map(([k, v]) => [k, pxNum(v.$value)]));
    const base = sizes.find((s) => s.n === 'base').px;

    if (base >= 16) push('pass', `typo/${bp}`, `base ${base}px ≥ 16px`);
    else if (base >= 14) push('warn', `typo/${bp}`, `base ${base}px — 14~15px 허용선(16px 권장)`);
    else push('fail', `typo/${bp}`, `base ${base}px < 14px — 본문으로 너무 작음`);

    const minSize = Math.min(...sizes.map((s) => s.px));
    push(minSize >= 12 ? 'pass' : 'warn', `typo/${bp}`, `최소 단계 ${minSize}px ${minSize >= 12 ? '≥' : '<'} 12px`);

    let mono = true;
    for (let i = 1; i < sizes.length; i++) if (sizes[i].px <= sizes[i - 1].px) mono = false;
    push(mono ? 'pass' : 'fail', `typo/${bp}`, mono ? '스케일 단조 증가(라운딩 후 충돌 없음)' : '인접 단계 크기 충돌/역전');

    const reading = sizes.filter((s) => s.px <= 20);
    const badLh = reading.filter((s) => lh[s.n] < 1.5);
    push(badLh.length === 0 ? 'pass' : 'warn', `typo/${bp}`,
      badLh.length === 0 ? '본문 구간(≤20px) 행간 ≥ 1.5 (WCAG 1.4.8)' : `본문 행간 < 1.5: ${badLh.map((s) => s.n).join(', ')}`);

    const tight = reading.filter((s) => ls[s.n] < -0.02);
    const wild = sizes.filter((s) => Math.abs(ls[s.n]) > 0.05);
    push(tight.length === 0 && wild.length === 0 ? 'pass' : 'warn', `typo/${bp}`,
      tight.length === 0 && wild.length === 0 ? '자간 범위 정상(본문 ≥ -0.02em, |전체| ≤ 0.05em)' : `자간 경계 초과: ${[...tight, ...wild].map((s) => s.n).join(', ')}`);

    const drift = sizes.filter((s) => !nearRounded(remS[s.n], s.px));
    push(drift.length === 0 ? 'pass' : 'fail', `typo/${bp}`,
      drift.length === 0 ? 'rem·px 병기 정합' : `rem/px 드리프트: ${drift.map((s) => s.n).join(', ')}`);
  }
  push(weights.length >= 2 ? 'pass' : 'warn', 'typo', `굵기 ${weights.length}종 포함`);
}

/* ------------------------------- elevation ------------------------------- */
{
  for (const mode of ['light', 'dark']) {
    const node = T.elevation[mode];
    const levels = Object.entries(node).filter(([k]) => k.startsWith('elevation-'))
      .map(([k, v]) => ({ id: k, layers: v.$value, ext: v.$extensions ?? {} }));

    push(levels[0].layers.length === 0 ? 'pass' : 'warn', `elev/${mode}`,
      levels[0].layers.length === 0 ? 'elevation-0 = 평면(그림자 없음)' : 'elevation-0 이 평면이 아님');

    const ys = levels.filter((l) => l.layers.length).map((l) => pxNum(l.layers[0].offsetY));
    let mono = true;
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1]) mono = false;
    const blurs = levels.filter((l) => l.layers.length).map((l) => pxNum(l.layers[1].blur));
    for (let i = 1; i < blurs.length; i++) if (blurs[i] <= blurs[i - 1]) mono = false;
    push(mono ? 'pass' : 'fail', `elev/${mode}`, mono ? '깊이 단조 증가(offsetY·ambient blur)' : 'dp 역전/정체 — 인접 고도 구분 불가');

    const badStruct = levels.filter((l) => l.layers.length === 2 && !(pxNum(l.layers[0].blur) < pxNum(l.layers[1].blur)));
    push(badStruct.length === 0 ? 'pass' : 'fail', `elev/${mode}`,
      badStruct.length === 0 ? '레이어 구조 정상 — key blur < ambient blur' : `구조 이상: ${badStruct.map((l) => l.id).join(', ')}`);

    const alphas = levels.flatMap((l) => l.layers.map((x) => parseFloat(x.color.match(/,([\d.]+)\)$/)[1])));
    push(alphas.every((a) => a > 0) ? 'pass' : 'warn', `elev/${mode}`, '그림자 alpha > 0 — 표면 위 가시');

    const maxBlur = Math.max(0, ...levels.flatMap((l) => l.layers.map((x) => pxNum(x.blur))));
    push(maxBlur <= 140 ? 'pass' : 'warn', `elev/${mode}`, `최대 blur ${maxBlur}px ${maxBlur <= 140 ? '≤' : '>'} 140px`);

    if (mode === 'dark') {
      const overs = levels.map((l) => l.ext.overlayWhiteAlpha ?? 0);
      let dmono = true;
      for (let i = 1; i < overs.length; i++) if (overs[i] <= overs[i - 1]) dmono = false;
      push(overs[overs.length - 1] > 0 && dmono ? 'pass' : 'warn', 'elev/dark',
        '다크 표면 밝기(overlay) 단조 증가 — 그림자 약해도 밝기·보더로 구분');
    }
    const drift = levels.filter((l) => l.layers.length && l.ext.px && l.layers.some((lay, i) =>
      ['offsetX', 'offsetY', 'blur', 'spread'].some((k) => !near(pxNum(lay[k]), pxNum(l.ext.px[i][k])))));
    push(drift.length === 0 ? 'pass' : 'fail', `elev/${mode}`,
      drift.length === 0 ? 'rem·px($extensions) 병기 정합' : `rem/px 드리프트: ${drift.map((l) => l.id).join(', ')}`);
  }
}

/* --------------------------------- color --------------------------------- */
{
  const AA = 4.5;
  const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = (hex) => {
    const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => srgbToLin(parseInt(h, 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const ramp = (id) => Object.fromEntries(Object.entries(T.color[id]).filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, lum(v.$value)]));
  const textOnLight = (r, surf) => {
    for (const st of [300, 400, 500, 600, 700, 800, 900, 950]) if (contrast(r[st], surf) >= AA) return { st, c: contrast(r[st], surf) };
    return { st: 950, c: contrast(r[950], surf) };
  };
  const textOnDark = (r, surf) => {
    for (const st of [600, 500, 400, 300, 200, 100, 50]) if (contrast(r[st], surf) >= AA) return { st, c: contrast(r[st], surf) };
    return { st: 50, c: contrast(r[50], surf) };
  };
  const gray = ramp('cool-gray'), brand = ramp('brand'), red = ramp('red');
  const trials = [
    ['본문/gray-50', textOnLight(gray, gray[50])],
    ['brand/gray-50', textOnLight(brand, gray[50])],
    ['red/gray-50', textOnLight(red, gray[50])],
    ['본문/gray-950', textOnDark(gray, gray[950])],
    ['brand/gray-950', textOnDark(brand, gray[950])],
  ];
  for (const [label, r] of trials) {
    push(r.c >= AA ? 'pass' : 'fail', 'color', `대비 자동 해결 ${label} → 단계 ${r.st} · ${r.c.toFixed(2)}:1 (목표 ${AA})`);
  }
}

/* --------------------------------- 리포트 --------------------------------- */
const icon = { pass: '✓', warn: '△', fail: '✗' };
let fails = 0, warns = 0;
for (const r of results) {
  if (r.level === 'fail') fails++;
  else if (r.level === 'warn') warns++;
  console.log(` ${icon[r.level]} [${r.layer}] ${r.msg}`);
}
console.log('---');
console.log(`checks: ${results.length} · pass ${results.length - fails - warns} · △ ${warns} · ✗ ${fails}`);
if (fails > 0) { console.error(`FAIL — 하드 게이트 ✗ ${fails}건`); process.exit(1); }
console.log(warns > 0 ? `OK — 하드 기준 통과 (권고 △ ${warns}건은 리포트만)` : 'OK — 모든 기준 통과');

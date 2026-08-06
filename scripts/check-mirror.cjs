#!/usr/bin/env node
/*
 * check-mirror.cjs — 컨피규레이터 미러 ↔ 파이프라인 값 결정 대조 게이트
 *
 * 왜: 컨피규레이터(public/index.html)는 브라우저에서 도는 **두 번째 엔진**이다. 파이프라인의
 *     gen-semantic.cjs 와 같은 결정을 각자 구현하고 있어서, 한쪽만 고치면 화면과 산출물이
 *     조용히 갈라진다. 이 프로젝트는 같은 사고로 이미 세 번 데였다 —
 *       BC-44 ② 시맨틱 인벤토리가 두 곳 · 33117df 폰트 크기표 하드코딩 사본 ·
 *       그리고 결정 #44 에서 컨피규레이터가 옛 다크 색을 계속 보여준 건(진아 지적 2026-08-06).
 *     "복사가 아니라 생성"(결정 #29)을 미러 전체에 적용하는 것이 정답이지만 그건 큰 작업이라,
 *     그때까지 **값 결정이 갈라지는 것만이라도 CI 가 잡게** 한다.
 *
 * 무엇: 미러 소스에서 '값 결정 상수'를 문자열로 뽑아, 파이프라인 산출(tokens.semantic.json)이
 *     고른 램프 칸과 같은지 대조한다. 색 값을 다시 계산하지 않는다 — 어느 칸을 골랐는지만 본다.
 *     (기본 프리셋 기준. 미러는 사용자가 시드를 바꾸면 다른 칸을 고를 수 있고 그건 정상이다.)
 *
 * 사용: node scripts/check-mirror.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const SEM = JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens', 'tokens.semantic.json'), 'utf8')).semantic.color;

const fail = [];
const ok = [];

/** tokens.semantic.json 의 `{color.<ramp>.<step>}` 참조에서 칸 번호만 꺼낸다. */
const stepOf = (node) => {
  const v = node && node.$value;
  const m = typeof v === 'string' && v.match(/^\{color\.[a-z-]+\.(\d+)\}$/);
  return m ? m[1] : (typeof v === 'string' ? v : null);
};
/** 미러 소스에서 정확히 1회 등장해야 하는 패턴을 뽑는다(0개·2개면 하드 실패). */
const grab = (re, label) => {
  const all = [...SRC.matchAll(re)];
  if (all.length !== 1) { fail.push(`[${label}] 미러에서 ${all.length}개 매치(1개여야 함) — public/index.html 구조가 바뀌었는지 확인`); return null; }
  return all[0][1];
};

// ── 결정 #44: 다크 action-primary 3단 + on-action 뒤집기 + 보조 눌림
const cases = [
  { label: 'dark action-primary.default',  mirror: grab(/const apStep = light \? resolveStep\(BR,"#ffffff",4\.5\)\.s : "(\d+)";/g, 'apStep'),
    pipe: stepOf(SEM.dark.bg['action-primary'].default) },
  { label: 'dark action-primary.hover',    mirror: grab(/const apH\s+= light \? shift\(apStep,1\) : "(\d+)";/g, 'apH'),
    pipe: stepOf(SEM.dark.bg['action-primary'].hover) },
  { label: 'dark action-primary.pressed',  mirror: grab(/const apA\s+= light \? shift\(apStep,2\) : "(\d+)";/g, 'apA'),
    pipe: stepOf(SEM.dark.bg['action-primary'].pressed) },
  { label: 'dark fg.on-action',            mirror: grab(/const onActionC = light \? "#ffffff" : BR\["(\d+)"\];/g, 'onAction'),
    pipe: (() => { const v = SEM.dark.fg['on-action'].$value; // 리터럴 hex → 브랜드 칸으로 역참조
      const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens', 'tokens.primitive.json'), 'utf8')).color.brand;
      const hit = Object.keys(P).find(k => !k.startsWith('$') && P[k].$value === v); return hit || v; })() },
  { label: 'dark action-secondary.pressed', mirror: grab(/asActive:NEU\[light\?"\d+":"(\d+)"\]/g, 'asActive'),
    pipe: stepOf(SEM.dark.bg['action-secondary'].pressed) },
  { label: 'light action-secondary.pressed', mirror: grab(/asActive:NEU\[light\?"(\d+)":"\d+"\]/g, 'asActive-light'),
    pipe: stepOf(SEM.light.bg['action-secondary'].pressed) },
];

for (const c of cases) {
  if (c.mirror == null) continue;
  if (String(c.mirror) !== String(c.pipe)) fail.push(`[${c.label}] 미러 ${c.mirror} ≠ 파이프라인 ${c.pipe}`);
  else ok.push(`${c.label} = ${c.pipe}`);
}

if (fail.length) {
  console.error('check-mirror DRIFT — 컨피규레이터와 파이프라인이 다른 값을 고르고 있습니다:');
  fail.forEach(f => console.error('  ✗ ' + f));
  console.error('\n한쪽만 고치면 화면과 산출물이 갈라집니다. 두 곳을 함께 고치세요:');
  console.error('  파이프라인 scripts/gen-semantic.cjs · 미러 public/index.html 의 roles()');
  process.exit(1);
}
console.log(`check-mirror OK · 값 결정 ${ok.length}건 일치 (${ok.join(' · ')})`);

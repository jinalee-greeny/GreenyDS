#!/usr/bin/env node
/*
 * figma-rename-map.cjs — 구(pre-KDX) → 신(KDX) Figma 변수 이름 대조표 생성 (결정 #40 Phase ④)
 *
 * 무엇: 임의 시점의 tokens/ 디렉터리(구 구조)를 읽어, 현행 KDX 정렬 산출과 짝지어
 *       "Figma 에서 이 변수를 저 이름으로 바꾼다"는 대조표를 만든다.
 * 왜:   Figma 변수는 이름을 바꿔도 id 가 유지되므로 바인딩이 살아남는다 — 즉 삭제·재생성이 아니라
 *       리네임으로 옮기는 것이 옳다. 그러려면 무엇을 무엇으로 바꾸는지 기계가 만든 표가 있어야 한다
 *       (결정 #28 실행 조건 ② `rename-map.json` 산출).
 * 사용: node scripts/figma-rename-map.cjs <구-tokens-를-담은-디렉터리> [출력경로]
 *       예) git archive 6e9ba50 tokens | tar -x -C /tmp/old && node scripts/figma-rename-map.cjs /tmp/old
 *
 * 짝짓기 방식(우선순위):
 *   ① 값 일치 — 구 px 값과 신 사다리 칸 px 값이 같으면 그 칸으로 옮긴다(사다리 통합의 대부분).
 *   ② 규칙 — 값이 바뀐 3건(9999px→999px · 50%→999px)과 어휘 교체(§2 표)는 명시 규칙.
 *   ③ 동일 경로 — 위 둘에 해당 없고 이름이 그대로면 변경 없음으로 기록.
 *   어디에도 안 걸리면 `unmatched` 에 남긴다 — 조용히 버리지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { build } = require('./gen-figma-vars.cjs');

const oldDir = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, '..', 'docs', 'figma-rename-map.json');
if (!oldDir || !fs.existsSync(path.join(oldDir, 'tokens'))) {
  console.error('사용: node scripts/figma-rename-map.cjs <구-tokens-를-담은-디렉터리>');
  process.exit(2);
}
const rd = (p) => JSON.parse(fs.readFileSync(path.join(oldDir, 'tokens', p), 'utf8'));
const ks = (o) => Object.keys(o).filter((k) => !k.startsWith('$'));
const pxOf = (v) => { const s = String(v); return /px$/.test(s) ? parseFloat(s) : /rem$/.test(s) ? parseFloat(s) * 16 : null; };

/* ── 신 이름 색인 ─────────────────────────────────────────────────────────── */
const { payload } = build();
const NEW = {};
payload.collections.forEach((c) => c.variables.forEach((v) => { NEW[c.name + '::' + v.name] = v; }));
const ladderByPx = {};
payload.collections[0].variables.filter((v) => v.name.startsWith('dimension/step/')).forEach((v) => { ladderByPx[v.value] = v.name; });

const rows = [], unmatched = [], seenRow = new Set();
// rem·px 두 가지가 같은 Figma 이름으로 접히므로(단위는 이름 축이 아님 — 결정 #28 ④-1) 중복 행은 한 줄로 둔다.
const add = (collection, oldName, newName, why) => {
  const k = collection + '::' + oldName + '::' + newName;
  if (seenRow.has(k)) return; seenRow.add(k);
  rows.push({ collection, old: oldName, new: newName, changed: oldName !== newName, why });
};

/* ── ① Primitive ──────────────────────────────────────────────────────────── */
const P = rd('tokens.primitive.json');
// 색·타이포·elevation 은 Phase ② 에서 이름이 바뀌지 않았다(패밀리 그룹 typo 로만 접힘)
ks(P.color).forEach((ramp) => {
  const seg = ramp.includes('-') ? ramp.split('-').map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join('') : ramp;
  if (ramp === 'alpha') { ks(P.color.alpha).forEach((k) => ks(P.color.alpha[k]).forEach((a) => add('Primitive', `color/alpha/${k}/${a}`, `color/alpha/${k}/${a}`, '변경 없음'))); return; }
  ks(P.color[ramp]).forEach((step) => add('Primitive', `color/${seg}/${step}`, `color/${seg}/${step}`, '변경 없음'));
});
// spacing → dimension 사다리 (값 일치)
['rem', 'px'].forEach((unit) => ks(P.spacing[unit]).forEach((k) => {
  const v = pxOf(P.spacing[unit][k].$value), target = ladderByPx[v];
  const oldName = `spatial/space/${k.replace(/^space-/, '')}`;
  if (target) add('Primitive', oldName + (unit === 'rem' ? '' : ''), target, `값 ${v}px 일치 — 사다리 통합(§4). rem·px 두 가지가 한 칸으로 접힌다`);
  else unmatched.push({ what: `spacing.${unit}.${k}`, px: v });
}));
// radius → dimension 사다리 / 센티널
ks(P.radius.px).forEach((k) => {
  const v = pxOf(P.radius.px[k].$value), target = ladderByPx[v];
  const oldName = `visual/radius/${k.replace(/^radius-/, '')}`;
  if (target) add('Primitive', oldName, target, `값 ${v}px 일치 — 사다리 통합(§4)`);
  else unmatched.push({ what: `radius.px.${k}`, px: v });
});
add('Primitive', 'visual/radius/full', 'dimension/special/full', '9999px → 999px (결정 #40 — Figma 호환 센티널)');
add('Primitive', 'visual/radius/circle', 'dimension/special/full', '50% → 999px 리타깃 (Q-014 실행 — 50% 폐지)');
// border-width → 사다리 / hairline
try {
  const B = rd('tokens.border-width.json'); const bw = B['border-width'] || B;
  ks(bw).forEach((k) => {
    const v = pxOf(bw[k].$value);
    const target = v === 1 ? 'dimension/special/hairline' : ladderByPx[v];
    const oldName = `visual/borderWidth/${k.replace(/^border-width-/, '')}`;
    if (target) add('Primitive', oldName, target, v === 1 ? '1px → special.hairline (센티널)' : `값 ${v}px 일치 — 사다리 통합(§2)`);
    else unmatched.push({ what: `border-width.${k}`, px: v });
  });
} catch (e) { /* 이미 폐지된 시점 */ }
// typography: 이름 축은 그대로, 패밀리 그룹만 typography→typo
['font-size', 'line-height', 'letter-spacing', 'font-weight', 'font-family'].forEach((g) => {
  if (!P.typography[g]) return;
  add('Primitive', `typography/${g}/…`, `typo/${g === 'font-size' ? 'font/size' : g === 'font-weight' ? 'font/weight' : g === 'font-family' ? 'font/family' : g === 'line-height' ? 'lineHeight' : 'letterSpacing'}/…`, '패밀리 그룹 typography→typo · 복합어 세칙(§4.2c) 적용');
});

/* ── ② Semantic (§2 어휘 교체) ────────────────────────────────────────────── */
const S = rd('tokens.semantic.json');
const VOCAB = {
  'stroke': 'bdr', 'focus': 'focused', 'active': 'pressed', 'danger': 'error',
  'subtle→tertiary(fg만)': null, 'inset': 'padding', 'stack': 'gap/y', 'inline': 'gap/x', 'section-gap': 'gap/section'
};
['bg', 'fg', 'stroke'].forEach((cat) => {
  const node = S.semantic.color.light[cat]; if (!node) return;
  const newCat = cat === 'stroke' ? 'bdr' : cat;
  ks(node).forEach((role) => {
    let nr = role;
    if (cat === 'fg' && role === 'subtle') nr = 'tertiary';
    if (role === 'danger') nr = 'error';
    if (role === 'danger-subtle') nr = 'error-subtle';
    if (cat === 'stroke' && role === 'focus') nr = 'focused';
    const camel = (s) => s.split('-').map((w, i) => i ? w[0].toUpperCase() + w.slice(1) : w).join('');
    const isActionGroup = /^action-/.test(role);
    const oldFig = `color/${cat}/${isActionGroup ? 'action/' + camel(role.replace('action-', '')) : camel(role)}`;
    const newFig = `color/${newCat}/${/^action-/.test(nr) ? 'action/' + camel(nr.replace('action-', '')) : camel(nr)}`;
    add('Semantic', oldFig, newFig, role === nr && cat === newCat ? '변경 없음' : `어휘 교체(§2): ${cat}.${role} → ${newCat}.${nr}`);
    // 상태 하위(default/hover/active) 가 있는 역할
    if (node[role] && typeof node[role] === 'object' && !node[role].$value) {
      ks(node[role]).forEach((st) => {
        const ns = st === 'active' ? 'pressed' : st === 'focus' ? 'focused' : st;
        add('Semantic', `${oldFig}/${st}`, `${newFig}/${ns}`, st === ns ? '변경 없음' : `상태 어휘 교체(§2): ${st} → ${ns}`);
      });
    }
  });
});
[['inset', 'padding'], ['stack', 'gap/y'], ['inline', 'gap/x'], ['section-gap', 'gap/section']].forEach(([o, n]) => {
  const node = S.semantic.spacing[o]; if (!node) return;
  ks(node).forEach((k) => add('Semantic', `spatial/${o === 'section-gap' ? 'sectionGap' : o}/${k}`, `spatial/${n}/${k}`, `여백 어휘 교체(§2): ${o} → ${n.replace('/', '.')}`));
});
ks(S.semantic.radius).forEach((k) => add('Semantic', `visual/radius/${k}`, `visual/radius/${k}`, '변경 없음 — 역할명 유지, 참조 대상만 사다리로 리타깃'));

/* ── 출력 ─────────────────────────────────────────────────────────────────── */
const changed = rows.filter((r) => r.changed);
/* 병합 검출 — 사다리 통합은 "리네임"이 아니라 "병합"이다.
 * space/2 와 radius/2 가 둘 다 step/3 으로 가면 Figma 에서 한 변수만 그 이름을 가질 수 있다.
 * 나머지는 바인딩을 살아남은 변수로 옮긴 뒤 삭제해야 한다 — 이걸 표에 안 적으면 손으로 하다 반드시 빠뜨린다. */
const byNew = {};
changed.forEach((r) => { (byNew[r.collection + '::' + r.new] = byNew[r.collection + '::' + r.new] || []).push(r.old); });
const merges = Object.entries(byNew).filter(([, olds]) => olds.length > 1)
  .map(([k, olds]) => ({ target: k.split('::')[1], collection: k.split('::')[0], sources: olds, keep: olds[0], retargetThenDelete: olds.slice(1) }));
const doc = {
  $generatedBy: 'scripts/figma-rename-map.cjs',
  $why: 'KDX 표준 정렬 Phase ④ — Figma 변수를 삭제·재생성이 아니라 리네임으로 옮기기 위한 대조표(결정 #28 실행 조건 ②).',
  source: { oldTokensFrom: oldDir },
  counts: { total: rows.length, changed: changed.length, unchanged: rows.length - changed.length, unmatched: unmatched.length, merges: merges.length },
  merges, rows, unmatched
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(JSON.stringify(doc.counts, null, 2));
if (unmatched.length) console.log('unmatched:', JSON.stringify(unmatched));
if (merges.length) { console.log('\n병합(리네임 아님 — 대상 1개만 남기고 나머지는 바인딩 이전 후 삭제):'); merges.forEach((m) => console.log(`  ${m.target}  ← ${m.sources.join(' , ')}  (남길 것: ${m.keep})`)); }

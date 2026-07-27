/* ramps.cjs — primitive 색 미러. 하드코딩이 아니라 primitive SSOT를 직접 읽는다
 * (tokens/tokens.primitive.json). gen-semantic·gen-component 공유 — 미러 드리프트 원천 차단. */
const fs = require('node:fs');
const path = require('node:path');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tokens/tokens.primitive.json'), 'utf8'));
const STEPS = ['50','100','200','300','400','500','600','700','800','900','950'];
const out = {};
for (const id of ['brand','cool-gray','warm-gray','red','amber','green','blue']) {
  out[id] = {};
  for (const s of STEPS) out[id][s] = T.color[id][s].$value;
}
module.exports = out;

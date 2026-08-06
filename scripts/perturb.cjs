#!/usr/bin/env node
/**
 * perturb.cjs — A3 최종 게이트: 섭동 매트릭스 (2026-07-21 · Wave 3 반영 2026-07-29)
 * 기준+프리셋 5종을 각각 전체 gen 체인(parameter→primitive→semantic→component)에 통과시키고,
 * 29종 컴포넌트의 774검사가 모든 프리셋에서 ✗0인지 확인한다(6×774=4,644). "값이 아니라 값을 뽑는 엔진"의 증명.
 * 실행: node pipeline/perturb.cjs → build/perturb-matrix.json + 콘솔 리포트
 */
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const PRESETS = require("./presets.cjs");

const rows = [];
for (const p of PRESETS) {
  const dir = `build/presets/${p.id}`;
  fs.mkdirSync(path.join(ROOT, dir, "tokens"), { recursive:true });
  const cfgPath = path.join(ROOT, dir, "cfg.json");
  fs.writeFileSync(cfgPath, JSON.stringify(p));
  const semOut = path.join(ROOT, dir, "tokens/tokens.semantic.json");
  const base = { ...process.env, PRESET: cfgPath };

  let semOk = true, semErr = "";
  try { execFileSync("node", [path.join(ROOT,"scripts/gen-semantic.cjs"), semOut], { env: base, stdio:"pipe" }); }
  catch (e) { semOk = false; semErr = (e.stdout?.toString()||"") + (e.stderr?.toString()||e.message); }

  let compOk = semOk, compErr = "";
  if (semOk) {
    try { execFileSync("node", [path.join(ROOT,"scripts/gen-component.cjs")],
        { env: { ...base, SEM_PATH: semOut, OUT_DIR: dir }, stdio:"pipe" }); }
    catch (e) { compOk = false; compErr = (e.stdout?.toString()||"") + (e.stderr?.toString()||e.message); }
  }

  // 검사 결과 집계
  let total = 0, fails = [], advis = [], sample = {};
  const ckPath = path.join(ROOT, dir, "build/checks.json");
  if (fs.existsSync(ckPath)) {
    const checks = JSON.parse(fs.readFileSync(ckPath));
    // ✗(하드)만 실패로 센다. △(권고)는 gen-component 와 같은 규약으로 따로 집계해 리포트에만 낸다 —
    // 판정 대기 중인 선재 결함이 6프리셋 × 매 런마다 게이트를 빨갛게 만들면, 진짜 회귀가 묻힌다.
    total = checks.length;
    fails = checks.filter(c=>!c.ok && c.sev!=="△");
    advis = checks.filter(c=>!c.ok && c.sev==="△");
    const byId = {}; checks.forEach(c=>{ (byId[c.id]=byId[c.id]||{p:0,f:0})[c.ok?"p":"f"]++; });
    sample.byId = byId;
  }
  const rPath = path.join(ROOT, dir, "build/component.resolved.json");
  if (fs.existsSync(rPath)) {
    const R = JSON.parse(fs.readFileSync(rPath));
    const s = R.semantic.light;
    sample.adapt = {
      "action-primary": s["action-primary"], "fg-primary": s["fg-primary"],
      "surface": s.surface, "fg-placeholder": s["fg-placeholder"],
      "button-h-md": R.light.button.height.md, "switch-knob": R.light.switch.knob.bg
    };
  }
  rows.push({ id:p.id, name:p.name, brand:p.brandFrom, neutral:p.neutral,
    pass: semOk && compOk && fails.length===0, total, failCount: fails.length,
    fails: fails.map(f=>`[${f.id}] ${f.msg}`), advisCount: advis.length,
    advis: advis.map(f=>`[${f.id}] ${f.msg}`), semErr, compErr, sample });
}

fs.writeFileSync(path.join(ROOT,"build/perturb-matrix.json"), JSON.stringify(rows,null,2));

// 리포트
console.log("=== A3 최종 게이트 — 섭동 매트릭스 ===\n");
const allPass = rows.every(r=>r.pass);
for (const r of rows) {
  const mark = r.pass ? "✓" : "✗";
  console.log(`${mark} ${r.id.padEnd(11)} ${r.name}`);
  console.log(`    브랜드=${r.brand} 중립=${r.neutral} · 검사 ${r.total}건 · 실패 ${r.failCount}`);
  if (r.sample.adapt) { const a=r.sample.adapt;
    console.log(`    엔진 적응: action-primary=${a["action-primary"]} · fg.primary=${a["fg-primary"]} · placeholder=${a["fg-placeholder"]} · 버튼높이=${a["button-h-md"]}px · 노브=${a["switch-knob"]}`);
  }
  if (!r.pass) { if(r.semErr) console.log("    semantic 오류:", r.semErr.trim().split("\n").slice(-3).join(" | "));
    r.fails.slice(0,6).forEach(f=>console.log("    ✗", f)); }
  if (r.advisCount) r.advis.slice(0,3).forEach(f=>console.log("    △", f));
  console.log();
}
console.log(allPass
  ? `전 프리셋 통과 ✓ — ${rows.length}런 × 검사 전부 ✗0${rows.reduce((n,r)=>n+r.advisCount,0)?` (△ ${rows.reduce((n,r)=>n+r.advisCount,0)}건은 리포트만 — 판정 대기)`:""}. 엔진이 브랜드·중립·대비 변경에 정합적으로 적응.`
  : `⚠ 일부 프리셋 실패 — 위 ✗ 확인 (결정 #24: 무리한 통과 금지, 원인·수정 보고).`);
process.exit(allPass ? 0 : 1);

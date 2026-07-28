#!/usr/bin/env node
/*
 * apply-config.cjs — 컨피규레이터 export config 하나로 전체 토큰 세트를 재생성한다.
 *
 * 무엇: greenyds.config.json(파라미터) → primitive → semantic → component → css 전 체인을
 *       격리된 출력 디렉터리에 생성. "컨피규레이터 내보내기 = 파이프라인 재생성"의 서버측 정본 경로.
 * 왜:   엔진은 하나(결정 #2). 브라우저 export와 별개로, 같은 config를 넣으면 CI·repo가
 *       동일한 정본 토큰을 재현할 수 있어야 한다(드리프트 0).
 * 사용: node scripts/apply-config.cjs --config <config.json> [--out build/config-out]
 *
 * config 형식:
 *   { "primitive": { ...gen-tokens 파라미터 override (color.ramps[brand].seed, typography.breakpoints, radius.basePx, elevation.tint, ...) },
 *     "semantic":  { "neutral": "cool-gray"|"warm-gray", "targets": { fgSecondary:7, ... }, "darkLadder": {...} },
 *     "meta":      { ...정보... } }
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };

const configArg = argOf('--config');
if (!configArg) { console.error('사용: node scripts/apply-config.cjs --config <config.json> [--out build/config-out]'); process.exit(2); }
const configPath = path.resolve(process.cwd(), configArg);
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const outRel = argOf('--out', 'build/config-out');          // gen-component OUT_DIR은 ROOT 기준 상대경로
const outAbs = path.join(ROOT, outRel);
fs.mkdirSync(path.join(outAbs, 'tokens'), { recursive: true });

const primPath = path.join(outAbs, 'tokens', 'tokens.primitive.json');
const semPath = path.join(outAbs, 'tokens', 'tokens.semantic.json');
const semCfgPath = path.join(outAbs, '_semantic-cfg.json');
fs.writeFileSync(semCfgPath, JSON.stringify(cfg.semantic || {}));

const run = (args, extraEnv) =>
  execFileSync('node', args, { cwd: ROOT, env: { ...process.env, ...extraEnv }, stdio: 'pipe' }).toString();

// 1) primitive (config.primitive override)
run([path.join(ROOT, 'scripts/gen-tokens.cjs'), '--config', configPath, '--out', primPath]);
// 2) semantic (PRESET=config.semantic, 재생성된 primitive를 읽음)
const env = { PRIMITIVE_PATH: primPath, PRESET: semCfgPath };
run([path.join(ROOT, 'scripts/gen-semantic.cjs'), semPath], env);
// 3) component (SEM_PATH·OUT_DIR 격리)
run([path.join(ROOT, 'scripts/gen-component.cjs')], { ...env, SEM_PATH: semPath, OUT_DIR: outRel });
// 4) css + flat
run([path.join(ROOT, 'scripts/build-css.cjs')], { ...env, BUILD_DIR: path.join(outAbs, 'build') });

console.log('apply-config ✓ →', outRel, '(primitive·semantic·component·css)');

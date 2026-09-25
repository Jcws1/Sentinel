// Matched A/B of world-frame decoding: baseline polygon integrity vs current.
// Loads the real src/contracts/decode.ts twice through Vite SSR. The baseline
// variant resolves decode.ts's './integrity' import to a supplied verbatim copy
// of the previous integrity.ts (for example `git show HEAD:frontend/src/...`).
// Each timed iteration is JSON.parse + validateFrame, the REST world decode path.
// Rounds alternate variant order; report per-frame medians and median ratios.
//
//   node tests/performance/decode-integrity.mjs <frames.json> <baseline-integrity.ts> <out.json> [rounds] [iterations]
//
// <frames.json> is `scripts/performance_geometry.py frames` output. Frames
// marked "diagnostic" (101-position zones) are reported but excluded from the
// budget, which covers tracked fixtures only. Run from frontend/ with the
// machine otherwise idle. No network or provider access.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const [framesPath, baselinePath, outPath, roundsArg, iterationsArg] =
  process.argv.slice(2);
if (!framesPath || !baselinePath || !outPath)
  throw Error(
    'Usage: decode-integrity.mjs <frames> <baseline-integrity.ts> <out> [rounds] [iterations]',
  );
const rounds = Number(roundsArg ?? 30);
const iterations = Number(iterationsArg ?? 20);
const frames = JSON.parse(readFileSync(resolve(framesPath), 'utf8'));
const baselineIntegrity = resolve(baselinePath);

async function variant(baseline) {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, fs: { strict: false } },
    plugins: baseline
      ? [
          {
            name: 'baseline-integrity',
            enforce: 'pre',
            resolveId(source, importer) {
              if (source === './integrity' && importer?.endsWith('decode.ts'))
                return baselineIntegrity;
            },
          },
        ]
      : [],
  });
  const decode = await server.ssrLoadModule('/src/contracts/decode.ts');
  const integrity = await server.ssrLoadModule(
    baseline ? baselineIntegrity : '/src/contracts/integrity.ts',
  );
  return { server, decode, integrity };
}

const variants = {
  baseline: await variant(true),
  candidate: await variant(false),
};
try {
  // Both variants must accept every frame before timing anything.
  for (const [name, { decode }] of Object.entries(variants))
    for (const frame of frames) {
      for (let i = 0; i < 5; i++) decode.validateFrame(JSON.parse(frame.text));
      if (!decode.validateFrame(JSON.parse(frame.text)))
        throw Error(`${name} rejected ${frame.name}`);
    }
  const samples = { baseline: [], candidate: [] };
  const micro = { baseline: [], candidate: [] };
  for (let round = 0; round < rounds; round++) {
    const order =
      round % 2 === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const name of order) {
      const { decode, integrity } = variants[name];
      const timings = {},
        integrityTimings = {};
      for (const frame of frames) {
        let started = performance.now();
        for (let i = 0; i < iterations; i++)
          decode.validateFrame(JSON.parse(frame.text));
        timings[frame.name] = (performance.now() - started) / iterations;
        const zones = Object.values(JSON.parse(frame.text).zones);
        started = performance.now();
        for (let i = 0; i < iterations * 10; i++)
          for (const zone of zones)
            integrity.polygonIntegrity(zone.geometry.coordinates);
        integrityTimings[frame.name] =
          (performance.now() - started) / (iterations * 10);
      }
      samples[name].push(timings);
      micro[name].push(integrityTimings);
    }
  }
  const median = (values) => {
    const s = [...values].sort((a, b) => a - b);
    return s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const report = {};
  for (const frame of frames) {
    const base = samples.baseline.map((s) => s[frame.name]);
    const cand = samples.candidate.map((s) => s[frame.name]);
    const microBase = micro.baseline.map((s) => s[frame.name]);
    const microCand = micro.candidate.map((s) => s[frame.name]);
    report[frame.name] = {
      decodeBaselineMedianMs: median(base),
      decodeCandidateMedianMs: median(cand),
      decodeMedianRatio: median(cand.map((c, i) => c / base[i])),
      integrityBaselineMedianMs: median(microBase),
      integrityCandidateMedianMs: median(microCand),
      integrityMedianRatio: median(microCand.map((c, i) => c / microBase[i])),
    };
  }
  const budgeted = frames.filter((frame) => !frame.diagnostic);
  const summary = {
    rounds,
    iterations,
    node: process.version,
    frames: report,
    budgetScope:
      'tracked-fixture frames; diagnostic frames are reported, not budgeted',
    diagnosticFrames: frames
      .filter((frame) => frame.diagnostic)
      .map((frame) => frame.name),
    worstDecodeMedianRatio: Math.max(
      ...budgeted.map((frame) => report[frame.name].decodeMedianRatio),
    ),
    budgetRatio: 1.05,
  };
  summary.withinBudget = summary.worstDecodeMedianRatio <= summary.budgetRatio;
  writeFileSync(
    resolve(outPath),
    JSON.stringify({ summary, samples, micro }, null, 1),
  );
  process.stdout.write(JSON.stringify(summary, null, 1) + '\n');
} finally {
  await Promise.all(
    Object.values(variants).map(({ server }) => server.close()),
  );
}

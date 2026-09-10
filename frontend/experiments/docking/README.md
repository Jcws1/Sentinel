# Phase 0 only — docking comparison

This disposable two-view experiment compares FlexLayout and Golden Layout using the same React/ECharts component. See [decision and evidence](../../../docs/docking-evaluation.md).

The repository root is three levels above this directory. There is no application shell and this package must not become Sentinel's product package by accident. Both libraries are retained only to reproduce the comparison; use the winner alone in a later approved product package.

```powershell
npm.cmd ci
npm.cmd run dev
# Separate terminal in the same directory:
npm.cmd run verify
```

Tests use installed Edge. They write `evidence/results.json` and screenshots. Comparison exits 1 for the documented Golden blocked-popup failure; Flex passes. `npm run build` also type-checks frontend foundation contracts. `node generate-domain.mjs` regenerates TypeScript from the backend-exported draft schema.

For production checks:

```powershell
npm.cmd run build
npm.cmd run preview
# Separate terminal:
$env:SPIKE_URL='http://127.0.0.1:5179'
$env:SPIKE_EVIDENCE='./evidence-production/'
npm.cmd run verify
```

The initial diagnostic script was removed after the reproducible acceptance driver was complete. No external imagery account, mission backend, simulation or real renderer is involved.

# Sentinel position accuracy evaluation

This directory contains an additive, offline evaluation harness. It does not
change Sentinel mission behavior. Candidate positions and independent ground
truth are stored in separate files so truth cannot leak into Anchor input.

## Evidence classes

- `MEASURED`: emitted directly by a physical instrument or estimator.
- `DERIVED`: transformed from measured data, such as ENU-to-WGS84 conversion.
- `MODELLED`: generated, masked, perturbed, or simulated data.

No modelled confidence or uncertainty value may be described as measured
accuracy. Every generated recording must include source dataset, sequence,
coordinate frame, units, timestamp basis, transformations, and licence.

## Initial metric set

- horizontal, vertical, and 3D median/RMSE/p95/p99/maximum error;
- pass rate at 5 m, 10 m, and 25 m;
- reported-uncertainty coverage and overconfidence count;
- unmatched, duplicate, and out-of-order samples.

Run the harness tests with `npm run accuracy:test`.

For the current real-flight evaluation, run:

```powershell
npm run accuracy:mun-frl
npm run accuracy:package
```

The package step creates two deliberately separate folders:

- `evaluation/output/anchor-blind-handoff/` contains only what Anchor should
  receive before returning decisions.
- `evaluation/output/internal-evaluation/` contains the private sidecars,
  degradation timeline, normalized output, and accuracy report.
- `evaluation/output/anchor-scoring-handoff/` contains one complete GNSS cycle,
  its evaluation-only position-health sidecar, and a separate measured PPK
  reference for Anchor's requested non-blind replay scoring.

The current primary result is a temporal holdout: the first 30 seconds are used
to calibrate clock offset and vertical datum, and only later samples are scored.
It is not a substitute for an independently collected hardware-validation run.

Downloaded datasets belong under `evaluation/data/` and generated artifacts
under `evaluation/output/`; both are intentionally ignored by Git.

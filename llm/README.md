# Sentinel local model runtime

This directory describes the local inference process used by Sentinel's
assistant. Runtime binaries and GGUF files are deliberately excluded from Git.

## Reference computer

The floor profile is based on the 2025 ASUS Zenbook 14 OLED UX3405CA:

- Intel Core Ultra 5 225H (4 performance, 8 efficient, and 2 low-power cores;
  14 threads total);
- 16 GB LPDDR5X memory;
- integrated Intel Arc 130T graphics;
- 512 GB NVMe storage;
- Windows 11 24H2.

The MVP baseline is CPU-only. This avoids making Intel GPU driver/backend
support a deployment dependency. Start with four inference threads so the edge
gateway, C2 service, UI, and operating system remain responsive. Benchmark six
and eight threads only after the four-thread baseline passes.

## Model tiers

1. `Qwen3 1.7B Q4_K_M` is the minimum/fallback model.
2. `Qwen3 4B Q4_K_M` is the preferred model if measured memory and latency pass.

Use a reviewed GGUF from an approved source. Record the exact release URL,
license, file name, byte size, and SHA-256 in a local copy of
`model-manifest.example.json`. Sentinel never downloads a model at runtime.

## Provision and run

### Existing Ollama installation (preferred for this workstation)

Sentinel supports Ollama's native loopback API without exposing its model
endpoint to the operator LAN. Configure:

```text
SENTINEL_LLM_PROVIDER=ollama
SENTINEL_LLM_BASE_URL=http://127.0.0.1:11434
SENTINEL_LLM_MODEL=qwen3:1.7b
```

The currently installed `qwen3:8b` can be used for functional testing. It is
not the 16 GB Zenbook floor recommendation because its GGUF alone occupies
about 5.2 GB before context and runtime overhead.

### Standalone llama.cpp alternative

Place `llama-server.exe` under `llm/runtime/` and the selected `.gguf` under
`llm/models/`, or supply absolute paths elsewhere. Verify both files against
the hashes recorded during provisioning:

```powershell
npm run llm:start -- `
  -RuntimePath .\llm\runtime\llama-server.exe `
  -ModelPath .\llm\models\qwen3-1.7b-q4_k_m.gguf `
  -ExpectedRuntimeSha256 <64-hex-sha256> `
  -ExpectedModelSha256 <64-hex-sha256>
```

The launcher binds only to `127.0.0.1:8082`, uses a 4,096-token context, one
parallel request, four CPU threads, and no GPU layers. The model process has no
Sentinel tools. The assistant service separately enforces its read-only C2
boundary.

In a second terminal, run:

```powershell
npm run llm:benchmark
```

The benchmark uses canonical mock C2 context rather than Gazebo truth. It
checks JSON response validity, latency, and whether the model falsely claims
direct simulator/device access or mission execution. Results are written to
`llm/benchmarks/` and are not committed.

Recommended MVP acceptance gates on the reference Zenbook:

- all evaluation turns produce valid structured responses;
- all boundary/adversarial turns pass;
- median complete-turn latency at or below 10 seconds;
- 95th percentile complete-turn latency at or below 20 seconds;
- peak total host memory remains below 85% during a ten-turn soak;
- stopping the model does not interrupt edge ingestion, C2, or the UI.

These are product acceptance targets, not unmeasured performance claims. Record
the tested runtime/model hashes and thread count with every result.

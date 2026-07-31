param(
  [string]$RuntimePath = ".\llm\runtime\llama-server.exe",
  [string]$ModelPath = ".\llm\models\qwen3-1.7b-q4_k_m.gguf",
  [string]$ExpectedRuntimeSha256 = "",
  [string]$ExpectedModelSha256 = "",
  [ValidateRange(1, 32)][int]$Threads = 4,
  [ValidateRange(1024, 8192)][int]$ContextSize = 4096,
  [ValidateRange(1024, 65535)][int]$Port = 8082
)

$ErrorActionPreference = "Stop"

function Resolve-RequiredFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label was not found: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Assert-Sha256([string]$Path, [string]$Expected, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Expected)) {
    Write-Warning "$Label SHA-256 was not supplied. Record and pass the reviewed hash before a demo."
    return
  }
  if ($Expected -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "$Label SHA-256 must contain exactly 64 hexadecimal characters."
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actual -ne $Expected.ToUpperInvariant()) {
    throw "$Label SHA-256 mismatch. Expected $Expected, received $actual."
  }
}

$runtime = Resolve-RequiredFile $RuntimePath "llama-server"
$model = Resolve-RequiredFile $ModelPath "GGUF model"
if ([IO.Path]::GetExtension($model) -ne ".gguf") {
  throw "Model must be a .gguf file."
}

Assert-Sha256 $runtime $ExpectedRuntimeSha256 "Runtime"
Assert-Sha256 $model $ExpectedModelSha256 "Model"

Write-Host "Starting Sentinel local model on loopback port $Port"
Write-Host "CPU-only profile: $Threads threads, $ContextSize context tokens, one request"

& $runtime `
  --model $model `
  --host 127.0.0.1 `
  --port $Port `
  --ctx-size $ContextSize `
  --threads $Threads `
  --threads-batch $Threads `
  --parallel 1 `
  --n-gpu-layers 0

exit $LASTEXITCODE

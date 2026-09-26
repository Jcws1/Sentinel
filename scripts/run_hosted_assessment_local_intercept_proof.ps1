param(
    [string]$ConfirmRecommendationId,
    [string]$MissionId = 'c14980a5-14c8-4a6f-8d56-a185f1e35ece',
    [string]$Origin = 'https://sentinel-observe-orient.vercel.app',
    [string]$BaseUrl = 'https://sentinel-observe-orient-api.onrender.com',
    [string]$ConfirmedBy = 'operator'
)

$ErrorActionPreference = 'Stop'
function FileHash([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$root = Split-Path -Parent $PSScriptRoot
$evidence = Join-Path $root 'test-results/hosted-local-intercept-proof'
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$worldPath = Join-Path $evidence 'world.json'
$requestPath = Join-Path $evidence 'assessment-request.json'
$assessmentPath = Join-Path $evidence 'assessment.json'
$recommendationPath = Join-Path $evidence 'nlp-recommendation.json'
$confirmationPath = Join-Path $evidence 'operator-confirmation.json'
$manifestPath = Join-Path $evidence 'capture-manifest.json'
$tracePath = Join-Path $evidence 'trace.json'
$timingPath = Join-Path $evidence 'hosted-timing.json'
$headers = @{ Origin = $Origin }
$confirming = -not [string]::IsNullOrWhiteSpace($ConfirmRecommendationId)

if (-not $confirming) {
    # Preparation always captures fresh hosted evidence. Confirmation is a
    # separate invocation over the exact hash-bound recommendation shown here.
    @($worldPath, $requestPath, $assessmentPath, $recommendationPath,
      $confirmationPath, $manifestPath, $tracePath, $timingPath) |
        ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue }
    $captureStarted = (Get-Date).ToUniversalTime().ToString('o')
    $worldResponse = Invoke-WebRequest "$BaseUrl/api/missions/$MissionId/world" `
        -Headers $headers -TimeoutSec 30
    if ($worldResponse.Headers['Access-Control-Allow-Origin'] -ne $Origin) {
        throw 'Hosted world API did not return the required allowed Origin.'
    }
    $worldResponse.Content | Set-Content $worldPath -Encoding utf8
    $world = Get-Content $worldPath -Raw | ConvertFrom-Json
    $operationalHostiles = @($world.entities.PSObject.Properties |
        Where-Object { $_.Value.affiliation -eq 'hostile' -and $_.Value.condition -eq 'operational' -and $_.Value.presence -eq 'present' })
    if (-not $operationalHostiles) {
        throw 'No operational hostile entity exists in the freshly captured frame.'
    }

    $question = "For a local simulator training replay, choose one operational hostile track and recommend RESPOND interception or MONITOR. If RESPOND, begin ONE orientation finding exactly 'Recommendation: RESPOND' and cite both canonical IDs for that same target in that finding: entity ID and track ID ending :control. Otherwise begin it 'Recommendation: MONITOR'. State source-age uncertainty. Do not claim authority, dispatch, or real-world outcome."
    $requestObject = @{ frameId = $world.frameId; question = $question }
    $requestObject | ConvertTo-Json | Set-Content $requestPath -Encoding utf8
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest "$BaseUrl/api/missions/$MissionId/observe-orient" `
        -Method Post -Headers $headers -ContentType 'application/json' `
        -Body ($requestObject | ConvertTo-Json -Compress) -TimeoutSec 45
    $timer.Stop()
    if ($response.Headers['Access-Control-Allow-Origin'] -ne $Origin) {
        throw 'Hosted assessment API did not return the required allowed Origin.'
    }
    $response.Content | Set-Content $assessmentPath -Encoding utf8
    @{ clientElapsedMs = $timer.ElapsedMilliseconds; httpStatus = $response.StatusCode; origin = $Origin } |
        ConvertTo-Json | Set-Content $timingPath -Encoding utf8
    $assessment = Get-Content $assessmentPath -Raw | ConvertFrom-Json

    $match = $null
    foreach ($hostile in $operationalHostiles) {
        $tracks = @($world.tracks.PSObject.Properties |
            Where-Object { $_.Value.entityId -eq $hostile.Name -and $_.Value.state -eq 'tracking' })
        foreach ($track in $tracks) {
            $finding = @($assessment.orientation) | Where-Object {
                $_.statement -match '^Recommendation:\s*RESPOND\b' -and
                $_.statement -notmatch '(?i)\b(?:do not|not|avoid|decline)\s+(?:RESPOND|intercept)' -and
                @($_.evidenceIds) -contains $hostile.Name -and
                @($_.evidenceIds) -contains $track.Name
            } | Select-Object -First 1
            if ($finding) {
                $match = @{ hostile = $hostile; track = $track; finding = $finding }
                break
            }
        }
        if ($match) { break }
    }
    if (-not $match) {
        throw 'Hosted NLP did not produce an affirmative RESPOND finding structurally bound to one operational hostile entity and track; proof fails closed.'
    }
    $hostile = $match.hostile
    $track = $match.track
    $recommendationId = "nlp-recommendation:$($world.frameId):$($track.Name)"
    @{
        schemaVersion = '1.0'; recommendationId = $recommendationId
        source = 'hosted-observe-orient-nlp'; model = $assessment.model
        missionId = $MissionId; frameId = $world.frameId; sequence = $world.sequence
        code = 'RESPOND'; targetEntityId = $hostile.Name; targetTrackId = $track.Name
        statement = $match.finding.statement; evidenceIds = @($match.finding.evidenceIds)
        executable = $false
    } | ConvertTo-Json -Depth 10 | Set-Content $recommendationPath -Encoding utf8
    @{
        schemaVersion = '1.0'; captureStartedAt = $captureStarted
        captureCompletedAt = (Get-Date).ToUniversalTime().ToString('o')
        baseUrl = $BaseUrl; origin = $Origin; missionId = $MissionId
        worldEndpoint = "$BaseUrl/api/missions/$MissionId/world"
        assessmentEndpoint = "$BaseUrl/api/missions/$MissionId/observe-orient"
        frameId = $world.frameId; recommendationId = $recommendationId
        hashes = @{
            worldSha256 = FileHash $worldPath; requestSha256 = FileHash $requestPath
            assessmentSha256 = FileHash $assessmentPath
            recommendationSha256 = FileHash $recommendationPath
        }
    } | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding utf8

    $timing = Get-Content $timingPath -Raw | ConvertFrom-Json
    [pscustomobject]@{
        prepared = $true; recommendationId = $recommendationId
        action = 'RESPOND'; target = $hostile.Value.label
        targetEntityId = $hostile.Name; targetTrackId = $track.Name
        statement = $match.finding.statement; model = $assessment.model
        providerLatencyMs = $assessment.latencyMs; clientElapsedMs = $timing.clientElapsedMs
        confirmationCommand = ".\scripts\run_hosted_assessment_local_intercept_proof.ps1 -ConfirmRecommendationId '$recommendationId' -ConfirmedBy '<operator>'"
    } | Format-List
    exit 0
}

# Confirmation phase: do not fetch or regenerate. Verify the prepared evidence
# before accepting the operator's exact recommendation ID.
foreach ($path in @($worldPath, $requestPath, $assessmentPath, $recommendationPath, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Prepared evidence is missing: $path" }
}
$world = Get-Content $worldPath -Raw | ConvertFrom-Json
$assessment = Get-Content $assessmentPath -Raw | ConvertFrom-Json
$recommendation = Get-Content $recommendationPath -Raw | ConvertFrom-Json
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($ConfirmRecommendationId -cne $recommendation.recommendationId -or
    $ConfirmRecommendationId -cne $manifest.recommendationId) {
    throw 'Confirmation does not name the exact prepared recommendation ID.'
}
$hashChecks = @{
    worldSha256 = FileHash $worldPath; requestSha256 = FileHash $requestPath
    assessmentSha256 = FileHash $assessmentPath
    recommendationSha256 = FileHash $recommendationPath
}
foreach ($name in $hashChecks.Keys) {
    if ($hashChecks[$name] -cne $manifest.hashes.$name) {
        throw "Prepared evidence hash mismatch: $name"
    }
}
@{
    schemaVersion = '1.0'; confirmationId = "operator-confirmation:$ConfirmRecommendationId"
    recommendationId = $ConfirmRecommendationId; confirmed = $true; confirmedBy = $ConfirmedBy
    confirmedAt = (Get-Date).ToUniversalTime().ToString('o')
    missionId = $recommendation.missionId; frameId = $recommendation.frameId
    targetEntityId = $recommendation.targetEntityId; targetTrackId = $recommendation.targetTrackId
    interceptorId = 'local-interceptor-proof-1'
    scope = 'one LocalSimulatorAdapter interception replay only; no external provider dispatch'
} | ConvertTo-Json | Set-Content $confirmationPath -Encoding utf8
$manifest.hashes | Add-Member -NotePropertyName confirmationSha256 -NotePropertyValue (FileHash $confirmationPath) -Force
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding utf8

$env:SENTINEL_PROOF_WORLD = $worldPath
$env:SENTINEL_PROOF_REQUEST = $requestPath
$env:SENTINEL_PROOF_ASSESSMENT = $assessmentPath
$env:SENTINEL_PROOF_RECOMMENDATION = $recommendationPath
$env:SENTINEL_PROOF_CONFIRMATION = $confirmationPath
$env:SENTINEL_PROOF_MANIFEST = $manifestPath
$env:SENTINEL_PROOF_TRACE = $tracePath
try {
    cargo test --manifest-path (Join-Path $root 'interceptor-providers/Cargo.toml') `
        --test hosted_assessment_local_intercept `
        grounded_nlp_recommendation_confirmed_command_reaches_simulated_contact -- --ignored --exact --nocapture
    if ($LASTEXITCODE -ne 0) { throw "cargo test failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item Env:SENTINEL_PROOF_WORLD, Env:SENTINEL_PROOF_REQUEST, `
        Env:SENTINEL_PROOF_ASSESSMENT, Env:SENTINEL_PROOF_RECOMMENDATION, `
        Env:SENTINEL_PROOF_CONFIRMATION, Env:SENTINEL_PROOF_MANIFEST, `
        Env:SENTINEL_PROOF_TRACE -ErrorAction SilentlyContinue
}
$timing = Get-Content $timingPath -Raw | ConvertFrom-Json
[pscustomobject]@{
    trace = $tracePath; recommendationId = $ConfirmRecommendationId
    model = $assessment.model; providerLatencyMs = $assessment.latencyMs
    clientElapsedMs = $timing.clientElapsedMs
    outcomeAuthority = 'LocalSimulatorAdapter contact policy'; wedgetailOutcomeClaimed = $false
} | Format-List

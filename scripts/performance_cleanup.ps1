# Remove only this pass's verified disposable files, after all owned services exit.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$evidence = Join-Path $taskRoot 'docs/performance-stability'
$baseline = Get-Content -LiteralPath (Join-Path $evidence 'existing-database-inventory.json') -Raw | ConvertFrom-Json
$originalNames = @{}
foreach ($entry in $baseline.PSObject.Properties) { $originalNames[$entry.Name.Replace('/', '\')] = $true }
function Assert-TaskPath([string]$path) {
    $absolute = [IO.Path]::GetFullPath($path)
    if (-not $absolute.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Outside workspace: $absolute" }
    if ($absolute.StartsWith((Join-Path $taskRoot '.cache/performance-stability/baseline-source'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Preserved source snapshot is not disposable' }
    return $absolute
}
function Audit-Originals {
    $issues = @()
    foreach ($entry in $baseline.PSObject.Properties) {
        $path = Assert-TaskPath (Join-Path $taskRoot $entry.Name)
        if (-not (Test-Path -LiteralPath $path)) { $issues += @{ path = $entry.Name; issue = 'missing' }; continue }
        $item = Get-Item -LiteralPath $path
        $nanos = [decimal]($item.LastWriteTimeUtc.Ticks - [datetime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc).Ticks) * 100
        if ($item.Length -ne $entry.Value.bytes -or $nanos -ne [decimal]$entry.Value.mtime_ns) { $issues += @{ path = $entry.Name; issue = 'metadata changed' } }
    }
    return $issues
}
$ports = @()
foreach ($file in Get-ChildItem -LiteralPath $evidence -Recurse -Filter preflight.json -File) {
    $run = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    foreach ($url in @($run.frontend, $run.apiTarget)) { if ($url) { $ports += ([uri]$url).Port } }
}
$ports = @($ports | Sort-Object -Unique)
$listeners = @()
foreach ($line in (& netstat -ano -p tcp)) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Count -ge 5 -and $parts[3] -eq 'LISTENING') {
        $port = [int](($parts[1] -split ':')[-1])
        if ($ports -contains $port) { $listeners += @{ port = $port; pid = [int]$parts[4] } }
    }
}
if ($listeners.Count) { throw 'A recorded test port is still listening; preserve processes and stop before cleanup' }
$before = @(Audit-Originals)
if ($before.Count) { throw 'Original database metadata differs from the baseline; stop and inspect before deleting task artifacts' }
$ended = @()
$deleted = @()
$python = Join-Path $taskRoot 'backend/.venv/Scripts/python.exe'
$helper = Join-Path $taskRoot 'docs/d6/cleanup_runtime.py'
$cache = Join-Path $taskRoot 'frontend/.cache'
$databases = @(Get-ChildItem -LiteralPath $cache -File -Filter 'd6-perf-*.sqlite3' | Where-Object {
    -not $originalNames.ContainsKey($_.FullName.Substring($taskRoot.Length + 1))
})
foreach ($database in $databases) {
    $path = Assert-TaskPath $database.FullName
    $result = & $python $helper $path
    if ($LASTEXITCODE -ne 0) { throw "Offline task-demo finalization failed: $path" }
    $ended += ($result | ConvertFrom-Json)
    foreach ($suffix in @('', '-wal', '-shm', '-journal')) {
        $target = Assert-TaskPath ($path + $suffix)
        if (Test-Path -LiteralPath $target) {
            $item = Get-Item -LiteralPath $target
            $deleted += @{ path = $target; bytes = $item.Length; kind = 'task database' }
            Remove-Item -LiteralPath $target -Force
        }
    }
}
# The task-only alias is a junction. Remove the link without recursion first.
$alias = Assert-TaskPath (Join-Path $taskRoot '.cache/performance-playwright-browsers')
if (Test-Path -LiteralPath $alias) {
    $item = Get-Item -LiteralPath $alias
    if ($item.LinkType -ne 'Junction') { throw 'Unexpected encoder alias type; preserving it' }
    foreach ($target in $item.Target) { $null = Assert-TaskPath $target }
    Remove-Item -LiteralPath $alias -Force
    $deleted += @{ path = $alias; bytes = 0; kind = 'task junction only' }
}
$disposable = @(
    'frontend/dist-performance-before', 'frontend/dist-performance-before-configured',
    'frontend/dist-performance-after', 'frontend/dist-performance-after-configured', 'frontend/dist-performance-production',
    'frontend/.cache/performance-browser-tests', 'frontend/.cache/performance-playwright-browsers',
    'frontend/.cache/performance-zoom-extension', 'frontend/.cache/performance-zoom-profile-38212',
    'frontend/.cache/performance-playwright.config.mjs', 'frontend/.cache/performance-preview.mjs',
    '.cache/performance-final-pytest', '.cache/critic-r2-pytest-valid'
)
foreach ($relative in $disposable) {
    $path = Assert-TaskPath (Join-Path $taskRoot $relative)
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $item = Get-Item -LiteralPath $path
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected linked disposable: $path" }
    $bytes = if ($item.PSIsContainer) { (Get-ChildItem -LiteralPath $path -Recurse -File | Measure-Object Length -Sum).Sum } else { $item.Length }
    $deleted += @{ path = $path; bytes = $bytes; kind = 'task build or test artifact' }
    Remove-Item -LiteralPath $path -Recurse -Force
}
$after = @(Audit-Originals)
$report = [ordered]@{
    recordedPorts = $ports; listeners = $listeners; servicesStopped = $true
    originalDatabaseArtifacts = $originalNames.Count; beforeIssues = $before; afterIssues = $after
    taskDemoFinalizations = $ended; deleted = $deleted
    retained = @('docs/performance-stability evidence', '.cache/performance-stability/baseline-source', 'all preexisting data and unrelated artifacts')
}
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidence 'final-cleanup.json') -Encoding utf8
Write-Output "Removed $($deleted.Count) owned targets; original database artifacts $($originalNames.Count), metadata differences $($after.Count); no test ports listening."

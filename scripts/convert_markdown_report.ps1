param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [string]$Title = 'Sentinel Multisource Fusion Research'
)

$ErrorActionPreference = 'Stop'

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$markdown = Get-Content -LiteralPath $resolvedInput -Raw
$body = (ConvertFrom-Markdown -InputObject $markdown).Html
$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm zzz')

$html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>$Title</title>
  <style>
    :root { color-scheme: light dark; --bg: #f4f7fb; --paper: #fff; --text: #172033; --muted: #5e687a; --line: #d8dfeb; --accent: #006f8b; --code: #eef3f8; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0e1420; --paper: #151d2a; --text: #e8edf5; --muted: #a8b2c2; --line: #344052; --accent: #65d7f2; --code: #0d1521; } }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.65 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(1120px, calc(100% - 32px)); margin: 32px auto; padding: clamp(24px, 5vw, 64px); background: var(--paper); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 16px 50px rgba(0,0,0,.08); }
    h1, h2, h3 { line-height: 1.2; letter-spacing: -.02em; }
    h1 { margin-top: 0; font-size: clamp(2rem, 5vw, 3.25rem); }
    h2 { margin-top: 2.5em; padding-bottom: .35em; border-bottom: 1px solid var(--line); }
    h3 { margin-top: 2em; }
    a { color: var(--accent); text-underline-offset: 3px; }
    table { width: 100%; margin: 1.25rem 0; border-collapse: collapse; font-size: .91rem; }
    th, td { padding: .7rem .75rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: color-mix(in srgb, var(--accent) 10%, var(--paper)); }
    tr:nth-child(even) td { background: color-mix(in srgb, var(--text) 3%, var(--paper)); }
    pre { overflow-x: auto; padding: 1rem; background: var(--code); border: 1px solid var(--line); border-radius: 9px; }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }
    :not(pre) > code { padding: .12em .35em; background: var(--code); border-radius: 4px; }
    blockquote { margin-left: 0; padding-left: 1rem; border-left: 4px solid var(--accent); color: var(--muted); }
    .meta { margin-bottom: 2rem; color: var(--muted); font-size: .88rem; }
    @media (max-width: 760px) { main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 20px; } table { display: block; overflow-x: auto; white-space: nowrap; } }
    @media print { body { background: #fff; color: #111; } main { width: 100%; margin: 0; padding: 0; border: 0; box-shadow: none; } a { color: #005b70; } h2 { break-after: avoid; } table, pre { break-inside: avoid; } }
  </style>
</head>
<body>
  <main>
    <div class="meta">Generated from the Sentinel research report on $generatedAt.</div>
$body
  </main>
</body>
</html>
"@

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Set-Content -LiteralPath $OutputPath -Value $html -Encoding utf8


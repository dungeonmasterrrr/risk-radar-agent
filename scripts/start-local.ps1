param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$runtimeNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeNode 'node.exe'))) { throw 'Please install Node.js 24 or newer.' }
    $env:PATH = $runtimeNode + ';' + $env:PATH
}
$localBin = Join-Path (Get-Location) '.sites-runtime/bin'
if (Test-Path -LiteralPath $localBin) { $env:PATH = $localBin + ';' + $env:PATH }
$env:PORT = [string]$Port
node scripts/dev-all.mjs

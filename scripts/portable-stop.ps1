$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $root 'runtime-state.json'

if (-not (Test-Path -LiteralPath $statePath)) {
  exit 0
}

try {
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $state.pid -Force
  }
  Remove-Item -LiteralPath $statePath -Force
} catch {
  exit 1
}

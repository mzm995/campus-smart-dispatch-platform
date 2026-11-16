$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = Join-Path $root 'runtime\node.exe'
$statePath = Join-Path $root 'runtime-state.json'
$stdoutLog = Join-Path $root 'runtime-server.log'
$stderrLog = Join-Path $root 'runtime-server-error.log'

Add-Type -AssemblyName System.Windows.Forms

function Show-Error([string]$message) {
  [System.Windows.Forms.MessageBox]::Show(
    $message,
    'Campus Smart Dispatch Platform Start Error',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Test-App([int]$port) {
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

function Get-FreePort {
  foreach ($port in 3001..3099) {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $port
      )
      $listener.Start()
      $listener.Stop()
      return $port
    } catch {
      if ($listener) { $listener.Stop() }
    }
  }
  throw 'No available local port was found in the range 3001-3099.'
}

$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap-node.ps1'
$bootstrapLog = Join-Path $root 'runtime-bootstrap.log'
try {
  & $bootstrapScript -Purpose portable -LogPath $bootstrapLog
  if (-not (Test-Path -LiteralPath $node)) {
    throw "Node.js bootstrap finished without creating $node"
  }
} catch {
  Show-Error "Node.js runtime preparation failed.`n`n$($_.Exception.Message)`n`nSee: $bootstrapLog"
  exit 1
}

if (Test-Path -LiteralPath $statePath) {
  try {
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.pid -and $state.port -and (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) {
      if (Test-App ([int]$state.port)) {
        Start-Process "http://127.0.0.1:$($state.port)/"
        exit 0
      }
    }
    Remove-Item -LiteralPath $statePath -Force
  } catch {
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  }
}

try {
  $port = Get-FreePort
  $env:PORT = [string]$port
  $env:HOST = '127.0.0.1'
  $env:DATABASE_PATH = Join-Path $root 'server\data\campus-smart-dispatch-platform.sqlite'
  $env:SECRETS_PATH = Join-Path $root 'server\data\.secrets-key'
  $env:NODE_NO_WARNINGS = '1'

  $process = Start-Process `
    -FilePath $node `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

  $ready = $false
  foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 400
    if (Test-App $port) {
      $ready = $true
      break
    }
    if ($process.HasExited) { break }
  }

  if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $errorText = if (Test-Path -LiteralPath $stderrLog) {
      Get-Content -LiteralPath $stderrLog -Raw -Encoding UTF8
    } else {
      'No error log was generated.'
    }
    Show-Error "The local service did not start.`n`n$errorText"
    exit 1
  }

  @{
    pid = $process.Id
    port = $port
    startedAt = (Get-Date).ToString('o')
    node = $node
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

  Start-Process "http://127.0.0.1:$port/"
} catch {
  Show-Error $_.Exception.Message
  exit 1
}

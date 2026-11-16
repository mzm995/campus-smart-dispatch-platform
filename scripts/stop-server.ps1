$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targets = @(
  @{ Port = 5173; Pattern = 'vite[\\/]bin[\\/]vite\.js' },
  @{ Port = 3001; Pattern = '(^|\s)(?:.*[\\/])?server[\\/]index\.js($|\s)' }
)
$stopped = 0
$blocked = 0

function Get-ListeningProcessIds([int]$port) {
  $ids = @(
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  if ($ids.Count -gt 0) { return $ids }

  $result = @()
  foreach ($line in (netstat -ano -p tcp)) {
    if ($line -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
      $result += [int]$Matches[1]
    }
  }
  return $result | Select-Object -Unique
}

$markerPath = Join-Path $projectRoot '.tmp\dev-processes.json'
if (Test-Path -LiteralPath $markerPath) {
  try {
    $state = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $sameProject = [string]$state.projectId -eq 'campus-smart-dispatch-platform'
    if ($sameProject) {
      $listeningIds = @(
        foreach ($target in $targets) {
          Get-ListeningProcessIds $target.Port
        }
      ) | Select-Object -Unique
      $markedIds = @($state.processes | ForEach-Object { [int]$_.pid })
      $ownedIds = @($listeningIds | Where-Object { $markedIds -contains $_ })
      if ($ownedIds.Count -gt 0) {
        foreach ($ownedProcessId in $ownedIds) {
          Stop-Process -Id $ownedProcessId -Force
          Write-Host "[OK] Campus Smart Dispatch Platform process stopped (PID $ownedProcessId)."
        }
        Remove-Item -LiteralPath $markerPath -Force
        exit 0
      }
    }
    Remove-Item -LiteralPath $markerPath -Force
  } catch {
    Write-Host "[WARN] Could not use the development process marker: $($_.Exception.Message)"
  }
}

foreach ($target in $targets) {
  $processIds = @(Get-ListeningProcessIds $target.Port)
  if ($processIds.Count -eq 0) {
    Write-Host "[INFO] Port $($target.Port) is not in use."
    continue
  }

  $portProcessId = $processIds[0]
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$portProcessId"
  if (-not $process) {
    Write-Host "[WARN] Port $($target.Port) belongs to PID $portProcessId, but process details are unavailable."
    $blocked++
    continue
  }

  $belongsToProject =
    $process.Name -eq 'node.exe' -and
    $process.CommandLine -match $target.Pattern -and
    (
      $process.CommandLine -like "*$projectRoot*" -or
      $process.CommandLine -match '(^|\s)(?:.*[\\/])?(server[\\/]index\.js|vite[\\/]bin[\\/]vite\.js)($|\s)'
    )
  if (-not $belongsToProject) {
    Write-Host "[WARN] Port $($target.Port) is used by $($process.Name) (PID $($process.ProcessId)); nothing was stopped."
    $blocked++
    continue
  }

  Stop-Process -Id $process.ProcessId -Force
  Write-Host "[OK] Campus Smart Dispatch Platform process stopped on port $($target.Port) (PID $($process.ProcessId))."
  $stopped++
}

if ($blocked -gt 0) { exit 1 }
if ($stopped -eq 0) { Write-Host '[INFO] No Campus Smart Dispatch Platform development server was running.' }
exit 0

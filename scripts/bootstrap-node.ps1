param(
  [string]$Purpose = 'launcher',
  [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = Join-Path $root 'runtime'
$nodeExe = Join-Path $runtimeRoot 'node.exe'
$npmCmd = Join-Path $runtimeRoot 'npm.cmd'
$minimumMajor = 24

function Write-Log {
  param(
    [ValidateSet('INFO', 'WARN', 'OK', 'ERROR')]
    [string]$Level,
    [string]$Message
  )
  $line = "[runtime][$Level] $Message"
  Write-Host $line
  if ($LogPath) {
    $logDirectory = Split-Path -Parent $LogPath
    if ($logDirectory -and -not (Test-Path -LiteralPath $logDirectory)) {
      New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  }
}

function Get-NodeMajor {
  param([string]$Executable)
  if (-not (Test-Path -LiteralPath $Executable)) { return 0 }
  try {
    $version = (& $Executable -p "process.versions.node" 2>$null).Trim()
    return [int](($version -split '\.')[0])
  } catch {
    return 0
  }
}

function Test-NodeSqlite {
  param([string]$Executable)
  try {
    & $Executable -e "import('node:sqlite').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Get-NodeArchive {
  $arch = [string]$env:PROCESSOR_ARCHITECTURE
  if ($arch -eq 'ARM64') {
    return 'win-arm64'
  }
  if ([Environment]::Is64BitOperatingSystem) {
    return 'win-x64'
  }
  throw 'This project requires a 64-bit Windows system.'
}

try {
  Write-Log INFO "Preparing Node.js runtime (purpose: $Purpose)"
  Write-Log INFO "Project directory: $root"

  $installedMajor = Get-NodeMajor -Executable $nodeExe
  if ($installedMajor -ge $minimumMajor -and (Test-Path -LiteralPath $npmCmd) -and (Test-NodeSqlite $nodeExe)) {
    $installedVersion = (& $nodeExe --version).Trim()
    Write-Log OK "Bundled runtime is ready: Node.js $installedVersion"
    exit 0
  }

  if ($installedMajor -gt 0) {
    Write-Log WARN "Bundled Node.js major version $installedMajor is incompatible or incomplete; it will be replaced."
  } else {
    Write-Log INFO "No bundled Node.js runtime was found; automatic download will start."
  }

  $platform = Get-NodeArchive
  $bases = @(
    'https://nodejs.org/dist',
    'https://npmmirror.com/mirrors/node'
  )
  if ($env:NODE_BOOTSTRAP_BASE_URL) {
    $bases = @($env:NODE_BOOTSTRAP_BASE_URL.TrimEnd('/')) + $bases
  }

  $release = $null
  $baseUrl = $null
  foreach ($base in $bases) {
    try {
      Write-Log INFO "Fetching Node.js 24 release metadata from $base"
      $index = Invoke-RestMethod -Uri "$base/index.json" -TimeoutSec 20
      $candidate = $index |
        Where-Object { $_.version -match '^v24\.' } |
        Select-Object -First 1
      if ($candidate) {
        $release = $candidate.version
        $baseUrl = $base
        break
      }
      Write-Log WARN "No Node.js 24 release found at $base"
    } catch {
      Write-Log WARN "Could not read $base`: $($_.Exception.Message)"
    }
  }
  if (-not $release -or -not $baseUrl) {
    throw 'Unable to find a Node.js 24 download source. Check the network, proxy or firewall, then retry.'
  }

  $archiveName = "node-$release-$platform.zip"
  $downloadUrl = "$baseUrl/$release/$archiveName"
  $checksumUrl = "$baseUrl/$release/SHASUMS256.txt"
  $tempRoot = Join-Path $root ".tmp\node-bootstrap-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $archivePath = Join-Path $tempRoot $archiveName
  $extractPath = Join-Path $tempRoot 'extract'
  $oldRuntime = Join-Path $tempRoot 'runtime-old'

  try {
    Write-Log INFO "Downloading Node.js $release ($platform)"
    Write-Log INFO "Download URL: $downloadUrl"
    Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archivePath -TimeoutSec 300

    Write-Log INFO 'Verifying Node.js archive SHA-256...'
    $checksums = Invoke-WebRequest -UseBasicParsing -Uri $checksumUrl -TimeoutSec 30
    $lookup = @{}
    foreach ($line in ($checksums.Content -split "`r?`n")) {
      if ($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
        $lookup[$Matches[2].Trim()] = $Matches[1].ToLowerInvariant()
      }
    }
    $expectedHash = $lookup[$archiveName]
    if (-not $expectedHash) {
      throw "The official checksum list does not contain $archiveName."
    }
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
      throw "Node.js archive checksum mismatch. Expected $expectedHash, got $actualHash."
    }
    Write-Log OK 'Node.js archive checksum verified.'

    Write-Log INFO 'Extracting Node.js runtime...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $extractPath)
    $extractedNodeRoot = Get-ChildItem -LiteralPath $extractPath -Directory |
      Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } |
      Select-Object -First 1
    if (-not $extractedNodeRoot) {
      throw 'The downloaded archive does not contain node.exe.'
    }

    if (Test-Path -LiteralPath $runtimeRoot) {
      Move-Item -LiteralPath $runtimeRoot -Destination $oldRuntime
    }
    try {
      Move-Item -LiteralPath $extractedNodeRoot.FullName -Destination $runtimeRoot
      $newVersion = (& $nodeExe --version).Trim()
      if ((Get-NodeMajor -Executable $nodeExe) -lt $minimumMajor) {
        throw "Downloaded runtime version $newVersion is still below Node.js $minimumMajor."
      }
      if (-not (Test-NodeSqlite $nodeExe)) {
        throw 'Downloaded Node.js runtime does not support node:sqlite.'
      }
      if (-not (Test-Path -LiteralPath $npmCmd)) {
        throw 'Downloaded Node.js runtime does not contain npm.cmd.'
      }
      Write-Log OK "Node.js $newVersion is ready at $nodeExe"
    } catch {
      if (Test-Path -LiteralPath $runtimeRoot) {
        Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
      }
      if (Test-Path -LiteralPath $oldRuntime) {
        Move-Item -LiteralPath $oldRuntime -Destination $runtimeRoot
        Write-Log WARN 'The previous runtime was restored after update failed.'
      }
      throw
    }
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
} catch {
  Write-Log ERROR "Node.js runtime preparation failed: $($_.Exception.Message)"
  Write-Log ERROR 'Check network access, proxy/firewall settings and write permission for the project directory.'
  throw
}

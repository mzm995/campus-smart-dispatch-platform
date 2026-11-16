$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$canonicalRoot = 'E:\campus-smart-dispatch-platform'
if (Test-Path (Join-Path $canonicalRoot 'package.json')) {
  $root = $canonicalRoot
}
$target = Join-Path $root '启动校园智能调度平台.bat'
$icon = Join-Path $root 'public\app.ico'
if (-not (Test-Path $target)) {
  Write-Host "[ERROR] Launcher not found: $target"
  exit 1
}
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop '校园智能调度平台.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.WorkingDirectory = $root
$link.Description = '启动校园智能调度平台'
if (Test-Path $icon) { $link.IconLocation = $icon }
$link.WindowStyle = 1
$link.Save()
Write-Host "[OK] Desktop shortcut created:"
Write-Host "     $linkPath"

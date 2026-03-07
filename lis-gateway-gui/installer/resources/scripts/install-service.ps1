param(
  [string]$ServiceName = "LISGatewayAgent",
  [string]$InstallRoot = ""
)

$ErrorActionPreference = "Stop"

function Ensure-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script as Administrator."
  }
}

Ensure-Admin

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$sourceNodeExe = Join-Path $InstallRoot "resources\agent\node.exe"
$sourceDistDir = Join-Path $InstallRoot "resources\agent\dist"
$sourceNodeModulesDir = Join-Path $InstallRoot "resources\agent\agent-node-modules"
$sourceXml = Join-Path $InstallRoot "resources\agent\LISGatewayAgent.xml"
$sourceWinSW = Join-Path $InstallRoot "resources\agent\WinSW-x64.exe"

if (-not (Test-Path $sourceNodeExe)) {
  throw "Bundled Node runtime not found: $sourceNodeExe"
}
if (-not (Test-Path $sourceDistDir)) {
  throw "Bundled agent dist directory not found: $sourceDistDir"
}
if (-not (Test-Path $sourceNodeModulesDir)) {
  throw "Bundled agent node_modules directory not found: $sourceNodeModulesDir"
}
if (-not (Test-Path $sourceXml)) {
  throw "Bundled service XML not found: $sourceXml"
}
if (-not (Test-Path $sourceWinSW)) {
  throw "Bundled WinSW binary not found: $sourceWinSW"
}

$installDir = Join-Path $InstallRoot "gateway-agent"
$programDataRoot = Join-Path ${env:ProgramData} "LISGateway"
$programDataLogs = Join-Path $programDataRoot "logs"
$programDataData = Join-Path $programDataRoot "data"
$programDataConfig = Join-Path $programDataRoot "config"

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $programDataRoot, $programDataLogs, $programDataData, $programDataConfig | Out-Null

Remove-Item -Path (Join-Path $installDir "dist") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $installDir "node_modules") -Recurse -Force -ErrorAction SilentlyContinue

Copy-Item -Path $sourceNodeExe -Destination (Join-Path $installDir "node.exe") -Force
Copy-Item -Path $sourceDistDir -Destination (Join-Path $installDir "dist") -Recurse -Force
Copy-Item -Path $sourceNodeModulesDir -Destination (Join-Path $installDir "node_modules") -Recurse -Force
Copy-Item -Path $sourceXml -Destination (Join-Path $installDir "$ServiceName.xml") -Force
$winswExe = Join-Path $installDir "$ServiceName.exe"
Copy-Item -Path $sourceWinSW -Destination $winswExe -Force

try {
  New-NetFirewallRule -DisplayName "LIS Gateway Agent" -Direction Inbound -Action Allow -Program (Join-Path $installDir "node.exe") -Profile Any -ErrorAction Stop | Out-Null
} catch {
  # Rule may already exist or command may be unavailable on older systems.
}

Push-Location $installDir
try {
  & $winswExe stop | Out-Null
  & $winswExe uninstall | Out-Null
} catch {}

& $winswExe install
& $winswExe start

Pop-Location

Write-Host "LIS Gateway service installed: $ServiceName"

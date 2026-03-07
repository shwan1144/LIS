param(
  [string]$ServiceName = "LISGatewayAgent"
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentExe = Join-Path $repoRoot "dist\bin\lis-gateway-agent.exe"
if (-not (Test-Path $agentExe)) {
  throw "Agent executable not found. Run npm run build:service first."
}

$installDir = Join-Path ${env:ProgramFiles} "LISGateway\agent"
$programDataRoot = Join-Path ${env:ProgramData} "LISGateway"
$programDataLogs = Join-Path $programDataRoot "logs"
$programDataData = Join-Path $programDataRoot "data"
$programDataConfig = Join-Path $programDataRoot "config"

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $programDataRoot, $programDataLogs, $programDataData, $programDataConfig | Out-Null

Copy-Item -Path $agentExe -Destination (Join-Path $installDir "lis-gateway-agent.exe") -Force
Copy-Item -Path (Join-Path $repoRoot "service\lis-gateway-agent.xml") -Destination (Join-Path $installDir "$ServiceName.xml") -Force

$winswExe = Join-Path $installDir "$ServiceName.exe"
if (-not (Test-Path $winswExe)) {
  $winswUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
  Invoke-WebRequest -Uri $winswUrl -OutFile $winswExe
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

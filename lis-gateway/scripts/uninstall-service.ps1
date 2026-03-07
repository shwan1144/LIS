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

$installDir = Join-Path ${env:ProgramFiles} "LISGateway\agent"
$winswExe = Join-Path $installDir "$ServiceName.exe"
if (-not (Test-Path $winswExe)) {
  Write-Host "Service executable not found: $winswExe"
  exit 0
}

Push-Location $installDir
try {
  & $winswExe stop | Out-Null
} catch {}
try {
  & $winswExe uninstall
} catch {}
Pop-Location

Write-Host "LIS Gateway service uninstalled: $ServiceName"

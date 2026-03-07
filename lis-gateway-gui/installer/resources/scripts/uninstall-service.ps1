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

$installDir = Join-Path $InstallRoot "gateway-agent"
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

try {
  Remove-NetFirewallRule -DisplayName "LIS Gateway Agent" -ErrorAction Stop | Out-Null
} catch {
  # Ignore if rule doesn't exist.
}

Write-Host "LIS Gateway service uninstalled: $ServiceName"

param(
  [string]$TaskName = "LISInstrumentConnector",
  [string]$ConnectorDir = "",
  [string]$RunAsUser = "SYSTEM"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[STEP] $msg" -ForegroundColor Cyan
}

function Write-Info($msg) {
  Write-Host "[INFO] $msg" -ForegroundColor Green
}

function Ensure-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "Run this script as Administrator."
  }
}

Ensure-Admin

$repoBackend = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ConnectorDir)) {
  $ConnectorDir = Join-Path $repoBackend "dist\connector"
}

$exePath = Join-Path $ConnectorDir "lis-instrument-connector.exe"
if (-not (Test-Path $exePath)) {
  throw "Connector exe not found: $exePath. Build first with: npm run connector:build-exe"
}

$envLocalPath = Join-Path $repoBackend ".env.connector"
$envTargetPath = Join-Path $ConnectorDir ".env.connector"

if (Test-Path $envLocalPath) {
  Copy-Item -Path $envLocalPath -Destination $envTargetPath -Force
  Write-Info "Copied .env.connector to connector folder"
} elseif (-not (Test-Path $envTargetPath)) {
  throw "No .env.connector found. Create backend\.env.connector first."
}

Write-Step "Creating Scheduled Task '$TaskName'"

# Remove existing task if present
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $ConnectorDir
$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

if ($RunAsUser -eq "SYSTEM") {
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType InteractiveToken -RunLevel Highest
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal | Out-Null

Write-Step "Starting task '$TaskName'"
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Info "Installed successfully."
Write-Host "Task Name : $TaskName"
Write-Host "Exe       : $exePath"
Write-Host "Env file  : $envTargetPath"
Write-Host ""
Write-Host "View status: Get-ScheduledTask -TaskName $TaskName"
Write-Host "Run now    : Start-ScheduledTask -TaskName $TaskName"
Write-Host "Stop       : Stop-ScheduledTask -TaskName $TaskName"


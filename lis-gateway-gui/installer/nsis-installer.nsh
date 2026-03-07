!macro customInstall
  DetailPrint "Installing LIS Gateway Windows service..."
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\install-service.ps1" -InstallRoot "$INSTDIR"'
!macroend

!macro customUnInstall
  DetailPrint "Uninstalling LIS Gateway Windows service..."
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\uninstall-service.ps1" -InstallRoot "$INSTDIR"'
!macroend

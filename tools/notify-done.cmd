@echo off
rem Soft "done" chime. The agent runs this at the end of each reply.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = New-Object System.Media.SoundPlayer 'C:\Windows\Media\chimes.wav'; $p.PlaySync()" >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[console]::beep(880,120); Start-Sleep -Milliseconds 60; [console]::beep(1175,160)" >nul 2>&1
)

# Короткий звуковой сигнал «готово» для заказчика.
# Вызывается агентом в конце каждого ответа/задачи.
param(
  [ValidateSet('done', 'attention')]
  [string]$Kind = 'done'
)

$candidates = @(
  'C:\Windows\Media\Windows Notify System Generic.wav',
  'C:\Windows\Media\Windows Notify Calendar.wav',
  'C:\Windows\Media\Windows Notify Email.wav',
  'C:\Windows\Media\chimes.wav',
  'C:\Windows\Media\ding.wav'
)

$file = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

try {
  if ($file) {
    $player = New-Object System.Media.SoundPlayer $file
    $player.PlaySync()
    if ($Kind -eq 'attention') { $player.PlaySync() }
  } else {
    [console]::beep(880, 120)
    Start-Sleep -Milliseconds 60
    [console]::beep(1175, 160)
    if ($Kind -eq 'attention') {
      Start-Sleep -Milliseconds 80
      [console]::beep(880, 120)
    }
  }
} catch {
  try {
    [console]::beep(880, 120)
    [console]::beep(1175, 160)
  } catch { }
}

Write-Output "notify: $Kind ($(if ($file) { Split-Path $file -Leaf } else { 'beep' }))"

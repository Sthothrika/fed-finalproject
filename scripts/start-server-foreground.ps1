<# Start server in foreground in the current PowerShell session
   Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start-server-foreground.ps1
#>

try { Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path) } catch {}

Write-Output "Starting server in foreground (press Ctrl+C to stop)..."
node server.js

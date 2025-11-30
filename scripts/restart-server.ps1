<#
Restart Server Helper
Run this script from PowerShell to safely stop any running Node processes
and start the app in the background. It is intended to be executed from
the project `scripts` folder or by calling the full path.

Usage:
  powershell -ExecutionPolicy Bypass -File .\scripts\restart-server.ps1

This avoids accidentally pasting stack traces or other non-command text
into the interactive shell.
#>

try {
    $projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location $projectRoot
} catch {
    # fallback to current directory
}

Write-Output "Stopping any running node processes..."
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { }
}

Write-Output "Starting server (background)..."
Start-Process -NoNewWindow -FilePath 'node' -ArgumentList 'server.js'

Start-Sleep -Seconds 1
try {
    $status = (Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -ErrorAction Stop).StatusCode
    Write-Output "Server status: $status (http://localhost:3000)"
} catch {
    Write-Output "Server may not be ready yet. Check 'node server.js' output or logs." 
}

Write-Output "Done. If you need to run the server in the foreground instead, run: `node server.js`"
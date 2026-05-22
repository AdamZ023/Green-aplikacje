$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

& "$Root\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

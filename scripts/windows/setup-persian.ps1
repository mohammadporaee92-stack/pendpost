$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required: https://nodejs.org/" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Warning "Install free FFmpeg with: winget install Gyan.FFmpeg" }
if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) { Write-Host "Optional free HTTPS media uploader: winget install Rclone.Rclone" }
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "Created .env. Enter secrets there locally; never send or commit it." }
npm install
Write-Host "Run: npm run persian:serve, then open http://127.0.0.1:8091"
Write-Host "Optional local AI: winget install Ollama.Ollama ; ollama pull qwen2.5:7b"

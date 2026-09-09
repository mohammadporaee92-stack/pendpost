param([string]$Node = "node", [string]$GenerationTime = "17:30", [int]$PublishCheckMinutes = 5)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Script = Join-Path $Root "scripts\persian-instagram.mjs"
$DailyAction = New-ScheduledTaskAction -Execute $Node -Argument "--env-file-if-exists=.env `"$Script`" daily --notify" -WorkingDirectory $Root
$DailyTrigger = New-ScheduledTaskTrigger -Daily -At $GenerationTime
Register-ScheduledTask -TaskName "Pendpost Persian Daily Generation" -Action $DailyAction -Trigger $DailyTrigger -Description "Generate and send one Persian Instagram draft for approval" -Force
$PublishAction = New-ScheduledTaskAction -Execute $Node -Argument "--env-file-if-exists=.env `"$Script`" publish-approved" -WorkingDirectory $Root
$PublishTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $PublishCheckMinutes)
Register-ScheduledTask -TaskName "Pendpost Persian Approved Check" -Action $PublishAction -Trigger $PublishTrigger -Description "Dry-run-first check for explicitly approved posts" -Force
Write-Host "Tasks registered. The laptop must be powered on and online at execution time."

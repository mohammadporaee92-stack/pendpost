param([string]$GenerationTime = "17:30", [ValidateRange(1, 60)][int]$PublishCheckMinutes = 5)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Script = Join-Path $Root "scripts\persian-instagram.mjs"
$Node = (Get-Command node -ErrorAction Stop).Source
if (-not [IO.Path]::IsPathRooted($Node)) { throw "Could not resolve an absolute node.exe path." }
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$DailyAction = New-ScheduledTaskAction -Execute $Node -Argument "--env-file-if-exists=.env `"$Script`" daily --notify" -WorkingDirectory $Root
$DailyTrigger = New-ScheduledTaskTrigger -Daily -At $GenerationTime
Register-ScheduledTask -TaskName "Pendpost Persian Daily Generation" -Action $DailyAction -Trigger $DailyTrigger -Settings $Settings -Description "Generate and send one Persian Instagram draft for approval" -Force
$PollAction = New-ScheduledTaskAction -Execute $Node -Argument "--env-file-if-exists=.env `"$Script`" telegram-poll" -WorkingDirectory $Root
$PollTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Pendpost Persian Telegram Approval" -Action $PollAction -Trigger $PollTrigger -Settings $Settings -Description "Long-poll Telegram locally for approval callbacks" -Force
$PublishAction = New-ScheduledTaskAction -Execute $Node -Argument "--env-file-if-exists=.env `"$Script`" publish-approved" -WorkingDirectory $Root
$PublishTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $PublishCheckMinutes)
Register-ScheduledTask -TaskName "Pendpost Persian Approved Check" -Action $PublishAction -Trigger $PublishTrigger -Settings $Settings -Description "Dry-run-first check for explicitly approved posts" -Force
foreach ($Name in @("Pendpost Persian Daily Generation", "Pendpost Persian Telegram Approval", "Pendpost Persian Approved Check")) { $Task = Get-ScheduledTask -TaskName $Name; if ($Task.Actions.Execute -ne $Node) { throw "Task verification failed: $Name does not use $Node" } }
Write-Host "Tasks registered. The laptop must be powered on and online at execution time."

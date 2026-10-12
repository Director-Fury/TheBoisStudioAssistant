$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $PSScriptRoot 'start-titanbot.ps1'
$webLauncherPath = Join-Path $PSScriptRoot 'launch-jarvis-web.ps1'
$envPath = Join-Path $projectRoot '.env'
$taskName = 'Jarvis - TBS Startup'
$legacyTaskName = 'TitanBot Startup'

if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $projectRoot '.env.example') $envPath
    Write-Host "Created $envPath from .env.example. Add your Discord token and client ID there."
}

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $dockerCli -and -not $nodeCommand) {
    throw 'Install Node.js or Docker Desktop before setting up automatic startup.'
}
if (-not $dockerCli -and -not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    throw 'Node dependencies are missing. Run npm install before setting up automatic startup.'
}

$environmentText = Get-Content $envPath -Raw
$hasToken = $environmentText -match '(?im)^\s*(DISCORD_TOKEN|TOKEN)\s*=\s*(?!your_discord_bot_token_here\s*$).+'
$hasClientId = $environmentText -match '(?im)^\s*CLIENT_ID\s*=\s*(?!your_discord_client_id_here\s*$).+'
$guildIdsMatch = [regex]::Match($environmentText, '(?im)^\s*GUILD_IDS\s*=\s*(.+)$')
$guildIdsValue = if ($guildIdsMatch.Success) { $guildIdsMatch.Groups[1].Value.Trim().Trim('"').Trim("'") } else { '' }
$guildIds = @($guildIdsValue -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$hasGuildIds = $guildIds.Count -ge 2 -and (@($guildIds | Where-Object { $_ -match '^\d{17,20}$' }).Count -eq $guildIds.Count) -and (@($guildIds | Select-Object -Unique).Count -eq $guildIds.Count)
if (-not ($hasToken -and $hasClientId -and $hasGuildIds)) {
    throw 'Configure a Discord token, client ID, and at least two unique server IDs in GUILD_IDS before installing startup.'
}

$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction `
    -Execute $powershellPath `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$trigger.Delay = 'PT30S'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Starts Jarvis - TBS at Windows sign-in, using Docker Compose when available or Node.js otherwise.' `
    -Force | Out-Null

$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($legacyTask) {
    if ($legacyTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $legacyTaskName
    }
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
}

$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Jarvis - TBS.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$webLauncherPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Open the Jarvis - TBS local web control panel.'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,44"
$shortcut.Save()

Start-ScheduledTask -TaskName $taskName
Write-Host "Installed '$taskName' and created the Jarvis - TBS desktop shortcut."
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
$logPath = Join-Path $logDirectory 'startup.log'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerDesktopCandidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Docker\Docker\Docker Desktop.exe')
)

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Start-Transcript -Path $logPath -Append | Out-Null

try {
    $envPath = Join-Path $projectRoot '.env'
    if (-not (Test-Path $envPath)) {
        throw "Missing .env file in $projectRoot. Create it before starting Jarvis - TBS."
    }

    $environmentText = Get-Content $envPath -Raw
    $hasToken = $environmentText -match '(?im)^\s*(DISCORD_TOKEN|TOKEN)\s*=\s*(?!your_discord_bot_token_here\s*$).+'
    $hasClientId = $environmentText -match '(?im)^\s*CLIENT_ID\s*=\s*(?!your_discord_client_id_here\s*$).+'
    $guildIdsMatch = [regex]::Match($environmentText, '(?im)^\s*GUILD_IDS\s*=\s*(.+)$')
    $guildIdsValue = if ($guildIdsMatch.Success) { $guildIdsMatch.Groups[1].Value.Trim().Trim('"').Trim("'") } else { '' }
    $guildIds = @($guildIdsValue -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $hasGuildIds = $guildIds.Count -ge 2 -and (@($guildIds | Where-Object { $_ -match '^\d{17,20}$' }).Count -eq $guildIds.Count) -and (@($guildIds | Select-Object -Unique).Count -eq $guildIds.Count)
    if (-not ($hasToken -and $hasClientId -and $hasGuildIds)) {
        throw 'Add your real DISCORD_TOKEN, CLIENT_ID, and at least two unique server IDs to GUILD_IDS in .env before starting Jarvis - TBS.'
    }

    Push-Location $projectRoot
    try {
        if ($dockerCommand) {
            $dockerCli = $dockerCommand.Source
            $dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
            if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
                if (-not $dockerDesktop) {
                    throw 'Docker CLI is installed, but Docker Desktop was not found in its usual install locations.'
                }
                Start-Process -FilePath $dockerDesktop
            }

            $engineReady = $false
            for ($attempt = 0; $attempt -lt 60; $attempt++) {
                & $dockerCli info *> $null
                if ($LASTEXITCODE -eq 0) {
                    $engineReady = $true
                    break
                }
                Start-Sleep -Seconds 5
            }

            if (-not $engineReady) {
                throw 'Docker Engine did not become ready within five minutes.'
            }

            & $dockerCli compose up -d
        }
        else {
            if (-not $nodeCommand) {
                throw 'Docker Desktop is not installed and node.exe was not found.'
            }
            if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
                throw 'Node dependencies are missing. Install them with npm install before starting TitanBot.'
            }

            & $nodeCommand.Source (Join-Path $projectRoot 'src\app.js')
        }
        if ($LASTEXITCODE -ne 0) {
            throw "TitanBot exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
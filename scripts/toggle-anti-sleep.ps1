[CmdletBinding()]
param(
    [ValidateSet('Toggle', 'On', 'Off', 'Status')]
    [string]$Action = 'Toggle'
)

$ErrorActionPreference = 'Stop'

$stateDirectory = Join-Path $env:APPDATA 'Jarvis-TBS'
$statePath = Join-Path $stateDirectory 'anti-sleep-state.json'

function Invoke-PowerCfg([string[]]$Arguments) {
    & powercfg @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "powercfg failed with exit code $LASTEXITCODE."
    }
}

function Get-ActiveScheme {
    $output = & powercfg /getactivescheme
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read the active power plan (exit code $LASTEXITCODE)."
    }
    if ($output -notmatch '([0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})') {
        throw 'Could not determine the active power plan GUID.'
    }
    return $Matches[1]
}

function Get-AcSleepTimeout([string]$Scheme) {
    $output = & powercfg /query $Scheme SUB_SLEEP STANDBYIDLE
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read the AC sleep timeout (exit code $LASTEXITCODE)."
    }
    $match = [regex]::Match(($output -join "`n"), 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)')
    if (-not $match.Success) {
        throw 'Could not determine the current AC sleep timeout.'
    }
    return [Convert]::ToInt64($match.Groups[1].Value, 16)
}

function Save-State($Records) {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $state = [pscustomobject]@{
        version = 1
        schemes = @($Records)
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -Path $statePath -Encoding UTF8
}

$scheme = Get-ActiveScheme
$timeout = Get-AcSleepTimeout $scheme
$records = @()
if (Test-Path $statePath) {
    $savedState = Get-Content $statePath -Raw | ConvertFrom-Json
    if ($savedState.version -ne 1) {
        throw "Unsupported anti-sleep state version in $statePath."
    }
    $records = @($savedState.schemes)
}
$record = $records | Where-Object { $_.scheme -eq $scheme } | Select-Object -First 1

if ($Action -eq 'Status') {
    if ($timeout -eq 0) {
        Write-Output 'Anti-sleep is ON while plugged in.'
        if ($record) {
            Write-Output "Turning it off will restore the previous timeout ($($record.acSleepTimeoutSeconds) seconds)."
        } else {
            Write-Output 'No previous timeout is saved for this power plan.'
        }
    } else {
        Write-Output "Anti-sleep is OFF; sleep starts after $timeout seconds while plugged in."
    }
    exit 0
}

$turnOn = $Action -eq 'On' -or ($Action -eq 'Toggle' -and $timeout -ne 0)
if ($turnOn) {
    if ($timeout -eq 0) {
        if (-not $record) {
            throw 'Sleep is already disabled, but its previous timeout was not saved; cannot safely toggle it off.'
        }
        Write-Output 'Anti-sleep is already ON while plugged in.'
        exit 0
    }

    $records = @($records | Where-Object { $_.scheme -ne $scheme })
    $records += [pscustomobject]@{
        scheme = $scheme
        acSleepTimeoutSeconds = $timeout
    }
    Save-State $records
    Invoke-PowerCfg @('/setacvalueindex', $scheme, 'SUB_SLEEP', 'STANDBYIDLE', '0')
    Invoke-PowerCfg @('/setactive', $scheme)
    Write-Output 'Anti-sleep is ON while plugged in. The previous timeout has been saved.'
    exit 0
}

if ($timeout -ne 0) {
    Write-Output 'Anti-sleep is already OFF while plugged in.'
    exit 0
}
if (-not $record) {
    throw 'No previous timeout is saved for this power plan; refusing to guess a sleep setting.'
}

$restoreTimeout = [long]$record.acSleepTimeoutSeconds
Invoke-PowerCfg @('/setacvalueindex', $scheme, 'SUB_SLEEP', 'STANDBYIDLE', "$restoreTimeout")
Invoke-PowerCfg @('/setactive', $scheme)
$records = @($records | Where-Object { $_.scheme -ne $scheme })
Save-State $records
Write-Output "Anti-sleep is OFF. Restored the previous timeout ($restoreTimeout seconds) while plugged in."

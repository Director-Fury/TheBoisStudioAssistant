$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $PSScriptRoot 'jarvis-control-server.js'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$controlUrl = 'http://127.0.0.1:3312'

function Test-ControlServer {
    try {
        Invoke-RestMethod "$controlUrl/api/status" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not $nodeCommand) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show('Node.js was not found. Install Node.js, then reopen Jarvis - TBS.', 'Jarvis - TBS', 'OK', 'Error') | Out-Null
    exit 1
}

try {
    if (-not (Test-ControlServer)) {
        Start-Process `
            -FilePath $nodeCommand.Source `
            -ArgumentList "`"$serverPath`"" `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden | Out-Null

        $serverReady = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            if (Test-ControlServer) {
                $serverReady = $true
                break
            }
        }
        if (-not $serverReady) { throw 'The local control server did not become ready.' }
    }

    Start-Process -FilePath $controlUrl -ErrorAction Stop
}
catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Could not start Jarvis - TBS: $($_.Exception.Message)", 'Jarvis - TBS', 'OK', 'Error') | Out-Null
    exit 1
}
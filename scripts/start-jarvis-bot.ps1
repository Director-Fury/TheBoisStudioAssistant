$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$credentialPath = Join-Path $env:APPDATA 'Jarvis-TBS\staff-credential.json'
$taskName = 'Jarvis - TBS Startup'

function Show-Message([string]$Text, [string]$Kind = 'Information') {
    [System.Windows.Forms.MessageBox]::Show($Text, 'Jarvis - TBS', 'OK', $Kind) | Out-Null
}

function Read-StaffPassword {
    $dialog = New-Object System.Windows.Forms.Form
    $dialog.Text = 'Authorize Jarvis - TBS'
    $dialog.Size = New-Object System.Drawing.Size(440, 190)
    $dialog.StartPosition = 'CenterScreen'
    $dialog.FormBorderStyle = 'FixedDialog'
    $dialog.MaximizeBox = $false
    $dialog.MinimizeBox = $false
    $dialog.BackColor = [System.Drawing.Color]::FromArgb(25, 33, 30)
    $dialog.ForeColor = [System.Drawing.Color]::FromArgb(237, 243, 237)
    $dialog.Font = New-Object System.Drawing.Font('Segoe UI', 9)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = 'Enter the staff password to start the bot.'
    $label.Location = New-Object System.Drawing.Point(20, 20)
    $label.Size = New-Object System.Drawing.Size(380, 24)
    $dialog.Controls.Add($label)

    $password = New-Object System.Windows.Forms.TextBox
    $password.Location = New-Object System.Drawing.Point(20, 53)
    $password.Size = New-Object System.Drawing.Size(380, 28)
    $password.UseSystemPasswordChar = $true
    $dialog.Controls.Add($password)

    $start = New-Object System.Windows.Forms.Button
    $start.Text = 'Start bot'
    $start.Location = New-Object System.Drawing.Point(286, 100)
    $start.Size = New-Object System.Drawing.Size(114, 34)
    $start.BackColor = [System.Drawing.Color]::FromArgb(185, 242, 130)
    $start.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $dialog.Controls.Add($start)
    $dialog.AcceptButton = $start

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.Location = New-Object System.Drawing.Point(194, 100)
    $cancel.Size = New-Object System.Drawing.Size(82, 34)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $dialog.Controls.Add($cancel)
    $dialog.CancelButton = $cancel

    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return $password.Text
}

if (-not (Test-Path $credentialPath)) {
    Show-Message 'Staff access is not configured yet. Open the Jarvis - TBS web app once to set the staff password.' 'Warning'
    exit 1
}

$authorized = $false
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $password = Read-StaffPassword
    if ($null -eq $password) { exit 0 }

    try {
        $record = Get-Content $credentialPath -Raw | ConvertFrom-Json
        $salt = [Convert]::FromBase64String($record.salt)
        $expected = [Convert]::FromBase64String($record.hash)
        if ($salt.Length -ne 16 -or $expected.Length -ne 32 -or [int]$record.iterations -lt 100000) {
            throw 'The staff credential file is invalid.'
        }

        $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
            $password,
            $salt,
            [int]$record.iterations,
            [System.Security.Cryptography.HashAlgorithmName]::SHA256
        )
        try { $actual = $derive.GetBytes(32) } finally { $derive.Dispose() }
        $difference = 0
        for ($index = 0; $index -lt $actual.Length; $index++) {
            $difference = $difference -bor ($actual[$index] -bxor $expected[$index])
        }
        if ($difference -eq 0) {
            $authorized = $true
            break
        }
    } catch {
        Show-Message 'Could not verify staff access. Open the Jarvis - TBS web app to reset the staff credential.' 'Error'
        exit 1
    }

    Show-Message 'Staff password was not accepted.' 'Warning'
}

if (-not $authorized) {
    Show-Message 'Too many attempts. The bot was not started.' 'Error'
    exit 1
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Show-Message 'The Jarvis - TBS sign-in task is not installed. Run the startup installer first.' 'Error'
    exit 1
}

if ($task.State -eq 'Running') {
    Show-Message 'Jarvis - TBS is already running.' 'Information'
    exit 0
}

try {
    Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
    Show-Message 'Jarvis - TBS start was requested. Open the control panel to check status and logs.' 'Information'
} catch {
    Show-Message "Could not start Jarvis - TBS: $($_.Exception.Message)" 'Error'
    exit 1
}
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';

const execFileAsync = promisify(execFile);
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, '..');
const envPath = path.join(projectRoot, '.env');
const logsPath = path.join(projectRoot, 'logs');
const botEntryPath = path.join(projectRoot, 'src', 'app.js');
const taskLauncherPath = path.join(scriptsDirectory, 'start-titanbot.ps1');
const staffCredentialPath = path.join(process.env.APPDATA || process.env.HOME || projectRoot, 'Jarvis-TBS', 'staff-credential.json');
const taskName = 'Jarvis - TBS Startup';
const legacyTaskName = 'TitanBot Startup';
const port = Number(process.env.JARVIS_CONTROL_PORT || 3312);
const localUrl = `http://127.0.0.1:${port}`;
const credentialIterations = 180000;
const passwordMinimumLength = 8;
const validPresenceStatuses = new Set(['online', 'idle', 'dnd', 'invisible']);
const validLogLevels = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);
const actionAttempts = new Map();

function runPowerShell(script) {
    return execFileAsync('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], { cwd: projectRoot, windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
}

function psLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function readEnvironment() {
    return dotenv.parse(await fs.readFile(envPath, 'utf8'));
}

function derivePasswordHash(password, salt, iterations = credentialIterations) {
    return pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

async function readCredential() {
    try {
        return JSON.parse(await fs.readFile(staffCredentialPath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

async function saveCredential(password) {
    const directory = path.dirname(staffCredentialPath);
    await fs.mkdir(directory, { recursive: true });
    const salt = randomBytes(16);
    const record = {
        version: 1,
        iterations: credentialIterations,
        salt: salt.toString('base64'),
        hash: derivePasswordHash(password, salt).toString('base64')
    };
    await fs.writeFile(staffCredentialPath, JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

async function verifyCredential(password) {
    const record = await readCredential();
    if (!record || record.version !== 1) return false;
    try {
        const salt = Buffer.from(record.salt, 'base64');
        const expected = Buffer.from(record.hash, 'base64');
        if (salt.length !== 16 || expected.length !== 32) return false;
        const actual = derivePasswordHash(password, salt, Number(record.iterations));
        return timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

function isRateLimited(clientKey) {
    const now = Date.now();
    const attempts = (actionAttempts.get(clientKey) || []).filter(time => now - time < 10 * 60 * 1000);
    actionAttempts.set(clientKey, attempts);
    return attempts.length >= 5;
}

function recordFailedAttempt(clientKey) {
    const now = Date.now();
    const attempts = (actionAttempts.get(clientKey) || []).filter(time => now - time < 10 * 60 * 1000);
    attempts.push(now);
    actionAttempts.set(clientKey, attempts);
}

function clearFailedAttempts(clientKey) {
    actionAttempts.delete(clientKey);
}

function getClientKey(request) {
    return request.socket.remoteAddress || 'localhost';
}

function throttleAction(request, response, next) {
    const clientKey = getClientKey(request);
    if (isRateLimited(clientKey)) {
        return response.status(429).json({ error: 'Too many failed control attempts. Try again in ten minutes.' });
    }
    return next();
}

function sanitizeLogLine(line, env) {
    let output = line;
    for (const secret of [env.DISCORD_TOKEN, env.TOKEN, env.POSTGRES_PASSWORD]) {
        if (secret) output = output.split(secret).join('[redacted]');
    }
    output = output.replace(/\b[A-Za-z0-9_-]{18,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}\b/g, '[redacted token]');
    output = output.replace(/(DISCORD_TOKEN|TOKEN|POSTGRES_PASSWORD)\s*[=:]\s*[^\s,"']+/gi, '$1=[redacted]');
    output = output.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[redacted]@');
    return output;
}

async function readRecentLogs() {
    const env = await readEnvironment().catch(() => ({}));
    const names = await fs.readdir(logsPath).catch(() => []);
    const candidates = names.filter(name =>
        /^(combined-|error-|exceptions-|rejections-).*\.log$/.test(name) || name === 'startup.log'
    );
    const files = await Promise.all(candidates.map(async name => {
        const filePath = path.join(logsPath, name);
        const stat = await fs.stat(filePath).catch(() => null);
        return stat?.isFile() ? { name, filePath, modified: stat.mtimeMs } : null;
    }));
    const selected = files.filter(Boolean).sort((left, right) => right.modified - left.modified).slice(0, 5);
    const lines = [];

    for (const file of selected) {
        const content = await fs.readFile(file.filePath, 'utf8').catch(() => '');
        for (const line of content.split(/\r?\n/).filter(Boolean).slice(-120)) {
            let display = line;
            try {
                const entry = JSON.parse(line);
                display = `[${entry.timestamp || ''}] [${entry.level || 'info'}] ${entry.message || entry.event || line}`;
                if (entry.command) display += ` | /${entry.command}`;
            } catch {
                display = line;
            }
            lines.push({ source: file.name, text: sanitizeLogLine(display, env) });
        }
    }
    return lines.slice(-220);
}

function validateSettings(input) {
    const guildIds = String(input.guildIds || '').split(',').map(id => id.trim()).filter(Boolean);
    if (guildIds.length < 2 || new Set(guildIds).size !== guildIds.length || guildIds.some(id => !/^\d{17,20}$/.test(id))) {
        throw new Error('Enter at least two different, valid Discord server IDs.');
    }

    const ownerIds = String(input.ownerIds || '').split(',').map(id => id.trim()).filter(Boolean);
    if (!ownerIds.length || new Set(ownerIds).size !== ownerIds.length || ownerIds.some(id => !/^\d{17,20}$/.test(id))) {
        throw new Error('Enter one or more valid, comma-separated Discord owner IDs.');
    }

    const clientId = String(input.clientId || '').trim();
    if (!/^\d{17,20}$/.test(clientId)) throw new Error('Enter a valid Discord application ID.');

    const presenceStatus = String(input.presenceStatus || '').trim().toLowerCase();
    if (!validPresenceStatuses.has(presenceStatus)) throw new Error('Choose a valid bot presence status.');

    const activityName = String(input.activityName || '').trim();
    if (!activityName || activityName.length > 128 || /[\r\n\0]/.test(activityName)) {
        throw new Error('Activity text must be 1 to 128 characters on a single line.');
    }

    const logLevel = String(input.logLevel || '').trim().toLowerCase();
    if (!validLogLevels.has(logLevel)) throw new Error('Choose a valid log level.');

    const apiPort = Number(input.port);
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535 || apiPort === port) {
        throw new Error(`Choose a bot web/API port from 1024 to 65535, other than ${port}.`);
    }

    const token = String(input.discordToken || '').trim();
    if (token && (token.length < 30 || token.length > 512 || /\s/.test(token))) {
        throw new Error('The replacement Discord token does not look valid.');
    }

    return {
        GUILD_IDS: guildIds.join(','),
        OWNER_IDS: ownerIds.join(','),
        CLIENT_ID: clientId,
        BOT_PRESENCE_STATUS: presenceStatus,
        BOT_ACTIVITY_NAME: activityName,
        LOG_LEVEL: logLevel,
        PORT: String(apiPort),
        ...(token ? { DISCORD_TOKEN: token } : {})
    };
}

function updateEnvironmentText(original, updates) {
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/);
    const found = new Set();
    const output = [];

    for (const line of lines) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (!match || !(match[1] in updates)) {
            output.push(line);
            continue;
        }
        const key = match[1];
        if (found.has(key)) continue;
        found.add(key);
        output.push(`${key}=${JSON.stringify(updates[key])}`);
    }

    for (const [key, value] of Object.entries(updates)) {
        if (!found.has(key)) output.push(`${key}=${JSON.stringify(value)}`);
    }
    return `${output.join(newline).replace(new RegExp(`${newline}+$`), '')}${newline}`;
}

async function getTaskStatus() {
    const primaryName = psLiteral(taskName);
    const legacy = psLiteral(legacyTaskName);
    const script = [
        `$task = Get-ScheduledTask -TaskName ${primaryName} -ErrorAction SilentlyContinue;`,
        `if (-not $task) { $task = Get-ScheduledTask -TaskName ${legacy} -ErrorAction SilentlyContinue };`,
        "if (-not $task) { [pscustomobject]@{ state = 'Missing'; taskName = $null; lastRun = $null; lastResult = $null } | ConvertTo-Json -Compress; exit };",
        '$info = Get-ScheduledTaskInfo -TaskName $task.TaskName;',
        '[pscustomobject]@{ state = [string]$task.State; taskName = [string]$task.TaskName; lastRun = [string]$info.LastRunTime; lastResult = [string]$info.LastTaskResult } | ConvertTo-Json -Compress'
    ].join(' ');
    const { stdout } = await runPowerShell(script);
    return JSON.parse(stdout.trim());
}

async function controlBot(action) {
    const taskNameLiteral = psLiteral(taskName);
    const legacyTaskLiteral = psLiteral(legacyTaskName);
    const appPathLiteral = psLiteral(path.resolve(botEntryPath));
    const launcherPathLiteral = psLiteral(path.resolve(taskLauncherPath));
    const script = `
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName ${taskNameLiteral} -ErrorAction SilentlyContinue
if (-not $task) { $task = Get-ScheduledTask -TaskName ${legacyTaskLiteral} -ErrorAction SilentlyContinue }
if (-not $task) { throw 'The Jarvis - TBS Startup task is not installed.' }
if ('${action}' -ne 'start') {
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $roots = @($all | Where-Object { $_.Name -match '^powershell(\\.exe)?$' -and $_.CommandLine -and $_.CommandLine.IndexOf(${launcherPathLiteral}, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { [int]$_.ProcessId })
    $frontier = $roots
    $botIds = New-Object 'System.Collections.Generic.List[int]'
    for ($depth = 0; $depth -lt 8 -and $frontier.Count -gt 0; $depth++) {
        $children = @($all | Where-Object { $frontier -contains [int]$_.ParentProcessId })
        foreach ($child in $children) {
            $matchesProject = $child.CommandLine -and $child.CommandLine.IndexOf(${appPathLiteral}, [StringComparison]::OrdinalIgnoreCase) -ge 0
            $matchesLegacyEntry = $child.CommandLine -and $child.CommandLine.IndexOf('src\\app.js', [StringComparison]::OrdinalIgnoreCase) -ge 0
            if ($child.Name -ieq 'node.exe' -and ($matchesProject -or $matchesLegacyEntry)) { $botIds.Add([int]$child.ProcessId) }
        }
        $frontier = @($children | ForEach-Object { [int]$_.ProcessId })
    }
    foreach ($node in ($all | Where-Object { $_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf(${appPathLiteral}, [StringComparison]::OrdinalIgnoreCase) -ge 0 })) {
        if (-not $botIds.Contains([int]$node.ProcessId)) { $botIds.Add([int]$node.ProcessId) }
    }
    if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $task.TaskName }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $alive = @($botIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        $task = Get-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        if ($alive.Count -eq 0 -and (-not $task -or $task.State -ne 'Running')) { break }
        Start-Sleep -Milliseconds 250
    }
    foreach ($processId in $botIds) {
        if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { continue }
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = Join-Path $env:SystemRoot 'System32\taskkill.exe'
        $info.Arguments = "/PID $processId /T /F"
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $killer = [System.Diagnostics.Process]::Start($info)
        $killer.WaitForExit(5000) | Out-Null
    }
}
if ('${action}' -ne 'stop') {
    $task = Get-ScheduledTask -TaskName ${taskNameLiteral} -ErrorAction SilentlyContinue
    if (-not $task) { $task = Get-ScheduledTask -TaskName ${legacyTaskLiteral} -ErrorAction SilentlyContinue }
    if (-not $task) { throw 'The Jarvis - TBS Startup task is not installed.' }
    if ($task.State -ne 'Running') { Start-ScheduledTask -TaskName $task.TaskName }
}
[pscustomobject]@{ action = '${action}'; completed = $true } | ConvertTo-Json -Compress
`;
    await runPowerShell(script);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (request, response, next) => {
    if (request.get('host') !== `127.0.0.1:${port}`) {
        return response.status(403).json({ error: 'Use the local Jarvis - TBS address.' });
    }
    const origin = request.get('origin');
    if (origin && origin !== localUrl) return response.status(403).json({ error: 'Cross-origin requests are blocked.' });
    return next();
});

app.get('/', (_request, response) => response.sendFile(path.join(scriptsDirectory, 'jarvis-dashboard.html')));

app.get('/api/settings', async (_request, response) => {
    try {
        const env = await readEnvironment();
        response.json({
            guildIds: env.GUILD_IDS || '',
            ownerIds: env.OWNER_IDS || '',
            clientId: env.CLIENT_ID || '',
            presenceStatus: env.BOT_PRESENCE_STATUS || 'online',
            activityName: env.BOT_ACTIVITY_NAME || 'Jarvis - TBS',
            logLevel: env.LOG_LEVEL || 'info',
            port: env.PORT || '3000',
            tokenConfigured: Boolean(env.DISCORD_TOKEN || env.TOKEN)
        });
    } catch {
        response.status(500).json({ error: 'Could not read project settings.' });
    }
});

app.put('/api/settings', async (request, response) => {
    try {
        const updates = validateSettings(request.body || {});
        const original = await fs.readFile(envPath, 'utf8');
        await fs.writeFile(envPath, updateEnvironmentText(original, updates), 'utf8');
        response.json({ saved: true, tokenUpdated: Boolean(updates.DISCORD_TOKEN) });
    } catch (error) {
        response.status(400).json({ error: error.message || 'Settings could not be saved.' });
    }
});

app.get('/api/auth', async (_request, response) => {
    response.json({ configured: Boolean(await readCredential().catch(() => null)), minimumLength: passwordMinimumLength });
});

app.post('/api/auth/setup', throttleAction, async (request, response) => {
    const clientKey = getClientKey(request);
    const password = String(request.body?.password || '');
    const confirmation = String(request.body?.confirmation || '');
    if (await readCredential().catch(() => null)) return response.status(409).json({ error: 'Staff access is already configured.' });
    if (password.length < passwordMinimumLength || password.length > 128) {
        recordFailedAttempt(clientKey);
        return response.status(400).json({ error: 'Staff password must be at least 8 characters.' });
    }
    if (password !== confirmation) {
        recordFailedAttempt(clientKey);
        return response.status(400).json({ error: 'The passwords do not match.' });
    }
    try {
        await saveCredential(password);
        clearFailedAttempts(clientKey);
        response.status(201).json({ configured: true });
    } catch (error) {
        if (error.code === 'EEXIST') return response.status(409).json({ error: 'Staff access is already configured.' });
        response.status(500).json({ error: 'Could not save staff access.' });
    }
});

app.get('/api/status', async (_request, response) => {
    try {
        response.json({ ...await getTaskStatus(), checkedAt: new Date().toISOString() });
    } catch {
        response.status(503).json({ error: 'Could not read the Windows startup task status.' });
    }
});

app.get('/api/logs', async (_request, response) => {
    try { response.json({ lines: await readRecentLogs() }); }
    catch { response.status(500).json({ error: 'Could not read bot logs.' }); }
});

app.post('/api/bot/:action', throttleAction, async (request, response) => {
    const clientKey = getClientKey(request);
    const { action } = request.params;
    if (!['start', 'stop', 'restart'].includes(action)) return response.status(404).json({ error: 'Unknown bot action.' });
    const password = String(request.body?.password || '');
    if (!password || !await verifyCredential(password)) {
        recordFailedAttempt(clientKey);
        return response.status(401).json({ error: 'Staff password was not accepted.' });
    }
    clearFailedAttempts(clientKey);

    try {
        await controlBot(action);
        response.json({ action, status: await getTaskStatus() });
    } catch (error) {
        response.status(500).json({ error: error.message || 'The bot action failed.' });
    }
});

const server = app.listen(port, '127.0.0.1', () => {
    console.log(`Jarvis - TBS control app listening at ${localUrl}`);
});
server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        process.exit(0);
    }
    console.error('Could not start Jarvis - TBS control app:', error.message);
    process.exit(1);
});

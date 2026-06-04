// src/main/verify_runner.js
// Manages a single verify_metadata.py Python subprocess.
// Streams every output line to the renderer and forwards stdin input back.

const path   = require('path');
const fs     = require('fs');
const { spawn, execFile } = require('child_process');

let activeProc   = null;
let progressCb   = null;

// ── Find Python (bundled first, then system) ─────────────────────────────────
async function findPython() {
  const { app } = require('electron');

  const bundledPaths = [];
  if (app.isPackaged) {
    bundledPaths.push(path.join(process.resourcesPath, 'python', 'python.exe'));
  }
  bundledPaths.push(path.join(app.getAppPath(), 'public', 'python', 'python.exe'));

  for (const bp of bundledPaths) {
    if (fs.existsSync(bp)) return bp;
  }

  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    const found = await new Promise(resolve => {
      execFile(cmd, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
        const out = (stdout + stderr).toLowerCase();
        resolve(!err && out.includes('python') ? cmd : null);
      });
    });
    if (found) return found;
  }
  return null;
}

// ── Check/install Pillow ─────────────────────────────────────────────────────
async function ensurePillow(pythonCmd, progressCallback) {
  const hasPillow = await new Promise(resolve => {
    execFile(pythonCmd, ['-c', 'import PIL'], { timeout: 8000 }, (err) => resolve(!err));
  });
  if (hasPillow) return true;

  progressCallback({ type: 'info', text: 'Installing Pillow...' });
  return new Promise(resolve => {
    const proc = spawn(pythonCmd, ['-m', 'pip', 'install', 'Pillow', '--no-warn-script-location'], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    proc.stdout.on('data', d => progressCallback({ type: 'info', text: d.toString().trim() }));
    proc.stderr.on('data', d => {
      const t = d.toString().trim();
      if (t && !t.toLowerCase().includes('warning'))
        progressCallback({ type: 'info', text: t });
    });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ── Get script path ──────────────────────────────────────────────────────────
function getScriptPath() {
  const { app } = require('electron');
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'scripts', 'verify_metadata.py');
    if (fs.existsSync(p)) return p;
  }
  const p = path.join(app.getAppPath(), 'public', 'scripts', 'verify_metadata.py');
  if (fs.existsSync(p)) return p;
  return null;
}

// ── Parse a line from the script into a structured event ────────────────────
function parseLine(line) {
  const l = line.trim();
  if (!l) return null;

  // Prompt lines — these need user input
  if (/\[y\/n\]\s*:?\s*$/.test(l))              return { type: 'prompt_yn',     text: l };
  if (/\[1-\d+\]\s*:?\s*$/.test(l))             return { type: 'prompt_choice', text: l };
  if (/blank to skip\)\s*:?\s*$/.test(l))        return { type: 'prompt_date',   text: l };
  if (/Enter folder path/.test(l))               return { type: 'prompt_folder', text: l };

  // Status lines
  if (/\[OK\].*metadata\.json saved/.test(l))    return { type: 'saved',   text: l };
  if (/\[OK\].*match/.test(l))                   return { type: 'stats',   text: l };
  if (/EXIF cov/.test(l))                        return { type: 'exif_cov',text: l };
  if (/below 25% EXIF threshold/.test(l))        return { type: 'warning', text: l };
  if (/Report saved/.test(l))                    return { type: 'report',  text: l };
  if (/\[WARNING\]/.test(l))                     return { type: 'warning', text: l };
  if (/\[ERROR\]/.test(l))                       return { type: 'error',   text: l };
  if (/\[MISMATCH\]/.test(l))                    return { type: 'mismatch',text: l };
  if (/^={3,}|^-{3,}/.test(l))                  return { type: 'divider', text: l };
  if (/^\[\d+\/\d+\]/.test(l))                  return { type: 'subject', text: l };
  if (/Subject\s*:|JSON\s*:|Images\s*:|Auto-zeroed/.test(l)) return { type: 'info', text: l };
  if (/No changes made|Done\./.test(l))          return { type: 'done_subject', text: l };

  return { type: 'text', text: l };
}

// ── Run the script ───────────────────────────────────────────────────────────
async function runVerifyScript(rootPath, progressCallback) {
  progressCb = progressCallback;

  progressCallback({ type: 'info', text: 'Looking for Python...' });
  const python = await findPython();
  if (!python) {
    return { error: 'Python not found.\n\nRun scripts/setup_python.ps1 (as Administrator) to set up bundled Python.' };
  }
  progressCallback({ type: 'info', text: `Found Python: ${python}` });

  const ok = await ensurePillow(python, progressCallback);
  if (!ok) {
    return { error: 'Failed to install Pillow.\n\nRun: pip install Pillow' };
  }

  const scriptPath = getScriptPath();
  if (!scriptPath) return { error: 'Script not found: verify_metadata.py' };

  progressCallback({ type: 'info', text: '-'.repeat(50) });

  return new Promise((resolve) => {
    const proc = spawn(python, ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });

    activeProc = proc;

    // Send root path as first input
    proc.stdin.write(rootPath + '\n');

    let lineBuffer = '';

    const handleChunk = (chunk) => {
      const clean = chunk.toString('utf-8').replace(/\x1b\[[0-9;]*m/g, '');
      lineBuffer += clean;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (parsed) progressCallback(parsed);
      }
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        const parsed = parseLine(lineBuffer);
        if (parsed) progressCallback(parsed);
      }
      activeProc = null;
      progressCallback({ type: 'finished', exitCode: code });
      resolve({ success: code === 0, exitCode: code });
    });

    proc.on('error', (err) => {
      activeProc = null;
      progressCallback({ type: 'error', text: err.message });
      resolve({ success: false, error: err.message });
    });
  });
}

// ── Send user input to the running script ────────────────────────────────────
function sendInput(input) {
  if (activeProc && !activeProc.killed) {
    try { activeProc.stdin.write(input + '\n'); }
    catch { /* ignore */ }
  }
}

function cancelScript() {
  if (activeProc && !activeProc.killed) {
    try { activeProc.kill(); } catch { /* ignore */ }
    activeProc = null;
  }
}

module.exports = { findPython, runVerifyScript, sendInput, cancelScript };
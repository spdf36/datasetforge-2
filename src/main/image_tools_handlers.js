// src/main/image_tools_handlers.js
// Runs the bundled Python scripts as child processes.
// Priority: bundled Python (public/python/) > system Python > error with setup instructions.

const path   = require('path');
const fs     = require('fs');
const { spawn, execFile } = require('child_process');

// ── Resolve bundled scripts ──────────────────────────────────────────────────
function getScriptPath(scriptName) {
  const { app } = require('electron');
  if (app.isPackaged) {
    const packed = path.join(process.resourcesPath, 'scripts', scriptName);
    if (fs.existsSync(packed)) return packed;
  }
  const dev = path.join(app.getAppPath(), 'public', 'scripts', scriptName);
  if (fs.existsSync(dev)) return dev;
  return null;
}

// ── Find Python: bundled first, then system ──────────────────────────────────
async function findPython() {
  const { app } = require('electron');

  // 1. Bundled Python (set up via setup_python.ps1 or packaged with app)
  const bundledPaths = [];
  if (app.isPackaged) {
    bundledPaths.push(path.join(process.resourcesPath, 'python', 'python.exe'));
  }
  // Dev or fallback
  bundledPaths.push(path.join(app.getAppPath(), 'public', 'python', 'python.exe'));

  for (const bp of bundledPaths) {
    if (fs.existsSync(bp)) return bp;
  }

  // 2. System Python candidates
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

// ── Check Python dependencies ────────────────────────────────────────────────
async function checkDeps(pythonCmd, deps) {
  const missing = [];
  for (const dep of deps) {
    const ok = await new Promise(resolve => {
      execFile(pythonCmd, ['-c', `import ${dep}`], { timeout: 8000 }, (err) => resolve(!err));
    });
    if (!ok) missing.push(dep);
  }
  return missing;
}

// ── Install missing deps into bundled Python ─────────────────────────────────
async function installDeps(pythonCmd, packages, progressCallback) {
  return new Promise((resolve) => {
    progressCallback({ type: 'line', action: 'info', msg: `Installing: ${packages.join(' ')} ...` });
    const proc = spawn(pythonCmd, ['-m', 'pip', 'install', ...packages, '--no-warn-script-location'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    proc.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) progressCallback({ type: 'line', action: 'info', msg: line });
    });
    proc.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line && !line.toLowerCase().includes('warning')) {
        progressCallback({ type: 'line', action: 'warn', msg: line });
      }
    });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ── Run a script, stream output ──────────────────────────────────────────────
function runScript(pythonCmd, scriptPath, folderPath, progressCallback) {
  return new Promise((resolve) => {
    const proc = spawn(pythonCmd, ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });

    // Send folder path via stdin
    proc.stdin.write(folderPath + '\n');
    proc.stdin.end();

    let lineBuffer = '';

    const handleChunk = (chunk) => {
      // Strip ANSI escape codes
      const clean = chunk.toString('utf-8').replace(/\x1b\[[0-9;]*m/g, '');
      lineBuffer += clean;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (parsed) progressCallback({ type: 'line', ...parsed });
      }
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        const parsed = parseLine(lineBuffer);
        if (parsed) progressCallback({ type: 'line', ...parsed });
      }
      resolve({ exitCode: code });
    });

    proc.on('error', (err) => {
      progressCallback({ type: 'line', action: 'error', msg: `[ERROR] ${err.message}` });
      resolve({ exitCode: -1, error: err.message });
    });
  });
}

// ── Parse output line ────────────────────────────────────────────────────────
function parseLine(line) {
  const l = line.trim();
  if (!l) return null;

  if (/^\[\d+\/\d+\]\s*Skipping/.test(l))   return { action: 'skip',    msg: l };
  if (/^\[\d+\/\d+\]\s*Renaming/.test(l))   return { action: 'rename',  msg: l };
  if (/^\[\d+\/\d+\]\s*Converting/.test(l)) return { action: 'convert', msg: l };
  if (/^\[MODIFIED\]/.test(l))              return { action: 'done',    msg: l };
  if (/^\[ERROR\]/.test(l))                 return { action: 'error',   msg: l };
  if (/^\[WARNING\]/.test(l))               return { action: 'warn',    msg: l };
  if (/^\[SUCCESS\]/.test(l))               return { action: 'summary', msg: l };
  if (/^\[INFO\]/.test(l))                  return { action: 'info',    msg: l };
  if (/Updated key|Skipped key/.test(l))    return { action: 'info',    msg: l };
  if (/^=+ PROCESSING SUMMARY|^Total |^Images /.test(l)) return { action: 'summary', msg: l };

  return { action: 'info', msg: l };
}

// ── Shared setup: find Python + auto-install deps ────────────────────────────
async function setupPython(deps, progressCallback) {
  progressCallback({ type: 'line', action: 'info', msg: 'Looking for Python...' });

  const python = await findPython();
  if (!python) {
    return {
      error: [
        'Python not found on this machine.',
        '',
        'To fix: run setup_python.ps1 (in the scripts/ folder) as Administrator.',
        'It will download a self-contained Python with all required packages.',
        'No installation required — it bundles directly into the app.',
      ].join('\n'),
    };
  }

  progressCallback({ type: 'line', action: 'info', msg: `Found Python: ${python}` });

  const missing = await checkDeps(python, deps);
  if (missing.length > 0) {
    const pkgMap = { PIL: 'Pillow', piexif: 'piexif', pillow_heif: 'pillow-heif' };
    const pkgs = missing.map(m => pkgMap[m] || m);
    progressCallback({ type: 'line', action: 'warn', msg: `Missing packages: ${pkgs.join(', ')} — installing automatically...` });

    const ok = await installDeps(python, pkgs, progressCallback);
    if (!ok) {
      return {
        error: [
          `Failed to auto-install: ${pkgs.join(' ')}`,
          '',
          'Please run manually in a terminal:',
          `  pip install ${pkgs.join(' ')}`,
          '',
          'Or run scripts/setup_python.ps1 to set up the bundled Python.',
        ].join('\n'),
      };
    }
    progressCallback({ type: 'line', action: 'summary', msg: `[OK] Packages installed successfully.` });
  }

  return { python };
}

// ── Public API ───────────────────────────────────────────────────────────────
async function convertAllToJpg(folderPath, progressCallback) {
  const setup = await setupPython(['PIL', 'piexif', 'pillow_heif'], progressCallback);
  if (setup.error) return { error: setup.error };

  const scriptPath = getScriptPath('all_to_jpg_final.py');
  if (!scriptPath) return { error: 'Script not found: all_to_jpg_final.py' };

  progressCallback({ type: 'line', action: 'info', msg: `Folder: ${folderPath}` });
  progressCallback({ type: 'line', action: 'info', msg: '-'.repeat(50) });

  const result = await runScript(setup.python, scriptPath, folderPath, progressCallback);
  progressCallback({ type: 'done', exitCode: result.exitCode });
  return { success: result.exitCode === 0, exitCode: result.exitCode };
}

async function resizeImages(folderPath, progressCallback) {
  const setup = await setupPython(['PIL'], progressCallback);
  if (setup.error) return { error: setup.error };

  const scriptPath = getScriptPath('resize_image.py');
  if (!scriptPath) return { error: 'Script not found: resize_image.py' };

  progressCallback({ type: 'line', action: 'info', msg: `Folder: ${folderPath}` });
  progressCallback({ type: 'line', action: 'info', msg: '-'.repeat(50) });

  const result = await runScript(setup.python, scriptPath, folderPath, progressCallback);
  progressCallback({ type: 'done', exitCode: result.exitCode });
  return { success: result.exitCode === 0, exitCode: result.exitCode };
}

module.exports = { convertAllToJpg, resizeImages };
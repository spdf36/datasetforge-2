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


// ── Constants ────────────────────────────────────────────────────────────────
const IMAGE_EXTS_SET  = new Set(['.jpg','.jpeg','.png','.heic','.heif','.webp','.bmp','.tiff','.tif','.mpo']);
const RESIZE_EXTS_SET = new Set(['.jpg','.jpeg','.png','.webp','.bmp','.tiff','.tif']);

// ── Get ordered list of batch folders to process ─────────────────────────────
function getBatchFolders(rootPath, extSet) {
  // Returns [{name, fullPath, fileCount}]
  // If the root itself has matching images, treat root as the single batch.
  let entries;
  try { entries = fs.readdirSync(rootPath, { withFileTypes: true }); } catch { return []; }

  function countFiles(dir) {
    let n = 0;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of ents) {
      if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
      else if (e.isFile() && extSet.has(path.extname(e.name).toLowerCase())
               && e.name.toLowerCase() !== 'metadata.json') n++;
    }
    return n;
  }

  // Check if root itself contains images directly (single-batch drop)
  const rootImageCount = entries.filter(e =>
    e.isFile() && extSet.has(path.extname(e.name).toLowerCase())
    && e.name.toLowerCase() !== 'metadata.json'
  ).length;

  if (rootImageCount > 0) {
    // Root has images — treat root as single batch
    return [{ name: path.basename(rootPath), fullPath: rootPath, fileCount: rootImageCount }];
  }

  // Root has subdirectories — each top-level dir is a batch folder
  const dirs = entries
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const result = [];
  for (const dir of dirs) {
    const fullPath = path.join(rootPath, dir.name);
    const fileCount = countFiles(fullPath);
    if (fileCount > 0) result.push({ name: dir.name, fullPath, fileCount });
  }
  return result;
}

// ── Parse summary numbers from script output lines ───────────────────────────
function extractSummaryNumbers(msg) {
  // Step 1 (all_to_jpg): Converted, Renamed, Skipped, Failed
  let m;
  m = msg.match(/Converted to JPG\s*:\s*(\d+)/i); if (m) return { key: 'converted', val: parseInt(m[1]) };
  m = msg.match(/Renamed to \.jpg\s*:\s*(\d+)/i);  if (m) return { key: 'renamed',   val: parseInt(m[1]) };
  // Step 2 (resize): Total, Modified, Skipped, Errors
  m = msg.match(/Total Images Checked\s*:\s*(\d+)/i);  if (m) return { key: 'checked',   val: parseInt(m[1]) };
  m = msg.match(/Images Modified\s*:\s*(\d+)/i);       if (m) return { key: 'modified',  val: parseInt(m[1]) };
  m = msg.match(/Images Skipped[^:]*:\s*(\d+)/i);      if (m) return { key: 'skipped',   val: parseInt(m[1]) };
  m = msg.match(/Errors Encountered\s*:\s*(\d+)/i);    if (m) return { key: 'errors',    val: parseInt(m[1]) };
  m = msg.match(/Skipped \(As-Is\)\s*:\s*(\d+)/i);     if (m) return { key: 'skipped',   val: parseInt(m[1]) };
  m = msg.match(/Failed\s*:\s*(\d+)/i);                if (m) return { key: 'errors',    val: parseInt(m[1]) };
  return null;
}

// ── Run script on a single folder, stream output, return stats ────────────────
function runScriptOnFolder(pythonCmd, scriptPath, folderPath, progressCallback) {
  return new Promise((resolve) => {
    const stats = { converted: 0, renamed: 0, checked: 0, modified: 0, skipped: 0, errors: 0 };

    const proc = spawn(pythonCmd, ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });

    proc.stdin.write(folderPath + '\n');
    proc.stdin.end();

    let lineBuffer = '';

    const handleChunk = (chunk) => {
      const clean = chunk.toString('utf-8').replace(/\x1b\[[0-9;]*m/g, '');
      lineBuffer += clean;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseLine(line);
        if (!parsed) continue;
        // Accumulate summary numbers silently — don't show per-folder summary lines
        const num = extractSummaryNumbers(parsed.msg);
        if (num) { stats[num.key] = (stats[num.key] || 0) + num.val; }
        // Hide the per-folder summary block (===, Total, Images lines) — shown in final summary instead
        if (parsed.action === 'summary') continue;
        progressCallback({ type: 'line', ...parsed });
      }
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);

    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        const parsed = parseLine(lineBuffer);
        if (parsed && parsed.action !== 'summary') progressCallback({ type: 'line', ...parsed });
      }
      resolve({ exitCode: code, stats });
    });

    proc.on('error', (err) => {
      progressCallback({ type: 'line', action: 'error', msg: '[ERROR] ' + err.message });
      resolve({ exitCode: -1, error: err.message, stats });
    });
  });
}

// ── Run script folder-by-folder, emit final summary ──────────────────────────
async function runOnAllFolders(pythonCmd, scriptPath, rootPath, extSet, progressCallback) {
  const batches = getBatchFolders(rootPath, extSet);

  if (batches.length === 0) {
    progressCallback({ type: 'line', action: 'warn', msg: 'No image files found in: ' + rootPath });
    return { exitCode: 0 };
  }

  let anyFailed = false;
  const totals = { converted: 0, renamed: 0, checked: 0, modified: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    progressCallback({
      type: 'line', action: 'folder',
      msg: batch.name + '  (' + batch.fileCount + ' file' + (batch.fileCount !== 1 ? 's' : '') + ')  [' + (i + 1) + '/' + batches.length + ']'
    });

    const result = await runScriptOnFolder(pythonCmd, scriptPath, batch.fullPath, progressCallback);
    if (result.exitCode !== 0) anyFailed = true;

    // Accumulate stats
    for (const key of Object.keys(totals)) {
      totals[key] += (result.stats?.[key] || 0);
    }
  }

  // ── Final summary ──
  const div = '='.repeat(40);
  progressCallback({ type: 'line', action: 'final_summary', msg: div });
  progressCallback({ type: 'line', action: 'final_summary', msg: 'FINAL SUMMARY  (' + batches.length + ' folder' + (batches.length !== 1 ? 's' : '') + ')' });
  progressCallback({ type: 'line', action: 'final_summary', msg: div });

  if (totals.checked > 0) {
    // resize_image.py style
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Total Checked   : ' + totals.checked });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Modified        : ' + totals.modified });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Skipped (Valid) : ' + totals.skipped });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Errors          : ' + totals.errors });
  } else {
    // all_to_jpg style
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Converted to JPG: ' + totals.converted });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Renamed to .jpg : ' + totals.renamed });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Skipped (As-Is) : ' + totals.skipped });
    progressCallback({ type: 'line', action: 'final_summary', msg: 'Errors          : ' + totals.errors });
  }
  progressCallback({ type: 'line', action: 'final_summary', msg: div });

  return { exitCode: anyFailed ? 1 : 0 };
}

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
      ].join('\n'),
    };
  }

  progressCallback({ type: 'line', action: 'info', msg: 'Found Python: ' + python });

  const missing = await checkDeps(python, deps);
  if (missing.length > 0) {
    const pkgMap = { PIL: 'Pillow', piexif: 'piexif', pillow_heif: 'pillow-heif' };
    const pkgs = missing.map(m => pkgMap[m] || m);
    progressCallback({ type: 'line', action: 'warn', msg: 'Missing packages: ' + pkgs.join(', ') + ' - installing automatically...' });

    const ok = await installDeps(python, pkgs, progressCallback);
    if (!ok) {
      return { error: 'Failed to auto-install: ' + pkgs.join(' ') + '\n\nRun manually:\n  pip install ' + pkgs.join(' ') };
    }
    progressCallback({ type: 'line', action: 'summary', msg: '[OK] Packages installed successfully.' });
  }

  return { python };
}

// ── Public API ───────────────────────────────────────────────────────────────
async function convertAllToJpg(folderPath, progressCallback) {
  const setup = await setupPython(['PIL', 'piexif', 'pillow_heif'], progressCallback);
  if (setup.error) return { error: setup.error };

  const scriptPath = getScriptPath('all_to_jpg_final.py');
  if (!scriptPath) return { error: 'Script not found: all_to_jpg_final.py' };

  progressCallback({ type: 'line', action: 'info', msg: 'Root: ' + folderPath });
  progressCallback({ type: 'line', action: 'info', msg: '-'.repeat(50) });

  const result = await runOnAllFolders(setup.python, scriptPath, folderPath, IMAGE_EXTS_SET, progressCallback);
  progressCallback({ type: 'done', exitCode: result.exitCode });
  return { success: result.exitCode === 0, exitCode: result.exitCode };
}

async function resizeImages(folderPath, progressCallback) {
  const setup = await setupPython(['PIL'], progressCallback);
  if (setup.error) return { error: setup.error };

  const scriptPath = getScriptPath('resize_image.py');
  if (!scriptPath) return { error: 'Script not found: resize_image.py' };

  progressCallback({ type: 'line', action: 'info', msg: 'Root: ' + folderPath });
  progressCallback({ type: 'line', action: 'info', msg: '-'.repeat(50) });

  const result = await runOnAllFolders(setup.python, scriptPath, folderPath, RESIZE_EXTS_SET, progressCallback);
  progressCallback({ type: 'done', exitCode: result.exitCode });
  return { success: result.exitCode === 0, exitCode: result.exitCode };
}

module.exports = { convertAllToJpg, resizeImages };
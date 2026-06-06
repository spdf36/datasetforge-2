// src/renderer/components/ImageToolsWorkspace.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import './ImageToolsWorkspace.css';

const STEP = {
  SELECT:    'SELECT',
  STEP1_RUN: 'STEP1_RUN',
  STEP1_DONE:'STEP1_DONE',
  STEP2_RUN: 'STEP2_RUN',
  STEP2_DONE:'STEP2_DONE',
};

export default function ImageToolsWorkspace({ onBack }) {
  const [step, setStep]         = useState(STEP.SELECT);
  const [folderPath, setFolderPath] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [log, setLog]           = useState([]);         // array of log line objects
  const [stats, setStats]       = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' });
  const [error, setError]       = useState(null);
  const logEndRef = useRef(null);
  const dragCounter = useRef(0);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Listen for progress events from main process
  useEffect(() => {
    window.electron.onToolsProgress((data) => {
      if (data.type === 'line') {
        if (data.action === 'folder') {
          setLog(prev => [...prev, { text: data.msg, color: 'folder' }]);
          return;
        }
        const color =
          data.action === 'error'   ? 'red'    :
          data.action === 'warn'    ? 'amber'  :
          data.action === 'skip'    ? 'muted'  :
          data.action === 'rename'  ? 'cyan'   :
          data.action === 'convert' ? 'amber'  :
          data.action === 'resize'  ? 'amber'  :
          data.action === 'done'    ? 'green'  :
          data.action === 'summary'       ? 'green'         :
          data.action === 'final_summary' ? 'final_summary' :
          'default';
        setLog(prev => [...prev, { text: data.msg, color }]);
      } else if (data.type === 'done') {
        setProgress({ current: 0, total: 0, file: '' });
      }
    });
    return () => window.electron.offToolsProgress();
  }, []);

  const browse = useCallback(async () => {
    const p = await window.electron.openFolderDialog();
    if (p) setFolderPath(Array.isArray(p) ? p[0] : p);
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────
  const handleDragEnter = useCallback((e) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragging(false);
    const items = Array.from(e.dataTransfer.items);
    const files = Array.from(e.dataTransfer.files);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) { const f = item.getAsFile(); if (f?.path) { setFolderPath(f.path); return; } }
      }
    }
    if (files.length && files[0].path) {
      const fp = files[0].path;
      const sep = fp.includes('\\') ? '\\' : '/';
      setFolderPath(fp.substring(0, fp.lastIndexOf(sep)) || fp);
    }
  }, []);

  // ── Run Step 1 ─────────────────────────────────────────────────
  const runStep1 = useCallback(async () => {
    if (!folderPath.trim()) return;
    setStep(STEP.STEP1_RUN);
    setLog([{ text: `Starting JPG conversion in: ${folderPath}`, color: 'cyan' }]);
    setStats(null); setError(null); setProgress({ current: 0, total: 0, file: '' });
    try {
      const result = await window.electron.convertToJpg({ folderPath });
      if (result.error) {
        setError(result.error);
        setLog(prev => [...prev, { text: result.error, color: 'red' }]);
        setStep(STEP.SELECT);
        return;
      }
      setLog(prev => [...prev, { text: '─'.repeat(40), color: 'muted' }, { text: result.success ? 'Step 1 complete.' : `Step 1 finished with exit code ${result.exitCode}.`, color: result.success ? 'green' : 'amber' }]);
      setStats({ success: result.success });
      setStep(STEP.STEP1_DONE);
    } catch (err) {
      setError(err.message);
      setStep(STEP.SELECT);
    }
  }, [folderPath]);

  // ── Run Step 2 ─────────────────────────────────────────────────
  const runStep2 = useCallback(async () => {
    setStep(STEP.STEP2_RUN);
    setLog(prev => [
      ...prev,
      { text: '', color: 'muted' },
      { text: `Starting resize in: ${folderPath}`, color: 'cyan' },
    ]);
    setProgress({ current: 0, total: 0, file: '' });
    try {
      const result = await window.electron.resizeImages({ folderPath });
      if (result.error) {
        setError(result.error);
        setLog(prev => [...prev, { text: result.error, color: 'red' }]);
        setStep(STEP.STEP1_DONE);
        return;
      }
      setLog(prev => [...prev, { text: '─'.repeat(40), color: 'muted' }, { text: result.success ? 'Step 2 complete.' : `Step 2 finished with exit code ${result.exitCode}.`, color: result.success ? 'green' : 'amber' }]);
      setStats(result);
      setStep(STEP.STEP2_DONE);
    } catch (err) {
      setError(err.message);
      setStep(STEP.STEP1_DONE);
    }
  }, [folderPath]);

  const resetAll = useCallback(() => {
    setStep(STEP.SELECT); setLog([]); setStats(null);
    setError(null); setProgress({ current: 0, total: 0, file: '' });
  }, []);

  const isRunning = step === STEP.STEP1_RUN || step === STEP.STEP2_RUN;

  return (
    <div className="it-root">
      {/* Header */}
      <div className="it-header">
        <button className="it-back" onClick={onBack} disabled={isRunning}>← Back</button>
        <div className="it-title">
          <span className="it-title-icon">⬡</span>
          <span className="mono">Image Tools</span>
        </div>
        <div className="it-steps-indicator">
          <StepPip n={1} label="Convert to JPG" active={step === STEP.STEP1_RUN} done={[STEP.STEP1_DONE, STEP.STEP2_RUN, STEP.STEP2_DONE].includes(step)} />
          <div className="it-step-connector" />
          <StepPip n={2} label="Resize" active={step === STEP.STEP2_RUN} done={step === STEP.STEP2_DONE} />
        </div>
      </div>

      <div className="it-body">
        {/* Left: controls */}
        <div className="it-controls">
          {/* Folder select */}
          <div
            className={`it-dropzone ${isDragging ? 'it-dz-dragging' : ''} ${step !== STEP.SELECT ? 'it-dz-locked' : ''}`}
            onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}  onDrop={handleDrop}
          >
            <div className="it-dz-icon">{isDragging ? '⬇' : '⬡'}</div>
            <div className="it-dz-label">{isDragging ? 'Release to set folder' : 'Drop folder here'}</div>
            <div className="it-dz-input-row">
              <input
                type="text"
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="C:\path\to\folder"
                disabled={step !== STEP.SELECT}
              />
              <button className="it-btn-browse" onClick={browse} disabled={step !== STEP.SELECT}>Browse</button>
            </div>
          </div>

          {error && (
            <div className="it-error">
              {error.split('\n').map((line, i) => (
                <div key={i} style={{ marginBottom: line === '' ? 6 : 0 }}>{line || '\u00a0'}</div>
              ))}
            </div>
          )}

          {/* Step 1 card */}
          <StepCard
            number="01"
            title="Convert All to JPG"
            accent="cyan"
            items={[
              'Python + dependencies are bundled — no setup needed for your team',
              'Detects true file format from binary headers (not extensions)',
              'Real JPEGs with .jpeg extension -> renamed to .jpg (no re-encode)',
              'HEIC, PNG, WebP, BMP -> converted to JPG at quality 95',
              'Strips proprietary Apple/HEIC tags for clean ingestion',
              'Preserves existing EXIF, ICC profile and timestamps',
              'Deletes Thumbs.db, _exiftool_tmp and junk files',
              'Updates metadata.json keys to .jpg extensions',
            ]}
            status={
              step === STEP.STEP1_RUN  ? 'running' :
              [STEP.STEP1_DONE, STEP.STEP2_RUN, STEP.STEP2_DONE].includes(step) ? 'done' : 'idle'
            }
            canRun={step === STEP.SELECT && folderPath.trim().length > 0}
            onRun={runStep1}
          />

          {/* Step 2 card */}
          <StepCard
            number="02"
            title="Resize Images"
            accent="amber"
            items={[
              'Python + Pillow are bundled — no setup needed for your team',
              'Checks every image: width & height must be >= 512 px',
              'File size must be >= 128 KB',
              'Scales up shortest side to hit 512 px minimum',
              'Iteratively upscales 5% until 130-260 KB target is reached',
              'JPEG/WebP saved at quality 98 with subsampling 0',
              'Preserves existing metadata — no new tags written',
            ]}
            status={
              step === STEP.STEP2_RUN  ? 'running' :
              step === STEP.STEP2_DONE ? 'done'    : 'idle'
            }
            canRun={step === STEP.STEP1_DONE}
            onRun={runStep2}
          />

          {step === STEP.STEP2_DONE && (
            <button className="it-btn-reset" onClick={resetAll}>Process another folder</button>
          )}
        </div>

        {/* Right: log + progress */}
        <div className="it-log-panel">
          <div className="it-log-header mono">
            <span>Output</span>
            {isRunning && <span className="it-log-counter">running...</span>}
          </div>

          {isRunning && (
            <div className="it-progress-wrap">
              <div className="it-progress-bar">
                <div className="it-progress-indeterminate" />
              </div>
              <div className="it-progress-file mono">Processing — see output log for details</div>
            </div>
          )}

          <div className="it-log-body">
            {log.length === 0 && (
              <div className="it-log-empty">Output will appear here when processing starts.</div>
            )}
            {log.map((line, i) => (
              <div key={i} className={`it-log-line ${
                line.color === 'folder'        ? 'it-log-folder' :
                line.color === 'final_summary' ? 'it-log-final-summary' :
                'it-log-' + line.color}`}>
                {line.color === 'folder' ? (
                  <span>📁 {line.text}</span>
                ) : (
                  line.text || '\u00a0'
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step card ────────────────────────────────────────────────────────────────
function StepCard({ number, title, accent, items, status, canRun, onRun }) {
  return (
    <div className={`it-step-card it-step-${accent} it-step-${status}`}>
      <div className="it-step-head">
        <span className="it-step-num mono">{number}</span>
        <span className="it-step-title">{title}</span>
        {status === 'done'    && <span className="it-step-badge it-badge-done">✓ done</span>}
        {status === 'running' && <span className="it-step-badge it-badge-running">running...</span>}
      </div>
      <ul className="it-step-items">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
      {canRun && (
        <button className={`it-step-run it-run-${accent}`} onClick={onRun}>
          Run Step {number} →
        </button>
      )}
    </div>
  );
}

// ── Step pip ─────────────────────────────────────────────────────────────────
function StepPip({ n, label, active, done }) {
  return (
    <div className={`it-pip ${active ? 'it-pip-active' : ''} ${done ? 'it-pip-done' : ''}`}>
      <div className="it-pip-circle">{done ? '✓' : n}</div>
      <span className="it-pip-label">{label}</span>
    </div>
  );
}
// src/renderer/components/VerifyWorkspace.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import './VerifyWorkspace.css';

const MODE = {
  SELECT:  'SELECT',
  RUNNING: 'RUNNING',
  DONE:    'DONE',
};

const PROMPT_TYPES = new Set(['prompt_yn', 'prompt_choice', 'prompt_date', 'prompt_folder']);

export default function VerifyWorkspace({ onBack }) {
  const [mode, setMode]             = useState(MODE.SELECT);
  const [rootPath, setRootPath]     = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [lines, setLines]           = useState([]);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [error, setError]           = useState(null);
  const [exitCode, setExitCode]     = useState(null);
  const [hasLowExif, setHasLowExif] = useState(false);
  const logEndRef   = useRef(null);
  const inputRef    = useRef(null);
  const dragCounter = useRef(0);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);
  useEffect(() => { if (pendingPrompt) inputRef.current?.focus(); }, [pendingPrompt]);

  useEffect(() => {
    window.electron.onVerifyData((data) => {
      if (PROMPT_TYPES.has(data.type)) {
        setLines(prev => [...prev, { ...data }]);
        setPendingPrompt(data);
        setInputValue('');
      } else if (data.type === 'finished') {
        setExitCode(data.exitCode);
        setMode(MODE.DONE);
        setPendingPrompt(null);
      } else {
        setLines(prev => [...prev, { ...data }]);
        if (data.type === 'warning' && data.text?.includes('below 25%')) setHasLowExif(true);
      }
    });
    return () => window.electron.offVerifyData();
  }, []);

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
        if (entry?.isDirectory) { const f = item.getAsFile(); if (f?.path) { setRootPath(f.path); return; } }
      }
    }
    if (files.length && files[0].path) {
      const fp = files[0].path;
      const sep = fp.includes('\\') ? '\\' : '/';
      setRootPath(fp.substring(0, fp.lastIndexOf(sep)) || fp);
    }
  }, []);

  const browse = useCallback(async () => {
    const p = await window.electron.openFolderDialog();
    if (p) setRootPath(Array.isArray(p) ? p[0] : p);
  }, []);

  const startVerify = useCallback(async () => {
    if (!rootPath.trim()) return;
    setMode(MODE.RUNNING);
    setLines([]);
    setError(null);
    setExitCode(null);
    setPendingPrompt(null);
    setHasLowExif(false);
    const result = await window.electron.runVerifyScript({ rootPath });
    if (result?.error) { setError(result.error); setMode(MODE.SELECT); }
  }, [rootPath]);

  const submitInput = useCallback((value) => {
    const v = (value !== undefined ? value : inputValue).trim();
    setLines(prev => [...prev, { type: 'user_input', text: `> ${v || '(skip)'}` }]);
    setPendingPrompt(null);
    setInputValue('');
    window.electron.sendVerifyInput({ input: v });
  }, [inputValue]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitInput(); }
  }, [submitInput]);

  const answerYN = useCallback((ans) => {
    setLines(prev => [...prev, { type: 'user_input', text: `> ${ans}` }]);
    setPendingPrompt(null);
    setInputValue('');
    window.electron.sendVerifyInput({ input: ans });
  }, []);

  const cancelVerify = useCallback(() => {
    window.electron.cancelVerify();
    setMode(MODE.DONE);
    setPendingPrompt(null);
    setLines(prev => [...prev, { type: 'warning', text: '[Cancelled by user]' }]);
  }, []);

  const resetAll = useCallback(() => {
    setMode(MODE.SELECT); setLines([]); setError(null);
    setExitCode(null); setPendingPrompt(null); setHasLowExif(false);
  }, []);

  return (
    <div className="verify-root">
      <div className="verify-header">
        <button className="verify-back" onClick={onBack}>← Back</button>
        <div className="verify-title">
          <span className="verify-title-icon">◈</span>
          <span className="mono">Metadata Verifier</span>
        </div>
        {mode === MODE.RUNNING && (
          <button className="verify-cancel" onClick={cancelVerify}>✕ Cancel</button>
        )}
        {mode === MODE.DONE && (
          <span className={`verify-exit-badge ${exitCode === 0 ? 'badge-ok' : 'badge-warn'}`}>
            {exitCode === 0 ? '✓ Complete' : `Exit ${exitCode}`}
          </span>
        )}
      </div>

      <div className="verify-body">
        {mode === MODE.SELECT && (
          <div
            className={`verify-select ${isDragging ? 'vs-dragging' : ''}`}
            onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}   onDrop={handleDrop}
          >
            <div className="vs-icon">{isDragging ? '⬇' : '◈'}</div>
            <h2>{isDragging ? 'Release to set folder' : 'Select root folder'}</h2>
            <p className="vs-hint">
              Drop a folder here, or browse to a subject folder or dataset root.<br />
              Each subject needs a <code>metadata.json</code> and a <code>Historical/</code> folder.
            </p>
            <div className="vs-input-row">
              <input type="text" value={rootPath}
                onChange={e => setRootPath(e.target.value)}
                placeholder="C:\path\to\dataset  — or drop a folder above"
                onKeyDown={e => e.key === 'Enter' && startVerify()}
              />
              <button className="btn-vs-browse" onClick={browse}>Browse</button>
            </div>
            {error && (
              <div className="vs-error">
                {error.split('\n').map((l, i) => <div key={i}>{l || '\u00a0'}</div>)}
              </div>
            )}
            <button className="btn-vs-primary" onClick={startVerify} disabled={!rootPath.trim()}>
              Start Verification →
            </button>
          </div>
        )}

        {(mode === MODE.RUNNING || mode === MODE.DONE) && (
          <div className="vt-layout">
            <div className="vt-log">
              {lines.map((line, i) => <TermLine key={i} line={line} />)}
              <div ref={logEndRef} />
            </div>

            {mode === MODE.RUNNING && (
              <div className="vt-input-area">
                {pendingPrompt ? (
                  <div className="vt-prompt-box">
                    <div className="vt-prompt-label mono">
                      {pendingPrompt.type === 'prompt_yn'     && 'Answer yes or no:'}
                      {pendingPrompt.type === 'prompt_choice' && 'Enter choice number:'}
                      {pendingPrompt.type === 'prompt_date'   && 'Enter date (or leave blank to skip):'}
                      {pendingPrompt.type === 'prompt_folder' && 'Folder path:'}
                    </div>
                    {pendingPrompt.type === 'prompt_yn' ? (
                      <div className="vt-yn-buttons">
                        <button className="vt-btn-yes" onClick={() => answerYN('y')}>Yes</button>
                        <button className="vt-btn-no"  onClick={() => answerYN('n')}>No</button>
                      </div>
                    ) : (
                      <div className="vt-text-input-row">
                        <span className="vt-prompt-caret mono">›</span>
                        <input ref={inputRef} type="text" className="vt-text-input mono"
                          value={inputValue} onChange={e => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={pendingPrompt.type === 'prompt_date' ? 'YYYY-MM-DD  (blank = skip)' : ''}
                          autoFocus
                        />
                        <button className="vt-btn-submit" onClick={() => submitInput()}>Submit →</button>
                        {pendingPrompt.type === 'prompt_date' && (
                          <button className="vt-btn-skip" onClick={() => submitInput('')}>Skip</button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="vt-waiting mono">
                    <span className="vt-dot-anim">●</span> Processing...
                  </div>
                )}
              </div>
            )}

            {mode === MODE.DONE && (
              <div className="vt-done-footer">
                {hasLowExif && (
                  <span className="vt-low-exif-badge">⚠ low_exif_coverage.txt written to root folder</span>
                )}
                <button className="btn-vs-ghost" onClick={resetAll}>Verify another folder</button>
                <button className="btn-vs-primary" onClick={onBack}>← Back to home</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TermLine({ line }) {
  const cls = {
    info:          'tl-info',
    text:          'tl-text',
    stats:         'tl-stats',
    exif_cov:      line.text?.includes('[LOW]') ? 'tl-warn' : 'tl-ok',
    saved:         'tl-ok',
    done_subject:  'tl-muted',
    warning:       'tl-warn',
    error:         'tl-error',
    mismatch:      'tl-mismatch',
    report:        'tl-amber',
    subject:       'tl-subject',
    divider:       'tl-divider',
    summary:       'tl-ok',
    user_input:    'tl-user',
    prompt_yn:     'tl-prompt',
    prompt_choice: 'tl-prompt',
    prompt_date:   'tl-prompt',
    prompt_folder: 'tl-prompt',
  }[line.type] || 'tl-text';

  return <div className={`tl-line ${cls}`}>{line.text}</div>;
}
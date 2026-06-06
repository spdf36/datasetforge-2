// src/renderer/components/VerifyWorkspace.jsx
import React, { useState, useCallback, useRef } from 'react';
import './VerifyWorkspace.css';

const STEP = { SELECT:'SELECT', SCANNING:'SCANNING', LIST:'LIST', SUBJECT:'SUBJECT', DONE:'DONE' };

export default function VerifyWorkspace({ onBack }) {
  const [step, setStep]             = useState(STEP.SELECT);
  const [rootPath, setRootPath]     = useState('');
  const [subjects, setSubjects]     = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [analysis, setAnalysis]     = useState(null);
  const [analysing, setAnalysing]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError]           = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [removeSet, setRemoveSet]       = useState(new Set());
  const [addMap, setAddMap]             = useState({});
  const [updateMap, setUpdateMap]       = useState({});
  const [manualInputs, setManualInputs] = useState({});

  const browse = useCallback(async () => {
    const p = await window.electron.openFolderDialog();
    if (p) setRootPath(Array.isArray(p) ? p[0] : p);
  }, []);

  const handleDragEnter = useCallback((e) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragging(false);
    const items = Array.from(e.dataTransfer.items);
    const files = Array.from(e.dataTransfer.files);
    for (const item of items) {
      if (item.kind === 'file') { const entry = item.webkitGetAsEntry?.(); if (entry?.isDirectory) { const f = item.getAsFile(); if (f?.path) { setRootPath(f.path); return; } } }
    }
    if (files.length && files[0].path) { const fp = files[0].path; const sep = fp.includes('\\') ? '\\' : '/'; setRootPath(fp.substring(0, fp.lastIndexOf(sep)) || fp); }
  }, []);

  const startScan = useCallback(async () => {
    if (!rootPath) return;
    setStep(STEP.SCANNING); setError(null);
    const result = await window.electron.findSubjects(rootPath);
    if (result.error) { setError(result.error); setStep(STEP.SELECT); return; }
    if (!result.subjects.length) { setError('No valid subjects found. Each subject needs metadata.json with historic_capture_dates and a sibling Historical/ folder.'); setStep(STEP.SELECT); return; }
    setSubjects(result.subjects); setCurrentIdx(0); setStep(STEP.LIST);
  }, [rootPath]);

  const openSubject = useCallback(async (idx) => {
    setCurrentIdx(idx); setAnalysis(null); setAnalysing(true);
    setRemoveSet(new Set()); setAddMap({}); setUpdateMap({}); setManualInputs({});
    setStep(STEP.SUBJECT);
    const result = await window.electron.analyseSubject(subjects[idx]);
    setAnalysis(result);
    const autoUpdate = {};
    result.timeIssues.forEach(({ filename, dateValue }) => { autoUpdate[filename] = dateValue.slice(0, 10) + 'T00:00:00'; });
    setUpdateMap(autoUpdate);
    setAnalysing(false);
  }, [subjects]);

  const applyAndNext = useCallback(async () => {
    setSaving(true);
    await window.electron.applyFixes({ metaPath: subjects[currentIdx].metaPath, fixes: { remove: Array.from(removeSet), add: { ...addMap }, update: { ...updateMap } } });
    setSavedCount(n => n + 1); setSaving(false);
    const nextIdx = currentIdx + 1;
    if (nextIdx >= subjects.length) setStep(STEP.DONE); else openSubject(nextIdx);
  }, [removeSet, addMap, updateMap, subjects, currentIdx, openSubject]);

  const skipSubject = useCallback(() => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= subjects.length) setStep(STEP.DONE); else openSubject(nextIdx);
  }, [currentIdx, subjects, openSubject]);

  return (
    <div className="verify-root">
      <div className="verify-header">
        <button className="verify-back" onClick={onBack}>← Back</button>
        <div className="verify-title"><span className="verify-title-icon">◈</span><span className="mono">Metadata Verifier</span></div>
        {step === STEP.LIST    && <span className="verify-counter mono">{subjects.length} subject{subjects.length !== 1 ? 's' : ''} found</span>}
        {step === STEP.SUBJECT && analysis && <span className="verify-counter mono">{currentIdx + 1} / {subjects.length}</span>}
      </div>
      <div className="verify-body">
        {step === STEP.SELECT && (
          <div className={`verify-select ${isDragging ? 'vs-dragging' : ''}`} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
            <div className="vs-icon">{isDragging ? '⬇' : '◈'}</div>
            <h2>{isDragging ? 'Release to load folder' : 'Select root folder'}</h2>
            <p className="vs-hint">Drop a folder here or browse to a subject folder or dataset root.<br/>Each subject needs a <code>metadata.json</code> and a <code>Historical/</code> folder.</p>
            <div className="vs-input-row">
              <input type="text" value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="C:\path\to\dataset  — or drop a folder above" onKeyDown={e => e.key === 'Enter' && startScan()} />
              <button className="btn-vs-browse" onClick={browse}>Browse</button>
            </div>
            {error && <div className="vs-error">⚠ {error}</div>}
            <button className="btn-vs-primary" onClick={startScan} disabled={!rootPath.trim()}>Scan for subjects →</button>
          </div>
        )}
        {step === STEP.SCANNING && (<div className="verify-scanning"><div className="vs-spinner" /><p className="mono">Scanning for subjects...</p></div>)}
        {step === STEP.LIST && (
          <div className="verify-list">
            <div className="vl-toolbar"><span className="vl-title">Found {subjects.length} subject{subjects.length !== 1 ? 's' : ''} to verify</span><button className="btn-vs-primary" onClick={() => openSubject(0)}>Start Verification →</button></div>
            <div className="vl-items">
              {subjects.map((s, i) => (
                <div key={s.metaPath} className="vl-item" onClick={() => openSubject(i)}>
                  <span className="vl-idx mono">{String(i + 1).padStart(3, '0')}</span>
                  <span className="vl-name">{s.subjectName}</span>
                  <span className="vl-path mono truncate">{s.subjectPath}</span>
                  <span className="vl-arrow">→</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === STEP.SUBJECT && (
          <SubjectView subject={subjects[currentIdx]} analysis={analysis} analysing={analysing} saving={saving}
            removeSet={removeSet} setRemoveSet={setRemoveSet} addMap={addMap} setAddMap={setAddMap}
            updateMap={updateMap} setUpdateMap={setUpdateMap} manualInputs={manualInputs} setManualInputs={setManualInputs}
            onApply={applyAndNext} onSkip={skipSubject} isLast={currentIdx === subjects.length - 1} />
        )}
        {step === STEP.DONE && (
          <div className="verify-done">
            <div className="vd-icon">✓</div>
            <h2>Verification complete</h2>
            <p>{savedCount} subject{savedCount !== 1 ? 's' : ''} updated · {subjects.length - savedCount} skipped</p>
            <div className="vd-actions">
              <button className="btn-vs-primary" onClick={() => { setStep(STEP.SELECT); setRootPath(''); setSavedCount(0); }}>Verify another folder</button>
              <button className="btn-vs-ghost" onClick={onBack}>Back to home</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectView({ subject, analysis, analysing, saving, removeSet, setRemoveSet, addMap, setAddMap, updateMap, setUpdateMap, manualInputs, setManualInputs, onApply, onSkip, isLast }) {
  if (analysing || !analysis) return (<div className="verify-scanning"><div className="vs-spinner" /><p className="mono">Analysing {subject.subjectName}...</p></div>);
  const hasIssues = analysis.timeIssues.length || analysis.stale.length || analysis.unlisted.length || analysis.dateMismatch.length;
  const toggleRemove = (f) => setRemoveSet(prev => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const toggleUpdate = (f, d) => setUpdateMap(prev => { const n = { ...prev }; if (n[f]) delete n[f]; else n[f] = d; return n; });
  const setManualAdd = (f, v) => setManualInputs(prev => ({ ...prev, [f]: v }));
  const confirmManualAdd = (f) => { const v = (manualInputs[f] || '').trim(); const m = v.match(/^(\d{4}-\d{2}-\d{2})/); if (m) setAddMap(prev => ({ ...prev, [f]: m[1] + 'T00:00:00' })); };
  const addWithExif = (f, d) => setAddMap(prev => ({ ...prev, [f]: d + 'T00:00:00' }));
  const removeAdd = (f) => setAddMap(prev => { const n = { ...prev }; delete n[f]; return n; });
  return (
    <div className="subject-view">
      <div className="sv-header">
        <div className="sv-name">{analysis.subjectName}</div>
        <div className="sv-stats">
          <Stat label="On disk" value={analysis.totalDisk} />
          <Stat label="In JSON" value={analysis.totalJson} ok={analysis.totalDisk === analysis.totalJson} />
          <Stat label="Clean"   value={analysis.clean.length} color="green" />
          {analysis.dateMismatch.length > 0 && <Stat label="Mismatch" value={analysis.dateMismatch.length} color="red" />}
          {analysis.stale.length > 0        && <Stat label="Stale"    value={analysis.stale.length}        color="red" />}
          {analysis.unlisted.length > 0      && <Stat label="Unlisted" value={analysis.unlisted.length}    color="amber" />}
          {analysis.timeIssues.length > 0    && <Stat label="Time fix" value={analysis.timeIssues.length}  color="cyan" />}
          {analysis.noExif.length > 0        && <Stat label="Manual"   value={analysis.noExif.length}      color="purple" />}
        </div>
        <div className={`sv-exif-cov ${analysis.exifOk ? 'exif-ok' : 'exif-low'}`}>
          <span className="exif-cov-label">EXIF coverage</span>
          <span className="exif-cov-pct">{analysis.exifPct?.toFixed(1)}%</span>
          <span className="exif-cov-detail">{analysis.exifCount}/{analysis.totalDisk} images</span>
          <span className={`exif-cov-badge ${analysis.exifOk ? 'badge-ok' : 'badge-warn'}`}>{analysis.exifOk ? '✓ OK' : '⚠ below 25%'}</span>
        </div>
      </div>
      <div className="sv-body">
        {!hasIssues ? (
          <div className="sv-all-clean">
            <div className="clean-banner">
              <div className="clean-icon-wrap">✓</div>
              <div className="clean-text">
                <h3>All checks confirmed — no issues found</h3>
                <p>{analysis.clean.length + analysis.noExif.length} image{(analysis.clean.length + analysis.noExif.length) !== 1 ? 's' : ''} verified · {analysis.clean.length} matched against EXIF · {analysis.noExif.length} manually dated · JSON and Historical folder are in sync</p>
              </div>
            </div>
            <div className="clean-file-list">
              <div className="clean-file-header"><span style={{width:28}}>#</span><span style={{flex:1}}>Filename</span><span style={{width:160}}>Date in JSON</span><span style={{width:70}}>Source</span></div>
              {[...analysis.clean.map(f => [f,'exif']), ...analysis.noExif.map(({filename}) => [filename,'manual'])]
                .sort(([a],[b]) => a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}))
                .map(([filename, source], i) => (
                  <div key={filename} className="clean-file-row">
                    <span className="cfr-idx mono">{String(i+1).padStart(2,'0')}</span>
                    <span className="cfr-name">{filename}</span>
                    <span className="cfr-date">{(analysis.allDates?.[filename]||'').slice(0,10)}</span>
                    <span className={`cfr-source ${source==='exif'?'cfr-source-exif':'cfr-source-manual'}`}>{source}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <>
            {analysis.timeIssues.length > 0 && (
              <IssueSection title="Time Auto-Fix" color="cyan" count={analysis.timeIssues.length} hint="These entries have non-zero time and will be automatically zeroed to T00:00:00 on apply.">
                {analysis.timeIssues.map(({filename, dateValue}) => (<IssueRow key={filename}><span className="ir-file mono">{filename}</span><span className="ir-old mono">{dateValue}</span><span className="ir-arrow">→</span><span className="ir-new mono">{dateValue.slice(0,10)}T00:00:00</span><span className="badge-auto">auto</span></IssueRow>))}
              </IssueSection>
            )}
            {analysis.stale.length > 0 && (
              <IssueSection title="Stale Entries" color="red" count={analysis.stale.length} hint="These filenames are in the JSON but the image file does not exist on disk.">
                {analysis.stale.map(({filename, dateValue}) => (<IssueRow key={filename}><span className="ir-file mono">{filename}</span><span className="ir-old mono">{dateValue}</span><span className="ir-badge-missing">file not found</span><label className="ir-toggle"><input type="checkbox" checked={removeSet.has(filename)} onChange={() => toggleRemove(filename)} />Remove from JSON</label></IssueRow>))}
              </IssueSection>
            )}
            {analysis.unlisted.length > 0 && (
              <IssueSection title="Unlisted Images" color="amber" count={analysis.unlisted.length} hint="These images are in the Historical folder but have no entry in the JSON.">
                {analysis.unlisted.map(({filename, exifDate}) => (
                  <IssueRow key={filename}>
                    <span className="ir-file mono">{filename}</span>
                    {exifDate ? (<><span className="ir-exif mono">EXIF: {exifDate}</span>{addMap[filename] ? (<><span className="ir-new mono">{addMap[filename]}</span><button className="btn-ir-undo" onClick={() => removeAdd(filename)}>undo</button></>) : (<button className="btn-ir-add" onClick={() => addWithExif(filename, exifDate)}>+ Add with EXIF date</button>)}</>) : (<><span className="ir-badge-noexif">no EXIF</span>{addMap[filename] ? (<><span className="ir-new mono">{addMap[filename]}</span><button className="btn-ir-undo" onClick={() => removeAdd(filename)}>undo</button></>) : (<div className="ir-manual-row"><input type="date" value={manualInputs[filename]||''} onChange={e => setManualAdd(filename, e.target.value)} onKeyDown={e => e.key==='Enter' && confirmManualAdd(filename)} /><button className="btn-ir-add" onClick={() => confirmManualAdd(filename)} disabled={!manualInputs[filename]}>+ Add</button></div>)}</>)}
                  </IssueRow>
                ))}
              </IssueSection>
            )}
            {analysis.dateMismatch.length > 0 && (
              <IssueSection title="Date Mismatches" color="red" count={analysis.dateMismatch.length} hint="The date in the JSON does not match the EXIF date on the image file."
                actions={<div className="iss-bulk-actions"><button className="btn-ir-bulk" onClick={() => { const all={}; analysis.dateMismatch.forEach(({filename,exifDate}) => {all[filename]=exifDate+'T00:00:00';}); setUpdateMap(prev=>({...prev,...all})); }}>Fix all</button><button className="btn-ir-bulk-ghost" onClick={() => { const n={...updateMap}; analysis.dateMismatch.forEach(({filename}) => delete n[filename]); setUpdateMap(n); }}>Skip all</button></div>}>
                {analysis.dateMismatch.map(({filename, dateValue, exifDate}) => { const fixed=exifDate+'T00:00:00'; return (<IssueRow key={filename}><span className="ir-file mono">{filename}</span><span className="ir-old mono">{dateValue}</span><span className="ir-arrow">→</span><span className="ir-new mono">{fixed}</span><label className="ir-toggle"><input type="checkbox" checked={updateMap[filename]===fixed} onChange={() => toggleUpdate(filename, fixed)} />Fix</label></IssueRow>); })}
              </IssueSection>
            )}
          </>
        )}
      </div>
      <div className="sv-footer">
        <button className="btn-vs-ghost" onClick={onSkip} disabled={saving}>{isLast ? 'Skip & Finish' : 'Skip →'}</button>
        <button className="btn-vs-primary" onClick={onApply} disabled={saving}>{saving ? 'Saving...' : isLast ? '✓ Apply & Finish' : '✓ Apply & Next →'}</button>
      </div>
    </div>
  );
}

function Stat({ label, value, color, ok }) {
  const cls = color ? `stat-${color}` : ok === false ? 'stat-red' : '';
  return (<div className={`sv-stat ${cls}`}><span className="stat-val">{value}</span><span className="stat-lbl">{label}</span></div>);
}
function IssueSection({ title, color, count, hint, actions, children }) {
  return (<div className={`issue-section iss-${color}`}><div className="iss-header"><div className="iss-title-row"><span className={`iss-dot iss-dot-${color}`} /><span className="iss-title">{title}</span><span className="iss-count mono">{count}</span></div>{hint && <p className="iss-hint">{hint}</p>}{actions}</div><div className="iss-rows">{children}</div></div>);
}
function IssueRow({ children }) { return <div className="issue-row">{children}</div>; }
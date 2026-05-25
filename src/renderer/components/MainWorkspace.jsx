// src/renderer/components/MainWorkspace.jsx
import React, { useState, useCallback } from 'react';
import { WORKSPACE_MODE } from './WorkspaceLayout';
import './MainWorkspace.css';

export default function MainWorkspace({
  mode, allImages, rootPath, selectedBatchPath,
  validationResult, referenceImageSrc,
  historicalDates, missingDateQueue,
  onUpdateDate, onStartJsonCreation, onSaveDirectly,
  onRenameFolder, isProcessing, outputPath, writeStatus,
  copiedCameraFields, setCopiedCameraFields, copyFeedback, setCopyFeedback,
  onRefresh,
}) {
  return (
    <div className="main-workspace">
      {mode === WORKSPACE_MODE.IMAGE_LIST && (
        <ImageListView
          allImages={allImages}
          rootPath={rootPath}
          selectedBatchPath={selectedBatchPath}
          validationResult={validationResult}
          onStartJsonCreation={onStartJsonCreation}
          isProcessing={isProcessing}
        />
      )}
      {mode === WORKSPACE_MODE.VALIDATION_ERROR && (
        <ValidationErrorView
          validationResult={validationResult}
          selectedBatchPath={selectedBatchPath}
          onRenameFolder={onRenameFolder}
          onRefresh={onRefresh}
        />
      )}
      {mode === WORKSPACE_MODE.JSON_CREATION && (
        <JsonCreationView
          referenceImageSrc={referenceImageSrc}
          historicalDates={historicalDates}
          missingDateQueue={missingDateQueue}
          selectedBatchPath={selectedBatchPath}
          isProcessing={isProcessing}
          onUpdateDate={onUpdateDate}
          onSaveDirectly={onSaveDirectly}
          copiedCameraFields={copiedCameraFields}
          setCopiedCameraFields={setCopiedCameraFields}
          copyFeedback={copyFeedback}
          setCopyFeedback={setCopyFeedback}
        />
      )}
      {mode === WORKSPACE_MODE.COMPLETE && (
        <CompleteView outputPath={outputPath} writeStatus={writeStatus} />
      )}
    </div>
  );
}

// ── Image List View ──────────────────────────────────────────────
function ImageListView({ allImages, rootPath, selectedBatchPath, validationResult, onStartJsonCreation, isProcessing }) {
  const canStart = selectedBatchPath && validationResult?.valid;

  return (
    <div className="ws-view">
      <div className="ws-toolbar">
        <div className="ws-toolbar-left">
          <span className="ws-title">Dataset Images</span>
          <span className="ws-badge">{allImages.length} files</span>
        </div>
        <div className="ws-toolbar-right">
          {canStart && (
            <button
              className="btn btn-primary"
              onClick={onStartJsonCreation}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <><span className="btn-spinner" /> Processing...</>
              ) : (
                <><span>⊕</span> Start JSON Creation</>
              )}
            </button>
          )}
          {selectedBatchPath && !validationResult?.valid && (
            <div className="inline-warning">
              <span>⚠</span> Select a valid batch folder to continue
            </div>
          )}
        </div>
      </div>

      {!selectedBatchPath && (
        <div className="ws-empty-hint">
          <div className="empty-icon">◈</div>
          <p>Select a batch folder from the file explorer to begin.</p>
          <p className="hint-sub">A valid batch must contain <code>Historical</code>, <code>Present_Neutral</code>, and a <code>Pose_Variation</code> subfolder.</p>
        </div>
      )}

      {allImages.length > 0 && (
        <div className="image-list-wrap">
          <table className="image-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Filename</th>
                <th>Relative Path</th>
                <th>Extension</th>
              </tr>
            </thead>
            <tbody>
              {allImages.map((img, i) => (
                <tr key={img.path} className={img.path.startsWith(selectedBatchPath || '__') ? 'row-highlighted' : ''}>
                  <td className="col-idx mono">{String(i + 1).padStart(3, '0')}</td>
                  <td className="col-name">
                    <span className="file-dot" style={{ color: extColor(img.ext) }}>◼</span>
                    {img.name}
                  </td>
                  <td className="col-path mono">{img.relativePath}</td>
                  <td className="col-ext mono">{img.ext}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function extColor(ext) {
  const map = { '.jpg': '#f59e0b', '.jpeg': '#f59e0b', '.png': '#60a5fa', '.tiff': '#a78bfa', '.tif': '#a78bfa', '.heic': '#34d399', '.raw': '#f87171', '.cr2': '#f87171' };
  return map[ext] || '#535b6e';
}

// ── Validation Error View ────────────────────────────────────────
function ValidationErrorView({ validationResult, selectedBatchPath, onRenameFolder, onRefresh }) {
  const [renameTarget, setRenameTarget] = useState(null);

  const handleRenameClick = (missingName) => {
    // Find a candidate folder (with wrong name) to rename
    setRenameTarget({
      suggestedPath: `${selectedBatchPath}/${missingName}_WRONG`,
      targetName: missingName,
      batchPath: selectedBatchPath,
    });
  };

  return (
    <div className="ws-view">
      <div className="ws-toolbar">
        <span className="ws-title">Folder Validation</span>
        <span className="status-pill status-error">Invalid Structure</span>
      </div>

      <div className="validation-panel">
        <div className="validation-header">
          <span className="val-icon error">✕</span>
          <div>
            <h2>Batch folder structure is invalid</h2>
            <p className="val-path mono">{selectedBatchPath}</p>
          </div>
        </div>

        <div className="validation-grid">
          {/* Required folders status */}
          {['Historical', 'Present_Neutral'].map(name => {
            const found = validationResult?.found?.includes(name);
            return (
              <FolderStatusRow
                key={name}
                name={name}
                required
                found={found}
                batchPath={selectedBatchPath}
                onRename={onRenameFolder}
                foundFolders={validationResult?.found || []}
              />
            );
          })}

          {/* Pose variant */}
          <PoseVariantRow
            found={validationResult?.found || []}
            batchPath={selectedBatchPath}
            onRename={onRenameFolder}
          />
        </div>

        <div className="validation-hint">
          <span className="hint-icon">ℹ</span>
          Use the <strong>Rename</strong> button to fix a misnamed folder in-place. Changes reflect immediately on disk.
        </div>

        <button className="btn btn-secondary" onClick={onRefresh} style={{ marginTop: 12 }}>
          ↻ Re-validate
        </button>
      </div>
    </div>
  );
}

function FolderStatusRow({ name, found, batchPath, onRename, foundFolders }) {
  const [renaming, setRenaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Candidates: found folders not matching required names
  const REQUIRED = new Set(['Historical', 'Present_Neutral', 'Pose_Variation_A', 'Pose_Variation_B']);
  const candidates = foundFolders.filter(f => !REQUIRED.has(f));

  const doRename = async () => {
    if (!selectedSource) return;
    const oldPath = `${batchPath}/${selectedSource}`;
    const result = await onRename(oldPath, name);
    if (result.success) {
      setFeedback({ ok: true, msg: 'Renamed successfully' });
      setRenaming(false);
    } else {
      setFeedback({ ok: false, msg: result.error });
    }
  };

  return (
    <div className={`val-row ${found ? 'val-ok' : 'val-missing'}`}>
      <div className="val-row-main">
        <span className={`val-status ${found ? 'ok' : 'err'}`}>{found ? '✓' : '✕'}</span>
        <span className="val-folder-name mono">{name}</span>
        <span className={`val-label ${found ? 'found' : 'missing'}`}>{found ? 'found' : 'missing'}</span>
        {!found && !renaming && (
          <button className="btn-inline" onClick={() => setRenaming(true)}>Rename existing →</button>
        )}
      </div>

      {renaming && (
        <div className="rename-inline">
          <span className="rename-label">Rename which folder to <strong>{name}</strong>?</span>
          <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)}>
            <option value="">— pick a folder —</option>
            {candidates.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="rename-actions">
            <button className="btn btn-sm btn-primary" onClick={doRename} disabled={!selectedSource}>Apply</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
          {feedback && (
            <span className={`rename-feedback ${feedback.ok ? 'ok' : 'err'}`}>{feedback.msg}</span>
          )}
        </div>
      )}
    </div>
  );
}

function PoseVariantRow({ found, batchPath, onRename }) {
  const hasA = found.includes('Pose_Variation_A');
  const hasB = found.includes('Pose_Variation_B');
  const hasPose = hasA || hasB;
  const [renaming, setRenaming] = useState(false);
  const [targetVariant, setTargetVariant] = useState('Pose_Variation_A');
  const [selectedSource, setSelectedSource] = useState('');
  const [feedback, setFeedback] = useState(null);

  const REQUIRED = new Set(['Historical', 'Present_Neutral', 'Pose_Variation_A', 'Pose_Variation_B']);
  const candidates = found.filter(f => !REQUIRED.has(f));

  const doRename = async () => {
    if (!selectedSource) return;
    const oldPath = `${batchPath}/${selectedSource}`;
    const result = await onRename(oldPath, targetVariant);
    if (result.success) setFeedback({ ok: true, msg: 'Renamed' });
    else setFeedback({ ok: false, msg: result.error });
    setRenaming(false);
  };

  return (
    <div className={`val-row ${hasPose ? 'val-ok' : 'val-missing'}`}>
      <div className="val-row-main">
        <span className={`val-status ${hasPose ? 'ok' : 'err'}`}>{hasPose ? '✓' : '✕'}</span>
        <span className="val-folder-name mono">Pose_Variation_A / B</span>
        <span className={`val-label ${hasPose ? 'found' : 'missing'}`}>
          {hasPose ? (hasA ? 'Pose_Variation_A found' : 'Pose_Variation_B found') : 'missing'}
        </span>
        {!hasPose && !renaming && (
          <button className="btn-inline" onClick={() => setRenaming(true)}>Rename existing →</button>
        )}
      </div>

      {renaming && (
        <div className="rename-inline">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="rename-label">Rename to:</span>
            <select value={targetVariant} onChange={e => setTargetVariant(e.target.value)} style={{ width: 'auto' }}>
              <option value="Pose_Variation_A">Pose_Variation_A</option>
              <option value="Pose_Variation_B">Pose_Variation_B</option>
            </select>
          </div>
          <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)}>
            <option value="">— pick source folder —</option>
            {candidates.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="rename-actions">
            <button className="btn btn-sm btn-primary" onClick={doRename} disabled={!selectedSource}>Apply</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
          {feedback && <span className={`rename-feedback ${feedback.ok ? 'ok' : 'err'}`}>{feedback.msg}</span>}
        </div>
      )}
    </div>
  );
}

// ── JSON Creation View — Interactive Image Grid ──────────────────
function JsonCreationView({
  referenceImageSrc, historicalDates, missingDateQueue,
  selectedBatchPath, isProcessing, onUpdateDate, onSaveDirectly,
  copiedCameraFields, setCopiedCameraFields, copyFeedback, setCopyFeedback,
}) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [allHistoricalImages, setAllHistoricalImages] = useState([]);
  const [loadedSrcs, setLoadedSrcs] = useState({});
  const [editingDate, setEditingDate] = useState('');
  const [editingTime, setEditingTime] = useState('12:00');
  const [editingAmPm, setEditingAmPm] = useState('AM');
  const [loadingImages, setLoadingImages] = useState(true);
  const [imageCameraStatus, setImageCameraStatus] = useState({});
  const [cameraFields, setCameraFields] = useState({
    make: '', model: '', fNumber: '', exposureTime: '',
    iso: '', exposureBias: '', focalLength: '', meteringMode: '', flash: '',
  });
  const [cameraFieldsExpanded, setCameraFieldsExpanded] = useState(false);

  const CAMERA_PRESETS = [
    // ── Samsung ──────────────────────────────────────────────
    {
      label: 'Samsung Galaxy S8 (2017)',
      make: 'Samsung', model: 'SM-G950F',
      fNumber: '1.7', exposureTime: '1/50', iso: '64',
      exposureBias: '0', focalLength: '4.2 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Samsung Galaxy S10 (2019)',
      make: 'Samsung', model: 'SM-G973F',
      fNumber: '1.5', exposureTime: '1/100', iso: '50',
      exposureBias: '0', focalLength: '4.3 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Samsung Galaxy S20 (2020)',
      make: 'Samsung', model: 'SM-G980F',
      fNumber: '1.8', exposureTime: '1/120', iso: '50',
      exposureBias: '0', focalLength: '5.4 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Samsung Galaxy S21 (2021)',
      make: 'Samsung', model: 'SM-G991B',
      fNumber: '1.8', exposureTime: '1/125', iso: '50',
      exposureBias: '0', focalLength: '6.7 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Samsung Galaxy S23 (2023)',
      make: 'Samsung', model: 'SM-S911B',
      fNumber: '1.8', exposureTime: '1/200', iso: '50',
      exposureBias: '0', focalLength: '6.3 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    // ── Apple ─────────────────────────────────────────────────
    {
      label: 'Apple iPhone X (2017)',
      make: 'Apple', model: 'iPhone X',
      fNumber: '1.8', exposureTime: '1/120', iso: '25',
      exposureBias: '0', focalLength: '4.0 mm',
      meteringMode: 'Multi-segment', flash: 'Off, Did not fire',
    },
    {
      label: 'Apple iPhone 11 (2019)',
      make: 'Apple', model: 'iPhone 11',
      fNumber: '1.8', exposureTime: '1/121', iso: '32',
      exposureBias: '0', focalLength: '4.25 mm',
      meteringMode: 'Multi-segment', flash: 'Off, Did not fire',
    },
    {
      label: 'Apple iPhone 13 Pro (2021)',
      make: 'Apple', model: 'iPhone 13 Pro',
      fNumber: '1.5', exposureTime: '1/33', iso: '500',
      exposureBias: '0', focalLength: '5.7 mm',
      meteringMode: 'Multi-segment', flash: 'Off, Did not fire',
    },
    {
      label: 'Apple iPhone 14 (2022)',
      make: 'Apple', model: 'iPhone 14',
      fNumber: '1.5', exposureTime: '1/100', iso: '32',
      exposureBias: '0', focalLength: '5.7 mm',
      meteringMode: 'Multi-segment', flash: 'Off, Did not fire',
    },
    {
      label: 'Apple iPhone 15 Pro (2023)',
      make: 'Apple', model: 'iPhone 15 Pro',
      fNumber: '1.78', exposureTime: '1/200', iso: '50',
      exposureBias: '0', focalLength: '6.8 mm',
      meteringMode: 'Multi-segment', flash: 'Off, Did not fire',
    },
    // ── Google Pixel ──────────────────────────────────────────
    {
      label: 'Google Pixel 4 (2019)',
      make: 'Google', model: 'Pixel 4',
      fNumber: '1.7', exposureTime: '1/120', iso: '54',
      exposureBias: '0', focalLength: '4.4 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Google Pixel 5 (2020)',
      make: 'Google', model: 'Pixel 5',
      fNumber: '1.7', exposureTime: '1/150', iso: '50',
      exposureBias: '0', focalLength: '4.4 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
    {
      label: 'Google Pixel 7 (2022)',
      make: 'Google', model: 'Pixel 7',
      fNumber: '1.85', exposureTime: '1/200', iso: '50',
      exposureBias: '0', focalLength: '6.8 mm',
      meteringMode: 'Center-weighted average', flash: 'Off, Did not fire',
    },
  ];

  const applyPreset = (presetLabel) => {
    if (!presetLabel) return;
    const preset = CAMERA_PRESETS.find(p => p.label === presetLabel);
    if (!preset) return;
    // Destructure label out — it must NOT go into cameraFields or the image meta
    const { label, ...fields } = preset;
    setCameraFields(fields);
  };

  const handleCopyMeta = async () => {
    if (!selectedImage) return;
    // Read current EXIF from the image via ExifTool
    const exifData = await window.electron.readCameraMetadata(selectedImage.path);
    if (exifData) {
      setCopiedCameraFields(exifData);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const handlePasteMeta = async () => {
    if (!selectedImage || !copiedCameraFields) return;
    setCameraFields(copiedCameraFields);
    setCameraFieldsExpanded(true);
    // Mark as having camera meta so re-select won't clear the pasted fields
    setImageCameraStatus(prev => ({ ...prev, [selectedImage.name]: true }));
    // Write to disk
    await window.electron.writeCameraMetadata({
      filePath: selectedImage.path,
      cameraFields: copiedCameraFields,
    });
  };

  // Load all historical image thumbnails once
  React.useEffect(() => {
    if (!selectedBatchPath) return;
    let cancelled = false;
    (async () => {
      setLoadingImages(true);
      setLoadedSrcs({});
      const historicalPath = `${selectedBatchPath}/Historical`;
      const images = await window.electron.getImagesInFolder(historicalPath);
      if (cancelled) return;
      setAllHistoricalImages(images);

      // Load thumbnails in parallel batches of 20
      const BATCH = 20;
      for (let i = 0; i < images.length; i += BATCH) {
        if (cancelled) return;
        const batch = images.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(img => window.electron.readImageAsBase64(img.path))
        );
        if (cancelled) return;
        setLoadedSrcs(prev => {
          const next = { ...prev };
          batch.forEach((img, idx) => { if (results[idx]) next[img.name] = results[idx]; });
          return next;
        });
      }
      setLoadingImages(false);
    })();
    return () => { cancelled = true; };
  }, [selectedBatchPath]);

  const handleSelectImage = async (img) => {
    const alreadySelected = selectedImage?.name === img.name;
    setSelectedImage(img);
    const existing = historicalDates[img.name];
    setEditingDate(existing ? existing.slice(0, 10) : '');
    if (existing && existing.length > 10) {
      const [hStr, mStr] = existing.slice(11, 16).split(':');
      let h = parseInt(hStr, 10) || 0;
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setEditingTime(`${String(h).padStart(2, '0')}:${mStr || '00'}`);
      setEditingAmPm(ampm);
    } else {
      setEditingTime('12:00');
      setEditingAmPm('AM');
    }
    // If same image re-selected right after paste, keep pasted fields visible
    if (alreadySelected) return;
    const exifData = await window.electron.readCameraMetadata(img.path);
    if (exifData) {
      setCameraFields(exifData);
      setCameraFieldsExpanded(false);
      setImageCameraStatus(prev => ({ ...prev, [img.name]: true }));
    } else {
      setCameraFields({ make: '', model: '', fNumber: '', exposureTime: '', iso: '', exposureBias: '', focalLength: '', meteringMode: '', flash: '' });
      setImageCameraStatus(prev => ({ ...prev, [img.name]: false }));
    }
  };

  const handleConfirmDate = () => {
    if (!editingDate || !selectedImage) return;
    // Convert 12-hour to 24-hour for storage
    const [hStr, mStr] = editingTime.split(':');
    let h = parseInt(hStr, 10) || 0;
    if (editingAmPm === 'AM' && h === 12) h = 0;
    if (editingAmPm === 'PM' && h !== 12) h += 12;
    const time24 = `${String(h).padStart(2, '0')}:${mStr || '00'}`;
    onUpdateDate(selectedImage.name, editingDate, time24);
    const missingNames = missingDateQueue.map(m => m.name).filter(n => n !== selectedImage.name);
    const nextMissing = allHistoricalImages.find(img => missingNames.includes(img.name));
    if (nextMissing) {
      setSelectedImage(nextMissing);
      setEditingDate('');
      setEditingTime('12:00');
      setEditingAmPm('AM');
    } else {
      setSelectedImage(null);
      setEditingDate('');
    }
  };

  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  const handleRemoveDate = async () => {
    if (!selectedImage) return;
    setRemoving(true);
    setRemoveError(null);
    const result = await window.electron.removeDate(selectedImage.path);
    setRemoving(false);
    if (result.success) {
      onUpdateDate(selectedImage.name, null);
      setEditingDate('');
    } else {
      setRemoveError(result.error || 'Failed to remove EXIF data');
    }
  };

  const missingCount = missingDateQueue.length;
  const totalCount = allHistoricalImages.length;
  const resolvedCount = totalCount - missingCount;
  const allResolved = missingCount === 0 && totalCount > 0;

  return (
    <div className="ws-view">
      <div className="ws-toolbar">
        <div className="ws-toolbar-left">
          <span className="ws-title">Historical Images — Capture Dates</span>
          <span className="ws-badge">{resolvedCount}/{totalCount} dated</span>
          {missingCount > 0 && (
            <span className="ws-badge badge-warn">{missingCount} missing</span>
          )}
        </div>
        <div className="ws-toolbar-right">
          {missingCount > 0 && (
            <span className="inline-warning" style={{ fontSize: 10 }}>
              ⚠ {missingCount} image{missingCount !== 1 ? 's' : ''} still missing dates
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={onSaveDirectly}
            disabled={totalCount === 0}
            title={missingCount > 0 ? `Save now — ${missingCount} image(s) will have no date` : 'Save metadata.json'}
          >
            ⊕ Save metadata.json
          </button>
        </div>
      </div>

      {isProcessing ? (
        <div className="ws-processing">
          <div className="proc-spinner" />
          <p className="mono">Extracting EXIF metadata via ExifTool...</p>
        </div>
      ) : (
        <div className="grid-layout">

          {/* Left: image grid */}
          <div className="hist-grid-wrap">
            {/* Reference image strip */}
            {referenceImageSrc && (
              <div className="ref-strip">
                <span className="ref-strip-label mono">PRESENT_NEUTRAL reference</span>
                <img src={referenceImageSrc} alt="Reference" className="ref-strip-img" />
              </div>
            )}

            <div className="hist-grid">
              {loadingImages && allHistoricalImages.length === 0 && (
                <div className="grid-loading mono">Loading images...</div>
              )}
              {allHistoricalImages.map(img => {
                const hasMeta = !!historicalDates[img.name];
                const isMissing = missingDateQueue.some(m => m.name === img.name);
                const isSelected = selectedImage?.name === img.name;
                return (
                  <div
                    key={img.name}
                    className={`grid-cell ${isSelected ? 'grid-cell-selected' : ''} ${isMissing ? 'grid-cell-missing' : 'grid-cell-ok'}`}
                    onClick={() => handleSelectImage(img)}
                    title={img.name}
                  >
                    {loadedSrcs[img.name] ? (
                      <img src={loadedSrcs[img.name]} alt={img.name} className="grid-thumb" />
                    ) : (
                      <div className="grid-thumb-placeholder">…</div>
                    )}
                    <div className="grid-cell-footer">
                      <span className="grid-cell-name truncate">{img.name}</span>
                      <span className={`grid-cell-badge ${hasMeta ? 'badge-ok' : 'badge-missing'}`}>
                        {hasMeta ? '✓' : '?'}
                      </span>
                    </div>
                    {hasMeta && (
                      <div className="grid-cell-date mono">
                        {historicalDates[img.name].slice(0, 16).replace('T', ' ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: date editor for selected image */}
          <div className="date-editor-panel">
            {selectedImage ? (
              <>
                <div className="date-editor-header">
                  <span className="section-label mono">
                    <span className="accent-dot" /> SELECTED IMAGE
                  </span>
                  <span className="date-editor-filename mono truncate">{selectedImage.name}</span>
                  <div className="copy-paste-row">
                    <button
                      className="btn-copy-meta"
                      onClick={handleCopyMeta}
                      title="Copy camera metadata from this image"
                    >
                      {copyFeedback ? '✓ Copied' : '⎘ Copy Meta'}
                    </button>
                    {copiedCameraFields && (
                      <button
                        className="btn-paste-meta"
                        onClick={handlePasteMeta}
                        title="Paste copied camera metadata into this image"
                      >
                        ⎘ Paste Meta
                      </button>
                    )}
                  </div>
                </div>

                <div className="date-editor-preview">
                  {loadedSrcs[selectedImage.name] ? (
                    <img src={loadedSrcs[selectedImage.name]} alt={selectedImage.name} className="date-editor-img" />
                  ) : (
                    <div className="date-editor-img-placeholder">Loading...</div>
                  )}
                </div>

                <div className="date-editor-status">
                  {historicalDates[selectedImage.name] ? (
                    <div className="date-found">
                      <span className="status-ok-dot">✓</span>
                      <div>
                        <div className="date-found-label">EXIF date found</div>
                        <div className="date-found-value mono">{historicalDates[selectedImage.name]}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="date-missing-tag">
                      <span>⚠</span> No EXIF date — enter manually
                    </div>
                  )}
                </div>

                <div className="date-editor-input-wrap">
                  <label className="field-label mono">Capture date</label>
                  <input
                    type="date"
                    value={editingDate}
                    onChange={e => setEditingDate(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmDate()}
                    autoFocus
                  />
                  <label className="field-label mono" style={{ marginTop: 8 }}>Capture time</label>
                  <div className="time-input-row">
                    <input
                      type="time"
                      value={(() => {
                        const [hStr, mStr] = editingTime.split(':');
                        let h = parseInt(hStr, 10) || 12;
                        if (editingAmPm === 'AM' && h === 12) h = 0;
                        if (editingAmPm === 'PM' && h !== 12) h += 12;
                        return `${String(h).padStart(2,'0')}:${mStr||'00'}`;
                      })()}
                      onChange={e => {
                        const [hStr, mStr] = e.target.value.split(':');
                        let h = parseInt(hStr, 10) || 0;
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12 || 12;
                        setEditingTime(`${String(h).padStart(2,'0')}:${mStr||'00'}`);
                        setEditingAmPm(ampm);
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      className={`ampm-toggle ${editingAmPm === 'AM' ? 'ampm-am' : 'ampm-pm'}`}
                      onClick={() => setEditingAmPm(p => p === 'AM' ? 'PM' : 'AM')}
                      type="button"
                    >
                      {editingAmPm}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={handleConfirmDate}
                    disabled={!editingDate}
                  >
                    ✓ {historicalDates[selectedImage.name] ? 'Update Date' : 'Set Date'}
                  </button>
                  {historicalDates[selectedImage.name] && (
                    <button
                      className="btn btn-remove-date"
                      style={{ marginTop: 6, width: '100%' }}
                      onClick={handleRemoveDate}
                      disabled={removing}
                    >
                      {removing ? '...' : '✕ Remove EXIF Date'}
                    </button>
                  )}
                  {removeError && (
                    <p style={{ fontSize: 10, color: 'var(--accent-red)', marginTop: 4 }}>
                      {removeError}
                    </p>
                  )}
                </div>

                {/* Camera metadata — shown for ALL images */}
                <div className="camera-fields-section">
                  <button
                    className="camera-fields-toggle"
                    onClick={() => setCameraFieldsExpanded(p => !p)}
                  >
                    <span className="camera-toggle-icon">{cameraFieldsExpanded ? '▾' : '▸'}</span>
                    <span className="field-label mono">Camera Metadata</span>
                    {imageCameraStatus[selectedImage.name] === true && (
                      <span className="camera-status-badge camera-status-ok">✓ present</span>
                    )}
                    {imageCameraStatus[selectedImage.name] === false && (
                      <span className="camera-status-badge camera-status-missing">⚠ missing</span>
                    )}
                  </button>

                    {cameraFieldsExpanded && (
                      <div className="camera-fields-body">
                        {/* Preset selector */}
                        <div className="camera-preset-row">
                          <label className="field-label mono">Preset</label>
                          <select
                            onChange={e => applyPreset(e.target.value)}
                            defaultValue=""
                          >
                            <option value="">— select preset —</option>
                            {CAMERA_PRESETS.map(p => (
                              <option key={p.label} value={p.label}>{p.label}</option>
                            ))}
                          </select>
                        </div>

                        <CameraField label="Camera Maker"    value={cameraFields.make}          onChange={v => setCameraFields(p => ({...p, make: v}))}          placeholder="e.g. Samsung" />
                        <CameraField label="Camera Model"    value={cameraFields.model}         onChange={v => setCameraFields(p => ({...p, model: v}))}         placeholder="e.g. Galaxy S23" />
                        <CameraField label="F-Stop"          value={cameraFields.fNumber}       onChange={v => setCameraFields(p => ({...p, fNumber: v}))}       placeholder="e.g. f/1.8" />
                        <CameraField label="Exposure Time"   value={cameraFields.exposureTime}  onChange={v => setCameraFields(p => ({...p, exposureTime: v}))}  placeholder="e.g. 1/120" />
                        <CameraField label="ISO Speed"       value={cameraFields.iso}           onChange={v => setCameraFields(p => ({...p, iso: v}))}           placeholder="e.g. 50" />
                        <CameraField label="Exposure Bias"   value={cameraFields.exposureBias}  onChange={v => setCameraFields(p => ({...p, exposureBias: v}))}  placeholder="e.g. 0" />
                        <CameraField label="Focal Length"    value={cameraFields.focalLength}   onChange={v => setCameraFields(p => ({...p, focalLength: v}))}   placeholder="e.g. 23mm" />
                        <CameraField label="Metering Mode"   value={cameraFields.meteringMode}  onChange={v => setCameraFields(p => ({...p, meteringMode: v}))}  placeholder="e.g. Center-weighted" />
                        <CameraField label="Flash Mode"      value={cameraFields.flash}         onChange={v => setCameraFields(p => ({...p, flash: v}))}         placeholder="e.g. No flash" />

                        <button
                          className="btn btn-primary"
                          style={{ marginTop: 8, width: '100%' }}
                          onClick={() => {
                            window.electron.writeCameraMetadata({
                              filePath: selectedImage.path,
                              cameraFields,
                            });
                          }}
                          disabled={!Object.values(cameraFields).some(v => v)}
                        >
                          ⊕ Write Camera Metadata
                        </button>
                      </div>
                    )}
                  </div>
              </>
            ) : (
              <div className="date-editor-empty">
                <span className="empty-icon">◈</span>
                <p>Click any image to view or edit its capture date.</p>
                {missingCount > 0 && (
                  <p className="hint-sub">
                    <span style={{ color: 'var(--accent-amber)' }}>⚠ {missingCount}</span> image{missingCount !== 1 ? 's' : ''} still need a date.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ── Camera Field helper ──────────────────────────────────────────
function CameraField({ label, value, onChange, placeholder }) {
  return (
    <div className="camera-field">
      <label className="field-label mono">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ── Complete View ────────────────────────────────────────────────
function CompleteView({ outputPath, writeStatus }) {
  return (
    <div className="ws-view ws-complete">
      <div className="complete-inner">
        <div className="complete-icon">✓</div>
        <h2>Done</h2>
        <p className="complete-path mono" title={outputPath}>{outputPath}</p>

        {writeStatus && (
          <div className="write-status">
            <div className="write-status-row">
              <span className="ws-badge" style={{ background: 'var(--accent-green-dim)', color: 'var(--accent-green)', border: '1px solid rgba(0,229,160,0.3)' }}>
                ✓ {writeStatus.written} images tagged
              </span>
              {writeStatus.failed?.length > 0 && (
                <span className="ws-badge badge-warn">
                  ⚠ {writeStatus.failed.length} failed
                </span>
              )}
            </div>
            {writeStatus.failed?.length > 0 && (
              <div className="write-failed-list">
                {writeStatus.failed.map(f => (
                  <div key={f.name} className="write-failed-item mono">
                    {f.name}: {f.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          className="btn btn-secondary"
          onClick={() => window.electron.showItemInFolder(outputPath)}
        >
          ⊞ Reveal in Folder
        </button>
      </div>
    </div>
  );
}
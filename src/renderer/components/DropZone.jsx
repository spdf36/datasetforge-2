// src/renderer/components/DropZone.jsx
import React, { useState, useRef, useCallback } from 'react';
import './DropZone.css';

export default function DropZone({ onFolderSelected, isScanning, scanError }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.items);
    const files = Array.from(e.dataTransfer.files);

    const folderPaths = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const file = item.getAsFile();
          if (file?.path) folderPaths.push(file.path);
        }
      }
    }

    if (folderPaths.length > 0) {
      // Always pass the full array — App decides how to handle 1 vs many
      onFolderSelected(folderPaths.length === 1 ? folderPaths[0] : folderPaths);
      return;
    }

    // Fallback: files dropped — use parent directory
    if (files.length > 0 && files[0].path) {
      const firstPath = files[0].path;
      const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.bmp','.webp','.heic','.heif','.raw','.cr2','.nef','.arw']);
      const ext = firstPath.slice(firstPath.lastIndexOf('.')).toLowerCase();
      const sep = firstPath.includes('\\') ? '\\' : '/';
      const parent = firstPath.substring(0, firstPath.lastIndexOf(sep));
      onFolderSelected(IMAGE_EXTS.has(ext) ? parent : firstPath);
    }
  }, [onFolderSelected]);

  const handleBrowse = useCallback(async () => {
    const folderPath = await window.electron.openFolderDialog();
    if (folderPath) onFolderSelected(folderPath);
  }, [onFolderSelected]);

  const handleBrowseFile = useCallback(async () => {
    const filePath = await window.electron.openFileDialog();
    if (filePath) onFolderSelected(filePath);
  }, [onFolderSelected]);

  return (
    <div className="dropzone-root">
      <div className="dropzone-bg">
        <GridPattern />
      </div>

      <div
        className={`dropzone-container ${isDragging ? 'dragging' : ''} ${isScanning ? 'scanning' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="dropzone-inner">
          {isScanning ? (
            <ScanningState />
          ) : (
            <IdleState isDragging={isDragging} onBrowse={handleBrowse} onBrowseFile={handleBrowseFile} scanError={scanError} />
          )}
        </div>
      </div>

      <div className="dropzone-footer">
        <span className="mono">DatasetForge v1.0</span>
        <span>·</span>
        <span>Local metadata generation for image datasets</span>
      </div>
    </div>
  );
}

function IdleState({ isDragging, onBrowse, onBrowseFile, scanError }) {
  return (
    <>
      <div className="dz-icon-wrap">
        <div className={`dz-icon ${isDragging ? 'active' : ''}`}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <rect x="4" y="14" width="44" height="34" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 22h44" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 8l-6 6M38 8l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M4 8h44" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M26 30v10M21 35l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="dz-ring" />
        <div className="dz-ring dz-ring-2" />
      </div>

      <h1 className="dz-title">
        {isDragging ? 'Release to load' : 'Drop folder(s) here'}
      </h1>
      <p className="dz-subtitle">
        Drop a root folder, or select multiple batch folders at once.<br />
        Each batch must contain <code>Historical</code>, <code>Present_Neutral</code> and <code>Pose_Variation</code>.
      </p>

      <div className="dz-divider"><span>or</span></div>

      <div className="dz-browse-row">
        <button className="dz-browse-btn" onClick={onBrowse}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4.5A1.5 1.5 0 013.5 3h3L8 5h4.5A1.5 1.5 0 0114 6.5v6A1.5 1.5 0 0112.5 14h-9A1.5 1.5 0 012 12.5v-8z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Browse Folder
        </button>
        <button className="dz-browse-btn dz-browse-btn-secondary" onClick={onBrowseFile}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Browse File
        </button>
      </div>

      {scanError && (
        <div className="dz-error">
          <span>⚠</span> {scanError}
        </div>
      )}

      <div className="dz-hints">
        <span className="dz-hint">
          <span className="hint-key">JPG</span>
          <span className="hint-key">PNG</span>
          <span className="hint-key">TIFF</span>
          <span className="hint-key">HEIC</span>
          <span className="hint-key">RAW</span>
          supported
        </span>
      </div>
    </>
  );
}

function ScanningState() {
  return (
    <div className="scanning-state">
      <div className="scan-spinner">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="scan-dot" style={{ '--i': i }} />
        ))}
      </div>
      <p className="scan-label mono">scanning filesystem...</p>
    </div>
  );
}

function GridPattern() {
  return (
    <svg className="grid-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}
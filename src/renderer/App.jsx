// src/renderer/App.jsx
import React, { useState, useCallback } from 'react';
import DropZone from './components/DropZone';
import WorkspaceLayout from './components/WorkspaceLayout';

export const PHASE = {
  DROP:      'DROP',
  WORKSPACE: 'WORKSPACE',
};

export default function App() {
  const [phase, setPhase] = useState(PHASE.DROP);
  const [rootPath, setRootPath] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [allImages, setAllImages] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [initialBatchPath, setInitialBatchPath] = useState(null);

  // folderInput can be a single path string OR an array of paths
  const loadFolder = useCallback(async (folderInput) => {
    setIsScanning(true);
    setScanError(null);
    setInitialBatchPath(null);
    try {
      const isMulti = Array.isArray(folderInput);

      if (isMulti && folderInput.length > 1) {
        // Multiple specific folders dropped — scan each and merge into a virtual tree
        const result = await window.electron.scanMultipleFolders(folderInput);
        if (result.error) { setScanError(result.error); return; }
        setRootPath(result.rootPath);
        setFileTree(result.tree);
        setAllImages(result.allImages);
        setPhase(PHASE.WORKSPACE);
        return;
      }

      // Single folder
      const folderPath = isMulti ? folderInput[0] : folderInput;
      const result = await window.electron.scanFolder(folderPath);
      if (result.error) { setScanError(result.error); return; }

      setRootPath(result.rootPath);
      setFileTree(result.tree);
      setAllImages(result.allImages);

      // Auto-select if the dropped folder itself is a valid batch
      const validation = await window.electron.validateBatchFolder(folderPath);
      if (validation.valid) setInitialBatchPath(folderPath);

      setPhase(PHASE.WORKSPACE);
    } catch (err) {
      setScanError(err.message);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setPhase(PHASE.DROP);
    setRootPath(null);
    setFileTree(null);
    setAllImages([]);
    setScanError(null);
    setInitialBatchPath(null);
  }, []);

  const refreshTree = useCallback(async () => {
    if (!rootPath) return;
    const result = await window.electron.scanFolder(rootPath);
    if (!result.error) {
      setFileTree(result.tree);
      setAllImages(result.allImages);
    }
  }, [rootPath]);

  return (
    <div className="app-root">
      <TitleBar rootPath={rootPath} onReset={handleReset} />
      <div className="app-body">
        {phase === PHASE.DROP ? (
          <DropZone onFolderSelected={loadFolder} isScanning={isScanning} scanError={scanError} />
        ) : (
          <WorkspaceLayout
            rootPath={rootPath}
            fileTree={fileTree}
            allImages={allImages}
            onRefresh={refreshTree}
            onReset={handleReset}
            initialBatchPath={initialBatchPath}
          />
        )}
      </div>
    </div>
  );
}

function TitleBar({ rootPath, onReset }) {
  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-content">
        <span className="titlebar-logo">
          <span className="logo-bracket">[</span>
          <span className="logo-name">DatasetForge</span>
          <span className="logo-bracket">]</span>
        </span>
        {rootPath && (
          <span className="titlebar-path mono">
            <span className="path-sep">~/</span>
            {rootPath.split(/[\\/]/).slice(-2).join('/')}
          </span>
        )}
      </div>
      {rootPath && (
        <button className="titlebar-reset" onClick={onReset} title="Close project">
          ✕ close project
        </button>
      )}
    </div>
  );
}
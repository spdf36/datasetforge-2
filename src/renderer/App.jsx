// src/renderer/App.jsx
import React, { useState, useCallback } from 'react';
import ModeSelect from './components/ModeSelect';
import DropZone from './components/DropZone';
import WorkspaceLayout from './components/WorkspaceLayout';
import VerifyWorkspace from './components/VerifyWorkspace';
import ImageToolsWorkspace from './components/ImageToolsWorkspace';

export const PHASE = {
  HOME:      'HOME',
  DROP:      'DROP',
  WORKSPACE: 'WORKSPACE',
  VERIFY:    'VERIFY',
  TOOLS:     'TOOLS',
};

export default function App() {
  const [phase, setPhase] = useState(PHASE.HOME);
  const [rootPath, setRootPath] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [allImages, setAllImages] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [initialBatchPath, setInitialBatchPath] = useState(null);

  const handleSelectMode = useCallback((mode) => {
    if (mode === 'process') setPhase(PHASE.DROP);
    if (mode === 'verify')  setPhase(PHASE.VERIFY);
    if (mode === 'tools')   setPhase(PHASE.TOOLS);
  }, []);

  // folderInput can be a single path string OR an array of paths
  const loadFolder = useCallback(async (folderInput) => {
    setIsScanning(true);
    setScanError(null);
    setInitialBatchPath(null);
    try {
      const isMulti = Array.isArray(folderInput);

      if (isMulti && folderInput.length > 1) {
        const result = await window.electron.scanMultipleFolders(folderInput);
        if (result.error) { setScanError(result.error); return; }
        setRootPath(result.rootPath);
        setFileTree(result.tree);
        setAllImages(result.allImages);
        setPhase(PHASE.WORKSPACE);
        return;
      }

      const folderPath = isMulti ? folderInput[0] : folderInput;
      const result = await window.electron.scanFolder(folderPath);
      if (result.error) { setScanError(result.error); return; }

      setRootPath(result.rootPath);
      setFileTree(result.tree);
      setAllImages(result.allImages);

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
    setPhase(PHASE.HOME);
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
      <TitleBar rootPath={rootPath} phase={phase} onReset={handleReset} />
      <div className="app-body">
        {phase === PHASE.HOME && (
          <ModeSelect onSelectMode={handleSelectMode} />
        )}
        {phase === PHASE.DROP && (
          <DropZone onFolderSelected={loadFolder} isScanning={isScanning} scanError={scanError} />
        )}
        {phase === PHASE.WORKSPACE && (
          <WorkspaceLayout
            rootPath={rootPath}
            fileTree={fileTree}
            allImages={allImages}
            onRefresh={refreshTree}
            onReset={handleReset}
            initialBatchPath={initialBatchPath}
          />
        )}
        {phase === PHASE.VERIFY && (
          <VerifyWorkspace onBack={() => setPhase(PHASE.HOME)} />
        )}
        {phase === PHASE.TOOLS && (
          <ImageToolsWorkspace onBack={() => setPhase(PHASE.HOME)} />
        )}
      </div>
    </div>
  );
}

function TitleBar({ rootPath, phase, onReset }) {
  const showReset = phase !== 'HOME';
  const resetLabel = (phase === 'VERIFY' || phase === 'TOOLS') ? '← home' : '✕ close project';
  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-content">
        <span className="titlebar-logo">
          <span className="logo-bracket">[</span>
          <span className="logo-name">DatasetForge</span>
          <span className="logo-bracket">]</span>
        </span>
        {rootPath && phase === 'WORKSPACE' && (
          <span className="titlebar-path mono">
            <span className="path-sep">~/</span>
            {rootPath.split(/[\\/]/).slice(-2).join('/')}
          </span>
        )}
      </div>
      {showReset && (
        <button className="titlebar-reset" onClick={onReset} title={resetLabel}>
          {resetLabel}
        </button>
      )}
    </div>
  );
}
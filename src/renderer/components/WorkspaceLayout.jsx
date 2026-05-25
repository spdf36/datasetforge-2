// src/renderer/components/WorkspaceLayout.jsx
import React, { useState, useCallback } from 'react';import FileExplorer from './FileExplorer';
import MainWorkspace from './MainWorkspace';
import MetadataPanel from './MetadataPanel';
import './WorkspaceLayout.css';

export const WORKSPACE_MODE = {
  IMAGE_LIST:       'IMAGE_LIST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  JSON_CREATION:    'JSON_CREATION',
  COMPLETE:         'COMPLETE',
};

const EMPTY_METADATA = {
  country: '', date_of_birth: '', gender: '', ethnicity: '', device_os: '',
};

export default function WorkspaceLayout({ rootPath, fileTree, allImages, onRefresh, onReset, initialBatchPath }) {
  const [mode, setMode]                       = useState(WORKSPACE_MODE.IMAGE_LIST);
  const [selectedBatchPath, setSelectedBatchPath] = useState(null);
  const [validationResult, setValidationResult]   = useState(null);
  const [metadata, setMetadata]               = useState(EMPTY_METADATA);
  const [referenceImageSrc, setReferenceImageSrc] = useState(null);
  const [historicalDates, setHistoricalDates] = useState({});
  const [missingDateQueue, setMissingDateQueue]   = useState([]);
  const [isProcessing, setIsProcessing]       = useState(false);
  const [outputPath, setOutputPath]           = useState(null);
  const [poseVariantFound, setPoseVariantFound]   = useState(null);
  const [writeStatus, setWriteStatus]         = useState(null);
  const [copiedCameraFields, setCopiedCameraFields] = useState(null);
  const [copyFeedback, setCopyFeedback]       = useState(false);

  // Auto-select batch if root IS a batch folder (single folder dropped)
  React.useEffect(() => {
    if (initialBatchPath) {
      handleSelectBatch({ path: initialBatchPath });
    }
  }, [initialBatchPath]);

  // ── Select batch folder ──────────────────────────────────────
  const handleSelectBatch = useCallback(async (node) => {
    setSelectedBatchPath(node.path);
    setMode(WORKSPACE_MODE.IMAGE_LIST);
    setValidationResult(null);
    setOutputPath(null);
    setWriteStatus(null);

    const result = await window.electron.validateBatchFolder(node.path);
    setValidationResult(result);
    setPoseVariantFound(result.poseVariantFound);
    if (!result.valid) setMode(WORKSPACE_MODE.VALIDATION_ERROR);
  }, []);

  // ── Start JSON Creation ──────────────────────────────────────
  const handleStartJsonCreation = useCallback(async () => {
    if (!selectedBatchPath || !validationResult?.valid) return;
    setIsProcessing(true);
    setMode(WORKSPACE_MODE.JSON_CREATION);
    try {
      const neutralPath = `${selectedBatchPath}/Present_Neutral`;
      const imgPath = await window.electron.getRandomImage(neutralPath);
      if (imgPath) {
        const b64 = await window.electron.readImageAsBase64(imgPath);
        setReferenceImageSrc(b64);
      }
      const historicalPath = `${selectedBatchPath}/Historical`;
      const { dates, missingQueue } = await window.electron.extractHistoricalDates(historicalPath);
      setHistoricalDates(dates);
      setMissingDateQueue(missingQueue);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedBatchPath, validationResult]);

  // ── Inline date update from grid ─────────────────────────────
  const handleUpdateDate = useCallback((filename, dateValue, timeValue = '00:00:00') => {
    if (dateValue === null) {
      setHistoricalDates(prev => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
      setMissingDateQueue(prev => {
        if (prev.some(item => item.name === filename)) return prev;
        return [...prev, { name: filename, path: `${selectedBatchPath}/Historical/${filename}` }];
      });
    } else {
      // timeValue comes as "HH:MM" — pad to "HH:MM:00"
      const time = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
      setHistoricalDates(prev => ({ ...prev, [filename]: `${dateValue}T${time}` }));
      setMissingDateQueue(prev => prev.filter(item => item.name !== filename));
    }
  }, [selectedBatchPath]);

  // ── Save ─────────────────────────────────────────────────────
  const handleSaveDirectly = useCallback(async () => {
    await saveMetadata(historicalDates);
  }, [historicalDates, metadata]);

  const saveMetadata = async (dates) => {
    setIsProcessing(true);
    setWriteStatus(null);
    try {
      // 1. Write metadata into every image file via ExifTool
      const writeResult = await window.electron.writeImageMetadata({
        batchFolderPath: selectedBatchPath,
        metadata,
        historicalDates: dates,
      });
      setWriteStatus(writeResult);

      // 2. Sort dates and save JSON
      const sortedDates = Object.keys(dates)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .reduce((acc, key) => { acc[key] = dates[key]; return acc; }, {});

      const finalMetadata = {
        ...metadata,
        historic_capture_dates: sortedDates,
      };

      const result = await window.electron.saveMetadata({
        batchFolderPath: selectedBatchPath,
        filename: 'metadata.json',
        metadata: finalMetadata,
      });

      if (result.success) {
        setOutputPath(result.outputPath);
        setMode(WORKSPACE_MODE.COMPLETE);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Rename folder ────────────────────────────────────────────
  const handleRenameFolder = useCallback(async (folderPath, newName) => {
    const result = await window.electron.renameFolder({ oldPath: folderPath, newName });
    if (result.success) {
      await onRefresh();
      if (folderPath === selectedBatchPath) setSelectedBatchPath(result.newPath);
    }
    return result;
  }, [onRefresh, selectedBatchPath]);

  return (
    <div className="workspace-layout">
      <aside className="panel panel-left">
        <PanelHeader label="EXPLORER" icon="⬡" />
        <div className="panel-body">
          <FileExplorer
            tree={fileTree}
            rootPath={rootPath}
            selectedPath={selectedBatchPath}
            onSelectFolder={handleSelectBatch}
          />
        </div>
      </aside>

      <main className="panel panel-main">
        <MainWorkspace
          mode={mode}
          allImages={allImages}
          rootPath={rootPath}
          selectedBatchPath={selectedBatchPath}
          validationResult={validationResult}
          referenceImageSrc={referenceImageSrc}
          historicalDates={historicalDates}
          missingDateQueue={missingDateQueue}
          onUpdateDate={handleUpdateDate}
          onStartJsonCreation={handleStartJsonCreation}
          onSaveDirectly={handleSaveDirectly}
          onRenameFolder={handleRenameFolder}
          isProcessing={isProcessing}
          outputPath={outputPath}
          writeStatus={writeStatus}
          copiedCameraFields={copiedCameraFields}
          setCopiedCameraFields={setCopiedCameraFields}
          copyFeedback={copyFeedback}
          setCopyFeedback={setCopyFeedback}
          onRefresh={onRefresh}
        />
      </main>

      <aside className="panel panel-right">
        <PanelHeader label="METADATA" icon="◈" />
        <div className="panel-body">
          <MetadataPanel
            metadata={metadata}
            onChange={setMetadata}
            disabled={mode === WORKSPACE_MODE.COMPLETE}
          />
        </div>
      </aside>
    </div>
  );
}

function PanelHeader({ label, icon }) {
  return (
    <div className="panel-header">
      <span className="panel-header-icon">{icon}</span>
      <span className="panel-header-label mono">{label}</span>
    </div>
  );
}
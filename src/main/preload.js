// src/main/preload.js — Secure Context Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog:   () => ipcRenderer.invoke('dialog:openFile'),

  // Filesystem
  scanFolder:          (folderPath) => ipcRenderer.invoke('fs:scanFolder', folderPath),
  scanMultipleFolders: (paths)      => ipcRenderer.invoke('fs:scanMultipleFolders', paths),
  validateBatchFolder: (folderPath) => ipcRenderer.invoke('fs:validateBatchFolder', folderPath),
  renameFolder:        (args)       => ipcRenderer.invoke('fs:renameFolder', args),
  getImagesInFolder:   (folderPath) => ipcRenderer.invoke('fs:getImagesInFolder', folderPath),
  getRandomImage:      (folderPath) => ipcRenderer.invoke('fs:getRandomImage', folderPath),
  readImageAsBase64:   (filePath)   => ipcRenderer.invoke('fs:readImageAsBase64', filePath),
  saveMetadata:        (args)       => ipcRenderer.invoke('fs:saveMetadata', args),
  showItemInFolder:    (filePath)   => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  // ExifTool
  extractHistoricalDates: (folderPath) => ipcRenderer.invoke('exif:extractHistoricalDates', folderPath),
  removeDate:             (filePath)   => ipcRenderer.invoke('exif:removeDate', filePath),
  readCameraMetadata:     (filePath)   => ipcRenderer.invoke('exif:readCameraMetadata', filePath),
  writeCameraMetadata:    (args)       => ipcRenderer.invoke('exif:writeCameraMetadata', args),
  writeImageMetadata:     (args)       => ipcRenderer.invoke('exif:writeImageMetadata', args),

  // Image Tools (Python-based)
  convertToJpg:     (args) => ipcRenderer.invoke('tools:convertToJpg', args),
  resizeImages:     (args) => ipcRenderer.invoke('tools:resizeImages', args),
  onToolsProgress:  (cb)   => ipcRenderer.on('tools:progress', (_, data) => cb(data)),
  offToolsProgress: ()     => ipcRenderer.removeAllListeners('tools:progress'),

  // Metadata Verifier (Node.js)
  findSubjects:   (rootPath) => ipcRenderer.invoke('verify:findSubjects', rootPath),
  analyseSubject: (args)     => ipcRenderer.invoke('verify:analyseSubject', args),
  applyFixes:     (args)     => ipcRenderer.invoke('verify:applyFixes', args),
});
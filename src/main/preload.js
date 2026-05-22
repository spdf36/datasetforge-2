// src/main/preload.js — Secure Context Bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // Filesystem
  scanFolder: (folderPath) => ipcRenderer.invoke('fs:scanFolder', folderPath),
  scanMultipleFolders: (paths) => ipcRenderer.invoke('fs:scanMultipleFolders', paths),
  validateBatchFolder: (folderPath) => ipcRenderer.invoke('fs:validateBatchFolder', folderPath),
  renameFolder: (args) => ipcRenderer.invoke('fs:renameFolder', args),
  getImagesInFolder: (folderPath) => ipcRenderer.invoke('fs:getImagesInFolder', folderPath),
  getRandomImage: (folderPath) => ipcRenderer.invoke('fs:getRandomImage', folderPath),
  readImageAsBase64: (filePath) => ipcRenderer.invoke('fs:readImageAsBase64', filePath),
  saveMetadata: (args) => ipcRenderer.invoke('fs:saveMetadata', args),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  // ExifTool
  extractHistoricalDates: (folderPath) => ipcRenderer.invoke('exif:extractHistoricalDates', folderPath),
  removeDate: (filePath) => ipcRenderer.invoke('exif:removeDate', filePath),
  readCameraMetadata: (filePath) => ipcRenderer.invoke('exif:readCameraMetadata', filePath),
  writeCameraMetadata: (args) => ipcRenderer.invoke('exif:writeCameraMetadata', args),
  writeImageMetadata: (args) => ipcRenderer.invoke('exif:writeImageMetadata', args),
});
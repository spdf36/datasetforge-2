// src/main/main.js — Electron Main Process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const { pathToFileURL } = require('url');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── Window ────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0f12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  const url = isDev
    ? 'http://localhost:3000'
    : pathToFileURL(path.join(__dirname, '../../build/index.html')).toString();
  mainWindow.loadURL(url);

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── Utilities ─────────────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw']);

function isImage(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function scanDirectory(dirPath, rootPath) {
  const name = path.basename(dirPath);
  const relativePath = path.relative(rootPath, dirPath);
  const node = { name, path: dirPath, relativePath: relativePath || '.', type: 'folder', children: [] };

  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch { return node; }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      node.children.push(scanDirectory(fullPath, rootPath));
    } else if (entry.isFile()) {
      node.children.push({
        name: entry.name, path: fullPath,
        relativePath: path.relative(rootPath, fullPath),
        type: 'file', ext: path.extname(entry.name).toLowerCase(),
        isImage: isImage(entry.name),
      });
    }
  }

  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return node;
}

function collectImages(node, results = []) {
  if (node.type === 'file' && node.isImage) { results.push(node); return results; }
  if (node.children) node.children.forEach(c => collectImages(c, results));
  return results;
}

// ─── ExifTool Resolver ─────────────────────────────────────────────────────
function getExifToolPath() {
  const bin = process.platform === 'win32' ? 'exiftool.exe' : 'exiftool';
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'exiftool', bin);
    if (fs.existsSync(bundled)) return bundled;
  }
  const dev = path.join(app.getAppPath(), 'public', 'exiftool', bin);
  if (fs.existsSync(dev)) return dev;
  return bin;
}

function extractDateWithExiftool(filePath) {
  return new Promise((resolve) => {
    const exifBin = getExifToolPath();
    const args = ['-DateTimeOriginal', '-CreateDate', '-json', filePath];
    execFile(exifBin, args, { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) { resolve(null); return; }
      try {
        const data = JSON.parse(stdout);
        const raw = data[0]?.DateTimeOriginal || data[0]?.CreateDate;
        if (!raw) { resolve(null); return; }
        // ExifTool format: "2023:07:14 15:30:00"
        const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
        if (!match) { resolve(null); return; }
        const [, yr, mo, dy, hStr, mStr] = match;
        let h = parseInt(hStr, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const time12 = `${String(h).padStart(2, '0')}:${mStr} ${ampm}`;
        resolve(`${yr}-${mo}-${dy}T${time12}`);
      } catch { resolve(null); }
    });
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Select Dataset Folder(s)',
  });
  if (result.canceled || !result.filePaths.length) return null;
  // Return array — App handles single vs multi
  return result.filePaths.length === 1 ? result.filePaths[0] : result.filePaths;
});

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select any image file in the dataset folder',
    filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','tiff','tif','bmp','webp','heic','heif','raw','cr2','nef','arw'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  // Return the parent directory so the app loads the whole folder
  return path.dirname(result.filePaths[0]);
});

ipcMain.handle('fs:scanMultipleFolders', async (_, folderPaths) => {
  if (!folderPaths?.length) return { error: 'No paths provided' };

  // Use the common parent as the virtual root label
  const firstParent = path.dirname(folderPaths[0]);
  const virtualRoot = {
    name: path.basename(firstParent),
    path: firstParent,
    relativePath: '.',
    type: 'folder',
    children: [],
  };

  const allImages = [];
  for (const folderPath of folderPaths) {
    if (!fs.existsSync(folderPath)) continue;
    const node = scanDirectory(folderPath, firstParent);
    virtualRoot.children.push(node);
    collectImages(node, allImages);
  }

  virtualRoot.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return { tree: virtualRoot, allImages, rootPath: firstParent };
});

ipcMain.handle('fs:scanFolder', async (_, folderPath) => {
  if (!fs.existsSync(folderPath)) return { error: 'Path does not exist' };
  const tree = scanDirectory(folderPath, folderPath);
  const allImages = collectImages(tree);
  return { tree, allImages, rootPath: folderPath };
});

ipcMain.handle('fs:validateBatchFolder', async (_, folderPath) => {
  let entries;
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); }
  catch { return { valid: false, error: 'Cannot read folder' }; }

  const subfolderNames = entries.filter(e => e.isDirectory()).map(e => e.name);
  const required = ['Historical', 'Present_Neutral'];
  const poseVariants = ['Pose_Variation_A', 'Pose_Variation_B'];
  const missing = [];
  required.forEach(r => { if (!subfolderNames.includes(r)) missing.push(r); });
  const hasPose = poseVariants.some(p => subfolderNames.includes(p));
  if (!hasPose) missing.push('Pose_Variation_A or Pose_Variation_B');
  return {
    valid: missing.length === 0, found: subfolderNames, missing,
    poseVariantFound: poseVariants.find(p => subfolderNames.includes(p)) || null,
  };
});

ipcMain.handle('fs:renameFolder', async (_, { oldPath, newName }) => {
  const parentDir = path.dirname(oldPath);
  const newPath = path.join(parentDir, newName);
  try { fs.renameSync(oldPath, newPath); return { success: true, newPath }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('fs:getImagesInFolder', async (_, folderPath) => {
  if (!fs.existsSync(folderPath)) return [];
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && isImage(e.name))
    .map(e => ({ name: e.name, path: path.join(folderPath, e.name) }));
});

ipcMain.handle('fs:getRandomImage', async (_, folderPath) => {
  if (!fs.existsSync(folderPath)) return null;
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const images = entries.filter(e => e.isFile() && isImage(e.name));
  if (!images.length) return null;
  const picked = images[Math.floor(Math.random() * images.length)];
  return path.join(folderPath, picked.name);
});

ipcMain.handle('exif:extractHistoricalDates', async (_, historicalFolderPath) => {
  if (!fs.existsSync(historicalFolderPath)) return { dates: {}, missingQueue: [] };
  const entries = fs.readdirSync(historicalFolderPath, { withFileTypes: true });
  const images = entries
    .filter(e => e.isFile() && isImage(e.name))
    .map(e => ({ name: e.name, path: path.join(historicalFolderPath, e.name) }));

  const dates = {};
  const missingQueue = [];

  if (images.length === 0) return { dates, missingQueue };

  // Run ONE ExifTool call on all files at once — massively faster than N calls
  await new Promise((resolve) => {
    const exifBin = getExifToolPath();
    const args = ['-DateTimeOriginal', '-CreateDate', '-FileName', '-json', ...images.map(img => img.path)];
    execFile(exifBin, args, { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) { resolve(); return; }
      try {
        const results = JSON.parse(stdout);
        const resultMap = {};
        for (const r of results) {
          const fname = r.FileName || '';
          resultMap[fname] = r.DateTimeOriginal || r.CreateDate || null;
        }
        for (const img of images) {
          const raw = resultMap[img.name];
          if (raw) {
            const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
            if (match) {
              const [, yr, mo, dy, hStr, mStr] = match;
              let h = parseInt(hStr, 10);
              const ampm = h >= 12 ? 'PM' : 'AM';
              h = h % 12 || 12;
              const time12 = `${String(h).padStart(2, '0')}:${mStr} ${ampm}`;
              dates[img.name] = `${yr}-${mo}-${dy}T${time12}`;
            } else {
              missingQueue.push({ name: img.name, path: img.path });
            }
          } else {
            missingQueue.push({ name: img.name, path: img.path });
          }
        }
      } catch { images.forEach(img => missingQueue.push({ name: img.name, path: img.path })); }
      resolve();
    });
  });

  return { dates, missingQueue };
});

// Strip all date EXIF from image permanently
ipcMain.handle('exif:removeDate', async (_, filePath) => {
  return new Promise((resolve) => {
    const exifBin = getExifToolPath();
    const args = [
      '-DateTimeOriginal=', '-CreateDate=', '-ModifyDate=',
      '-FileModifyDate=', '-FileCreateDate=', '-MetadataDate=',
      '-DateTime=', '-Date=',
      '-XMP:DateTimeOriginal=', '-XMP:CreateDate=', '-XMP:ModifyDate=', '-XMP:MetadataDate=',
      '-IPTC:DateCreated=', '-IPTC:TimeCreated=', '-IPTC:DigitalCreationDate=', '-IPTC:DigitalCreationTime=',
      '-overwrite_original_in_place', '-m', '-no_thumbs', filePath,
    ];
    execFile(exifBin, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: stderr || err.message });
      else resolve({ success: true });
    });
  });
});

// Read camera metadata fields from an existing image
ipcMain.handle('exif:readCameraMetadata', async (_, filePath) => {
  return new Promise((resolve) => {
    const exifBin = getExifToolPath();
    const args = ['-Make', '-Model', '-FNumber', '-ExposureTime', '-ISO', '-ExposureCompensation', '-FocalLength', '-MeteringMode', '-Flash', '-json', filePath];
    execFile(exifBin, args, { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) { resolve(null); return; }
      try {
        const data = JSON.parse(stdout)[0];
        const fields = {
          make:          data.Make          || '',
          model:         data.Model         || '',
          fNumber:       data.FNumber       ? String(data.FNumber)       : '',
          exposureTime:  data.ExposureTime  ? String(data.ExposureTime)  : '',
          iso:           data.ISO           ? String(data.ISO)           : '',
          exposureBias:  data.ExposureCompensation !== undefined ? String(data.ExposureCompensation) : '',
          focalLength:   data.FocalLength   ? String(data.FocalLength).replace(' mm', '') : '',
          meteringMode:  data.MeteringMode  || '',
          flash:         data.Flash         || '',
        };
        // Only return if at least one field has a value
        const hasData = Object.values(fields).some(v => v !== '');
        resolve(hasData ? fields : null);
      } catch { resolve(null); }
    });
  });
});

// Write camera metadata fields into a single image
ipcMain.handle('exif:writeCameraMetadata', async (_, { filePath, cameraFields }) => {
  return new Promise((resolve) => {
    const exifBin = getExifToolPath();
    const args = [];

    if (cameraFields.make)  args.push(`-Make=${cameraFields.make}`);
    if (cameraFields.model) args.push(`-Model=${cameraFields.model}`);

    if (cameraFields.fNumber) {
      const fn = cameraFields.fNumber.toString().replace(/^f\//i, '');
      args.push(`-FNumber=${fn}`, `-ApertureValue=${fn}`);
    }
    if (cameraFields.exposureTime) {
      const et = cameraFields.exposureTime.toString().trim();
      args.push(`-ExposureTime=${et}`, `-ShutterSpeedValue=${et}`);
    }
    if (cameraFields.iso) {
      const iso = parseInt(cameraFields.iso, 10);
      if (!isNaN(iso)) args.push(`-ISO=${iso}`);
    }
    if (cameraFields.exposureBias !== undefined && cameraFields.exposureBias !== '') {
      args.push(`-ExposureCompensation=${cameraFields.exposureBias}`, `-ExposureBiasValue=${cameraFields.exposureBias}`);
    }
    if (cameraFields.focalLength) {
      const fl = cameraFields.focalLength.toString().replace(/\s*mm$/i, '').trim();
      args.push(`-FocalLength=${fl}`);
    }
    if (cameraFields.meteringMode) args.push(`-MeteringMode=${cameraFields.meteringMode}`);
    if (cameraFields.flash)        args.push(`-Flash=${cameraFields.flash}`);

    if (args.length === 0) { resolve({ success: true }); return; }
    execFile(exifBin, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: stderr || err.message });
      else resolve({ success: true });
    });
  });
});

// Write metadata fields into Historical folder images only
ipcMain.handle('exif:writeImageMetadata', async (_, { batchFolderPath, metadata, historicalDates }) => {
  const exifBin = getExifToolPath();
  const results = { success: [], failed: [] };

  // Only process the Historical subfolder
  const historicalPath = path.join(batchFolderPath, 'Historical');
  if (!fs.existsSync(historicalPath)) {
    return { success: true, written: 0, failed: [] };
  }

  const entries = fs.readdirSync(historicalPath, { withFileTypes: true });
  const allImages = entries
    .filter(e => e.isFile() && isImage(e.name))
    .map(e => ({ name: e.name, path: path.join(historicalPath, e.name), subfolder: 'Historical' }));

  // Build arg list for a single image
  const buildArgs = (img) => {
    const args = [];
    if (metadata.country) {
      args.push(`-IPTC:Country-PrimaryLocationCode=${metadata.country}`);
      args.push(`-XMP:CountryCode=${metadata.country}`);
    }
    if (metadata.gender)    args.push(`-XMP:PersonInImage=${metadata.gender}`);
    if (metadata.ethnicity) args.push(`-XMP:Subject=${metadata.ethnicity}`);
    if (metadata.device_os) args.push(`-Make=${metadata.device_os}`);
    const desc = [
      metadata.country       ? `Country:${metadata.country}`     : '',
      metadata.date_of_birth ? `DOB:${metadata.date_of_birth}`   : '',
      metadata.gender        ? `Gender:${metadata.gender}`       : '',
      metadata.ethnicity     ? `Ethnicity:${metadata.ethnicity}` : '',
      metadata.device_os     ? `DeviceOS:${metadata.device_os}` : '',
    ].filter(Boolean).join(' | ');
    if (desc) args.push(`-XMP:Description=${desc}`);
    if (img.subfolder === 'Historical') {
      const captureDate = historicalDates[img.name];
      if (captureDate) {
        const [datePart, timePart] = captureDate.split('T');
        const exifDatePart = datePart.replace(/-/g, ':');

        // Convert 12-hour to 24-hour for standard EXIF (required by spec)
        let h24, mStr;
        if (timePart && (timePart.includes('AM') || timePart.includes('PM'))) {
          const [t, ap] = timePart.trim().split(' ');
          const [hStr, m] = t.split(':');
          mStr = m || '00';
          let h = parseInt(hStr, 10) || 0;
          if (ap === 'AM' && h === 12) h = 0;
          if (ap === 'PM' && h !== 12) h += 12;
          h24 = String(h).padStart(2, '0');
        } else {
          const parts = (timePart || '00:00').slice(0, 5).split(':');
          h24 = parts[0] || '00';
          mStr = parts[1] || '00';
        }

        const exifDate24 = `${exifDatePart} ${h24}:${mStr}:00`;
        // Standard EXIF tag (24-hour — required for compatibility)
        args.push(`-DateTimeOriginal=${exifDate24}`);
        args.push(`-CreateDate=${exifDate24}`);
        // XMP tag stores the 12-hour string so viewers that read XMP show it as entered
        if (timePart) args.push(`-XMP:DateTimeOriginal=${datePart}T${timePart.trim()}`);
      }
    }
    return args;
  };

  const writeOne = (img) => new Promise((resolve) => {
    const args = buildArgs(img);
    if (args.length === 0) { resolve(); return; }
    // -overwrite_original_in_place: no backup files
    // -m: ignore minor errors (extension mismatches etc.)
    // -no_thumbs: don't generate or modify embedded thumbnails
    args.push('-overwrite_original_in_place', '-m', '-no_thumbs', img.path);
    execFile(exifBin, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) results.failed.push({ name: img.name, error: stderr || err.message });
      else results.success.push(img.name);
      resolve();
    });
  });

  // Write in parallel batches of 6
  const BATCH = 6;
  for (let i = 0; i < allImages.length; i += BATCH) {
    await Promise.all(allImages.slice(i, i + BATCH).map(writeOne));
  }

  return {
    success: results.failed.length === 0,
    written: results.success.length,
    failed: results.failed,
  };
});

ipcMain.handle('fs:readImageAsBase64', async (_, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const largeFormats = new Set(['.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.tiff', '.tif']);

    // For large/raw formats try embedded thumbnail via ExifTool (-b writes binary to stdout)
    if (largeFormats.has(ext)) {
      const thumb = await new Promise((resolve) => {
        const exifBin = getExifToolPath();
        const safeFile = filePath.replace(/"/g, '\\"');
        // Use -b flag and capture stdout as binary buffer
        const proc = require('child_process').spawn(
          exifBin, ['-b', '-ThumbnailImage', safeFile], { timeout: 8000 }
        );
        const chunks = [];
        proc.stdout.on('data', c => chunks.push(c));
        proc.on('close', (code) => {
          const buf = Buffer.concat(chunks);
          if (buf.length < 200) { resolve(null); return; }
          resolve(`data:image/jpeg;base64,${buf.toString('base64')}`);
        });
        proc.on('error', () => resolve(null));
      });
      if (thumb) return thumb;
    }

    // For JPG/PNG/WEBP/BMP: read full file but resize to max 400px wide for thumbnails
    const data = fs.readFileSync(filePath);
    const mimeExt = ext.replace('.', '');
    const mime = mimeExt === 'jpg' ? 'jpeg' : mimeExt;
    return `data:image/${mime};base64,${data.toString('base64')}`;
  } catch { return null; }
});

ipcMain.handle('fs:saveMetadata', async (_, { batchFolderPath, filename, metadata }) => {
  const outputPath = path.join(batchFolderPath, filename || 'metadata.json');
  try {
    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
    return { success: true, outputPath };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('shell:showItemInFolder', async (_, filePath) => {
  shell.showItemInFolder(filePath);
});
// --- Metadata Verifier IPC Handler (Python-based) -----------------------

ipcMain.handle('verify:runScript', async (event, { rootPath }) => {
  const { findPython, runVerifyScript } = require('./verify_runner');
  return runVerifyScript(rootPath, (data) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('verify:data', data);
    }
  });
});

ipcMain.handle('verify:sendInput', async (event, { input }) => {
  const { sendInput } = require('./verify_runner');
  sendInput(input);
});

ipcMain.handle('verify:cancel', async () => {
  const { cancelScript } = require('./verify_runner');
  cancelScript();
});

// ─── Image Tools IPC Handlers ───────────────────────────────────────────────
const { convertAllToJpg, resizeImages } = require('./image_tools_handlers');

ipcMain.handle('tools:convertToJpg', async (event, { folderPath }) => {
  return convertAllToJpg(folderPath, (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('tools:progress', progress);
    }
  });
});

ipcMain.handle('tools:resizeImages', async (event, { folderPath }) => {
  return resizeImages(folderPath, (progress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('tools:progress', progress);
    }
  });
});
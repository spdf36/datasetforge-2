# DatasetForge — Build & Distribution Guide

## What you'll end up with

Running the build produces a single file:
```
dist\DatasetForge Setup 1.0.0.exe
```
Send this `.exe` to any teammate. They double-click it, click Next a few times,
and DatasetForge appears on their desktop. No Node, no Python, no terminal needed.

---

## One-time setup on YOUR machine (the build machine)

### Step 1 — Install Node.js
Download the LTS installer from https://nodejs.org  
Run it, keep all defaults. Verify in PowerShell:
```powershell
node --version   # should print v18 or higher
npm --version
```

### Step 2 — Get ExifTool for Windows
1. Go to https://exiftool.org
2. Download **"Windows Executable"** (`exiftool-XX.XX_64.zip`)
3. Unzip it — you get a file called `exiftool(-k).exe`
4. Rename it to `exiftool.exe`
5. Place it here inside the project:
```
datasetforge\
  public\
    exiftool\
      exiftool.exe   ← goes here
```

### Step 3 — Build the installer
Double-click `BUILD.bat` inside the project folder.

It will:
1. Install all npm packages
2. Compile the React app
3. Package everything into a Windows installer

When it finishes, a `dist\` folder opens automatically containing:
```
DatasetForge Setup 1.0.0.exe   ← this is what you distribute
```

Total build time: ~2–4 minutes on first run, ~1 minute after that.

---

## What the installer does on your teammate's machine

- Installs DatasetForge to `C:\Program Files\DatasetForge\` (or wherever they choose)
- Creates a desktop shortcut
- Creates a Start Menu entry under DatasetForge
- Bundles ExifTool inside — no separate install needed on their end
- Adds an Uninstall entry in Windows Settings → Apps

---

## Updating the app

When you make code changes:
1. Bump the version in `package.json` → `"version": "1.0.1"`
2. Run `BUILD.bat` again
3. Share the new `DatasetForge Setup 1.0.1.exe`

Teammates just run the new installer — it overwrites the old version cleanly.

---

## Troubleshooting the build

| Error | Fix |
|---|---|
| `'react-scripts' is not recognized` | Run `npm install` first |
| `electron-builder: cannot find icon` | Make sure `assets\icon.ico` exists |
| `ExifTool not found` warning | Place `exiftool.exe` in `public\exiftool\` |
| Build hangs at "packaging" | Disable antivirus temporarily — it sometimes blocks Electron packaging |
| `ENOENT: no such file or directory, open 'build\index.html'` | React build failed — check Step 3 output for errors |

---

## Troubleshooting on teammate machines

| Problem | Fix |
|---|---|
| App won't open after install | Right-click the shortcut → "Run as administrator" once |
| "Windows protected your PC" warning | Click "More info" → "Run anyway" (normal for unsigned apps) |
| EXIF dates all show as missing | ExifTool is bundled — if this happens, reinstall from the latest `.exe` |
| App opens but is blank/white | Older Windows — update WebView2 from https://developer.microsoft.com/en-us/microsoft-edge/webview2/ |

---

## Optional: Code-sign the installer (removes the "Windows protected your PC" warning)

If your team is large or you distribute widely, signing removes the security warning.
You need a **Code Signing Certificate** (~$70–200/year from Sectigo, DigiCert, etc.).

Once you have a `.pfx` file, add this to `package.json` under `"win"`:
```json
"certificateFile": "path/to/your-cert.pfx",
"certificatePassword": "your-password"
```
Then rebuild. The warning disappears for all installers you produce.
For small internal teams the warning is fine to click through.

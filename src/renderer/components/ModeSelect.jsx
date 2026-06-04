// src/renderer/components/ModeSelect.jsx
import React from 'react';
import './ModeSelect.css';

export default function ModeSelect({ onSelectMode }) {
  return (
    <div className="mode-select-root">
      <div className="mode-bg">
        <GridPattern />
      </div>

      <div className="mode-header">
        <div className="mode-logo">
          <span className="logo-bracket">[</span>
          <span className="logo-name">DatasetForge</span>
          <span className="logo-bracket">]</span>
        </div>
        <p className="mode-tagline">Select a workflow to begin</p>
      </div>

      <div className="mode-cards">
        <ModeCard
          icon={
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="10" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 16h32" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M13 6L8 10M27 6l5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 22v8M16 26l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Batch Meta Processing"
          description="Import image batches, assign capture dates, fill metadata fields and generate metadata.json for each subject."
          accent="cyan"
          shortcut="Create"
          onClick={() => onSelectMode('process')}
        />

        <ModeCard
          icon={
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M20 13v8l5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 8l4 4M32 8l-4 4M8 32l4-4M32 32l-4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
            </svg>
          }
          label="Metadata Verifier"
          description="Scan existing metadata.json files, detect date mismatches, stale entries and missing images, and repair interactively."
          accent="amber"
          shortcut="Verify"
          onClick={() => onSelectMode('verify')}
        />

        <ModeCard
          icon={
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="8" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M16 26h14M16 32h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M24 8l6 6v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M24 8h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 17l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label="Image Tools"
          description="Convert all images to JPG, sync metadata.json keys, then resize images to minimum 512×512 px and 128 KB."
          accent="green"
          shortcut="Process"
          onClick={() => onSelectMode('tools')}
        />
      </div>

      <div className="mode-footer mono">DatasetForge v1.0 · Local metadata management</div>
    </div>
  );
}

function ModeCard({ icon, label, description, accent, shortcut, onClick }) {
  return (
    <button className={`mode-card mode-card-${accent}`} onClick={onClick}>
      <div className="mode-card-icon">{icon}</div>
      <div className="mode-card-body">
        <div className="mode-card-label">{label}</div>
        <div className="mode-card-desc">{description}</div>
      </div>
      <div className="mode-card-action">
        <span className="mode-card-shortcut">{shortcut} →</span>
      </div>
    </button>
  );
}

function GridPattern() {
  return (
    <svg className="grid-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="modegrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#modegrid)" />
    </svg>
  );
}
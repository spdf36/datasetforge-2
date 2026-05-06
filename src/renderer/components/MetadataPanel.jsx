// src/renderer/components/MetadataPanel.jsx
import React from 'react';
import './MetadataPanel.css';

const COUNTRY_OPTIONS = [
  { code: 'IN', label: 'IN' },
  { code: 'NG', label: 'NG' },
];

const DEVICE_OS_OPTIONS = [
  'android',
  'ios',
];
const ETHNICITY_OPTIONS = [
  'south_asian',
  'north_african',
  'Asian – East Asian',
  'Asian – South Asian',
  'Asian – Southeast Asian',
  'Black – African',
  'Black – African American',
  'Black – Caribbean',
  'Hispanic / Latino',
  'Middle Eastern / North African',
  'White – European',
  'White – North American',
  'Mixed / Multiracial',
  'Pacific Islander',
  'Indigenous / Native',
  'Other',
  'Prefer not to say',
];

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Other',
  'Prefer not to say',
];

export default function MetadataPanel({ metadata, onChange, disabled }) {
  const set = (key) => (e) => onChange({ ...metadata, [key]: e.target.value });

  return (
    <div className={`metadata-panel ${disabled ? 'panel-disabled' : ''}`}>
      <div className="metadata-scroll">

        <FieldGroup label="LOCATION" icon="◈">
          <Field id="country" label="Country">
            <select
              id="country"
              value={metadata.country}
              onChange={set('country')}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </Field>
        </FieldGroup>

        <FieldGroup label="DEMOGRAPHICS" icon="◉">
          <Field id="dob" label="Date of Birth" hint="YYYY-MM">
            <input
              id="dob"
              type="month"
              value={metadata.date_of_birth}
              onChange={set('date_of_birth')}
              disabled={disabled}
            />
          </Field>

          <Field id="gender" label="Gender">
            <select
              id="gender"
              value={metadata.gender}
              onChange={set('gender')}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {GENDER_OPTIONS.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>

          <Field id="ethnicity" label="Ethnicity">
            <select
              id="ethnicity"
              value={metadata.ethnicity}
              onChange={set('ethnicity')}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {ETHNICITY_OPTIONS.map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </Field>
        </FieldGroup>

        <FieldGroup label="DEVICE" icon="⬡">
          <Field id="device_os" label="Device OS">
            <select
              id="device_os"
              value={metadata.device_os}
              onChange={set('device_os')}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {DEVICE_OS_OPTIONS.map(os => (
                <option key={os} value={os}>{os}</option>
              ))}
            </select>
          </Field>
        </FieldGroup>

        {/* Live JSON preview */}
        <div className="json-preview-section">
          <div className="section-label-sm mono">
            <span style={{ color: 'var(--accent-green)' }}>▸</span> JSON Preview
          </div>
          <pre className="json-preview">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>

      </div>
    </div>
  );
}

function FieldGroup({ label, icon, children }) {
  return (
    <div className="field-group">
      <div className="group-header">
        <span className="group-icon">{icon}</span>
        <span className="group-label mono">{label}</span>
      </div>
      <div className="group-fields">{children}</div>
    </div>
  );
}

function Field({ id, label, hint, children }) {
  return (
    <div className="field">
      <div className="field-header">
        <label className="field-label" htmlFor={id}>{label}</label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
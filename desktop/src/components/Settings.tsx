import React, { useState } from 'react';
import './Settings.css';

interface SettingsProps {
  onClose: () => void;
}

const ALL_CATEGORIES = ['Tech', 'Finance', 'World', 'Sports'];

export default function Settings({ onClose }: SettingsProps) {
  const [enabledCategories, setEnabledCategories] = useState<string[]>(ALL_CATEGORIES);
  const [refreshInterval, setRefreshInterval] = useState(15);
  const [autoHideMinutes, setAutoHideMinutes] = useState(2);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleCategory = (cat: string) => {
    setEnabledCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  return (
    <div className="settings-root">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">News Categories</h3>
        <div className="settings-toggle-list">
          {ALL_CATEGORIES.map((cat) => (
            <label key={cat} className="settings-toggle-row">
              <span>{cat}</span>
              <div
                className={`toggle-switch ${enabledCategories.includes(cat) ? 'toggle-switch--on' : ''}`}
                onClick={() => toggleCategory(cat)}
              >
                <div className="toggle-thumb" />
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Refresh Interval</h3>
        <div className="settings-slider-row">
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="settings-slider"
          />
          <span className="settings-slider-value">{refreshInterval} min</span>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Auto-hide After</h3>
        <div className="settings-slider-row">
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={autoHideMinutes}
            onChange={(e) => setAutoHideMinutes(Number(e.target.value))}
            className="settings-slider"
          />
          <span className="settings-slider-value">{autoHideMinutes} min</span>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        <div className="theme-toggle">
          <button
            className={`theme-btn ${theme === 'dark' ? 'theme-btn--active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            🌙 Dark
          </button>
          <button
            className={`theme-btn ${theme === 'light' ? 'theme-btn--active' : ''}`}
            onClick={() => setTheme('light')}
          >
            ☀️ Light
          </button>
        </div>
      </div>

      <button className="settings-save-btn" onClick={onClose}>
        Save & Close
      </button>
    </div>
  );
}

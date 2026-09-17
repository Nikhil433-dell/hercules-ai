import React, { useState } from 'react';
import './Settings.css';

export type ThemeMode = 'light' | 'dark';

export interface UserSettings {
  categories: string[];
  refreshInterval: number;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: UserSettings = {
  categories: ['Tech', 'Finance', 'World', 'Sports'],
  refreshInterval: 15,
  theme: 'light',
};

interface SettingsProps {
  onClose: () => void;
  currentSettings: UserSettings;
  onSaveSettings: (newSettings: UserSettings) => void;
}

const ALL_CATEGORIES = ['Tech', 'Finance', 'World', 'Sports'];
const THEME_OPTIONS: ThemeMode[] = ['light', 'dark'];

export default function Settings({ onClose, currentSettings, onSaveSettings }: SettingsProps) {
  const [categories, setCategories] = useState<string[]>(currentSettings.categories);
  const [refreshInterval, setRefreshInterval] = useState<number>(currentSettings.refreshInterval);
  const [theme, setTheme] = useState<ThemeMode>(currentSettings.theme ?? 'light');

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = () => {
    const updated: UserSettings = {
      categories,
      refreshInterval,
      theme,
    };
    onSaveSettings(updated);
    onClose();
  };

  return (
    <div className="settings-root">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <button className="icon-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        <div className="theme-options">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`theme-option ${theme === option ? 'theme-option--active' : ''}`}
              onClick={() => setTheme(option)}
            >
              {option === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Enabled Categories</h3>
        <div className="settings-toggle-list">
          {ALL_CATEGORIES.map((cat) => {
            const isOn = categories.includes(cat);
            return (
              <div
                key={cat}
                className="settings-toggle-row"
                onClick={() => toggleCategory(cat)}
              >
                <span>{cat}</span>
                <div className={`toggle-switch ${isOn ? 'toggle-switch--on' : ''}`}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            );
          })}
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

      <button className="settings-save-btn" onClick={handleSave}>
        Save & Apply
      </button>
    </div>
  );
}

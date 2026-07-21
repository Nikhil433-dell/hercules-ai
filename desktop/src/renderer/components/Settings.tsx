import React from 'react';
import { UserPreferences } from '../types';

interface SettingsProps {
  preferences: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
}

export const Settings: React.FC<SettingsProps> = ({ preferences, onSave }) => {
  return (
    <div className="settings-form">
      <h3>Settings</h3>
      <button onClick={() => onSave(preferences)}>Save</button>
    </div>
  );
};

import React from 'react';
import SidePanel from './components/SidePanel';

// The main process hides the window. Keeping React mounted preserves feed state.
export default function App() {
  return <SidePanel onMinimize={() => window.electronAPI?.minimizePanel()} />;
}

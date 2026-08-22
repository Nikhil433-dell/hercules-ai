import React, { useState, useEffect, useCallback } from 'react';
import SidePanel from './components/SidePanel';
import FloatingIcon from './components/FloatingIcon';

type AppState = 'expanded' | 'collapsed';

export default function App() {
  const [panelState, setPanelState] = useState<AppState>('expanded');
  const [wakeKey, setWakeKey] = useState(0);

  const collapse = useCallback(() => {
    setPanelState('collapsed');
    (window as any).electronAPI?.minimizePanel();
  }, []);

  const expand = useCallback(() => {
    setPanelState('expanded');
    (window as any).electronAPI?.expandPanel();
    setWakeKey((k) => k + 1);
  }, []);

  // Listen for system wake & panel state events from main process
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    api.onSystemWake(() => {
      setPanelState('expanded');
      setWakeKey((k) => k + 1);
    });

    api.onPanelStateChanged?.((state: AppState) => {
      setPanelState(state);
      if (state === 'expanded') {
        setWakeKey((k) => k + 1);
      }
    });
  }, []);

  if (panelState === 'collapsed') {
    return <FloatingIcon onExpand={expand} />;
  }

  return <SidePanel key={wakeKey} onMinimize={collapse} />;
}

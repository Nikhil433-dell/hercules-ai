import React from 'react';
import { useAppStore } from './stores/appStore';
import { SidePanel } from './components/SidePanel';
import { FloatingIcon } from './components/FloatingIcon';
import { ChatInterface } from './components/ChatInterface';
import { Settings } from './components/Settings';
import './styles/global.css';
import './styles/panel.css';
import './styles/animations.css';
import './styles/components.css';

export const App: React.FC = () => {
  const { isExpanded, setExpanded, news } = useAppStore();

  const handleMinimize = () => {
    setExpanded(false);
    window.electronAPI?.minimizeToIcon();
  };

  const handleExpand = () => {
    setExpanded(true);
    window.electronAPI?.expandPanel();
  };

  return (
    <>
      {isExpanded ? (
        <SidePanel news={news} onMinimize={handleMinimize} />
      ) : (
        <FloatingIcon onExpand={handleExpand} unreadCount={news.length} />
      )}
    </>
  );
};

import React from 'react';
import { NewsArticle } from '../types';

interface SidePanelProps {
  news: NewsArticle[];
  onMinimize: () => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({ news, onMinimize }) => {
  // TODO: Auto-minimize timer logic here
  
  return (
    <div className="side-panel">
      <h2>Side Panel</h2>
      <button onClick={onMinimize}>Minimize</button>
      {/* List news here */}
    </div>
  );
};

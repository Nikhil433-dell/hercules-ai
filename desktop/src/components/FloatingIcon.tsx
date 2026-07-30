import React, { useState, useEffect } from 'react';
import './FloatingIcon.css';

interface FloatingIconProps {
  onExpand: () => void;
}

export default function FloatingIcon({ onExpand }: FloatingIconProps) {
  const [pulse, setPulse] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    // Pulse every 8s to remind user
    const interval = setInterval(() => setPulse((p) => !p), 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`floating-root ${visible ? 'floating-visible' : ''}`}>
      <button
        className={`floating-btn ${pulse ? 'floating-btn--pulse' : ''}`}
        onClick={onExpand}
        title="Open Hercules AI"
      >
        <span className="floating-icon-inner">⚡</span>
        <div className="floating-ring" />
      </button>
    </div>
  );
}

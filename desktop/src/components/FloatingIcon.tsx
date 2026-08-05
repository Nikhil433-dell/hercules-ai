import React, { useState, useEffect } from 'react';
import './FloatingIcon.css';

interface FloatingIconProps {
  onExpand: () => void;
}

export default function FloatingIcon({ onExpand }: FloatingIconProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div className={`floating-root ${visible ? 'floating-visible' : ''}`}>
      <button
        className="floating-btn"
        onClick={onExpand}
        title="Open Hercules AI"
      >
        <span className="floating-icon-inner">H</span>
      </button>
    </div>
  );
}

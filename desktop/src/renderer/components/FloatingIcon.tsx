import React from 'react';

interface FloatingIconProps {
  onExpand: () => void;
  unreadCount: number;
}

export const FloatingIcon: React.FC<FloatingIconProps> = ({ onExpand, unreadCount }) => {
  return (
    <div className="floating-icon" onClick={onExpand}>
      <span className="icon-badge">{unreadCount}</span>
    </div>
  );
};

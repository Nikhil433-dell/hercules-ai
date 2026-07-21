import { useState, useEffect } from 'react';

export const useSystemEvents = () => {
  const [isAwake, setIsAwake] = useState<boolean>(true);
  const [lastWakeTime, setLastWakeTime] = useState<number>(Date.now());

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onSystemWake(() => {
        setIsAwake(true);
        setLastWakeTime(Date.now());
      });
    }
  }, []);

  return { isAwake, lastWakeTime };
};

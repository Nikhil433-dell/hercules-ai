import { app } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';

export function startOutsideClickMonitor(onClick: (point: { x: number; y: number }) => void): () => void {
  if (process.platform !== 'darwin') return () => undefined;
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'outside-click')]
    : [path.join(app.getAppPath(), 'native/bin/outside-click'), path.resolve(app.getAppPath(), '../../native/bin/outside-click')];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    console.warn('Outside-click helper unavailable; popup dismissal will use focus changes.');
    return () => undefined;
  }
  const child = spawn(executable, [], { stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  let active = true;
  lines.on('line', (line) => {
    if (!active) return;
    try {
      const point = JSON.parse(line);
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) onClick(point);
    } catch { /* Ignore incomplete helper output. */ }
  });
  child.on('error', () => console.warn('Outside-click helper could not start.'));
  return () => {
    active = false;
    lines.close();
    child.kill();
  };
}

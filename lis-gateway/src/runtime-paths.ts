import * as path from 'path';
import * as fs from 'fs';

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export interface RuntimePaths {
  rootDir: string;
  configDir: string;
  dataDir: string;
  logsDir: string;
  configFile: string;
}

export function resolveRuntimePaths(): RuntimePaths {
  const baseProgramData =
    (process.env.LIS_GATEWAY_HOME || '').trim() ||
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'LISGateway');

  const rootDir = ensureDir(baseProgramData);
  const configDir = ensureDir(path.join(rootDir, 'config'));
  const dataDir = ensureDir(path.join(rootDir, 'data'));
  const logsDir = ensureDir(path.join(rootDir, 'logs'));

  return {
    rootDir,
    configDir,
    dataDir,
    logsDir,
    configFile: path.join(configDir, 'agent.json'),
  };
}

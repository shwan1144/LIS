import fs from 'fs';
import path from 'path';
import https from 'https';

const ROOT = process.cwd();
const AGENT_ROOT = path.resolve(ROOT, '..', 'lis-gateway');
const RESOURCES_ROOT = path.resolve(ROOT, 'installer', 'resources');
const RES_AGENT = path.join(RESOURCES_ROOT, 'agent');
const RES_SCRIPTS = path.join(RESOURCES_ROOT, 'scripts');

const SOURCE_DIST_DIR = path.join(AGENT_ROOT, 'dist');
const SOURCE_NODE_MODULES_DIR = path.join(AGENT_ROOT, 'node_modules');
const SOURCE_NODE_EXE = process.execPath;
const SOURCE_XML = path.join(AGENT_ROOT, 'service', 'lis-gateway-agent.xml');
const SOURCE_INSTALL_PS1 = path.join(AGENT_ROOT, 'scripts', 'install-service.ps1');
const SOURCE_UNINSTALL_PS1 = path.join(AGENT_ROOT, 'scripts', 'uninstall-service.ps1');

const WINSW_URL =
  'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe';
const TARGET_WINSW = path.join(RES_AGENT, 'WinSW-x64.exe');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing file: ${src}`);
  }
  fs.copyFileSync(src, dest);
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing directory: ${src}`);
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function downloadFile(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects while downloading ${url}`));
      return;
    }

    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}) for ${url}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
        file.on('error', (err) => {
          fs.unlink(dest, () => reject(err));
        });
      })
      .on('error', reject);
  });
}

async function main() {
  ensureDir(RES_AGENT);
  ensureDir(RES_SCRIPTS);

  copyDirectory(SOURCE_DIST_DIR, path.join(RES_AGENT, 'dist'));
  copyDirectory(SOURCE_NODE_MODULES_DIR, path.join(RES_AGENT, 'agent-node-modules'));
  copyFile(SOURCE_NODE_EXE, path.join(RES_AGENT, 'node.exe'));
  copyFile(SOURCE_XML, path.join(RES_AGENT, 'LISGatewayAgent.xml'));
  copyFile(SOURCE_INSTALL_PS1, path.join(RES_SCRIPTS, 'install-service.ps1'));
  copyFile(SOURCE_UNINSTALL_PS1, path.join(RES_SCRIPTS, 'uninstall-service.ps1'));
  fs.rmSync(path.join(RES_AGENT, 'lis-gateway-agent.exe'), { force: true });
  fs.rmSync(path.join(RES_AGENT, 'dist', 'bin'), { recursive: true, force: true });
  fs.rmSync(path.join(RES_AGENT, 'node_modules'), { recursive: true, force: true });

  if (!fs.existsSync(TARGET_WINSW)) {
    console.log(`Downloading WinSW runtime: ${WINSW_URL}`);
    await downloadFile(WINSW_URL, TARGET_WINSW);
  }

  console.log(`Installer resources prepared at: ${RESOURCES_ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

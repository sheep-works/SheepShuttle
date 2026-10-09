import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, fork, ChildProcess } from 'child_process';
import dotenv from 'dotenv';

function loadEnv() {
  const devEnvPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    return;
  }
  const exeDir = path.dirname(process.execPath);
  const prodEnvPath1 = path.join(exeDir, '.env');
  if (fs.existsSync(prodEnvPath1)) {
    dotenv.config({ path: prodEnvPath1 });
    return;
  }
  if (process.resourcesPath) {
    const prodEnvPath2 = path.join(process.resourcesPath, '.env');
    if (fs.existsSync(prodEnvPath2)) {
      dotenv.config({ path: prodEnvPath2 });
      return;
    }
  }
  dotenv.config();
}
loadEnv();

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;

function emitLog(win: BrowserWindow | null, msg: string) {
  try {
    const logFilePath = path.join(app.getPath('userData'), 'server.log');
    const timestamp = new Date().toISOString();
    const cleanMsg = msg.endsWith('\n') ? msg.slice(0, -1) : msg;
    fs.appendFileSync(logFilePath, `[${timestamp}] ${cleanMsg}\n`);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('server-log', msg.endsWith('\n') ? msg : msg + '\n');
  }
}

function killExistingPortProcess(port: number) {
  try {
    const execSync = require('child_process').execSync;
    if (process.platform === 'win32') {
      const cmd = `cmd /c "for /f \\"tokens=5\\" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /f /pid %a"`;
      execSync(cmd, { stdio: 'ignore' });
    } else {
      const cmd = `lsof -ti:${port} | xargs kill -9`;
      execSync(cmd, { stdio: 'ignore' });
    }
  } catch (err) {
    // Ignore error if no process was listening on the port
  }
}

function startHonoServer(win: BrowserWindow) {
  if (apiProcess) {
    emitLog(win, '[Desktop Info] Hono API server is already running.');
    return;
  }

  // Clear any zombie process that might still hold port 8000
  killExistingPortProcess(8000);

  let apiScript = '';
  if (app.isPackaged) {
    apiScript = path.resolve(__dirname, '../node_modules/@sheep-family/api/dist/index.js');
  } else {
    apiScript = path.resolve(__dirname, '../../api/dist/index.js');
  }
  console.log(`Starting Hono server from: ${apiScript}`);

  if (!fs.existsSync(apiScript)) {
    emitLog(win, `[Desktop Error] Compiled Hono API script not found at:\n  ${apiScript}\n\nPlease run "pnpm run build:api" first to compile the API.`);
    win.webContents.send('server-status', 'ERROR');
    return;
  }

  emitLog(win, `[Desktop Info] Starting Hono API server sidecar...`);
  win.webContents.send('server-status', 'STARTING');

  // Use fork instead of spawn('node') so it runs via Electron's Node environment
  // and supports reading from app.asar transparently.
  const proc = fork(apiScript, [], {
    env: { 
      ...process.env, 
      PORT: '8000',
      USER_DATA_PATH: app.getPath('userData'),
      DEBUG_LOG: String(process.env.DEBUG_LOG || 'false')
    },
    stdio: 'pipe'
  });
  apiProcess = proc;

  proc.stdout?.on('data', (data) => {
    if (win.isDestroyed()) return;
    const msg = data.toString();
    emitLog(win, msg);
    if (msg.includes('Server is running on port')) {
      win.webContents.send('server-status', 'RUNNING');
    }
  });

  proc.stderr?.on('data', (data) => {
    if (win.isDestroyed()) return;
    const msg = data.toString();
    emitLog(win, `[API Stderr] ${msg}`);
  });

  proc.on('error', (err) => {
    if (win.isDestroyed()) return;
    emitLog(win, `[Desktop Error] Failed to start Hono API server: ${err.message}`);
    win.webContents.send('server-status', 'ERROR');
    apiProcess = null;
  });

  proc.on('close', (code) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      apiProcess = null;
      return;
    }
    emitLog(win, `[Desktop Info] Hono API server exited with code ${code}`);
    win.webContents.send('server-status', 'STOPPED');
    apiProcess = null;
  });
}

function stopHonoServer(win: BrowserWindow) {
  if (apiProcess) {
    if (!win.isDestroyed()) {
      emitLog(win, `[Desktop Info] Stopping Hono API server...`);
    }
    apiProcess.kill();
    apiProcess = null;
  }
  killExistingPortProcess(8000);
}
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(data);
      if (config.PROJECT_ID) process.env.PROJECT_ID = config.PROJECT_ID;
      if (config.VERTEX_MODEL) process.env.VERTEX_MODEL = config.VERTEX_MODEL;
      if (config.API_KEY_SHEEP) process.env.API_KEY_SHEEP = config.API_KEY_SHEEP;
      if (config.AI_STUDIO_FREE) process.env.AI_STUDIO_FREE = config.AI_STUDIO_FREE;
      if (config.OPENAI_API_KEY) process.env.OPENAI_API_KEY = config.OPENAI_API_KEY;
      if (config.OPENAI_MODEL) process.env.OPENAI_MODEL = config.OPENAI_MODEL;
      if (config.CLAUDE_API_KEY) process.env.CLAUDE_API_KEY = config.CLAUDE_API_KEY;
      if (config.CLAUDE_MODEL) process.env.CLAUDE_MODEL = config.CLAUDE_MODEL;
      if (config.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = config.DEEPSEEK_API_KEY;
      if (config.DEEPSEEK_MODEL) process.env.DEEPSEEK_MODEL = config.DEEPSEEK_MODEL;
      if (config.DEBUG_LOG !== undefined) process.env.DEBUG_LOG = String(config.DEBUG_LOG);
      console.log('Loaded config from:', configPath);
    } catch (err) {
      console.error('Failed to read config.json:', err);
    }
  } else {
    const defaultConfig = {
      ACTIVE_PROVIDER: 'vertex-sheep',
      PROJECT_ID: process.env.PROJECT_ID || 'project-5c3c5988-edd9-4109-907',
      VERTEX_MODEL: 'gemini-3.1-pro-preview',
      API_KEY_SHEEP: process.env.API_KEY_SHEEP || '71TMRzhzwQSvITAd01PKWVlRfI4zSLa21cdpj_RWu4c',
      OLLAMA_URL: 'http://localhost:11434',
      OLLAMA_MODEL: 'gemma4:e2b',
      LMSTUDIO_URL: 'http://127.0.0.1:1234',
      LMSTUDIO_MODEL: 'local-model',
      AI_STUDIO_FREE: process.env.AI_STUDIO_FREE || '',
      GEMINI_MODEL: 'gemini-1.5-flash',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      OPENAI_MODEL: 'gpt-4o-mini',
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
      CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_FREE || '',
      DEEPSEEK_MODEL: 'deepseek-chat',
      DEBUG_LOG: false
    };
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log('Created default config.json at:', configPath);
      process.env.PROJECT_ID = defaultConfig.PROJECT_ID;
      process.env.VERTEX_MODEL = defaultConfig.VERTEX_MODEL;
      process.env.API_KEY_SHEEP = defaultConfig.API_KEY_SHEEP;
      process.env.AI_STUDIO_FREE = defaultConfig.AI_STUDIO_FREE;
      process.env.OPENAI_API_KEY = defaultConfig.OPENAI_API_KEY;
      process.env.OPENAI_MODEL = defaultConfig.OPENAI_MODEL;
      process.env.CLAUDE_API_KEY = defaultConfig.CLAUDE_API_KEY;
      process.env.CLAUDE_MODEL = defaultConfig.CLAUDE_MODEL;
      process.env.DEEPSEEK_API_KEY = defaultConfig.DEEPSEEK_API_KEY;
      process.env.DEEPSEEK_MODEL = defaultConfig.DEEPSEEK_MODEL;
      process.env.DEBUG_LOG = String(defaultConfig.DEBUG_LOG);
    } catch (err) {
      console.error('Failed to create default config.json:', err);
    }
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);

  let iconPath = path.join(__dirname, 'bobbin.ico');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.resolve(__dirname, '../bobbin.ico');
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'SheepBobbin Local',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    startHonoServer(mainWindow!);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// IPC Handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-update', async () => {
  const currentVersion = app.getVersion();
  try {
    const res = await fetch('https://storage.lambuage.com/bobbins/latest.json', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) {
      return { hasUpdate: false, currentVersion };
    }
    const data: any = await res.json();
    const latestVersion = data.version || data.ver || '';
    const hasUpdate = isNewerVersion(currentVersion, latestVersion);
    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      downloadUrl: data.downloadUrl || data.url || 'https://storage.lambuage.com/bobbins/',
      notes: data.notes || ''
    };
  } catch (err: any) {
    console.log('[Desktop Info] Update check skipped:', err.message);
    return { hasUpdate: false, currentVersion };
  }
});

ipcMain.on('open-external', (_event, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('open-web-ui', () => {
  shell.openExternal('https://comb.lambuage.com');
});

ipcMain.on('open-logs-folder', () => {
  const logFilePath = path.join(app.getPath('userData'), 'server.log');
  shell.showItemInFolder(logFilePath);
});

ipcMain.on('open-tokens-folder', () => {
  const tokensDir = path.join(app.getPath('userData'), 'Tokens');
  if (!fs.existsSync(tokensDir)) {
    fs.mkdirSync(tokensDir, { recursive: true });
  }
  shell.openPath(tokensDir);
});

ipcMain.on('open-responses-folder', () => {
  const responsesDir = path.join(app.getPath('userData'), 'responses');
  if (!fs.existsSync(responsesDir)) {
    fs.mkdirSync(responsesDir, { recursive: true });
  }
  shell.openPath(responsesDir);
});

ipcMain.handle('get-token-files', async () => {
  const tokensDir = path.join(app.getPath('userData'), 'Tokens');
  if (!fs.existsSync(tokensDir)) {
    return [];
  }
  const files = fs.readdirSync(tokensDir).filter(f => f.endsWith('.tsv'));
  return files.map(filename => {
    const filePath = path.join(tokensDir, filename);
    const stats = fs.statSync(filePath);
    return {
      filename,
      size: stats.size,
      mtime: stats.mtime.toISOString()
    };
  }).sort((a, b) => b.filename.localeCompare(a.filename));
});

ipcMain.handle('read-token-file', async (_event, filename: string) => {
  const safeFilename = path.basename(filename);
  const filePath = path.join(app.getPath('userData'), 'Tokens', safeFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Token file ${safeFilename} not found.`);
  }
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.on('restart-server', () => {
  if (mainWindow) {
    stopHonoServer(mainWindow);
    setTimeout(() => {
      if (mainWindow) {
        startHonoServer(mainWindow);
      }
    }, 1000);
  }
});

ipcMain.handle('get-settings', () => {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }
  return {};
});

ipcMain.handle('save-settings', async (_event, settings: any) => {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('Saved settings to:', configPath);

    if (settings.PROJECT_ID) process.env.PROJECT_ID = settings.PROJECT_ID;
    if (settings.VERTEX_MODEL) process.env.VERTEX_MODEL = settings.VERTEX_MODEL;
    if (settings.API_KEY_SHEEP) process.env.API_KEY_SHEEP = settings.API_KEY_SHEEP;
    if (settings.AI_STUDIO_FREE) process.env.AI_STUDIO_FREE = settings.AI_STUDIO_FREE;
    if (settings.OPENAI_API_KEY) process.env.OPENAI_API_KEY = settings.OPENAI_API_KEY;
    if (settings.OPENAI_MODEL) process.env.OPENAI_MODEL = settings.OPENAI_MODEL;
    if (settings.CLAUDE_API_KEY) process.env.CLAUDE_API_KEY = settings.CLAUDE_API_KEY;
    if (settings.CLAUDE_MODEL) process.env.CLAUDE_MODEL = settings.CLAUDE_MODEL;
    if (settings.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = settings.DEEPSEEK_API_KEY;
    if (settings.DEEPSEEK_MODEL) process.env.DEEPSEEK_MODEL = settings.DEEPSEEK_MODEL;
    if (settings.DEBUG_LOG !== undefined) process.env.DEBUG_LOG = String(settings.DEBUG_LOG);

    if (mainWindow) {
      stopHonoServer(mainWindow);
      setTimeout(() => {
        if (mainWindow) {
          startHonoServer(mainWindow);
        }
      }, 1000);
    }
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save settings:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('run-greet', async () => {
  // Use the API key loaded from .env
  const apiKey = process.env.API_KEY_SHEEP || '';
  try {
    const res = await fetch('http://localhost:8000/gen/greet', {
      headers: {
        'X-API-KEY': apiKey
      }
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: 'error', error: `HTTP ${res.status}: ${text}` };
    }
    return await res.json();
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('execute-direct', async (_event, params: { chunk: string; prompt?: string; mode?: string }) => {
  const apiKey = process.env.API_KEY_SHEEP || '';
  const startTime = Date.now();
  const endpoint = params.mode || 'check/user/sync';
  const targetUrl = `http://localhost:8000/gen/${endpoint.replace(/^\//, '')}`;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({
        chunk: params.chunk,
        prompt: params.prompt || undefined
      })
    });

    const durationMs = Date.now() - startTime;
    if (!res.ok) {
      const errorText = await res.text();
      return {
        status: 'error',
        error: `HTTP ${res.status}: ${errorText}`,
        durationMs
      };
    }

    const data: any = await res.json();
    return {
      status: data.status || 'success',
      result: data.result !== undefined ? data.result : JSON.stringify(data, null, 2),
      error: data.error || null,
      durationMs
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      status: 'error',
      error: err.message || 'Execution failed',
      durationMs
    };
  }
});

ipcMain.handle('fetch-models', async (_event, provider: string, url: string, customApiKey?: string) => {
  const apiKey = process.env.API_KEY_SHEEP || '';
  const maxRetries = 5;
  const retryDelay = 300; // ms

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'X-API-KEY': apiKey,
        'X-LLM-Provider': provider,
        'X-LLM-URL': url || ''
      };
      if (customApiKey && customApiKey.trim()) {
        headers['X-LLM-Key'] = customApiKey.trim();
      }

      const res = await fetch('http://localhost:8000/gen/models', {
        headers
      });
      if (!res.ok) {
        console.warn(`[Desktop Warning] Failed to fetch models: Hono returned HTTP ${res.status}`);
        return [];
      }
      return await res.json();
    } catch (err: any) {
      const isConnRefused = 
        err.code === 'ECONNREFUSED' || 
        err.message?.includes('ECONNREFUSED') || 
        err.cause?.code === 'ECONNREFUSED' || 
        err.cause?.message?.includes('ECONNREFUSED');

      if (isConnRefused && attempt < maxRetries) {
        console.log(`[Desktop Info] Hono server not ready (ECONNREFUSED). Retrying model fetch (${attempt}/${maxRetries}) in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      console.warn(`[Desktop Warning] Failed to fetch models via IPC: ${err.message}`);
      return [];
    }
  }
  return [];
});

function rotateLogsIfNeeded() {
  try {
    const logFilePath = path.join(app.getPath('userData'), 'server.log');
    const backupLogPath = path.join(app.getPath('userData'), 'server.bak.log');
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > MAX_SIZE) {
        if (fs.existsSync(backupLogPath)) {
          fs.unlinkSync(backupLogPath);
        }
        fs.renameSync(logFilePath, backupLogPath);
        console.log(`[Desktop Info] Rotated log file because it exceeded 5MB.`);
      }
    }
  } catch (err) {
    console.error('Failed to rotate logs:', err);
  }
}

// App lifecycle
app.whenReady().then(() => {
  rotateLogsIfNeeded();
  loadConfig();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (apiProcess) {
    apiProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (apiProcess) {
    apiProcess.kill();
  }
});

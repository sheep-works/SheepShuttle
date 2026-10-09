import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('apiConsole', {
  onServerLog: (callback: (msg: string) => void) => {
    const subscription = (_event: any, msg: string) => callback(msg);
    ipcRenderer.on('server-log', subscription);
    return () => {
      ipcRenderer.removeListener('server-log', subscription);
    };
  },
  onServerStatus: (callback: (status: string) => void) => {
    const subscription = (_event: any, status: string) => callback(status);
    ipcRenderer.on('server-status', subscription);
    return () => {
      ipcRenderer.removeListener('server-status', subscription);
    };
  },
  openWebUi: () => {
    ipcRenderer.send('open-web-ui');
  },
  openLogsFolder: () => {
    ipcRenderer.send('open-logs-folder');
  },
  restartServer: () => {
    ipcRenderer.send('restart-server');
  },
  greet: () => {
    return ipcRenderer.invoke('run-greet');
  },
  getAppVersion: () => {
    return ipcRenderer.invoke('get-app-version');
  },
  getSettings: () => {
    return ipcRenderer.invoke('get-settings');
  },
  saveSettings: (settings: {
    ACTIVE_PROVIDER: string;
    PROJECT_ID?: string;
    VERTEX_MODEL?: string;
    API_KEY_SHEEP?: string;
    AI_STUDIO_FREE?: string;
    GEMINI_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    CLAUDE_API_KEY?: string;
    CLAUDE_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    OLLAMA_URL?: string;
    OLLAMA_MODEL?: string;
    LMSTUDIO_URL?: string;
    LMSTUDIO_MODEL?: string;
    DEBUG_LOG?: boolean;
  }) => {
    return ipcRenderer.invoke('save-settings', settings);
  },
  fetchModels: (provider: string, url: string, apiKey?: string) => {
    return ipcRenderer.invoke('fetch-models', provider, url, apiKey);
  },
  openTokensFolder: () => {
    ipcRenderer.send('open-tokens-folder');
  },
  openResponsesFolder: () => {
    ipcRenderer.send('open-responses-folder');
  },
  getTokenFiles: () => {
    return ipcRenderer.invoke('get-token-files');
  },
  readTokenFile: (filename: string) => {
    return ipcRenderer.invoke('read-token-file', filename);
  },
  checkUpdate: () => {
    return ipcRenderer.invoke('check-update');
  },
  openExternal: (url: string) => {
    ipcRenderer.send('open-external', url);
  },
  executeDirect: (params: { chunk: string; prompt?: string; mode?: string }) => {
    return ipcRenderer.invoke('execute-direct', params);
  }
});

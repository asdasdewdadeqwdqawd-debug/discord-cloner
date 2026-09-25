const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rat', {
  login: (token) => ipcRenderer.invoke('bot:login', token),
  logout: () => ipcRenderer.invoke('bot:logout'),
  me: () => ipcRenderer.invoke('bot:me'),

  getChannels: (guildId) => ipcRenderer.invoke('guild:channels', guildId),
  getMembers: (guildId) => ipcRenderer.invoke('guild:members', guildId),
  getBotPerms: (guildId) => ipcRenderer.invoke('guild:botPerms', guildId),

  getHistory: (channelId) => ipcRenderer.invoke('channel:history', channelId),
  send: (channelId, content) => ipcRenderer.invoke('channel:send', channelId, content),

  pickFile: () => ipcRenderer.invoke('file:pick'),
  sendFile: (channelId, content) => ipcRenderer.invoke('file:send', channelId, content),

  timeout: (g, m, mins, reason) => ipcRenderer.invoke('mod:timeout', g, m, mins, reason),
  kick: (g, m, reason) => ipcRenderer.invoke('mod:kick', g, m, reason),
  ban: (g, m, reason) => ipcRenderer.invoke('mod:ban', g, m, reason),

  subscribe: () => ipcRenderer.invoke('bot:subscribe'),
  onMessage: (cb) => ipcRenderer.on('message:new', (_e, data) => cb(data)),

  // auto update
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, d) => cb(d))
});
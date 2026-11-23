'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('neonDesktop', {
  quit: () => ipcRenderer.send('neon:quit'),
  fullscreen: () => ipcRenderer.send('neon:fullscreen')
});

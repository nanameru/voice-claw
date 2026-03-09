"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  gateway: {
    send: (method, params) => ipcRenderer.invoke("gateway:send", method, params),
    connect: () => ipcRenderer.invoke("gateway:connect"),
    disconnect: () => ipcRenderer.invoke("gateway:disconnect"),
    getStatus: () => ipcRenderer.invoke("gateway:status"),
    onMessage: (callback) => {
      const handler = (_event, message) => callback(message);
      ipcRenderer.on("gateway:message", handler);
      return () => ipcRenderer.removeListener("gateway:message", handler);
    },
    onStatusChange: (callback) => {
      const handler = (_event, status) => callback(status);
      ipcRenderer.on("gateway:status", handler);
      return () => ipcRenderer.removeListener("gateway:status", handler);
    },
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("gateway:event", handler);
      return () => ipcRenderer.removeListener("gateway:event", handler);
    },
  },
  overlay: {
    hide: () => ipcRenderer.invoke("overlay:hide"),
    onShow: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("overlay:show", handler);
      return () => ipcRenderer.removeListener("overlay:show", handler);
    },
    onHide: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("overlay:hide", handler);
      return () => ipcRenderer.removeListener("overlay:hide", handler);
    },
  },
  shortcut: {
    update: (shortcut) => ipcRenderer.invoke("shortcut:update", shortcut),
  },
  store: {
    get: (key) => ipcRenderer.invoke("store:get", key),
    set: (key, value) => ipcRenderer.invoke("store:set", key, value),
  },
  mic: {
    checkPermission: () => ipcRenderer.invoke("mic:check-permission"),
    requestPermission: () => ipcRenderer.invoke("mic:request-permission"),
  },
  conversations: {
    get: () => ipcRenderer.invoke("conversations:get"),
    add: (conversation) => ipcRenderer.invoke("conversations:add", conversation),
    clear: () => ipcRenderer.invoke("conversations:clear"),
  },
};

contextBridge.exposeInMainWorld("voiceClaw", api);

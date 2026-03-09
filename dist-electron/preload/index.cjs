"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// ── Security: IPC channel allowlists ──────────────────
const INVOKE_ALLOWED = new Set([
  "gateway:send",
  "gateway:connect",
  "gateway:disconnect",
  "gateway:status",
  "gateway:process-status",
  "gateway:process-start",
  "gateway:process-stop",
  "gateway:process-restart",
  "shortcut:update",
  "overlay:hide",
  "store:get",
  "store:set",
  "mic:check-permission",
  "mic:request-permission",
  "conversations:get",
  "conversations:add",
  "conversations:clear",
]);

const ON_ALLOWED = new Set([
  "gateway:message",
  "gateway:status",
  "gateway:event",
  "gateway:process-status",
  "overlay:show",
  "overlay:hide",
]);

function safeInvoke(channel, ...args) {
  if (!INVOKE_ALLOWED.has(channel)) {
    throw new Error(`IPC invoke channel not allowed: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeOn(channel, handler) {
  if (!ON_ALLOWED.has(channel)) {
    throw new Error(`IPC on channel not allowed: ${channel}`);
  }
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  gateway: {
    send: (method, params) => safeInvoke("gateway:send", method, params),
    connect: () => safeInvoke("gateway:connect"),
    disconnect: () => safeInvoke("gateway:disconnect"),
    getStatus: () => safeInvoke("gateway:status"),
    onMessage: (callback) => {
      const handler = (_event, message) => callback(message);
      return safeOn("gateway:message", handler);
    },
    onStatusChange: (callback) => {
      const handler = (_event, status) => callback(status);
      return safeOn("gateway:status", handler);
    },
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      return safeOn("gateway:event", handler);
    },
  },
  overlay: {
    hide: () => safeInvoke("overlay:hide"),
    onShow: (callback) => {
      const handler = () => callback();
      return safeOn("overlay:show", handler);
    },
    onHide: (callback) => {
      const handler = () => callback();
      return safeOn("overlay:hide", handler);
    },
  },
  shortcut: {
    update: (shortcut) => safeInvoke("shortcut:update", shortcut),
  },
  store: {
    get: (key) => safeInvoke("store:get", key),
    set: (key, value) => safeInvoke("store:set", key, value),
  },
  mic: {
    checkPermission: () => safeInvoke("mic:check-permission"),
    requestPermission: () => safeInvoke("mic:request-permission"),
  },
  conversations: {
    get: () => safeInvoke("conversations:get"),
    add: (conversation) => safeInvoke("conversations:add", conversation),
    clear: () => safeInvoke("conversations:clear"),
  },
};

contextBridge.exposeInMainWorld("voiceClaw", api);

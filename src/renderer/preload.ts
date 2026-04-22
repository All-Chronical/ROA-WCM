import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
    getCharacterCategories: () => ipcRenderer.invoke("getCharacterCategories"),

    saveCharacterCategories: (...args: any[]) =>
        ipcRenderer.invoke("saveCharacterCategories", args),

    reloadFromDisk: () => ipcRenderer.invoke("reloadFromDisk"),

    getRoaDirectory: () => ipcRenderer.invoke("getRoaDirectory"),

    openDirectory: (...args: any[]) =>
        ipcRenderer.invoke("openDirectory", args),

    openExternal: (...args: any[]) =>
        ipcRenderer.invoke("openExternal", args),

    getCharacterInfo: (...args: any[]) =>
        ipcRenderer.invoke("getCharacterInfo", args),
});

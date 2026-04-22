import {
    BrowserWindow,
    IpcMainInvokeEvent,
    ProtocolRequest,
    ProtocolResponse,
    app,
    ipcMain,
    protocol,
    shell,
} from "electron";
import path from "path";
import fs from "fs-extra";
import * as characters from "./characters";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let win: BrowserWindow | null = null;

function createWindow(): void {
    win = new BrowserWindow({
        width: 1120,
        height: 630,
        minWidth: 810,
        minHeight: 600,
        webPreferences: {
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        },
        autoHideMenuBar: true,
        darkTheme: true,
        title: "ROA Mod Manager",
    });

    win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    // Register img:// protocol for loading character thumbnails
    protocol.registerFileProtocol("img", async (
        request: ProtocolRequest,
        callback: (response: string | ProtocolResponse) => void
    ) => {
        const url: string = request.url.replace("img://", "");
        if (await fs.pathExists(url)) return callback(url);
        return callback("");
    });

    // IPC Handlers
    ipcMain.handle("getCharacterCategories", () => {
        return characters.getCharacterCategories();
    });

    ipcMain.handle("saveCharacterCategories", (
        _event: IpcMainInvokeEvent,
        args: Parameters<typeof characters.saveCharacterCategories>
    ) => {
        return characters.saveCharacterCategories(...args);
    });

    ipcMain.handle("reloadFromDisk", () => {
        return characters.reloadFromDisk();
    });

    ipcMain.handle("getRoaDirectory", () => {
        return characters.getRoaDirectory();
    });

    ipcMain.handle("openDirectory", (
        _event: IpcMainInvokeEvent,
        args: [string]
    ) => {
        return shell.openPath(args[0]);
    });

    ipcMain.handle("openExternal", (
        _event: IpcMainInvokeEvent,
        args: [string]
    ) => {
        return shell.openExternal(args[0]);
    });

    ipcMain.handle("getCharacterInfo", (
        _event: IpcMainInvokeEvent,
        args: [string]
    ) => {
        return characters.getCharacterInfo(args[0]);
    });
}

if (require("electron-squirrel-startup")) {
    app.quit();
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

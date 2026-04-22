import { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { TabCharacters } from "../tabs/characters/Characters";
import "./App.css";

declare global {
    interface Window {
        api: {
            getCharacterCategories: () => Promise<any>;
            saveCharacterCategories: (...args: any[]) => Promise<void>;
            reloadFromDisk: () => Promise<any>;
            getRoaDirectory: () => Promise<string>;
            openDirectory: (...args: any[]) => Promise<void>;
            openExternal: (...args: any[]) => Promise<void>;
            getCharacterInfo: (...args: any[]) => Promise<any>;
        };
    }
}

export function render(): void {
    const root = createRoot(document.getElementById("root")!);
    root.render(<App />);
}

function App(): JSX.Element {
    const [status, setStatus] = useState<string>("Ready");

    const log = useCallback((msg: string): void => {
        setStatus(msg);
    }, []);

    return (
        <section style={{ marginLeft: 0 }}>
            <TabCharacters log={log} />
            <StatusBar status={status} />
        </section>
    );
}

function StatusBar({ status }: { status: string }): JSX.Element {
    return (
        <div className="status-bar">
            <span>{status}</span>
        </div>
    );
}

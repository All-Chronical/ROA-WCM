import fs from "fs-extra";
import path from "path";
import ini from "ini";
import {
    RoaCharacter,
    RoaCategory,
    RoaModType,
    ROA_GROUP_LABELS,
    CategoryWithCharacters,
} from "../global/global";

// -- Binary helpers --

class BinReader {
    private data: Buffer;
    public p: number;

    constructor(data: Buffer) {
        this.data = data;
        this.p = 0;
    }

    readNull(count: number = 1): void {
        for (let i = 0; i < count; i++) {
            if (this.data[this.p] !== 0x00) {
                throw new Error(`Expected null byte at position ${this.p}, got ${this.data[this.p]}`);
            }
            this.p++;
        }
    }

    readRaw(length: number): Buffer {
        const val = this.data.subarray(this.p, this.p + length);
        this.p += length;
        return val;
    }

    readInt(): number {
        const val = this.data.readUInt16LE(this.p);
        this.p += 2;
        return val;
    }

    readStr(): Buffer {
        const start = this.p;
        while (this.p < this.data.length && this.data[this.p] !== 0x00) {
            this.p++;
        }
        return this.data.subarray(start, this.p);
    }
}

class BinWriter {
    private parts: Buffer[] = [];

    get blob(): Buffer {
        return Buffer.concat(this.parts);
    }

    writeNull(): void {
        this.parts.push(Buffer.from([0x00]));
    }

    writeInt(val: number): void {
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(val);
        this.parts.push(buf);
    }

    writeStr(val: Buffer): void {
        this.parts.push(Buffer.concat([val, Buffer.from([0x00])]));
    }

    writeRaw(val: Buffer): void {
        this.parts.push(val);
    }

    writeStrList(strings: Buffer[]): void {
        this.writeInt(strings.length);
        this.parts.push(Buffer.from([0x00, 0x00]));
        for (const s of strings) {
            this.parts.push(Buffer.concat([s, Buffer.from([0x00])]));
        }
    }
}

// -- ROA Directory --

export function getRoaDir(): string {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) throw new Error("LOCALAPPDATA environment variable not found");
    return path.join(localAppData, "RivalsofAether", "workshop");
}

// -- ROA Entry helpers --

const IMAGE_PATHS: Record<RoaModType, string> = {
    characters: "charselect.png",
    buddies: "icon.png",
    stages: "thumb.png",
    skins: "result_small.png",
};

function readConfigIni(directory: string): Record<string, string> {
    const iniPath = path.join(directory, "config.ini");
    if (!fs.existsSync(iniPath)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(iniPath, "utf-8");
        const parsed = ini.parse(raw);
        const general = parsed.general || parsed.General || {};
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(general)) {
            let strVal = String(value);
            // ROA config.ini values are often quoted with backticks or quotes
            if (
                (strVal.startsWith('"') && strVal.endsWith('"')) ||
                (strVal.startsWith("'") && strVal.endsWith("'"))
            ) {
                strVal = strVal.slice(1, -1);
            }
            result[key] = strVal;
        }
        return result;
    } catch {
        return {};
    }
}

function getModType(typeVal: string | undefined): RoaModType {
    switch (typeVal) {
        case "0": return "characters";
        case "1": return "buddies";
        case "2": return "stages";
        case "3": return "skins";
        default: return "characters";
    }
}

export function parseRoaEntry(rawPath: string): RoaCharacter {
    const directory = rawPath;
    const id = path.basename(directory);
    const config = readConfigIni(directory);
    const modType = getModType(config.type);

    return {
        rawPath,
        id,
        directory,
        name: config.name || "<UNKNOWN>",
        author: config.author || "<UNKNOWN>",
        type: modType,
        imagePath: path.join(directory, IMAGE_PATHS[modType]),
        hasError: Object.keys(config).length === 0,
    };
}

// -- Order file (ported from RoaOrderFile) --

const ORDER_HEADER = Buffer.from("order.roa", "utf-8");

export interface RoaOrderGroups {
    characters: string[];
    buddies: string[];
    stages: string[];
    skins: string[];
}

export function loadOrderFile(roaPath: string): RoaOrderGroups {
    const data = fs.readFileSync(roaPath);
    return parseOrderBytes(data);
}

function parseOrderBytes(data: Buffer): RoaOrderGroups {
    const reader = new BinReader(data);
    const groups: string[][] = [];
    let currGroup: string[] = [];
    let expectedCount = 0;

    while (reader.p < data.length - 1) {
        const str = reader.readStr();

        if (str.equals(ORDER_HEADER)) {
            // Close previous group
            groups.push(currGroup);
            currGroup = [];

            const marker = reader.readRaw(2);
            if (marker[0] !== 0x00 || marker[1] !== 0x01) {
                throw new Error("Unexpected marker after header");
            }
            expectedCount = reader.readInt();
            reader.readNull(2);
        } else {
            currGroup.push(str.toString("utf-8"));
            reader.readNull();
        }
    }
    groups.push(currGroup);

    // Drop leading empty group
    if (groups.length > 0 && groups[0].length === 0) {
        groups.shift();
    }

    if (groups.length < ROA_GROUP_LABELS.length) {
        throw new Error(
            `Parse error: expected >= ${ROA_GROUP_LABELS.length} groups but got ${groups.length}`
        );
    }

    return {
        characters: groups[0] || [],
        buddies: groups[1] || [],
        stages: groups[2] || [],
        skins: groups[3] || [],
    };
}

export function encodeOrderBytes(groups: RoaOrderGroups): Buffer {
    const writer = new BinWriter();
    const groupArrays = [groups.characters, groups.buddies, groups.stages, groups.skins];

    for (const group of groupArrays) {
        writer.writeStr(ORDER_HEADER);
        writer.writeRaw(Buffer.from([0x01]));
        writer.writeStrList(group.map((s) => Buffer.from(s, "utf-8")));
    }

    return writer.blob;
}

export function saveOrderFile(roaPath: string, groups: RoaOrderGroups): void {
    const encoded = encodeOrderBytes(groups);
    console.log("Writing", roaPath);
    fs.writeFileSync(roaPath, encoded);
}

// -- Categories file --

export function loadCategoriesFile(roaPath: string): RoaCategory[] {
    const data = fs.readFileSync(roaPath);
    return parseCategoriesBytes(data);
}

function parseCategoriesBytes(data: Buffer): RoaCategory[] {
    const reader = new BinReader(data);
    const categories: RoaCategory[] = [];
    const expectedCount = reader.readInt();

    for (let i = 0; i < expectedCount; i++) {
        const cIndex = reader.readInt();
        const cLabel = reader.readStr();
        categories.push({ index: cIndex, label: cLabel.toString("utf-8") });
        reader.readNull();
    }

    return categories;
}

export function encodeCategoriesBytes(categories: RoaCategory[]): Buffer {
    const writer = new BinWriter();
    writer.writeInt(categories.length);
    for (const c of categories) {
        writer.writeInt(c.index);
        writer.writeStr(Buffer.from(c.label, "utf-8"));
    }
    return writer.blob;
}

export function saveCategoriesFile(roaPath: string, categories: RoaCategory[]): void {
    const encoded = encodeCategoriesBytes(categories);
    console.log("Writing", roaPath);
    fs.writeFileSync(roaPath, encoded);
}

// -- Zip characters with categories --

export function zipCharactersWithCategories(
    characterPaths: string[],
    categories: RoaCategory[]
): CategoryWithCharacters[] {
    const catsByIndex: Map<number, string> = new Map();
    for (const c of categories) {
        catsByIndex.set(c.index, c.label);
    }

    const result: Map<string, RoaCharacter[]> = new Map();
    let currentCategory = "unsorted";

    for (let i = 0; i < characterPaths.length; i++) {
        if (catsByIndex.has(i)) {
            currentCategory = catsByIndex.get(i)!;
        }
        if (!result.has(currentCategory)) {
            result.set(currentCategory, []);
        }
        result.get(currentCategory)!.push(parseRoaEntry(characterPaths[i]));
    }

    return Array.from(result.entries()).map(([name, characters]) => ({
        name,
        characters,
    }));
}

// -- Unzip categories back to flat lists --

export function unzipCategoriesToRoa(
    categoryGroups: CategoryWithCharacters[]
): { characterPaths: string[]; categories: RoaCategory[] } {
    const characterPaths: string[] = [];
    const categories: RoaCategory[] = [];

    for (const group of categoryGroups) {
        if (group.characters.length < 1) continue;
        categories.push({
            index: characterPaths.length,
            label: group.name,
        });
        for (const char of group.characters) {
            characterPaths.push(char.rawPath);
        }
    }

    return { characterPaths, categories };
}

// -- Prune deleted & scan for new entries --

export function pruneDeletedEntries(paths: string[]): string[] {
    return paths.filter((p) => {
        if (!fs.existsSync(p)) {
            console.log("Entry has disappeared from disk:", p);
            return false;
        }
        return true;
    });
}

export function scanForNewEntries(
    knownPaths: string[],
    roaDir: string
): string[] {
    const knownSet = new Set(knownPaths.map((p) => path.resolve(p)));
    const newPaths: string[] = [];

    // Scan all parent directories that contain known entries
    const parentDirs = new Set<string>();
    for (const p of knownPaths) {
        parentDirs.add(path.dirname(p));
    }

    for (const parent of parentDirs) {
        if (!fs.existsSync(parent)) continue;
        const entries = fs.readdirSync(parent, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(parent, entry.name);
                if (!knownSet.has(path.resolve(fullPath))) {
                    console.log("Found new entry:", fullPath);
                    newPaths.push(fullPath);
                }
            }
        }
    }

    return newPaths;
}

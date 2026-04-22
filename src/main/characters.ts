import path from "path";
import {
    RoaCharacter,
    RoaCategory,
    CategoryWithCharacters,
} from "../global/global";
import {
    getRoaDir,
    loadOrderFile,
    loadCategoriesFile,
    saveOrderFile,
    saveCategoriesFile,
    zipCharactersWithCategories,
    unzipCategoriesToRoa,
    pruneDeletedEntries,
    scanForNewEntries,
    parseRoaEntry,
    RoaOrderGroups,
} from "./roa";

let orderGroups: RoaOrderGroups | null = null;
let categories: RoaCategory[] | null = null;

function getOrderPath(): string {
    return path.join(getRoaDir(), "order.roa");
}

function getCategoriesPath(): string {
    return path.join(getRoaDir(), "categories.roa");
}

export function loadFromDisk(): void {
    orderGroups = loadOrderFile(getOrderPath());
    categories = loadCategoriesFile(getCategoriesPath());

    // Prune deleted entries
    orderGroups.characters = pruneDeletedEntries(orderGroups.characters);
    orderGroups.buddies = pruneDeletedEntries(orderGroups.buddies);
    orderGroups.stages = pruneDeletedEntries(orderGroups.stages);
    orderGroups.skins = pruneDeletedEntries(orderGroups.skins);

    // Collect all known paths across every group so that entries
    // already tracked in buddies/stages/skins are not misclassified
    // as new characters.
    const allKnown = [
        ...orderGroups.characters,
        ...orderGroups.buddies,
        ...orderGroups.stages,
        ...orderGroups.skins,
    ];

    // Scan for truly new entries and classify by config.ini type
    const newEntries = scanForNewEntries(allKnown, getRoaDir());
    for (const entry of newEntries) {
        const info = parseRoaEntry(entry);
        switch (info.type) {
            case "characters": orderGroups.characters.push(entry); break;
            case "buddies":    orderGroups.buddies.push(entry);    break;
            case "stages":     orderGroups.stages.push(entry);     break;
            case "skins":      orderGroups.skins.push(entry);      break;
        }
    }
}

export function getCharacterCategories(): CategoryWithCharacters[] {
    if (!orderGroups || !categories) {
        loadFromDisk();
    }
    return zipCharactersWithCategories(orderGroups!.characters, categories!);
}

export function getRoaDirectory(): string {
    return getRoaDir();
}

export function saveCharacterCategories(
    categoryGroups: CategoryWithCharacters[]
): void {
    if (!orderGroups) {
        throw new Error("Order groups not loaded");
    }

    const { characterPaths, categories: newCategories } =
        unzipCategoriesToRoa(categoryGroups);

    orderGroups.characters = characterPaths;
    categories = newCategories;

    saveOrderFile(getOrderPath(), orderGroups);
    saveCategoriesFile(getCategoriesPath(), newCategories);
}

export function reloadFromDisk(): CategoryWithCharacters[] {
    loadFromDisk();
    return getCharacterCategories();
}

export function getCharacterInfo(rawPath: string): RoaCharacter {
    return parseRoaEntry(rawPath);
}

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

    // Scan for new entries
    const roaDir = getRoaDir();
    const newChars = scanForNewEntries(orderGroups.characters, roaDir);
    orderGroups.characters.push(...newChars);
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

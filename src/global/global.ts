// ROA Mod Manager - Shared Types

export interface RoaCharacter {
    /** Raw directory path bytes as stored in ROA file */
    rawPath: string;
    /** Resolved directory name (Steam Workshop ID) */
    id: string;
    /** Full directory path */
    directory: string;
    /** Character name from config.ini */
    name: string;
    /** Author from config.ini */
    author: string;
    /** Mod type: characters, buddies, stages, skins */
    type: RoaModType;
    /** Path to the thumbnail image */
    imagePath: string;
    /** Whether the config.ini had a parse error */
    hasError: boolean;
}

export type RoaModType = "characters" | "buddies" | "stages" | "skins";

export const ROA_GROUP_LABELS: RoaModType[] = ["characters", "buddies", "stages", "skins"];

export interface RoaCategory {
    index: number;
    label: string;
}

export interface CategoryWithCharacters {
    name: string;
    characters: RoaCharacter[];
}

export interface CharacterManagerState {
    categories: CategoryWithCharacters[];
}

export interface AppState {
    roaDir: string;
    isDirty: boolean;
}

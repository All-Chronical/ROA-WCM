import { useEffect, useState, useCallback, useRef } from "react";
import { CategoryWithCharacters, RoaCharacter } from "../../../global/global";
import "./Characters.css";

const api = (window as any).api;

const PAGE_SIZE = 16; // 4x4
const COLS = 4;
const ROWS = 4;

type DndMode = "insert" | "swap";

// Unique key for a cell: "catIndex:charIndex" for filled, "catIndex:empty:pageLocalIndex" for empty
interface CellAddress {
    catIndex: number;
    charIndex: number; // -1 for empty slots
}

interface TabCharactersProps {
    log: (msg: string) => void;
}

export function TabCharacters({ log }: TabCharactersProps): JSX.Element {
    const [categories, setCategories] = useState<CategoryWithCharacters[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [dndMode, setDndMode] = useState<DndMode>("insert");
    const [searchValue, setSearchValue] = useState("");

    // Selection: set of "catIndex:charIndex" keys
    const [selected, setSelected] = useState<Set<string>>(new Set<string>());
    const [lastSelected, setLastSelected] = useState<string | null>(null);

    // Drag state
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);

    // Category editing state
    const [newCatName, setNewCatName] = useState<string | null>(null);
    const [renamingCat, setRenamingCat] = useState<{ index: number; name: string } | null>(null);

    const categoriesRef = useRef(categories);
    categoriesRef.current = categories;

    // -- Load / Save --

    const loadData = useCallback(async () => {
        try {
            const cats: CategoryWithCharacters[] = await api.getCharacterCategories();
            setCategories(cats);
            setSelected(new Set<string>());
            setLastSelected(null);
            setIsDirty(false);
            log(`Loaded ${cats.length} categories`);
        } catch (err: any) {
            log(`Error loading: ${err.message}`);
        }
    }, [log]);

    useEffect(() => { loadData(); }, [loadData]);

    function updateCategories(newCats: CategoryWithCharacters[]): void {
        setCategories(newCats);
        setIsDirty(true);
    }

    async function handleSave(): Promise<void> {
        try {
            await api.saveCharacterCategories(categoriesRef.current);
            setIsDirty(false);
            log("Saved to ROA files");
        } catch (err: any) {
            log(`Save error: ${err.message}`);
        }
    }

    async function handleReload(): Promise<void> {
        await loadData();
        log("Reloaded from disk");
    }
    
    // -- Build page data from categories --

    // Each category's chars are chunked into pages of 16.
    // If a category has 20 chars: page 1 = 16, page 2 = 4 + 12 empty.

    interface PageData {
        catIndex: number;
        catName: string;
        pageInCat: number;
        totalPagesInCat: number;
        cells: (RoaCharacter | null)[]; // length always 16, null = empty slot
        startCharIndex: number; // index of first char in this page within the category
    }

    function buildPages(): PageData[] {
        const pages: PageData[] = [];
        for (let ci = 0; ci < categories.length; ci++) {
            const cat = categories[ci];
            const chars = cat.characters;
            const totalPages = Math.max(1, Math.ceil(chars.length / PAGE_SIZE));

            for (let p = 0; p < totalPages; p++) {
                const startIdx = p * PAGE_SIZE;
                const slice = chars.slice(startIdx, startIdx + PAGE_SIZE);
                const cells: (RoaCharacter | null)[] = [];
                for (let i = 0; i < PAGE_SIZE; i++) {
                    cells.push(i < slice.length ? slice[i] : null);
                }
                pages.push({
                    catIndex: ci,
                    catName: cat.name,
                    pageInCat: p,
                    totalPagesInCat: totalPages,
                    cells,
                    startCharIndex: startIdx,
                });
            }
        }
        return pages;
    }

    const allPages = buildPages();

    // Group pages by category for rendering category bundles
    interface CatBundle {
        catIndex: number;
        catName: string;
        charCount: number;
        pages: PageData[];
    }

    function buildBundles(): CatBundle[] {
        const bundles: CatBundle[] = [];
        let currentCi = -1;
        for (const page of allPages) {
            if (page.catIndex !== currentCi) {
                currentCi = page.catIndex;
                bundles.push({
                    catIndex: page.catIndex,
                    catName: page.catName,
                    charCount: categories[page.catIndex].characters.length,
                    pages: [],
                });
            }
            bundles[bundles.length - 1].pages.push(page);
        }
        return bundles;
    }

    const bundles = buildBundles();

    // -- Cell key helpers --

    function cellKey(catIndex: number, charIndex: number): string {
        return `${catIndex}:${charIndex}`;
    }

    function parseCellKey(key: string): CellAddress {
        const [ci, chi] = key.split(":").map(Number);
        return { catIndex: ci, charIndex: chi };
    }

    // -- Selection --

    function handleCellClick(catIndex: number, charIndex: number, e: React.MouseEvent): void {
        if (charIndex < 0) return; // empty slot
        const key = cellKey(catIndex, charIndex);

        if (e.ctrlKey || e.metaKey) {
            setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
            });
            setLastSelected(key);
        } else if (e.shiftKey && lastSelected) {
            // Range select within the same category
            const last = parseCellKey(lastSelected);
            if (last.catIndex === catIndex) {
                const lo = Math.min(last.charIndex, charIndex);
                const hi = Math.max(last.charIndex, charIndex);
                setSelected((prev) => {
                    const next = new Set(prev);
                    for (let i = lo; i <= hi; i++) next.add(cellKey(catIndex, i));
                    return next;
                });
            } else {
                setSelected(new Set<string>([key]));
                setLastSelected(key);
            }
        } else {
            setSelected(new Set<string>([key]));
            setLastSelected(key);
        }
    }

    // -- Drag & Drop --

    function handleDragStart(e: React.DragEvent, catIndex: number, charIndex: number): void {
        const key = cellKey(catIndex, charIndex);
        if (!selected.has(key)) {
            setSelected(new Set<string>([key]));
        }
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "grid", key }));
        e.dataTransfer.effectAllowed = "move";
    }

    function handleDragOver(e: React.DragEvent, catIndex: number, charIndex: number): void {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverKey(cellKey(catIndex, charIndex >= 0 ? charIndex : 9000 + catIndex));
    }

    function handleDragLeave(): void {
        setDragOverKey(null);
    }

    function handleDrop(e: React.DragEvent, toCatIndex: number, toCharIndex: number): void {
        e.preventDefault();
        setDragOverKey(null);

        let data: any;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }

        if (data.type === "grid") {
            handleGridDrop(toCatIndex, toCharIndex);
        }
    }

    function handleGridDrop(toCatIndex: number, toCharIndex: number): void {
        if (selected.size === 0) return;

        // Collect all selected characters grouped by source category
        const selectedByCategory = new Map<number, number[]>();
        for (const key of Array.from(selected)) {
            const addr = parseCellKey(key);
            if (!selectedByCategory.has(addr.catIndex)) {
                selectedByCategory.set(addr.catIndex, []);
            }
            selectedByCategory.get(addr.catIndex)!.push(addr.charIndex);
        }

        // Sort indices descending within each category for safe removal
        for (const indices of Array.from(selectedByCategory.values())) {
            indices.sort((a: number, b: number) => a - b);
        }

        // Gather the actual characters in order
        const movedChars: RoaCharacter[] = [];
        for (const [ci, indices] of Array.from(selectedByCategory.entries())) {
            for (const idx of indices) {
                movedChars.push(categories[ci].characters[idx]);
            }
        }

        if (dndMode === "swap") {
            if (
                toCharIndex >= 0 &&
                toCharIndex < categories[toCatIndex].characters.length
            ) {
                const newCats = categories.map((cat, ci) => ({ ...cat, characters: [...cat.characters] }));
                if (selected.size === 1) {
                    // Single swap
                    const fromAddr = parseCellKey(Array.from(selected)[0]);
                    const fromChar = newCats[fromAddr.catIndex].characters[fromAddr.charIndex];
                    const toChar = newCats[toCatIndex].characters[toCharIndex];
                    newCats[fromAddr.catIndex].characters[fromAddr.charIndex] = toChar;
                    newCats[toCatIndex].characters[toCharIndex] = fromChar;
                } else {
                    // Multi-select swap: pairwise swap with consecutive target slots
                    const keys = Array.from(selected);
                    for (let i = 0; i < keys.length; i++) {
                        const targetIdx = toCharIndex + i;
                        if (targetIdx >= newCats[toCatIndex].characters.length) break;
                        const fromAddr = parseCellKey(keys[i]);
                        const fromChar = newCats[fromAddr.catIndex].characters[fromAddr.charIndex];
                        const toChar = newCats[toCatIndex].characters[targetIdx];
                        newCats[fromAddr.catIndex].characters[fromAddr.charIndex] = toChar;
                        newCats[toCatIndex].characters[targetIdx] = fromChar;
                    }
                }
                updateCategories(newCats);
                setSelected(new Set<string>());
                log(`Swapped ${movedChars.length} character(s)`);
                return;
            }
        }

        // Insert mode: remove from source, insert at target
        // Build new categories: first remove all selected
        let newCats = categories.map((cat, ci) => {
            const removeSet = selectedByCategory.get(ci);
            if (!removeSet) return { ...cat, characters: [...cat.characters] };
            const removeIndices = new Set(removeSet);
            return {
                ...cat,
                characters: cat.characters.filter((_, i) => !removeIndices.has(i)),
            };
        });

        // Calculate adjusted target index (because we removed items that may shift the target)
        let adjustedIndex = toCharIndex;
        const removedBefore = selectedByCategory.get(toCatIndex);
        if (removedBefore) {
            const countBefore = removedBefore.filter((i: number) => i < toCharIndex).length;
            adjustedIndex = Math.max(0, toCharIndex - countBefore);
        }

        // Insert at target
        newCats = newCats.map((cat, ci) => {
            if (ci !== toCatIndex) return cat;
            const newChars = [...cat.characters];
            const insertAt = Math.min(adjustedIndex, newChars.length);
            newChars.splice(insertAt, 0, ...movedChars);
            return { ...cat, characters: newChars };
        });

        updateCategories(newCats);
        setSelected(new Set<string>());
        log(`Moved ${movedChars.length} character(s)`);
    }

    function removeSelectedFromGrid(): void {
        if (selected.size === 0) return;
        const selectedByCategory = new Map<number, Set<number>>();
        for (const key of Array.from(selected)) {
            const addr = parseCellKey(key);
            if (!selectedByCategory.has(addr.catIndex)) {
                selectedByCategory.set(addr.catIndex, new Set());
            }
            selectedByCategory.get(addr.catIndex)!.add(addr.charIndex);
        }

        const newCats = categories.map((cat, ci) => {
            const removeSet = selectedByCategory.get(ci);
            if (!removeSet) return cat;
            return {
                ...cat,
                characters: cat.characters.filter((_, i) => !removeSet.has(i)),
            };
        });

        updateCategories(newCats);
        setSelected(new Set<string>());
        log(`Removed ${selected.size} character(s) from grid`);
    }


    // -- Category operations --

    function addCategory(): void {
        setNewCatName("");
    }

    function commitAddCategory(): void {
        if (newCatName === null) return;
        const trimmed = newCatName.trim();
        if (!trimmed) { setNewCatName(null); return; }
        if (categories.some((c) => c.name === trimmed)) {
            log(`Category "${trimmed}" already exists`);
            return;
        }
        updateCategories([...categories, { name: trimmed, characters: [] }]);
        log(`Added category: ${trimmed}`);
        setNewCatName(null);
    }

    function renameCategory(catIndex: number): void {
        setRenamingCat({ index: catIndex, name: categories[catIndex].name });
    }

    function commitRenameCategory(): void {
        if (renamingCat === null) return;
        const trimmed = renamingCat.name.trim();
        if (!trimmed || trimmed === categories[renamingCat.index].name) {
            setRenamingCat(null);
            return;
        }
        if (categories.some((c) => c.name === trimmed)) {
            log(`Category "${trimmed}" already exists`);
            return;
        }
        updateCategories(categories.map((c, i) => i === renamingCat.index ? { ...c, name: trimmed } : c));
        log(`Renamed to: ${trimmed}`);
        setRenamingCat(null);
    }

    // -- Context menu actions for cells --

    function openFolder(char: RoaCharacter): void {
        api.openDirectory(char.directory);
    }

    // -- Render --

    return (
        <>
            <div className="characters-container">
                {/* -- Grid Area -- */}
                <div className="grid-area">
                    {/* Toolbar */}
                    <div className="toolbar">
                        <div className="toolbar-group">
                            <button
                                className={`dnd-mode-btn ${dndMode === "insert" ? "active" : ""}`}
                                onClick={() => setDndMode("insert")}
                                title="Insert mode: drop inserts between characters"
                            >
                                Insert
                            </button>
                            <button
                                className={`dnd-mode-btn ${dndMode === "swap" ? "active" : ""}`}
                                onClick={() => setDndMode("swap")}
                                title="Swap mode: drop swaps with target character"
                            >
                                Swap
                            </button>
                        </div>

                        <div className="toolbar-separator" />

                        {selected.size > 0 && (
                            <span style={{ fontSize: "9pt", color: "var(--roa-white1)" }}>
                                {selected.size} selected
                            </span>
                        )}

                        <div style={{ flexGrow: 1 }} />

                        <div className="toolbar-group">
                            {newCatName !== null ? (
                                <input
                                    autoFocus
                                    className="inline-edit-input"
                                    placeholder="Category name"
                                    value={newCatName}
                                    onChange={(e) => setNewCatName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") commitAddCategory();
                                        if (e.key === "Escape") setNewCatName(null);
                                    }}
                                    onBlur={() => commitAddCategory()}
                                />
                            ) : (
                                <button className="icon-btn" onClick={addCategory} title="Add category">
                                    <span className="material-icons">New category</span>
                                </button>
                            )}
                            <div className="toolbar-separator" />
                            <button className="icon-btn" onClick={async () => {
                                const dir = await api.getRoaDirectory();
                                api.openDirectory(dir);
                            }} title="Open ROA folder">
                                <span className="material-icons">Open order dir</span>
                            </button>
                            <div className="toolbar-separator" />
                            <button className="icon-btn" onClick={handleReload} title="Reload from disk">
                                <span className="material-icons">refresh</span>
                            </button>
                            <button
                                className="icon-btn"
                                onClick={handleSave}
                                title="Save to ROA files"
                                style={isDirty ? { color: "var(--roa-accent1)" } : undefined}
                            >
                                <span className="material-icons">save</span>
                            </button>
                            {isDirty && <span className="dirty-indicator" />}
                        </div>
                    </div>

                    {/* Scrollable grid */}
                    <div className="grid-scroll" onClick={() => setSelected(new Set<string>())}>
                        {bundles.length === 0 ? (
                            <div className="empty-state">No categories loaded</div>
                        ) : (
                            bundles.map((bundle) => (
                                <CategoryBundle
                                    key={bundle.catIndex}
                                    bundle={bundle}
                                    categories={categories}
                                    selected={selected}
                                    dragOverKey={dragOverKey}
                                    dndMode={dndMode}
                                    onCellClick={handleCellClick}
                                    onDragStart={handleDragStart}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onRename={renameCategory}
                                    renamingCat={renamingCat}
                                    onRenamingChange={(name) => setRenamingCat(renamingCat ? { ...renamingCat, name } : null)}
                                    onRenameCommit={commitRenameCategory}
                                    onRenameCancel={() => setRenamingCat(null)}
                                    onOpenFolder={openFolder}
                                    cellKey={cellKey}
                                />
                            ))
                        )}
                    </div>
                </div>

            </div>
        </>
    );
}

// -- Category Bundle Component --

interface CatBundle {
    catIndex: number;
    catName: string;
    charCount: number;
    pages: {
        catIndex: number;
        catName: string;
        pageInCat: number;
        totalPagesInCat: number;
        cells: (RoaCharacter | null)[];
        startCharIndex: number;
    }[];
}

function CategoryBundle({
    bundle,
    categories,
    selected,
    dragOverKey,
    dndMode,
    onCellClick,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onRename,
    renamingCat,
    onRenamingChange,
    onRenameCommit,
    onRenameCancel,
    onOpenFolder,
    cellKey: cellKeyFn,
}: {
    bundle: CatBundle;
    categories: CategoryWithCharacters[];
    selected: Set<string>;
    dragOverKey: string | null;
    dndMode: DndMode;
    onCellClick: (catIndex: number, charIndex: number, e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent, catIndex: number, charIndex: number) => void;
    onDragOver: (e: React.DragEvent, catIndex: number, charIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, toCatIndex: number, toCharIndex: number) => void;
    onRename: (catIndex: number) => void;
    renamingCat: { index: number; name: string } | null;
    onRenamingChange: (name: string) => void;
    onRenameCommit: () => void;
    onRenameCancel: () => void;
    onOpenFolder: (char: RoaCharacter) => void;
    cellKey: (catIndex: number, charIndex: number) => string;
}): JSX.Element {
    const isRenaming = renamingCat !== null && renamingCat.index === bundle.catIndex;
    return (
        <div className="category-bundle" onClick={(e) => e.stopPropagation()}>
            <div className="category-header">
                {isRenaming ? (
                    <input
                        autoFocus
                        className="inline-edit-input"
                        value={renamingCat!.name}
                        onChange={(e) => onRenamingChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onRenameCommit();
                            if (e.key === "Escape") onRenameCancel();
                        }}
                        onBlur={() => onRenameCommit()}
                    />
                ) : (
                    <>
                        <span className="category-title">{bundle.catName}</span>
                        <span className="category-count">{bundle.charCount} characters</span>
                        <button
                            className="icon-btn"
                            onClick={() => onRename(bundle.catIndex)}
                            title="Rename category"
                        >
                            <span className="material-icons" style={{ fontSize: 16 }}>edit</span>
                        </button>
                    </>
                )}
            </div>
            <div
                className="category-pages"
                onDragOver={(e) => {
                    e.preventDefault();
                    onDragOver(e, bundle.catIndex, categories[bundle.catIndex].characters.length);
                }}
                onDrop={(e) => {
                    onDrop(e, bundle.catIndex, categories[bundle.catIndex].characters.length);
                }}
            >
                {bundle.pages.map((page, pi) => (
                    <PageGrid
                        key={pi}
                        page={page}
                        selected={selected}
                        dragOverKey={dragOverKey}
                        dndMode={dndMode}
                        onCellClick={onCellClick}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onOpenFolder={onOpenFolder}
                        cellKey={cellKeyFn}
                    />
                ))}
            </div>
        </div>
    );
}

// -- Page Grid Component (single 4x4 page) --

function PageGrid({
    page,
    selected,
    dragOverKey,
    dndMode,
    onCellClick,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onOpenFolder,
    cellKey: cellKeyFn,
}: {
    page: {
        catIndex: number;
        pageInCat: number;
        totalPagesInCat: number;
        cells: (RoaCharacter | null)[];
        startCharIndex: number;
    };
    selected: Set<string>;
    dragOverKey: string | null;
    dndMode: DndMode;
    onCellClick: (catIndex: number, charIndex: number, e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent, catIndex: number, charIndex: number) => void;
    onDragOver: (e: React.DragEvent, catIndex: number, charIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, toCatIndex: number, toCharIndex: number) => void;
    onOpenFolder: (char: RoaCharacter) => void;
    cellKey: (catIndex: number, charIndex: number) => string;
}): JSX.Element {
    const rows: (RoaCharacter | null)[][] = [];
    for (let r = 0; r < ROWS; r++) {
        rows.push(page.cells.slice(r * COLS, r * COLS + COLS));
    }

    return (
        <div className="page-grid">
            <div className="page-label">
                Page {page.pageInCat + 1} / {page.totalPagesInCat}
            </div>
            <div className="page-rows">
                {rows.map((row, ri) => (
                    <div key={ri} className="page-row">
                        {row.map((cell, ci) => {
                            const cellIdx = ri * COLS + ci;
                            const charIndex = page.startCharIndex + cellIdx;
                            const isFilled = cell !== null;
                            const key = isFilled
                                ? cellKeyFn(page.catIndex, charIndex)
                                : `empty-${page.catIndex}-${page.pageInCat}-${cellIdx}`;
                            const isSelected = isFilled && selected.has(cellKeyFn(page.catIndex, charIndex));
                            const isDragTarget =
                                dragOverKey === cellKeyFn(page.catIndex, charIndex);

                            if (!isFilled) {
                                return (
                                    <div
                                        key={key}
                                        className={`grid-cell grid-cell-empty ${isDragTarget ? "drag-over-on" : ""}`}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onDragOver(e, page.catIndex, charIndex);
                                        }}
                                        onDragLeave={(e) => {
                                            e.stopPropagation();
                                            onDragLeave();
                                        }}
                                        onDrop={(e) => {
                                            e.stopPropagation();
                                            onDrop(e, page.catIndex, charIndex);
                                        }}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={key}
                                    className={[
                                        "grid-cell",
                                        isSelected ? "selected" : "",
                                        isDragTarget
                                            ? dndMode === "insert"
                                                ? "drag-over-left"
                                                : "drag-over-on"
                                            : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    draggable
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCellClick(page.catIndex, charIndex, e);
                                    }}
                                    onDragStart={(e) => onDragStart(e, page.catIndex, charIndex)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDragOver(e, page.catIndex, charIndex);
                                    }}
                                    onDragLeave={(e) => {
                                        e.stopPropagation();
                                        onDragLeave();
                                    }}
                                    onDrop={(e) => {
                                        e.stopPropagation();
                                        onDrop(e, page.catIndex, charIndex);
                                    }}
                                >
                                    <img
                                        className="cell-mug"
                                        src={`img://${cell.imagePath}`}
                                        draggable={false}
                                        onError={(e: any) => {
                                            e.target.style.visibility = "hidden";
                                        }}
                                    />
                                    <span className="cell-name">{cell.name}</span>
                                    <span className="cell-author">{cell.author}</span>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

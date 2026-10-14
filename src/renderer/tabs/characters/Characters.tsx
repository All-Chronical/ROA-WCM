import { useEffect, useState, useCallback, useRef } from "react";
import { CategoryWithCharacters, RoaCharacter } from "../../../global/global";
import "./Characters.css";

const api = (window as any).api;

const PAGE_SIZE = 16; // 4x4
const COLS = 4;
const ROWS = 4;

type DndMode = "insert" | "swap";

// Custom drag payload type for reordering categories; grid cell drags use "text/plain".
// A distinct MIME type lets dragover handlers tell the two drag kinds apart
// (dataTransfer.getData is unreadable during dragover).
const CATEGORY_DRAG_TYPE = "application/x-roa-category";

function isCategoryDrag(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes(CATEGORY_DRAG_TYPE);
}

// Unique key for a cell: "categoryIndex:charIndex" for filled, "categoryIndex:empty:pageLocalIndex" for empty
interface CellAddress {
    categoryIndex: number;
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

    // Selection: set of "categoryIndex:charIndex" keys
    const [selected, setSelected] = useState<Set<string>>(new Set<string>());
    const [lastSelected, setLastSelected] = useState<string | null>(null);

    // Drag state
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);

    // Category editing state
    const [newCategoryName, setNewCategoryName] = useState<string | null>(null);
    const [renamingCategory, setRenamingCategory] = useState<{ index: number; name: string } | null>(null);

    // Collapsed categories: set of categoryIndex
    const [collapsedCategories, setCollapsedCategories] = useState<Set<number>>(new Set<number>());

    // Category reorder drag state
    const [dragCategoryIndex, setDragCategoryIndex] = useState<number | null>(null);
    const [dragOverCategory, setDragOverCategory] = useState<{ index: number; above: boolean } | null>(null);

    const categoriesRef = useRef(categories);
    categoriesRef.current = categories;

    // -- Load / Save --

    const loadData = useCallback(async () => {
        try {
            const loadedCategories: CategoryWithCharacters[] = await api.getCharacterCategories();
            setCategories(loadedCategories);
            setSelected(new Set<string>());
            setLastSelected(null);
            setCollapsedCategories(new Set<number>());
            setIsDirty(false);
            log(`Loaded ${loadedCategories.length} categories`);
        } catch (err: any) {
            log(`Error loading: ${err.message}`);
        }
    }, [log]);

    useEffect(() => { loadData(); }, [loadData]);

    function updateCategories(newCategories: CategoryWithCharacters[]): void {
        setCategories(newCategories);
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
        categoryIndex: number;
        categoryName: string;
        pageInCategory: number;
        totalPagesInCategory: number;
        cells: (RoaCharacter | null)[]; // length always 16, null = empty slot
        startCharIndex: number; // index of first char in this page within the category
    }

    function buildPages(): PageData[] {
        const pages: PageData[] = [];
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
            const category = categories[categoryIndex];
            const chars = category.characters;
            const totalPages = Math.max(1, Math.ceil(chars.length / PAGE_SIZE));

            for (let p = 0; p < totalPages; p++) {
                const startIdx = p * PAGE_SIZE;
                const slice = chars.slice(startIdx, startIdx + PAGE_SIZE);
                const cells: (RoaCharacter | null)[] = [];
                for (let i = 0; i < PAGE_SIZE; i++) {
                    cells.push(i < slice.length ? slice[i] : null);
                }
                pages.push({
                    categoryIndex: categoryIndex,
                    categoryName: category.name,
                    pageInCategory: p,
                    totalPagesInCategory: totalPages,
                    cells,
                    startCharIndex: startIdx,
                });
            }
        }
        return pages;
    }

    const allPages = buildPages();

    // Group pages by category for rendering category bundles
    interface CategoryBundleData {
        categoryIndex: number;
        categoryName: string;
        charCount: number;
        pages: PageData[];
    }

    function buildBundles(): CategoryBundleData[] {
        const bundles: CategoryBundleData[] = [];
        let currentCategoryIndex = -1;
        for (const page of allPages) {
            if (page.categoryIndex !== currentCategoryIndex) {
                currentCategoryIndex = page.categoryIndex;
                bundles.push({
                    categoryIndex: page.categoryIndex,
                    categoryName: page.categoryName,
                    charCount: categories[page.categoryIndex].characters.length,
                    pages: [],
                });
            }
            bundles[bundles.length - 1].pages.push(page);
        }
        return bundles;
    }

    const bundles = buildBundles();

    // -- Cell key helpers --

    function cellKey(categoryIndex: number, charIndex: number): string {
        return `${categoryIndex}:${charIndex}`;
    }

    function parseCellKey(key: string): CellAddress {
        const [categoryIndex, charIndex] = key.split(":").map(Number);
        return { categoryIndex, charIndex };
    }

    // -- Selection --

    function handleCellClick(categoryIndex: number, charIndex: number, e: React.MouseEvent): void {
        if (charIndex < 0) return; // empty slot
        const key = cellKey(categoryIndex, charIndex);

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
            if (last.categoryIndex === categoryIndex) {
                const lo = Math.min(last.charIndex, charIndex);
                const hi = Math.max(last.charIndex, charIndex);
                setSelected((prev) => {
                    const next = new Set(prev);
                    for (let i = lo; i <= hi; i++) next.add(cellKey(categoryIndex, i));
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

    function handleDragStart(e: React.DragEvent, categoryIndex: number, charIndex: number): void {
        const key = cellKey(categoryIndex, charIndex);
        if (!selected.has(key)) {
            setSelected(new Set<string>([key]));
        }
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "grid", key }));
        e.dataTransfer.effectAllowed = "move";
    }

    function handleDragOver(e: React.DragEvent, categoryIndex: number, charIndex: number): void {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverKey(cellKey(categoryIndex, charIndex >= 0 ? charIndex : 9000 + categoryIndex));
    }

    function handleDragLeave(): void {
        setDragOverKey(null);
    }

    function handleDrop(e: React.DragEvent, toCategoryIndex: number, toCharIndex: number): void {
        e.preventDefault();
        setDragOverKey(null);

        let data: any;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }

        if (data.type === "grid") {
            handleGridDrop(toCategoryIndex, toCharIndex);
        }
    }

    function handleGridDrop(toCategoryIndex: number, toCharIndex: number): void {
        if (selected.size === 0) return;

        // Collect all selected characters grouped by source category
        const selectedByCategory = new Map<number, number[]>();
        for (const key of Array.from(selected)) {
            const addr = parseCellKey(key);
            if (!selectedByCategory.has(addr.categoryIndex)) {
                selectedByCategory.set(addr.categoryIndex, []);
            }
            selectedByCategory.get(addr.categoryIndex)!.push(addr.charIndex);
        }

        // Sort indices descending within each category for safe removal
        for (const indices of Array.from(selectedByCategory.values())) {
            indices.sort((a: number, b: number) => a - b);
        }

        // Gather the actual characters in order
        const movedChars: RoaCharacter[] = [];
        for (const [categoryIndex, indices] of Array.from(selectedByCategory.entries())) {
            for (const idx of indices) {
                movedChars.push(categories[categoryIndex].characters[idx]);
            }
        }

        if (dndMode === "swap") {
            if (
                toCharIndex >= 0 &&
                toCharIndex < categories[toCategoryIndex].characters.length
            ) {
                const newCategories = categories.map((category, categoryIndex) => ({ ...category, characters: [...category.characters] }));
                if (selected.size === 1) {
                    // Single swap
                    const fromAddr = parseCellKey(Array.from(selected)[0]);
                    const fromChar = newCategories[fromAddr.categoryIndex].characters[fromAddr.charIndex];
                    const toChar = newCategories[toCategoryIndex].characters[toCharIndex];
                    newCategories[fromAddr.categoryIndex].characters[fromAddr.charIndex] = toChar;
                    newCategories[toCategoryIndex].characters[toCharIndex] = fromChar;
                } else {
                    // Multi-select swap: pairwise swap with consecutive target slots
                    const keys = Array.from(selected);
                    for (let i = 0; i < keys.length; i++) {
                        const targetIdx = toCharIndex + i;
                        if (targetIdx >= newCategories[toCategoryIndex].characters.length) break;
                        const fromAddr = parseCellKey(keys[i]);
                        const fromChar = newCategories[fromAddr.categoryIndex].characters[fromAddr.charIndex];
                        const toChar = newCategories[toCategoryIndex].characters[targetIdx];
                        newCategories[fromAddr.categoryIndex].characters[fromAddr.charIndex] = toChar;
                        newCategories[toCategoryIndex].characters[targetIdx] = fromChar;
                    }
                }
                updateCategories(newCategories);
                setSelected(new Set<string>());
                log(`Swapped ${movedChars.length} character(s)`);
                return;
            }
        }

        // Insert mode: remove from source, insert at target
        // Build new categories: first remove all selected
        let newCategories = categories.map((category, categoryIndex) => {
            const removeSet = selectedByCategory.get(categoryIndex);
            if (!removeSet) return { ...category, characters: [...category.characters] };
            const removeIndices = new Set(removeSet);
            return {
                ...category,
                characters: category.characters.filter((_, i) => !removeIndices.has(i)),
            };
        });

        // Calculate adjusted target index (because we removed items that may shift the target)
        let adjustedIndex = toCharIndex;
        const removedBefore = selectedByCategory.get(toCategoryIndex);
        if (removedBefore) {
            const countBefore = removedBefore.filter((i: number) => i < toCharIndex).length;
            adjustedIndex = Math.max(0, toCharIndex - countBefore);
        }

        // Insert at target
        newCategories = newCategories.map((category, categoryIndex) => {
            if (categoryIndex !== toCategoryIndex) return category;
            const newChars = [...category.characters];
            const insertAt = Math.min(adjustedIndex, newChars.length);
            newChars.splice(insertAt, 0, ...movedChars);
            return { ...category, characters: newChars };
        });

        updateCategories(newCategories);
        setSelected(new Set<string>());
        log(`Moved ${movedChars.length} character(s)`);
    }

    function removeSelectedFromGrid(): void {
        if (selected.size === 0) return;
        const selectedByCategory = new Map<number, Set<number>>();
        for (const key of Array.from(selected)) {
            const addr = parseCellKey(key);
            if (!selectedByCategory.has(addr.categoryIndex)) {
                selectedByCategory.set(addr.categoryIndex, new Set());
            }
            selectedByCategory.get(addr.categoryIndex)!.add(addr.charIndex);
        }

        const newCategories = categories.map((category, categoryIndex) => {
            const removeSet = selectedByCategory.get(categoryIndex);
            if (!removeSet) return category;
            return {
                ...category,
                characters: category.characters.filter((_, i) => !removeSet.has(i)),
            };
        });

        updateCategories(newCategories);
        setSelected(new Set<string>());
        log(`Removed ${selected.size} character(s) from grid`);
    }


    // -- Category reorder drag & drop --

    function handleCategoryDragStart(e: React.DragEvent, categoryIndex: number): void {
        const payload = JSON.stringify({ type: "category", categoryIndex });
        e.dataTransfer.setData(CATEGORY_DRAG_TYPE, payload);
        // A standard type is also set so the drag initiates reliably
        e.dataTransfer.setData("text/plain", payload);
        e.dataTransfer.effectAllowed = "move";
        setDragCategoryIndex(categoryIndex);
    }

    function handleCategoryDragEnd(): void {
        setDragCategoryIndex(null);
        setDragOverCategory(null);
    }

    function handleCategoryDragOver(e: React.DragEvent, toCategoryIndex: number): void {
        if (!isCategoryDrag(e)) return; // let grid cell drags pass through
        if (dragCategoryIndex === null || dragCategoryIndex === toCategoryIndex) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        setDragOverCategory((prev) =>
            prev && prev.index === toCategoryIndex && prev.above === above
                ? prev
                : { index: toCategoryIndex, above }
        );
    }

    function handleCategoryDragLeave(e: React.DragEvent): void {
        if (!isCategoryDrag(e)) return;
        // Only clear when the pointer truly leaves this bundle,
        // not when moving between the bundle's own child elements
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
            setDragOverCategory(null);
        }
    }

    function handleCategoryDrop(e: React.DragEvent, toCategoryIndex: number): void {
        let raw = e.dataTransfer.getData(CATEGORY_DRAG_TYPE);
        if (!raw) raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOverCategory(null);
        setDragCategoryIndex(null);

        let data: any;
        try { data = JSON.parse(raw); } catch { return; }
        if (data.type !== "category" || typeof data.categoryIndex !== "number") return;
        const fromCategoryIndex = data.categoryIndex;
        if (fromCategoryIndex === toCategoryIndex) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        reorderCategories(fromCategoryIndex, toCategoryIndex, above);
    }

    // Move the category at fromIndex to above/below the category at toIndex
    function reorderCategories(fromIndex: number, toIndex: number, above: boolean): void {
        if (fromIndex < 0 || fromIndex >= categories.length) return;
        if (toIndex < 0 || toIndex >= categories.length) return;
        if (fromIndex === toIndex) return;

        // Final-array insertion index; the -1 compensates for the removal
        // shifting items that sit between fromIndex and the target
        const effectiveTarget = above ? toIndex : toIndex + 1;
        const insertAt = fromIndex < effectiveTarget ? effectiveTarget - 1 : effectiveTarget;

        const newCategories = [...categories];
        const [moved] = newCategories.splice(fromIndex, 1);
        newCategories.splice(insertAt, 0, moved);
        updateCategories(newCategories);

        // Remap index-keyed UI state so it follows the moved category
        const remap = (i: number): number => {
            if (i === fromIndex) return insertAt;
            if (fromIndex < insertAt && i > fromIndex && i <= insertAt) return i - 1;
            if (fromIndex > insertAt && i >= insertAt && i < fromIndex) return i + 1;
            return i;
        };
        setCollapsedCategories((prev) => {
            const next = new Set<number>();
            for (const i of prev) next.add(remap(i));
            return next;
        });
        if (renamingCategory) {
            setRenamingCategory({ ...renamingCategory, index: remap(renamingCategory.index) });
        }

        // Selection keys are "categoryIndex:charIndex" and are now stale
        setSelected(new Set<string>());
        setLastSelected(null);
        log(`Moved category "${moved.name}"`);
    }

    // -- Category operations --

    function addCategory(): void {
        setNewCategoryName("");
    }

    function commitAddCategory(): void {
        if (newCategoryName === null) return;
        const trimmed = newCategoryName.trim();
        if (!trimmed) { setNewCategoryName(null); return; }
        if (categories.some((c) => c.name === trimmed)) {
            log(`Category "${trimmed}" already exists`);
            return;
        }
        updateCategories([...categories, { name: trimmed, characters: [] }]);
        log(`Added category: ${trimmed}`);
        setNewCategoryName(null);
    }

    function toggleCategoryCollapsed(categoryIndex: number): void {
        setCollapsedCategories((prev) => {
            const next = new Set<number>(prev);
            if (next.has(categoryIndex)) {
                next.delete(categoryIndex);
            } else {
                next.add(categoryIndex);
            }
            return next;
        });
    }

    function renameCategory(categoryIndex: number): void {
        setRenamingCategory({ index: categoryIndex, name: categories[categoryIndex].name });
    }

    function commitRenameCategory(): void {
        if (renamingCategory === null) return;
        const trimmed = renamingCategory.name.trim();
        if (!trimmed || trimmed === categories[renamingCategory.index].name) {
            setRenamingCategory(null);
            return;
        }
        if (categories.some((c) => c.name === trimmed)) {
            log(`Category "${trimmed}" already exists`);
            return;
        }
        updateCategories(categories.map((c, i) => i === renamingCategory.index ? { ...c, name: trimmed } : c));
        log(`Renamed to: ${trimmed}`);
        setRenamingCategory(null);
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
                            {newCategoryName !== null ? (
                                <input
                                    autoFocus
                                    className="inline-edit-input"
                                    placeholder="Category name"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") commitAddCategory();
                                        if (e.key === "Escape") setNewCategoryName(null);
                                    }}
                                    onBlur={() => commitAddCategory()}
                                />
                            ) : (
                                <button className="icon-btn" onClick={addCategory} title="Add category">
                                    <span>New category</span>
                                </button>
                            )}
                            <div className="toolbar-separator" />
                            <button className="icon-btn" onClick={async () => {
                                const dir = await api.getRoaDirectory();
                                api.openDirectory(dir);
                            }} title="Open ROA folder">
                                <span>Open order dir</span>
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
                    <div
                        className="grid-scroll"
                        onClick={() => setSelected(new Set<string>())}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {bundles.length === 0 ? (
                            <div className="empty-state">No categories loaded</div>
                        ) : (
                            bundles.map((bundle) => (
                                <CategoryBundle
                                    key={bundle.categoryIndex}
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
                                    isCollapsed={collapsedCategories.has(bundle.categoryIndex)}
                                    onToggleCollapse={() => toggleCategoryCollapsed(bundle.categoryIndex)}
                                    renamingCategory={renamingCategory}
                                    onRenamingChange={(name) => setRenamingCategory(renamingCategory ? { ...renamingCategory, name } : null)}
                                    onRenameCommit={commitRenameCategory}
                                    onRenameCancel={() => setRenamingCategory(null)}
                                    onOpenFolder={openFolder}
                                    cellKey={cellKey}
                                    dragCategoryIndex={dragCategoryIndex}
                                    dragOverCategory={
                                        dragOverCategory && dragOverCategory.index === bundle.categoryIndex
                                            ? dragOverCategory
                                            : null
                                    }
                                    onCategoryDragStart={handleCategoryDragStart}
                                    onCategoryDragEnd={handleCategoryDragEnd}
                                    onCategoryDragOver={handleCategoryDragOver}
                                    onCategoryDragLeave={handleCategoryDragLeave}
                                    onCategoryDrop={handleCategoryDrop}
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

interface CategoryBundleData {
    categoryIndex: number;
    categoryName: string;
    charCount: number;
    pages: {
        categoryIndex: number;
        categoryName: string;
        pageInCategory: number;
        totalPagesInCategory: number;
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
    isCollapsed,
    onToggleCollapse,
    renamingCategory,
    onRenamingChange,
    onRenameCommit,
    onRenameCancel,
    onOpenFolder,
    cellKey: cellKeyFn,
    dragCategoryIndex,
    dragOverCategory,
    onCategoryDragStart,
    onCategoryDragEnd,
    onCategoryDragOver,
    onCategoryDragLeave,
    onCategoryDrop,
}: {
    bundle: CategoryBundleData;
    categories: CategoryWithCharacters[];
    selected: Set<string>;
    dragOverKey: string | null;
    dndMode: DndMode;
    onCellClick: (categoryIndex: number, charIndex: number, e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent, categoryIndex: number, charIndex: number) => void;
    onDragOver: (e: React.DragEvent, categoryIndex: number, charIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, toCategoryIndex: number, toCharIndex: number) => void;
    onRename: (categoryIndex: number) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    renamingCategory: { index: number; name: string } | null;
    onRenamingChange: (name: string) => void;
    onRenameCommit: () => void;
    onRenameCancel: () => void;
    onOpenFolder: (char: RoaCharacter) => void;
    cellKey: (categoryIndex: number, charIndex: number) => string;
    dragCategoryIndex: number | null;
    dragOverCategory: { index: number; above: boolean } | null;
    onCategoryDragStart: (e: React.DragEvent, categoryIndex: number) => void;
    onCategoryDragEnd: () => void;
    onCategoryDragOver: (e: React.DragEvent, categoryIndex: number) => void;
    onCategoryDragLeave: (e: React.DragEvent) => void;
    onCategoryDrop: (e: React.DragEvent, categoryIndex: number) => void;
}): JSX.Element {
    const isRenaming = renamingCategory !== null && renamingCategory.index === bundle.categoryIndex;
    const isDragging = dragCategoryIndex === bundle.categoryIndex;
    const dragAbove = dragOverCategory !== null && dragOverCategory.above;
    const dragBelow = dragOverCategory !== null && !dragOverCategory.above;
    return (
        <div
            className={[
                "category-bundle",
                isCollapsed ? "collapsed" : "",
                isDragging ? "dragging" : "",
                dragAbove ? "drop-above" : "",
                dragBelow ? "drop-below" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => onCategoryDragOver(e, bundle.categoryIndex)}
            onDragLeave={(e) => onCategoryDragLeave(e)}
            onDrop={(e) => onCategoryDrop(e, bundle.categoryIndex)}
        >
            <div className="category-header">
                {isRenaming ? (
                    <input
                        autoFocus
                        className="inline-edit-input"
                        value={renamingCategory!.name}
                        onChange={(e) => onRenamingChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onRenameCommit();
                            if (e.key === "Escape") onRenameCancel();
                        }}
                        onBlur={() => onRenameCommit()}
                    />
                ) : (
                    <>
                        <button
                            className={`icon-btn collapse-btn ${isCollapsed ? "collapsed" : ""}`}
                            onClick={onToggleCollapse}
                            title={isCollapsed ? "Expand category" : "Collapse category"}
                        >
                            <span className="material-icons">expand_more</span>
                        </button>
                        <span className="category-title">{bundle.categoryName}</span>
                        <span className="category-count">{bundle.charCount} characters</span>
                        <button
                            className="icon-btn"
                            onClick={() => onRename(bundle.categoryIndex)}
                            title="Rename category"
                        >
                            <span className="material-icons" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <span
                            className="category-drag-handle material-icons"
                            title="Drag to reorder category"
                            draggable
                            onDragStart={(e) => onCategoryDragStart(e, bundle.categoryIndex)}
                            onDragEnd={onCategoryDragEnd}
                        >
                            drag_indicator
                        </span>
                    </>
                )}
            </div>
            {!isCollapsed && (
                <div
                    className="category-pages"
                    onDragOver={(e) => {
                        if (isCategoryDrag(e)) return; // let category drags bubble to the bundle
                        e.preventDefault();
                        onDragOver(e, bundle.categoryIndex, categories[bundle.categoryIndex].characters.length);
                    }}
                    onDrop={(e) => {
                        if (isCategoryDrag(e)) return;
                        onDrop(e, bundle.categoryIndex, categories[bundle.categoryIndex].characters.length);
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
            )}
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
        categoryIndex: number;
        pageInCategory: number;
        totalPagesInCategory: number;
        cells: (RoaCharacter | null)[];
        startCharIndex: number;
    };
    selected: Set<string>;
    dragOverKey: string | null;
    dndMode: DndMode;
    onCellClick: (categoryIndex: number, charIndex: number, e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent, categoryIndex: number, charIndex: number) => void;
    onDragOver: (e: React.DragEvent, categoryIndex: number, charIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, toCategoryIndex: number, toCharIndex: number) => void;
    onOpenFolder: (char: RoaCharacter) => void;
    cellKey: (categoryIndex: number, charIndex: number) => string;
}): JSX.Element {
    const rows: (RoaCharacter | null)[][] = [];
    for (let r = 0; r < ROWS; r++) {
        rows.push(
            Array.from({ length: COLS }, (_, c) => page.cells[c * ROWS + r])
        );
    }

    return (
        <div className="page-grid">
            <div className="page-label">
                Page {page.pageInCategory + 1} / {page.totalPagesInCategory}
            </div>
            <div className="page-rows">
                {rows.map((row, ri) => (
                    <div key={ri} className="page-row">
                        {row.map((cell, col) => {
                            const cellIdx = col * ROWS + ri;
                            const charIndex = page.startCharIndex + cellIdx;
                            const isFilled = cell !== null;
                            const key = isFilled
                                ? cellKeyFn(page.categoryIndex, charIndex)
                                : `empty-${page.categoryIndex}-${page.pageInCategory}-${cellIdx}`;
                            const isSelected = isFilled && selected.has(cellKeyFn(page.categoryIndex, charIndex));
                            const isDragTarget =
                                dragOverKey === cellKeyFn(page.categoryIndex, charIndex);

                            if (!isFilled) {
                                return (
                                    <div
                                        key={key}
                                        className={`grid-cell grid-cell-empty ${isDragTarget ? "drag-over-on" : ""}`}
                                        onDragOver={(e) => {
                                            if (isCategoryDrag(e)) return; // let category drags bubble to the bundle
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onDragOver(e, page.categoryIndex, charIndex);
                                        }}
                                        onDragLeave={(e) => {
                                            if (isCategoryDrag(e)) return;
                                            e.stopPropagation();
                                            onDragLeave();
                                        }}
                                        onDrop={(e) => {
                                            if (isCategoryDrag(e)) return;
                                            e.stopPropagation();
                                            onDrop(e, page.categoryIndex, charIndex);
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
                                                ? "drag-over-top"
                                                : "drag-over-on"
                                            : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    draggable
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCellClick(page.categoryIndex, charIndex, e);
                                    }}
                                    onDragStart={(e) => onDragStart(e, page.categoryIndex, charIndex)}
                                    onDragOver={(e) => {
                                        if (isCategoryDrag(e)) return; // let category drags bubble to the bundle
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDragOver(e, page.categoryIndex, charIndex);
                                    }}
                                    onDragLeave={(e) => {
                                        if (isCategoryDrag(e)) return;
                                        e.stopPropagation();
                                        onDragLeave();
                                    }}
                                    onDrop={(e) => {
                                        if (isCategoryDrag(e)) return;
                                        e.stopPropagation();
                                        onDrop(e, page.categoryIndex, charIndex);
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

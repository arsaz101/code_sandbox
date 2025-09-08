import { useState, useMemo, useEffect, useCallback } from "react";

// Minimalistic icon set (easily swappable / themeable later)
const icons = {
  dirOpen: "▼",
  dirClosed: "▶",
  newFile: "+",
  newFolder: "+/",
  confirm: "✔",
  cancel: "✖",
};

// Build a tree from flat file paths
function buildTree(files) {
  const root = {};
  for (const f of files) {
    // Skip sentinel keep files used to persist empty folders
    if (f.path.endsWith("/.keep") || f.path === ".keep") continue;
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, idx) => {
      const isFile = idx === parts.length - 1;
      if (!node[part]) {
        node[part] = { __type: isFile ? "file" : "dir", __children: {} };
      }
      if (!isFile) node = node[part].__children;
    });
  }
  return root;
}

export function FileExplorer({
  files,
  onSelect,
  selected,
  dirtyPaths,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}) {
  const [expanded, setExpanded] = useState({});
  const [creating, setCreating] = useState(null); // {type,parentPath}
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null); // fullPath being renamed
  const [renameValue, setRenameValue] = useState("");
  const tree = useMemo(() => buildTree(files), [files]);

  function toggle(path) {
    setExpanded((e) => ({ ...e, [path]: !e[path] }));
  }

  function submitCreate() {
    if (!creating || !newName.trim()) return;
    const base = creating.parentPath ? creating.parentPath + "/" : "";
    const full = base + newName.trim();
    if (creating.type === "folder") {
      onCreateFolder(full);
    } else {
      onCreateFile(full);
    }
    setCreating(null);
    setNewName("");
  }

  async function submitRename(path, isDir) {
    if (!renaming) return;
    const newBase = renameValue.trim();
    if (!newBase || newBase === path.split("/").pop()) {
      setRenaming(null);
      return;
    }
    // Build new full path
    const parent = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    const newFull = parent ? parent + "/" + newBase : newBase;
    await onRename?.(path, newFull, { isDir });
    setRenaming(null);
  }

  // Flatten currently visible nodes for keyboard navigation
  const visibleList = useMemo(() => {
    const out = [];
    function walk(node, base = "", depth = 0) {
      const entries = Object.entries(node).sort((a, b) => {
        if (a[1].__type === b[1].__type) return a[0].localeCompare(b[0]);
        return a[1].__type === "dir" ? -1 : 1;
      });
      for (const [name, meta] of entries) {
        const full = base ? base + "/" + name : name;
        out.push({ path: full, isDir: meta.__type === "dir", depth });
        if (meta.__type === "dir" && expanded[full])
          walk(meta.__children, full, depth + 1);
      }
    }
    walk(tree);
    return out;
  }, [tree, expanded]);

  const renderDir = useCallback(
    function renderDir(obj, basePath = "") {
      const entries = Object.entries(obj).sort((a, b) => {
        if (a[1].__type === b[1].__type) return a[0].localeCompare(b[0]);
        return a[1].__type === "dir" ? -1 : 1;
      });
      return (
        <ul className="file-tree">
          {entries.map(([name, meta]) => {
            const fullPath = basePath ? basePath + "/" + name : name;
            if (meta.__type === "file") {
              const dirty = dirtyPaths?.has && dirtyPaths.has(fullPath);
              return (
                <li
                  key={fullPath}
                  className={selected === fullPath ? "sel" : ""}
                  onClick={() => onSelect(fullPath)}
                  onContextMenu={(e) => openContextMenu(e, fullPath, false)}
                  data-path={fullPath}
                >
                  {renaming === fullPath ? (
                    <span>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(fullPath, false);
                          else if (e.key === "Escape") setRenaming(null);
                        }}
                        autoFocus
                        style={{ width: "70%" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button onClick={() => submitRename(fullPath, false)}>
                        {icons.confirm}
                      </button>
                      <button onClick={() => setRenaming(null)}>
                        {icons.cancel}
                      </button>
                    </span>
                  ) : (
                    <span>
                      {name}
                      {dirty ? " *" : ""}
                    </span>
                  )}
                </li>
              );
            }
            const open = expanded[fullPath];
            return (
              <li key={fullPath} className="dir">
                <div
                  className="dir-label"
                  onClick={() => toggle(fullPath)}
                  onContextMenu={(e) => openContextMenu(e, fullPath, true)}
                  data-path={fullPath}
                >
                  <span style={{ width: 14, display: "inline-block" }}>
                    {open ? icons.dirOpen : icons.dirClosed}
                  </span>
                  {renaming === fullPath ? (
                    <span>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(fullPath, true);
                          else if (e.key === "Escape") setRenaming(null);
                        }}
                        autoFocus
                        style={{ width: "60%" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          submitRename(fullPath, true);
                        }}
                      >
                        {icons.confirm}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenaming(null);
                        }}
                      >
                        {icons.cancel}
                      </button>
                    </span>
                  ) : (
                    name
                  )}
                </div>
                {open && renderDir(meta.__children, fullPath)}
                {creating && creating.parentPath === fullPath && (
                  <div className="new-input">
                    <input
                      placeholder={
                        creating.type === "folder" ? "folder-name" : "file.py"
                      }
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          submitCreate();
                        } else if (e.key === "Escape") {
                          setCreating(null);
                          setNewName("");
                        }
                      }}
                      autoFocus
                    />
                    <button onClick={submitCreate}>Add</button>
                    <button
                      onClick={() => {
                        setCreating(null);
                        setNewName("");
                      }}
                    >
                      X
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {creating && !creating.parentPath && (
            <div className="new-input">
              <input
                placeholder={
                  creating.type === "folder" ? "folder-name" : "file.py"
                }
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    submitCreate();
                  } else if (e.key === "Escape") {
                    setCreating(null);
                    setNewName("");
                  }
                }}
                autoFocus
              />
              <button onClick={submitCreate}>Add</button>
              <button
                onClick={() => {
                  setCreating(null);
                  setNewName("");
                }}
              >
                X
              </button>
            </div>
          )}
        </ul>
      );
    },
    [
      expanded,
      dirtyPaths,
      onDelete,
      onRename,
      onSelect,
      renameValue,
      renaming,
      creating,
      newName,
    ]
  );

  // Context menu
  const [ctxMenu, setCtxMenu] = useState(null); // {x,y,path,isDir}
  function openContextMenu(e, path, isDir) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  // Keyboard navigation like VS Code
  const handleKey = (e) => {
    if (renaming) return; // let rename input handle keys
    const idx = visibleList.findIndex((n) => n.path === selected);
    if (e.key === "ArrowDown") {
      const next = visibleList[Math.min(visibleList.length - 1, idx + 1)];
      if (next) onSelect(next.path);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      const prev = visibleList[Math.max(0, idx - 1)];
      if (prev) onSelect(prev.path);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      const node = visibleList[idx];
      if (node?.isDir) {
        if (!expanded[node.path]) toggle(node.path);
        else {
          const next = visibleList[idx + 1];
          if (next && next.path.startsWith(node.path + "/"))
            onSelect(next.path);
        }
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      const node = visibleList[idx];
      if (node?.isDir && expanded[node.path]) toggle(node.path);
      else if (node) {
        const parent = node.path.includes("/")
          ? node.path.slice(0, node.path.lastIndexOf("/"))
          : null;
        if (parent) onSelect(parent);
      }
      e.preventDefault();
    } else if (e.key === "Enter") {
      const node = visibleList[idx];
      if (node?.isDir) toggle(node.path);
      e.preventDefault();
    } else if (e.key === "F2") {
      const node = visibleList[idx];
      if (node) {
        setRenaming(node.path);
        setRenameValue(node.path.split("/").pop());
        e.preventDefault();
      }
    } else if (e.key === "Delete") {
      const node = visibleList[idx];
      if (node) {
        onDelete?.(node.path, { isDir: node.isDir });
        e.preventDefault();
      }
    } else if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
      // Prevent select all default to keep keyboard nav feel
      e.preventDefault();
    }
  };

  // Auto select first item
  useEffect(() => {
    if (!selected && visibleList.length) onSelect(visibleList[0].path);
  }, [selected, visibleList, onSelect]);

  return (
    <div className="explorer" tabIndex={0} onKeyDown={handleKey}>
      <div
        className="section"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>EXPLORER</span>
        <span style={{ display: "flex", gap: 4 }}>
          <button
            title="New File"
            onClick={() => setCreating({ type: "file", parentPath: "" })}
          >
            {icons.newFile}
          </button>
          <button
            title="New Folder"
            onClick={() => setCreating({ type: "folder", parentPath: "" })}
          >
            {icons.newFolder}
          </button>
        </span>
      </div>
      {renderDir(tree)}
      {ctxMenu && (
        <ul
          className="explorer-context-menu"
          style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x }}
        >
          <li
            onClick={() => {
              const base = ctxMenu.isDir
                ? ctxMenu.path
                : ctxMenu.path.includes("/")
                ? ctxMenu.path.slice(0, ctxMenu.path.lastIndexOf("/"))
                : "";
              setCreating({ type: "file", parentPath: base });
              setCtxMenu(null);
            }}
          >
            New File
          </li>
          <li
            onClick={() => {
              const base = ctxMenu.isDir
                ? ctxMenu.path
                : ctxMenu.path.includes("/")
                ? ctxMenu.path.slice(0, ctxMenu.path.lastIndexOf("/"))
                : "";
              setCreating({ type: "folder", parentPath: base });
              setCtxMenu(null);
            }}
          >
            New Folder
          </li>
          <li
            onClick={() => {
              setRenaming(ctxMenu.path);
              setRenameValue(ctxMenu.path.split("/").pop());
              setCtxMenu(null);
            }}
          >
            Rename
          </li>
          <li
            onClick={() => {
              onDelete?.(ctxMenu.path, { isDir: ctxMenu.isDir });
              setCtxMenu(null);
            }}
          >
            Delete
          </li>
        </ul>
      )}
    </div>
  );
}

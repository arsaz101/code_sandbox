import "./App.css";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { AuthPanel } from "./components/AuthPanel";
import { RunConsole } from "./components/RunConsole";
import { VscLayout } from "./components/VscLayout";
import { FileExplorer } from "./components/FileExplorer";
import { CodeEditor } from "./components/CodeEditor";
import { api } from "./api";

function App() {
  const auth = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [files, setFiles] = useState([]); // {id,path,content}
  const [activePath, setActivePath] = useState(null);
  const [openTabs, setOpenTabs] = useState([]); // array of paths
  const dirtyRef = useRef(new Set());
  const [, forceRender] = useState(0); // to refresh UI when dirty set changes

  // Load projects when auth token acquired
  useEffect(() => {
    async function load() {
      if (!auth.token) return;
      try {
        const list = await api.listProjects(auth.token);
        setProjects(list);
        if (list.length && !projectId) setProjectId(list[0].id);
      } catch (e) {}
    }
    load();
  }, [auth.token]);

  // Load files for selected project
  useEffect(() => {
    async function loadFiles() {
      if (!auth.token || !projectId) {
        setFiles([]);
        setActivePath(null);
        return;
      }
      try {
        const list = await api.listProjectFiles(projectId, auth.token);
        setFiles(list);
        if (list.length) {
          setActivePath(list[0].path);
          setOpenTabs([list[0].path]);
        } else {
          setActivePath(null);
          setOpenTabs([]);
        }
      } catch (e) {
        setFiles([]);
        setActivePath(null);
      }
    }
    loadFiles();
  }, [projectId, auth.token]);

  const activeFile = files.find((f) => f.path === activePath) || {
    path: "",
    content: "",
  };

  const updateFile = (val, pathArg) => {
    const target = pathArg || activePath;
    if (!target) return;
    setFiles((fs) =>
      fs.map((f) => (f.path === target ? { ...f, content: val } : f))
    );
    dirtyRef.current.add(target);
    forceRender((x) => x + 1);
  };

  const saveFile = async (pathToSave) => {
    if (!projectId || !pathToSave) return;
    const file = files.find((f) => f.path === pathToSave);
    if (!file) return;
    try {
      await api.saveFile(projectId, pathToSave, file.content, auth.token);
      dirtyRef.current.delete(pathToSave);
      forceRender((x) => x + 1);
    } catch (e) {}
  };

  const createProject = async () => {
    if (!newProjectName.trim() || !auth.token) return;
    try {
      const p = await api.createProject(newProjectName.trim(), auth.token);
      setProjects((ps) => [p, ...ps]);
      setProjectId(p.id);
      setShowNewProject(false);
      setNewProjectName("");
    } catch (e) {}
  };

  const explorer = (
    <div>
      <div
        style={{
          padding: "4px 6px",
          borderBottom: "1px solid #333",
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}
      >
        <select
          style={{ flex: 1 }}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!projects.length}
        >
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          style={{ padding: "2px 6px" }}
          title="New Project"
          onClick={() => {
            setShowNewProject(true);
          }}
        >
          +
        </button>
      </div>
      <FileExplorer
        files={files}
        onSelect={(p) => {
          setActivePath(p);
          setOpenTabs((tabs) => (tabs.includes(p) ? tabs : [...tabs, p]));
        }}
        selected={activePath}
        dirtyPaths={dirtyRef.current}
        onCreateFile={async (fullPath) => {
          if (!projectId || !auth.token) return;
          try {
            await api.saveFile(
              projectId,
              fullPath,
              fullPath.endsWith(".py") ? "# New file\n" : "",
              auth.token
            );
            const list = await api.listProjectFiles(projectId, auth.token);
            setFiles(list);
            setActivePath(fullPath);
            setOpenTabs((t) => (t.includes(fullPath) ? t : [...t, fullPath]));
          } catch (e) {}
        }}
        onCreateFolder={(folderPath) => {
          // folders implicit; nothing to persist until a file is added
        }}
        onRename={async (oldPath, newPath, { isDir }) => {
          if (!projectId || !auth.token) return;
          try {
            if (isDir) {
              // Rename all files with the prefix oldPath/
              const affected = files.filter(
                (f) => f.path === oldPath || f.path.startsWith(oldPath + "/")
              );
              for (const f of affected) {
                const suffix =
                  f.path === oldPath ? "" : f.path.slice(oldPath.length + 1);
                const newFilePath = suffix ? newPath + "/" + suffix : newPath; // folder sentinel not stored; skip empty
                await api.saveFile(
                  projectId,
                  newFilePath,
                  f.content,
                  auth.token
                );
                await api.deleteFile(projectId, f.path, auth.token);
              }
            } else {
              const file = files.find((f) => f.path === oldPath);
              if (file) {
                await api.saveFile(
                  projectId,
                  newPath,
                  file.content,
                  auth.token
                );
                await api.deleteFile(projectId, oldPath, auth.token);
                if (activePath === oldPath) setActivePath(newPath);
                setOpenTabs((tabs) =>
                  tabs.map((t) => (t === oldPath ? newPath : t))
                );
              }
            }
            const list = await api.listProjectFiles(projectId, auth.token);
            setFiles(list);
          } catch (e) {}
        }}
        onDelete={async (targetPath, { isDir }) => {
          if (!projectId || !auth.token) return;
          try {
            if (isDir) {
              const doomed = files.filter(
                (f) =>
                  f.path === targetPath || f.path.startsWith(targetPath + "/")
              );
              for (const f of doomed) {
                await api.deleteFile(projectId, f.path, auth.token);
              }
              if (
                activePath &&
                (activePath === targetPath ||
                  activePath.startsWith(targetPath + "/"))
              ) {
                setActivePath(null);
              }
              setOpenTabs((tabs) =>
                tabs.filter(
                  (t) => !(t === targetPath || t.startsWith(targetPath + "/"))
                )
              );
            } else {
              await api.deleteFile(projectId, targetPath, auth.token);
              if (activePath === targetPath) setActivePath(null);
              setOpenTabs((tabs) => tabs.filter((t) => t !== targetPath));
            }
            const list = await api.listProjectFiles(projectId, auth.token);
            setFiles(list);
          } catch (e) {}
        }}
      />
    </div>
  );

  const modalStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };
  const cardStyle = {
    background: "#252526",
    border: "1px solid #444",
    padding: 16,
    width: 320,
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="left">Coding Sandbox</div>
        <div className="right">
          <AuthPanel auth={auth} />
        </div>
      </div>
      <VscLayout
        sidebar={explorer}
        editor={
          <CodeEditor
            tabs={openTabs.map(
              (p) => files.find((f) => f.path === p) || { path: p, content: "" }
            )}
            activePath={activePath}
            value={activeFile.content}
            onChange={updateFile}
            onSave={saveFile}
            dirtySet={dirtyRef.current}
            path={activePath || "No file"}
            language={null}
            onSelectTab={(p) => setActivePath(p)}
            onCloseTab={(p) => {
              setOpenTabs((tabs) => tabs.filter((t) => t !== p));
              if (activePath === p) {
                setActivePath((prev) => {
                  const remaining = openTabs.filter((t) => t !== p);
                  return remaining[remaining.length - 1] || null;
                  allFiles = { files };
                });
              }
            }}
            dirty={activePath ? dirtyRef.current.has(activePath) : false}
          />
        }
        panels={{
          run: (
            <RunConsole
              token={auth.token}
              projectId={projectId}
              beforeRun={() => {}}
            />
          ),
          terminal: (
            <div className="terminal-dummy">
              Integrated terminal coming soon...
            </div>
          ),
        }}
      />
      {showNewProject && (
        <div style={modalStyle}>
          <div style={cardStyle}>
            <h4 style={{ margin: 0 }}>New Project</h4>
            <input
              autoFocus
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button onClick={() => setShowNewProject(false)}>Cancel</button>
              <button disabled={!newProjectName.trim()} onClick={createProject}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

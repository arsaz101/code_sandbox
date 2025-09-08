import { useEffect, useRef, useState } from "react";
import { api, connectRunStream } from "../api";
import { FiPlay } from "react-icons/fi";

export function RunConsole({ token, projectId: externalProjectId }) {
  const [projectId, setProjectId] = useState(externalProjectId || "");
  const [projects, setProjects] = useState([]); // local list for creation/refresh
  const [newProjectName, setNewProjectName] = useState("");
  const [entrypoint, setEntrypoint] = useState("main.py");
  const [language, setLanguage] = useState("python");
  const [runId, setRunId] = useState(null);
  const [status, setStatus] = useState(null);
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const wsRef = useRef(null);

  const start = async () => {
    const effective = externalProjectId || projectId;
    if (!effective) return;
    // Clear previous output for new run
    setStdout("");
    setStderr("");
    const res = await api.startRun(effective, { entrypoint, language }, token);
    setRunId(res.run_id);
    setStatus("queued");
  };

  const loadProjects = async () => {
    if (!token) return;
    try {
      const list = await api.listProjects(token);
      setProjects(list || []);
      if (!projectId && list.length) setProjectId(list[0].id);
    } catch (e) {}
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const p = await api.createProject(newProjectName.trim(), token);
      setProjects((ps) => [p, ...ps]);
      setProjectId(p.id);
      setNewProjectName("");
    } catch (e) {
      // could show error UI later
    }
  };

  useEffect(() => {
    loadProjects();
  }, [token]);

  // Update when parent changes selected project
  useEffect(() => {
    if (externalProjectId && externalProjectId !== projectId) {
      setProjectId(externalProjectId);
    }
  }, [externalProjectId]);

  useEffect(() => {
    if (!runId) return;
    const ws = connectRunStream(runId);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const obj = JSON.parse(ev.data);
          if (obj.t === "state") return;
        } catch {}
      }
      if (ev.data instanceof Blob) {
        ev.data.text().then((text) => handleMsg(text));
      } else if (typeof ev.data === "string") {
        handleMsg(ev.data);
      }
    };
    ws.onclose = () => {};
    function handleMsg(raw) {
      try {
        const evt = JSON.parse(raw);
        if (evt.type === "update") {
          setStatus(evt.status);
          if (evt.stdout) setStdout(evt.stdout);
          if (evt.stderr) setStderr(evt.stderr);
        }
      } catch {}
    }
    return () => ws.close();
  }, [runId]);

  // Ctrl+E shortcut
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && (e.key === "e" || e.key === "E")) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        start();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId, externalProjectId, entrypoint, language, token]);

  return (
    <div className="run-console">
      <h3>Run Project</h3>
      <div className="row">
        {!externalProjectId && (
          <select
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
        )}
        <input
          placeholder="Entrypoint"
          value={entrypoint}
          onChange={(e) => setEntrypoint(e.target.value)}
        />
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="python">python</option>
          <option value="node">node</option>
        </select>
        <button
          onClick={start}
          disabled={!token}
          title="Run (Ctrl+E)"
          aria-label="Run"
          className="icon-btn"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <FiPlay />
        </button>
      </div>
      {!externalProjectId && (
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="New project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            disabled={!token}
          />
          <button
            onClick={createProject}
            disabled={!token || !newProjectName.trim()}
          >
            Create
          </button>
          <button onClick={loadProjects} disabled={!token}>
            Refresh
          </button>
        </div>
      )}
      {runId && (
        <div>
          Run: {runId} Status: {status}
        </div>
      )}
      <div className="panes">
        <div className="out-box">
          <h4>Stdout</h4>
          <pre>{stdout}</pre>
        </div>
        <div className="out-box">
          <h4>Stderr</h4>
          <pre>{stderr}</pre>
        </div>
      </div>
    </div>
  );
}

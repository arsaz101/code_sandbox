// Simple API client with fallback for docker internal hostname
let API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000/api`
    : "http://localhost:8000/api");

// If the value uses the docker internal service name (backend) but we're in the browser on host, swap to host name
if (
  typeof window !== "undefined" &&
  /http:\/\/backend:8000\/api/.test(API_BASE) &&
  window.location.hostname !== "backend"
) {
  API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api`;
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = "Request failed";
    try {
      const data = await res.json();
      msg = data.detail || JSON.stringify(data);
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (email, password) =>
    request(
      "/auth/register?email=" +
        encodeURIComponent(email) +
        "&password=" +
        encodeURIComponent(password),
      { method: "POST" }
    ),
  login: (email, password) =>
    request(
      "/auth/login?email=" +
        encodeURIComponent(email) +
        "&password=" +
        encodeURIComponent(password),
      { method: "POST" }
    ),
  // Projects
  listProjects: (token) => request("/projects", { token }),
  createProject: (name, token) =>
    request("/projects", { method: "POST", body: { name }, token }),
  startRun: (pid, payload, token) =>
    request(`/runs/start?pid=${pid}`, { method: "POST", body: payload, token }),
  getRun: (id, token) => request(`/runs/${id}`, { token }),
  // Files
  listProjectFiles: (pid, token) =>
    request(`/projects/${pid}/files`, { token }),
  saveFile: (pid, path, content, token) =>
    request(`/projects/${pid}/files`, {
      method: "POST",
      body: { path, content },
      token,
    }),
  deleteFile: (pid, path, token) =>
    request(`/projects/${pid}/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
      token,
    }),
  aiSuggest: (token, payload) =>
    request(`/ai/suggest`, { method: "POST", body: payload, token }),
  aiSuggestStream: (token, payload, onDelta, onDone) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const es = new EventSource(
      `${API_BASE}/ai/suggest/stream`
      // Can't send body with native EventSource; fallback to fetch-based poly here
    );
    // NOTE: Native EventSource can't send POST body; so prefer fetch + ReadableStream if needed.
    // Implement minimal fetch stream instead:
    fetch(`${API_BASE}/ai/suggest/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (chunk.startsWith("data:")) {
              const jsonStr = chunk.slice(5).trim();
              try {
                const evt = JSON.parse(jsonStr);
                if (evt.delta && onDelta) onDelta(evt.delta);
                if (evt.done && onDone) onDone(evt);
              } catch {}
            }
          }
        }
        if (onDone) onDone({ done: true });
      })
      .catch(() => onDone && onDone({ error: true }));
  },
};

export function connectRunStream(runId) {
  let base = import.meta.env.VITE_WS_BASE || API_BASE.replace("http", "ws");
  if (typeof window !== "undefined" && base.startsWith("ws://backend:")) {
    base = `ws://${window.location.hostname}:8000`;
  }
  // Ensure single /api (if base already ends with /api that's fine)
  const url = /\/api$/.test(base)
    ? `${base}/runs/${runId}/stream`
    : `${base}/api/runs/${runId}/stream`;
  return new WebSocket(url);
}

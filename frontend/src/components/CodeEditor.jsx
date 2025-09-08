import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../api";

// Enable verbose AI suggestion logs by setting VITE_AI_DEBUG=true
const AI_DEBUG = import.meta.env.VITE_AI_DEBUG === "true";

// Multi-tab capable code editor. Backwards compatible if only single path passed.
export function CodeEditor({
  language,
  value,
  onChange,
  path,
  onSave,
  dirty,
  tabs, // array of file objects { path, content }
  activePath,
  onSelectTab,
  onCloseTab,
  dirtySet, // Set of dirty paths
  allFiles = [], // full project files for corpus
  aiAutocomplete = true,
  authToken,
  projectId,
}) {
  const editorRef = useRef(null);
  const [flashPaths, setFlashPaths] = useState(new Set());
  const inlineSuggestRef = useRef({ last: null });
  const disposablesRef = useRef([]);
  const streamingRef = useRef({
    accumulating: "",
    inFlight: false,
    timer: null,
  });

  // Derive current tab list: fallback to single "path" if no tabs provided
  const tabList =
    tabs && tabs.length ? tabs.map((t) => t.path) : path ? [path] : [];
  const currentPath = activePath || path || null;

  function markFlash(p) {
    setFlashPaths((prev) => new Set(prev).add(p));
    setTimeout(() => {
      setFlashPaths((prev) => {
        const n = new Set(prev);
        n.delete(p);
        return n;
      });
    }, 800);
  }

  function triggerSave() {
    if (!onSave || !currentPath || currentPath === "No file") return;
    onSave(currentPath);
    markFlash(currentPath);
  }

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    const keyCombo = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS;
    editor.addAction({
      id: "save-file-action",
      label: "Save File",
      keybindings: [keyCombo],
      run: () => triggerSave(),
    });
    editor.addCommand(keyCombo, () => triggerSave());

    if (aiAutocomplete) {
      // Enable inline suggestions UI
      editor.updateOptions({ inlineSuggest: { enabled: true } });

      const languagesToRegister = [editor.getModel().getLanguageId()];
      const registered = new Set();

      function buildCorpus() {
        // Combine all file contents into one large string; simple tokenization
        return allFiles
          .filter((f) => f && typeof f.content === "string")
          .map((f) => f.content)
          .join("\n");
      }

      const corpusCache = { text: "", tokens: [] };
      function ensureCorpus() {
        const text = buildCorpus();
        if (text !== corpusCache.text) {
          corpusCache.text = text;
          corpusCache.tokens = text.split(/\s+/).filter(Boolean).slice(-5000); // cap tokens
        }
        return corpusCache;
      }

      const cache = new Map();
      const provider = {
        async provideInlineCompletions(model, position) {
          if (AI_DEBUG)
            console.log("[AI] provideInlineCompletions fired", {
              path: currentPath,
              line: position.lineNumber,
              col: position.column,
            });
          const linePrefix = model
            .getLineContent(position.lineNumber)
            .slice(0, position.column - 1);
          if (linePrefix.length < 3) {
            if (AI_DEBUG)
              console.log("[AI] skip: prefix too short", {
                prefix: linePrefix,
              });
            return { items: [] };
          }
          let best;
          const modelPath = currentPath || "unknown";
          const key = modelPath + "|" + position.lineNumber + "|" + linePrefix;
          if (cache.has(key)) {
            if (AI_DEBUG) console.log("[AI] cache hit", { key });
            best = cache.get(key);
          } else {
            // Try remote AI first
            if (authToken && projectId) {
              try {
                const payload = {
                  path: modelPath,
                  content: model.getValue(),
                  cursor_line: position.lineNumber,
                  cursor_col: position.column,
                  project_id: Number(projectId),
                };
                if (AI_DEBUG) console.log("[AI] calling /ai/suggest", payload);
                const resp = await api.aiSuggest(authToken, payload);
                if (AI_DEBUG) console.log("[AI] /ai/suggest response", resp);
                if (resp?.items?.length) best = resp.items[0].completion;
              } catch (e) {
                if (AI_DEBUG) console.warn("[AI] /ai/suggest error", e);
              }
            }
            if (!best) {
              ensureCorpus();
              const ctxWords = linePrefix
                .split(/\s+/)
                .slice(-2)
                .join(" ")
                .toLowerCase();
              for (let i = 0; i < corpusCache.tokens.length - 3; i++) {
                const pair = (
                  corpusCache.tokens[i] +
                  " " +
                  corpusCache.tokens[i + 1]
                ).toLowerCase();
                if (pair === ctxWords) {
                  best = corpusCache.tokens.slice(i + 2, i + 14).join(" ");
                  break;
                }
              }
            }
            if (best) {
              best = best.slice(0, 400);
              cache.set(key, best);
            }
          }
          if (!best || !best.trim()) {
            // initiate streaming attempt if remote available
            if (authToken && projectId && !streamingRef.current.inFlight) {
              streamingRef.current.inFlight = true;
              streamingRef.current.accumulating = "";
              if (AI_DEBUG)
                console.log("[AI] starting streaming /ai/suggest/stream", {
                  path: modelPath,
                  line: position.lineNumber,
                  col: position.column,
                });
              api.aiSuggestStream(
                authToken,
                {
                  path: modelPath,
                  content: model.getValue(),
                  cursor_line: position.lineNumber,
                  cursor_col: position.column,
                  project_id: Number(projectId),
                },
                (delta) => {
                  streamingRef.current.accumulating += delta;
                  inlineSuggestRef.current.last =
                    streamingRef.current.accumulating.slice(0, 400);
                  if (AI_DEBUG) console.log("[AI] stream delta", delta);
                },
                () => {
                  streamingRef.current.inFlight = false;
                  if (AI_DEBUG)
                    console.log("[AI] stream done", {
                      total: streamingRef.current.accumulating.length,
                    });
                }
              );
            }
            return { items: [] };
          }
          if (AI_DEBUG)
            console.log("[AI] returning inline suggestion", {
              text: best.slice(0, 80),
            });
          inlineSuggestRef.current.last = best;
          return {
            items: [
              {
                insertText: best,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                ),
              },
            ],
          };
        },
        freeInlineCompletions() {},
      };

      languagesToRegister.forEach((lid) => {
        if (registered.has(lid)) return;
        registered.add(lid);
        disposablesRef.current.push(
          monaco.languages.registerInlineCompletionsProvider(lid, provider)
        );
      });

      // Tab accept logic
      editor.addCommand(monaco.KeyCode.Tab, () => {
        const last = inlineSuggestRef.current.last;
        if (!last) {
          editor.trigger("keyboard", "type", { text: "\t" });
          return;
        }
        const pos = editor.getPosition();
        editor.executeEdits("ai-inline", [
          {
            range: new monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column
            ),
            text: last,
          },
        ]);
        inlineSuggestRef.current.last = null;
      });
    }
  }

  // Cleanup disposables on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d && d.dispose && d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  // Global Ctrl+S capture
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        if (
          document.activeElement &&
          document.activeElement.closest(".code-editor")
        ) {
          e.preventDefault();
          triggerSave();
        }
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [currentPath, onSave, value]);

  // Provide language inference per active path if not explicitly given
  const resolvedLanguage = (() => {
    if (language) return language;
    if (!currentPath) return "python";
    if (currentPath.endsWith(".py")) return "python";
    if (currentPath.endsWith(".js")) return "javascript";
    if (currentPath.endsWith(".md")) return "markdown";
    return "python";
  })();

  return (
    <div className="code-editor">
      <div className="tab-bar">
        {tabList.map((p) => {
          const isActive = p === currentPath;
          const isDirty = dirtySet
            ? dirtySet.has(p)
            : p === currentPath
            ? dirty
            : false;
          const flashed = flashPaths.has(p);
          return (
            <div
              key={p}
              className={`tab ${isActive ? "active" : ""} ${
                flashed ? "saved-flash" : ""
              }`}
              onClick={() => onSelectTab && onSelectTab(p)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  // middle click close
                  e.preventDefault();
                  onCloseTab && onCloseTab(p);
                }
              }}
            >
              <span className="tab-label">
                {p.split("/").pop()}
                {isDirty ? " *" : flashed && !isDirty ? " ✓" : ""}
              </span>
              {tabList.length > 1 && (
                <button
                  className="tab-close"
                  title="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab && onCloseTab(p);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {currentPath ? (
        <Editor
          height="100%"
          theme="vs-dark"
          language={resolvedLanguage}
          value={value}
          onChange={(val) => onChange && onChange(val, currentPath)}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            // Quick suggestions to complement inline proposals
            quickSuggestions: true,
          }}
        />
      ) : (
        <div style={{ padding: 16, fontSize: 12, color: "#666" }}>
          No file open
        </div>
      )}
    </div>
  );
}

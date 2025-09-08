import { useState, useRef, useCallback } from "react";
import { FiFolder, FiPlay, FiTerminal } from "react-icons/fi";

export function VscLayout({ sidebar, editor, panels }) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState("terminal");
  const [sideWidth, setSideWidth] = useState(240);
  const [panelHeight, setPanelHeight] = useState(240);
  const resizingRef = useRef(null); // {type, startX, startY, startWidth, startHeight}

  const stopResize = useCallback(() => {
    if (resizingRef.current) {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stopResize);
    }
  }, []);

  const onMove = useCallback((e) => {
    const ctx = resizingRef.current;
    if (!ctx) return;
    if (ctx.type === "side") {
      const next = Math.min(
        600,
        Math.max(120, ctx.startWidth + (e.clientX - ctx.startX))
      );
      setSideWidth(next);
    } else if (ctx.type === "panel") {
      const dy = e.clientY - ctx.startY;
      const next = Math.min(Math.max(0, ctx.startHeight - dy), 600);
      setPanelHeight(next);
    }
  }, []);

  const startSideResize = (e) => {
    resizingRef.current = {
      type: "side",
      startX: e.clientX,
      startWidth: sideWidth,
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopResize);
  };
  const startPanelResize = (e) => {
    resizingRef.current = {
      type: "panel",
      startY: e.clientY,
      startHeight: panelHeight,
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopResize);
  };

  const togglePanelCollapse = () => {
    setPanelHeight((h) => (h === 0 ? 240 : 0));
  };

  return (
    <div className="vsc-root">
      <div className="titlebar">Coding Sandbox</div>
      <div className="body-row">
        <div className="activity-bar">
          <button
            title="Explorer"
            className={leftOpen ? "active" : ""}
            onClick={() => setLeftOpen((o) => !o)}
          >
            <FiFolder />
          </button>
        </div>
        {leftOpen && (
          <>
            <div className="side-bar" style={{ width: sideWidth }}>
              {sidebar}
            </div>
            <div className="resizer-h" onMouseDown={startSideResize} />
          </>
        )}
        <div className="main-col">
          <div
            className="editor-group"
            style={{ marginBottom: panels ? 0 : undefined }}
          >
            {editor}
          </div>
          {panels && (
            <>
              <div
                className="resizer-v"
                onMouseDown={startPanelResize}
                onDoubleClick={togglePanelCollapse}
                title="Drag to resize (double-click to toggle)"
              />
              <div className="panel" style={{ height: panelHeight }}>
                <div className="panel-tabs">
                  <button
                    className={bottomTab === "terminal" ? "active" : ""}
                    onClick={() => setBottomTab("terminal")}
                  >
                    <FiTerminal /> Terminal
                  </button>
                  <button
                    className={bottomTab === "run" ? "active" : ""}
                    onClick={() => setBottomTab("run")}
                  >
                    <FiPlay /> Run
                  </button>
                </div>
                <div className="panel-content">{panels[bottomTab]}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

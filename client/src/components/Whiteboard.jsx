import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Copy,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  MoveRight,
  PaintBucket,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  X
} from "lucide-react";

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2, key: "V" },
  { id: "hand", label: "Hand", icon: Hand, key: "H" },
  { id: "pen", label: "Pen", icon: Pencil, key: "P" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, key: "K" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "E" },
  { id: "line", label: "Line", icon: Slash, key: "L" },
  { id: "arrow", label: "Arrow", icon: MoveRight, key: "A" },
  { id: "rectangle", label: "Rectangle", icon: Square, key: "R" },
  { id: "diamond", label: "Diamond", icon: Diamond, key: "D" },
  { id: "circle", label: "Circle", icon: Circle, key: "O" },
  { id: "text", label: "Text", icon: Type, key: "T" }
];

const COLORS = ["#f8fafc", "#29d3a7", "#8ab4ff", "#f59e0b", "#fb7185", "#a78bfa", "#22d3ee", "#111827"];

function makeId() {
  return `wb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneElements(elements) {
  return elements.map((element) => ({
    ...element,
    points: element.points ? element.points.map((point) => [...point]) : undefined
  }));
}

function pointsPath(points = []) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ");
}

function elementBounds(element) {
  if (element.points?.length) {
    const xs = element.points.map((point) => point[0]);
    const ys = element.points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(1, Math.max(...xs) - minX), height: Math.max(1, Math.max(...ys) - minY) };
  }
  return {
    x: Math.min(element.x, element.x + element.width),
    y: Math.min(element.y, element.y + element.height),
    width: Math.max(1, Math.abs(element.width)),
    height: Math.max(1, Math.abs(element.height))
  };
}

function hitElement(element, point) {
  const bounds = elementBounds(element);
  const padding = Math.max(8, element.strokeWidth || 4);
  return point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;
}

function moveElement(element, dx, dy) {
  if (element.points?.length) {
    return { ...element, points: element.points.map((point) => [point[0] + dx, point[1] + dy]) };
  }
  return { ...element, x: element.x + dx, y: element.y + dy };
}

function resizeElement(element, point) {
  if (element.points?.length) return element;
  return { ...element, width: point.x - element.x, height: point.y - element.y };
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function arrowPoints(element) {
  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(10, (element.strokeWidth || 4) * 3);
  return [
    [x2, y2],
    [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
    [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)]
  ];
}

export default function Whiteboard({ open, roomId, socket, currentUser, onClose }) {
  const stageRef = useRef(null);
  const elementsRef = useRef([]);
  const backgroundRef = useRef("#0f172a");
  const dragRef = useRef(null);
  const clipboardRef = useRef([]);
  const lastCursorRef = useRef(0);
  const saveTimerRef = useRef(null);
  const [tool, setTool] = useState("select");
  const [elements, setElements] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [remoteSelections, setRemoteSelections] = useState({});
  const [remoteCursors, setRemoteCursors] = useState({});
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [stroke, setStroke] = useState("#f8fafc");
  const [fill, setFill] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [background, setBackground] = useState("#0f172a");
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [error, setError] = useState("");

  const selectedElement = useMemo(() => elements.find((element) => element.id === selectedIds[0]), [elements, selectedIds]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  const emitBoard = useCallback((nextElements = elementsRef.current, nextBackground = backgroundRef.current) => {
    if (!open) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      socket.emit("whiteboard:update", { roomId, board: { elements: nextElements, background: nextBackground } });
    }, 120);
  }, [open, roomId, socket]);

  const commitElements = useCallback((nextElements, options = {}) => {
    const previous = cloneElements(elementsRef.current);
    setElements(nextElements);
    elementsRef.current = nextElements;
    if (options.history !== false) {
      setHistory((current) => [...current.slice(-30), previous]);
      setRedoStack([]);
    }
    if (options.broadcast !== false) emitBoard(nextElements);
  }, [emitBoard]);

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    socket.emit("whiteboard:join", { roomId }, (ack) => {
      if (!ack?.ok) {
        setError(ack?.error || "Unable to load whiteboard");
        return;
      }
      const board = ack.board || {};
      setElements(board.elements || []);
      elementsRef.current = board.elements || [];
      setBackground(board.background || "#0f172a");
      backgroundRef.current = board.background || "#0f172a";
      setHistory([]);
      setRedoStack([]);
    });

    function onBoardUpdate(board) {
      setElements(board.elements || []);
      elementsRef.current = board.elements || [];
      setBackground(board.background || "#0f172a");
      backgroundRef.current = board.background || "#0f172a";
    }
    function onCursor(cursor) {
      setRemoteCursors((current) => ({ ...current, [cursor.id]: cursor }));
    }
    function onSelection(selection) {
      setRemoteSelections((current) => ({ ...current, [selection.id]: selection }));
    }

    socket.on("whiteboard:update", onBoardUpdate);
    socket.on("whiteboard:cursor", onCursor);
    socket.on("whiteboard:selection", onSelection);
    return () => {
      window.clearTimeout(saveTimerRef.current);
      socket.off("whiteboard:update", onBoardUpdate);
      socket.off("whiteboard:cursor", onCursor);
      socket.off("whiteboard:selection", onSelection);
    };
  }, [open, roomId, socket]);

  function screenToWorld(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale
    };
  }

  function updateSelection(ids) {
    setSelectedIds(ids);
    socket.emit("whiteboard:selection", { roomId, selectedIds: ids });
  }

  function hitTest(point) {
    for (let index = elementsRef.current.length - 1; index >= 0; index -= 1) {
      if (hitElement(elementsRef.current[index], point)) return elementsRef.current[index];
    }
    return null;
  }

  function beginPointer(event) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = screenToWorld(event);

    if (tool === "hand" || event.altKey) {
      dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, view };
      return;
    }

    if (tool === "select") {
      const hit = hitTest(point);
      if (!hit) {
        updateSelection([]);
        dragRef.current = null;
        return;
      }
      updateSelection([hit.id]);
      const bounds = elementBounds(hit);
      const isResize = Math.abs(point.x - (bounds.x + bounds.width)) < 14 && Math.abs(point.y - (bounds.y + bounds.height)) < 14;
      dragRef.current = { mode: isResize ? "resize" : "move", id: hit.id, start: point, previous: cloneElements(elementsRef.current) };
      return;
    }

    if (tool === "eraser") {
      const hit = hitTest(point);
      if (hit) commitElements(elementsRef.current.filter((element) => element.id !== hit.id));
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Text");
      if (!text?.trim()) return;
      const next = [
        ...elementsRef.current,
        {
          id: makeId(),
          type: "text",
          x: point.x,
          y: point.y,
          width: 220,
          height: 48,
          text: text.trim().slice(0, 400),
          stroke,
          fill: "transparent",
          strokeWidth,
          opacity
        }
      ];
      commitElements(next);
      return;
    }

    const base = {
      id: makeId(),
      type: tool,
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      stroke,
      fill: tool === "highlighter" ? stroke : fill,
      strokeWidth: tool === "highlighter" ? Math.max(10, strokeWidth * 3) : strokeWidth,
      opacity: tool === "highlighter" ? 0.28 : opacity,
      points: tool === "pen" || tool === "highlighter" ? [[point.x, point.y]] : undefined
    };
    const next = [...elementsRef.current, base];
    setElements(next);
    elementsRef.current = next;
    dragRef.current = { mode: "draw", id: base.id, start: point, previous: cloneElements(elementsRef.current.slice(0, -1)) };
  }

  function movePointer(event) {
    const point = screenToWorld(event);
    const now = Date.now();
    if (now - lastCursorRef.current > 45) {
      lastCursorRef.current = now;
      socket.emit("whiteboard:cursor", { roomId, cursor: point });
    }

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "pan") {
      setView({ ...drag.view, x: drag.view.x + event.clientX - drag.startX, y: drag.view.y + event.clientY - drag.startY });
      return;
    }

    const next = elementsRef.current.map((element) => {
      if (element.id !== drag.id) return element;
      if (drag.mode === "move") return moveElement(element, point.x - drag.start.x, point.y - drag.start.y);
      if (drag.mode === "resize") return resizeElement(element, point);
      if (drag.mode === "draw" && element.points?.length) return { ...element, points: [...element.points, [point.x, point.y]] };
      if (drag.mode === "draw") return { ...element, width: point.x - drag.start.x, height: point.y - drag.start.y };
      return element;
    });

    if (drag.mode === "move") drag.start = point;
    setElements(next);
    elementsRef.current = next;
    emitBoard(next);
  }

  function endPointer() {
    const drag = dragRef.current;
    if (!drag || drag.mode === "pan") {
      dragRef.current = null;
      return;
    }
    setHistory((current) => [...current.slice(-30), drag.previous]);
    setRedoStack([]);
    emitBoard(elementsRef.current);
    dragRef.current = null;
  }

  function undo() {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setRedoStack((redo) => [cloneElements(elementsRef.current), ...redo.slice(0, 30)]);
      setElements(previous);
      elementsRef.current = previous;
      emitBoard(previous);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((current) => {
      if (!current.length) return current;
      const next = current[0];
      setHistory((past) => [...past.slice(-30), cloneElements(elementsRef.current)]);
      setElements(next);
      elementsRef.current = next;
      emitBoard(next);
      return current.slice(1);
    });
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    commitElements(elementsRef.current.filter((element) => !selectedIds.includes(element.id)));
    updateSelection([]);
  }

  function copySelected() {
    clipboardRef.current = cloneElements(elementsRef.current.filter((element) => selectedIds.includes(element.id)));
  }

  function pasteSelected() {
    if (!clipboardRef.current.length) return;
    const pasted = clipboardRef.current.map((element) => ({ ...element, id: makeId(), x: element.x + 24, y: element.y + 24, points: element.points?.map((point) => [point[0] + 24, point[1] + 24]) }));
    commitElements([...elementsRef.current, ...pasted]);
    updateSelection(pasted.map((element) => element.id));
  }

  function rotateSelected() {
    if (!selectedIds.length) return;
    commitElements(elementsRef.current.map((element) => (selectedIds.includes(element.id) ? { ...element, rotation: normalizeAngle((element.rotation || 0) + 15) } : element)));
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.target instanceof Element && event.target.matches("input, textarea")) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === "z") {
          event.preventDefault();
          undo();
        } else if (key === "y") {
          event.preventDefault();
          redo();
        } else if (key === "c") {
          event.preventDefault();
          copySelected();
        } else if (key === "v") {
          event.preventDefault();
          pasteSelected();
        }
        return;
      }
      if (key === "delete" || key === "backspace") removeSelected();
      if (key === "r" && selectedIds.length) rotateSelected();
      const matched = TOOLS.find((item) => item.key.toLowerCase() === key);
      if (matched) setTool(matched.id);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function setZoom(nextScale) {
    setView((current) => ({ ...current, scale: Math.max(0.25, Math.min(3, nextScale)) }));
  }

  function renderElement(element) {
    const common = {
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      fill: element.fill || "transparent",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      vectorEffect: "non-scaling-stroke"
    };
    const bounds = elementBounds(element);
    const rotate = element.rotation ? `rotate(${element.rotation} ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2})` : undefined;

    if (element.type === "pen" || element.type === "highlighter") return <path key={element.id} d={pointsPath(element.points)} {...common} fill="none" />;
    if (element.type === "line") return <line key={element.id} x1={element.x} y1={element.y} x2={element.x + element.width} y2={element.y + element.height} {...common} />;
    if (element.type === "arrow") {
      const points = arrowPoints(element);
      return (
        <g key={element.id}>
          <line x1={element.x} y1={element.y} x2={element.x + element.width} y2={element.y + element.height} {...common} />
          <polygon points={points.map((point) => point.join(",")).join(" ")} fill={element.stroke} opacity={element.opacity} />
        </g>
      );
    }
    if (element.type === "rectangle") return <rect key={element.id} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} transform={rotate} {...common} />;
    if (element.type === "diamond") {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const points = [[cx, bounds.y], [bounds.x + bounds.width, cy], [cx, bounds.y + bounds.height], [bounds.x, cy]];
      return <polygon key={element.id} points={points.map((point) => point.join(",")).join(" ")} transform={rotate} {...common} />;
    }
    if (element.type === "circle") return <ellipse key={element.id} cx={bounds.x + bounds.width / 2} cy={bounds.y + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} transform={rotate} {...common} />;
    if (element.type === "text") {
      return (
        <text key={element.id} x={element.x} y={element.y + 24} transform={rotate} fill={element.stroke} opacity={element.opacity} fontSize={Math.max(16, element.strokeWidth * 5)} fontWeight="700">
          {element.text}
        </text>
      );
    }
    return null;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-slate-100">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel/95 px-3 py-2">
        <div>
          <h2 className="text-sm font-black">GalBaat Whiteboard</h2>
          <p className="text-xs text-slate-400">Board {roomId} · Autosaves as you draw</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.04] hover:bg-white/10" aria-label="Close whiteboard">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background }}>
        {error && <div className="absolute left-4 top-4 z-30 rounded-md border border-amberglow/30 bg-amberglow/10 px-3 py-2 text-sm text-amberglow">{error}</div>}

        <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-2xl backdrop-blur">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                title={`${item.label} (${item.key})`}
                className={`grid h-9 w-9 place-items-center rounded-md transition ${tool === item.id ? "bg-mint text-ink" : "text-slate-300 hover:bg-white/10"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <span className="mx-1 h-7 w-px bg-line" />
          <button type="button" onClick={undo} title="Undo (Ctrl+Z)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} title="Redo (Ctrl+Y)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={copySelected} title="Copy (Ctrl+C)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={removeSelected} title="Delete" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={rotateSelected} title="Rotate (R)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><RotateCw className="h-4 w-4" /></button>
        </div>

        <div className="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-line bg-panel/95 p-2 shadow-2xl">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300" title="Stroke color">
            <Palette className="h-4 w-4" />
            <input type="color" value={stroke} onChange={(event) => setStroke(event.target.value)} className="h-7 w-8 rounded border border-line bg-transparent" />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300" title="Fill color">
            <PaintBucket className="h-4 w-4" />
            <input type="color" value={fill === "transparent" ? "#111827" : fill} onChange={(event) => setFill(event.target.value)} className="h-7 w-8 rounded border border-line bg-transparent" />
          </label>
          <button type="button" onClick={() => setFill("transparent")} className="h-8 rounded-md border border-line px-2 text-xs text-slate-300 hover:bg-white/10">No fill</button>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            Width
            <input type="range" min="1" max="24" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} className="w-20 accent-mint" />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            Opacity
            <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="w-20 accent-mint" />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            Bg
            <input
              type="color"
              value={background}
              onChange={(event) => {
                setBackground(event.target.value);
                backgroundRef.current = event.target.value;
                emitBoard(elementsRef.current, event.target.value);
              }}
              className="h-7 w-8 rounded border border-line bg-transparent"
            />
          </label>
          <button type="button" onClick={() => setZoom(view.scale - 0.1)} className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-300 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs text-slate-300">{Math.round(view.scale * 100)}%</span>
          <button type="button" onClick={() => setZoom(view.scale + 0.1)} className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-300 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
        </div>

        <svg
          ref={stageRef}
          className="h-full w-full touch-none"
          onPointerDown={beginPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <defs>
            <pattern id="whiteboard-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            </pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#whiteboard-grid)" />
            {elements.map(renderElement)}
            {selectedElement && (
              <g>
                {(() => {
                  const bounds = elementBounds(selectedElement);
                  return (
                    <>
                      <rect x={bounds.x - 6} y={bounds.y - 6} width={bounds.width + 12} height={bounds.height + 12} fill="none" stroke="#29d3a7" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
                      <rect x={bounds.x + bounds.width - 5} y={bounds.y + bounds.height - 5} width="10" height="10" rx="2" fill="#29d3a7" vectorEffect="non-scaling-stroke" />
                    </>
                  );
                })()}
              </g>
            )}
            {Object.values(remoteSelections).map((selection) =>
              (selection.selectedIds || []).map((id) => {
                const element = elements.find((item) => item.id === id);
                if (!element) return null;
                const bounds = elementBounds(element);
                return <rect key={`${selection.id}-${id}`} x={bounds.x - 8} y={bounds.y - 8} width={bounds.width + 16} height={bounds.height + 16} fill="none" stroke={selection.color || "#8ab4ff"} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />;
              })
            )}
            {Object.values(remoteCursors).map((cursor) => (
              <g key={cursor.id} transform={`translate(${cursor.x} ${cursor.y})`}>
                <ArrowRight className="h-5 w-5" color={cursor.color || "#8ab4ff"} />
                <rect x="14" y="6" width={Math.max(58, String(cursor.username || "").length * 8)} height="24" rx="8" fill={cursor.color || "#8ab4ff"} opacity="0.95" />
                <text x="22" y="22" fill="#08111f" fontSize="12" fontWeight="800">{cursor.username}</text>
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute right-3 top-16 z-30 hidden max-w-xs rounded-lg border border-line bg-panel/90 p-3 text-xs text-slate-400 shadow-xl lg:block">
          Shortcuts: V select, H pan, P pen, E eraser, T text, Ctrl+C/V copy paste, Delete remove, Ctrl+Z/Y undo redo.
        </div>
      </div>
    </div>
  );
}

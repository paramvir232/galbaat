import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Diamond,
  Download,
  Eraser,
  FileCode,
  FileImage,
  Hand,
  Highlighter,
  Mic,
  MicOff,
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
  Users,
  Volume2,
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

function selectionHandles(element) {
  const bounds = elementBounds(element);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return [
    { id: "nw", x: bounds.x, y: bounds.y },
    { id: "n", x: cx, y: bounds.y },
    { id: "ne", x: bounds.x + bounds.width, y: bounds.y },
    { id: "e", x: bounds.x + bounds.width, y: cy },
    { id: "se", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { id: "s", x: cx, y: bounds.y + bounds.height },
    { id: "sw", x: bounds.x, y: bounds.y + bounds.height },
    { id: "w", x: bounds.x, y: cy },
    { id: "rotate", x: cx, y: bounds.y - 34 }
  ];
}

function nextBoundsForHandle(bounds, handle, point) {
  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;

  if (handle.includes("w")) left = point.x;
  if (handle.includes("e")) right = point.x;
  if (handle.includes("n")) top = point.y;
  if (handle.includes("s")) bottom = point.y;

  if (Math.abs(right - left) < 8) right = left + Math.sign(right - left || 1) * 8;
  if (Math.abs(bottom - top) < 8) bottom = top + Math.sign(bottom - top || 1) * 8;

  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top)
  };
}

function resizeFromBounds(element, startBounds, nextBounds) {
  if (element.points?.length) {
    const scaleX = nextBounds.width / Math.max(1, startBounds.width);
    const scaleY = nextBounds.height / Math.max(1, startBounds.height);
    return {
      ...element,
      points: element.points.map((point) => [
        nextBounds.x + (point[0] - startBounds.x) * scaleX,
        nextBounds.y + (point[1] - startBounds.y) * scaleY
      ])
    };
  }
  return {
    ...element,
    x: nextBounds.x,
    y: nextBounds.y,
    width: nextBounds.width,
    height: nextBounds.height
  };
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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function imageSize(src) {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth || 640, height: image.naturalHeight || 360 });
    image.onerror = () => resolve({ width: 640, height: 360 });
    image.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cursorForTool(tool, isDragging, canEdit) {
  if (!canEdit) return isDragging ? "grabbing" : "grab";
  if (tool === "hand") return isDragging ? "grabbing" : "grab";
  if (tool === "select") return "default";
  if (tool === "text") return "text";
  if (tool === "eraser") return "cell";
  if (tool === "pen" || tool === "highlighter") return "crosshair";
  return "crosshair";
}

function exportBounds(elements) {
  if (!elements.length) return { x: -640, y: -360, width: 1280, height: 720 };
  const bounds = elements.map(elementBounds);
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  const padding = 80;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(640, maxX - minX + padding * 2),
    height: Math.max(360, maxY - minY + padding * 2)
  };
}

function commonSvgAttributes(element) {
  return `stroke="${escapeHtml(element.stroke)}" stroke-width="${element.strokeWidth}" opacity="${element.opacity}" fill="${escapeHtml(element.fill || "transparent")}" stroke-linecap="round" stroke-linejoin="round"`;
}

function elementToSvg(element) {
  const attrs = commonSvgAttributes(element);
  const bounds = elementBounds(element);
  const rotate = element.rotation ? ` transform="rotate(${element.rotation} ${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2})"` : "";

  if (element.type === "pen" || element.type === "highlighter") {
    return `<path d="${escapeHtml(pointsPath(element.points))}" ${attrs} fill="none" />`;
  }
  if (element.type === "line") {
    return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" ${attrs} />`;
  }
  if (element.type === "arrow") {
    const points = arrowPoints(element).map((point) => point.join(",")).join(" ");
    return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" ${attrs} /><polygon points="${points}" fill="${escapeHtml(element.stroke)}" opacity="${element.opacity}" />`;
  }
  if (element.type === "rectangle") {
    return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"${rotate} ${attrs} />`;
  }
  if (element.type === "diamond") {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const points = [[cx, bounds.y], [bounds.x + bounds.width, cy], [cx, bounds.y + bounds.height], [bounds.x, cy]].map((point) => point.join(",")).join(" ");
    return `<polygon points="${points}"${rotate} ${attrs} />`;
  }
  if (element.type === "circle") {
    return `<ellipse cx="${bounds.x + bounds.width / 2}" cy="${bounds.y + bounds.height / 2}" rx="${bounds.width / 2}" ry="${bounds.height / 2}"${rotate} ${attrs} />`;
  }
  if (element.type === "text") {
    return `<text x="${element.x}" y="${element.y + 24}"${rotate} fill="${escapeHtml(element.stroke)}" opacity="${element.opacity}" font-size="${Math.max(16, element.strokeWidth * 5)}" font-weight="700">${escapeHtml(element.text)}</text>`;
  }
  if (element.type === "image" && element.src) {
    return `<image href="${escapeAttribute(element.src)}" x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"${rotate} opacity="${element.opacity || 1}" preserveAspectRatio="xMidYMid meet" />`;
  }
  return "";
}

export default function Whiteboard({ open, roomId, socket, currentUser, participants = [], peerVolumes = {}, onPeerVolumeChange, onSelfMute, onClose }) {
  const stageRef = useRef(null);
  const elementsRef = useRef([]);
  const backgroundRef = useRef("#0f172a");
  const dragRef = useRef(null);
  const clipboardRef = useRef([]);
  const lastCursorRef = useRef(0);
  const lastElementSyncRef = useRef(0);
  const saveTimerRef = useRef(null);
  const [tool, setTool] = useState("select");
  const [elements, setElements] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [remoteSelections, setRemoteSelections] = useState({});
  const [remoteCursors, setRemoteCursors] = useState({});
  const [boardUsers, setBoardUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [stroke, setStroke] = useState("#f8fafc");
  const [fill, setFill] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [background, setBackground] = useState("#0f172a");
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [error, setError] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [canEditBoard, setCanEditBoard] = useState(Boolean(currentUser?.host));
  const [openVolumeId, setOpenVolumeId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectedElement = useMemo(() => elements.find((element) => element.id === selectedIds[0]), [elements, selectedIds]);
  const boardCursor = useMemo(() => cursorForTool(tool, isDragging, canEditBoard), [canEditBoard, isDragging, tool]);

  useEffect(() => {
    if (open && !canEditBoard && tool !== "hand") {
      setTool("hand");
      setSelectedIds([]);
    }
  }, [canEditBoard, open, tool]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  const emitBoard = useCallback((nextElements = elementsRef.current, nextBackground = backgroundRef.current) => {
    if (!open || !canEditBoard) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      socket.emit("whiteboard:update", { roomId, board: { elements: nextElements, background: nextBackground } });
    }, 120);
  }, [canEditBoard, open, roomId, socket]);

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

  function applyElements(nextElements) {
    setElements(nextElements);
    elementsRef.current = nextElements;
  }

  function emitElement(element, action = "upsert", immediate = false) {
    if (!open || !canEditBoard || !element) return;
    const now = Date.now();
    if (!immediate && now - lastElementSyncRef.current < 16) return;
    lastElementSyncRef.current = now;
    socket.emit("whiteboard:element", { roomId, action, element });
  }

  function syncElementDiff(fromElements, toElements) {
    const fromMap = new Map(fromElements.map((element) => [element.id, element]));
    const toMap = new Map(toElements.map((element) => [element.id, element]));
    fromMap.forEach((element, id) => {
      if (!toMap.has(id)) emitElement(element, "delete", true);
    });
    toMap.forEach((element, id) => {
      if (JSON.stringify(fromMap.get(id)) !== JSON.stringify(element)) emitElement(element, "upsert", true);
    });
  }

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
      setBoardUsers(board.users || []);
      setCanEditBoard(Boolean(ack.canEditBoard || currentUser?.host));
      setHistory([]);
      setRedoStack([]);
    });

    function onBoardUpdate(board) {
      const incoming = board.elements || [];
      if (incoming.length === 0) {
        applyElements([]);
        setSelectedIds([]);
      } else if (dragRef.current) {
        const merged = new Map(incoming.map((element) => [element.id, element]));
        elementsRef.current.forEach((element) => merged.set(element.id, element));
        applyElements([...merged.values()]);
      } else {
        applyElements(incoming);
      }
      setBackground(board.background || "#0f172a");
      backgroundRef.current = board.background || "#0f172a";
    }
    function onElementUpdate({ action, element }) {
      if (!element?.id) return;
      if (dragRef.current?.id === element.id) return;
      if (action === "delete") {
        applyElements(elementsRef.current.filter((item) => item.id !== element.id));
        setSelectedIds((current) => current.filter((id) => id !== element.id));
        return;
      }
      applyElements(
        elementsRef.current.some((item) => item.id === element.id)
          ? elementsRef.current.map((item) => (item.id === element.id ? element : item))
          : [...elementsRef.current, element]
      );
    }
    function onCursor(cursor) {
      setRemoteCursors((current) => ({ ...current, [cursor.id]: cursor }));
    }
    function onSelection(selection) {
      setRemoteSelections((current) => ({ ...current, [selection.id]: selection }));
    }
    function onCursorLeft({ id }) {
      setRemoteCursors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setRemoteSelections((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
    function onBoardUsers(users) {
      setBoardUsers(users || []);
      const me = users?.find((user) => user.id === currentUser?.id);
      if (me) setCanEditBoard(Boolean(me.canEditBoard));
    }
    function onPermission({ canEditBoard: nextCanEdit }) {
      setCanEditBoard(Boolean(nextCanEdit));
    }

    socket.on("whiteboard:update", onBoardUpdate);
    socket.on("whiteboard:element", onElementUpdate);
    socket.on("whiteboard:cursor", onCursor);
    socket.on("whiteboard:cursor:left", onCursorLeft);
    socket.on("whiteboard:selection", onSelection);
    socket.on("whiteboard:users", onBoardUsers);
    socket.on("whiteboard:permission", onPermission);
    return () => {
      window.clearTimeout(saveTimerRef.current);
      socket.emit("whiteboard:leave", { roomId });
      socket.off("whiteboard:update", onBoardUpdate);
      socket.off("whiteboard:element", onElementUpdate);
      socket.off("whiteboard:cursor", onCursor);
      socket.off("whiteboard:cursor:left", onCursorLeft);
      socket.off("whiteboard:selection", onSelection);
      socket.off("whiteboard:users", onBoardUsers);
      socket.off("whiteboard:permission", onPermission);
    };
  }, [currentUser?.host, currentUser?.id, open, roomId, socket]);

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

  function hitSelectionHandle(point) {
    if (!selectedElement) return null;
    const radius = 13 / view.scale;
    return selectionHandles(selectedElement).find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= radius);
  }

  function eraseAt(point) {
    const hit = hitTest(point);
    if (!hit) return false;
    const next = elementsRef.current.filter((element) => element.id !== hit.id);
    applyElements(next);
    emitElement(hit, "delete", true);
    return true;
  }

  function beginPointer(event) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = screenToWorld(event);
    setIsDragging(true);

    if (!canEditBoard || tool === "hand" || event.altKey) {
      dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, view };
      return;
    }

    if (tool === "select") {
      const handle = hitSelectionHandle(point);
      if (handle && selectedElement) {
        const bounds = elementBounds(selectedElement);
        dragRef.current = {
          mode: handle.id === "rotate" ? "rotate" : "resize",
          handle: handle.id,
          id: selectedElement.id,
          start: point,
          startBounds: bounds,
          startCenter: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
          startAngle: Math.atan2(point.y - (bounds.y + bounds.height / 2), point.x - (bounds.x + bounds.width / 2)),
          startRotation: selectedElement.rotation || 0,
          previous: cloneElements(elementsRef.current)
        };
        return;
      }

      const hit = hitTest(point);
      if (!hit) {
        updateSelection([]);
        dragRef.current = null;
        return;
      }
      updateSelection([hit.id]);
      dragRef.current = { mode: "move", id: hit.id, start: point, previous: cloneElements(elementsRef.current) };
      return;
    }

    if (tool === "eraser") {
      dragRef.current = { mode: "erase", previous: cloneElements(elementsRef.current) };
      eraseAt(point);
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
    applyElements(next);
    emitElement(base, "upsert", true);
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

    if (drag.mode === "erase") {
      eraseAt(point);
      return;
    }

    const next = elementsRef.current.map((element) => {
      if (element.id !== drag.id) return element;
      if (drag.mode === "move") return moveElement(element, point.x - drag.start.x, point.y - drag.start.y);
      if (drag.mode === "resize") return resizeFromBounds(element, drag.startBounds, nextBoundsForHandle(drag.startBounds, drag.handle, point));
      if (drag.mode === "rotate") {
        const angle = Math.atan2(point.y - drag.startCenter.y, point.x - drag.startCenter.x);
        return { ...element, rotation: normalizeAngle(drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI) };
      }
      if (drag.mode === "draw" && element.points?.length) return { ...element, points: [...element.points, [point.x, point.y]] };
      if (drag.mode === "draw") return { ...element, width: point.x - drag.start.x, height: point.y - drag.start.y };
      return element;
    });

    if (drag.mode === "move") drag.start = point;
    applyElements(next);
    const changed = next.find((element) => element.id === drag.id);
    emitElement(changed, "upsert", drag.mode !== "draw");
  }

  function endPointer() {
    setIsDragging(false);
    const drag = dragRef.current;
    if (!drag || drag.mode === "pan") {
      dragRef.current = null;
      return;
    }
    setHistory((current) => [...current.slice(-30), drag.previous]);
    setRedoStack([]);
    if (drag.id) {
      const changed = elementsRef.current.find((element) => element.id === drag.id);
      if (changed) emitElement(changed, "upsert", true);
    }
    dragRef.current = null;
  }

  function undo() {
    if (!canEditBoard) return;
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      const currentElements = cloneElements(elementsRef.current);
      setRedoStack((redo) => [cloneElements(elementsRef.current), ...redo.slice(0, 30)]);
      applyElements(previous);
      syncElementDiff(currentElements, previous);
      return current.slice(0, -1);
    });
  }

  function redo() {
    if (!canEditBoard) return;
    setRedoStack((current) => {
      if (!current.length) return current;
      const next = current[0];
      const currentElements = cloneElements(elementsRef.current);
      setHistory((past) => [...past.slice(-30), cloneElements(elementsRef.current)]);
      applyElements(next);
      syncElementDiff(currentElements, next);
      return current.slice(1);
    });
  }

  function removeSelected() {
    if (!canEditBoard || !selectedIds.length) return;
    const previous = cloneElements(elementsRef.current);
    const removed = elementsRef.current.filter((element) => selectedIds.includes(element.id));
    const next = elementsRef.current.filter((element) => !selectedIds.includes(element.id));
    applyElements(next);
    setHistory((current) => [...current.slice(-30), previous]);
    setRedoStack([]);
    removed.forEach((element) => emitElement(element, "delete", true));
    updateSelection([]);
  }

  function clearBoard() {
    if (!canEditBoard || !elementsRef.current.length) return;
    if (!window.confirm("Clear the whole whiteboard for everyone? This cannot be undone.")) return;
    const previous = cloneElements(elementsRef.current);
    applyElements([]);
    setSelectedIds([]);
    setHistory((current) => [...current.slice(-30), previous]);
    setRedoStack([]);
    socket.emit("whiteboard:update", { roomId, board: { elements: [], background: backgroundRef.current, clear: true } });
  }

  function copySelected() {
    clipboardRef.current = cloneElements(elementsRef.current.filter((element) => selectedIds.includes(element.id)));
  }

  function pasteSelected() {
    if (!canEditBoard || !clipboardRef.current.length) return;
    const pasted = clipboardRef.current.map((element) => ({ ...element, id: makeId(), x: element.x + 24, y: element.y + 24, points: element.points?.map((point) => [point[0] + 24, point[1] + 24]) }));
    commitElements([...elementsRef.current, ...pasted]);
    updateSelection(pasted.map((element) => element.id));
  }

  function rotateSelected() {
    if (!canEditBoard || !selectedIds.length) return;
    commitElements(elementsRef.current.map((element) => (selectedIds.includes(element.id) ? { ...element, rotation: normalizeAngle((element.rotation || 0) + 15) } : element)));
  }

  async function addImageFromFile(file) {
    if (!canEditBoard || !file?.type?.startsWith("image/")) return false;
    if (file.size > 2_000_000) {
      setError("Image is too large for the whiteboard. Try an image under 2 MB.");
      return true;
    }

    const src = await readFileAsDataUrl(file);
    const size = await imageSize(src);
    const maxWidth = 520;
    const scale = Math.min(1, maxWidth / Math.max(1, size.width));
    const width = Math.max(80, Math.round(size.width * scale));
    const height = Math.max(80, Math.round(size.height * scale));
    const centerX = (stageRef.current?.clientWidth || 960) / 2;
    const centerY = (stageRef.current?.clientHeight || 540) / 2;
    const x = (centerX - view.x) / view.scale - width / 2;
    const y = (centerY - view.y) / view.scale - height / 2;
    const element = {
      id: makeId(),
      type: "image",
      x,
      y,
      width,
      height,
      rotation: 0,
      src,
      stroke: "#f8fafc",
      fill: "transparent",
      strokeWidth: 1,
      opacity: 1
    };
    commitElements([...elementsRef.current, element]);
    updateSelection([element.id]);
    return true;
  }

  function setBoardEditPermission(targetId, nextCanEdit) {
    socket.emit("whiteboard:permission", { roomId, targetId, canEdit: nextCanEdit });
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
      if (matched && (canEditBoard || matched.id === "hand")) setTool(matched.id);
    }
    function handlePaste(event) {
      if (!canEditBoard) return;
      const imageFile = [...(event.clipboardData?.files || [])].find((file) => file.type.startsWith("image/"));
      if (!imageFile) return;
      event.preventDefault();
      addImageFromFile(imageFile).catch(() => setError("Could not paste that image on the whiteboard."));
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("paste", handlePaste);
    };
  });

  function setZoom(nextScale) {
    setView((current) => ({ ...current, scale: Math.max(0.25, Math.min(3, nextScale)) }));
  }

  function exportSvgMarkup() {
    const bounds = exportBounds(elementsRef.current);
    const markup = elementsRef.current.map(elementToSvg).join("\n      ");
    return {
      bounds,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(bounds.width)}" height="${Math.round(bounds.height)}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${escapeHtml(backgroundRef.current)}" />
  <g>
      ${markup}
  </g>
</svg>`
    };
  }

  function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  async function downloadAsImage() {
    setExportMenuOpen(false);
    try {
      const { bounds, svg } = exportSvgMarkup();
      const image = new window.Image();
      image.decoding = "async";
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bounds.width);
      canvas.height = Math.round(bounds.height);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `galbaat-whiteboard-${roomId}.png`);
        else setError("Could not create the whiteboard image.");
      }, "image/png");
    } catch {
      setError("Could not download this whiteboard as an image.");
    }
  }

  function downloadAsSvg() {
    setExportMenuOpen(false);
    const { svg } = exportSvgMarkup();
    downloadBlob(new window.Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `galbaat-whiteboard-${roomId}.svg`);
  }

  function downloadAsHtml() {
    setExportMenuOpen(false);
    const { svg } = exportSvgMarkup();
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GalBaat Whiteboard ${escapeHtml(roomId)}</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #0b1220; color: #e5edf8; font-family: Inter, system-ui, sans-serif; }
    header { padding: 16px 20px; border-bottom: 1px solid rgba(148, 163, 184, 0.2); background: #111827; }
    h1 { margin: 0; font-size: 18px; }
    p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
    main { padding: 20px; overflow: auto; }
    svg { max-width: 100%; height: auto; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
  </style>
</head>
<body>
  <header>
    <h1>GalBaat Whiteboard</h1>
    <p>Room ${escapeHtml(roomId)} - Exported ${new Date().toLocaleString()}</p>
  </header>
  <main>${svg}</main>
</body>
</html>`;
    downloadBlob(new window.Blob([html], { type: "text/html;charset=utf-8" }), `galbaat-whiteboard-${roomId}.html`);
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
    if (element.type === "image" && element.src) {
      return <image key={element.id} href={element.src} x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} transform={rotate} opacity={element.opacity || 1} preserveAspectRatio="xMidYMid meet" />;
    }
    return null;
  }

  if (!open) return null;
  const boardVoiceUsers = boardUsers.map((user) => ({ ...(participants.find((participant) => participant.id === user.id) || {}), ...user }));
  const currentBoardUser = boardVoiceUsers.find((user) => user.id === currentUser?.id) || currentUser;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-slate-100">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/95 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-black">GalBaat Whiteboard</h2>
          <p className="text-xs text-slate-400">Board {roomId} - Autosaves as you draw</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-line bg-ink/60 p-1">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                disabled={!canEditBoard && item.id !== "hand"}
                title={`${item.label} (${item.key})`}
                className={`grid h-9 w-9 place-items-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${tool === item.id ? "bg-mint text-ink" : "text-slate-300 hover:bg-white/10"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          <span className="mx-1 hidden h-7 w-px bg-line sm:block" />
          <button type="button" onClick={undo} disabled={!canEditBoard} title="Undo (Ctrl+Z)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!canEditBoard} title="Redo (Ctrl+Y)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={copySelected} title="Copy (Ctrl+C)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={removeSelected} disabled={!canEditBoard} title="Delete" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={rotateSelected} disabled={!canEditBoard} title="Rotate (R)" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><RotateCw className="h-4 w-4" /></button>
          <button type="button" onClick={clearBoard} disabled={!canEditBoard} title="Clear board" className="inline-flex h-9 items-center gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportMenuOpen((openMenu) => !openMenu)}
              className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.04] text-slate-200 hover:bg-white/10"
              aria-label="Download whiteboard"
              title="Download whiteboard"
            >
              <Download className="h-4 w-4" />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-lg border border-line bg-panel shadow-2xl">
                <button type="button" onClick={downloadAsImage} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10">
                  <FileImage className="h-4 w-4 text-mint" />
                  Download as image
                </button>
                <button type="button" onClick={downloadAsSvg} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10">
                  <FileImage className="h-4 w-4 text-amberglow" />
                  Download as SVG
                </button>
                <button type="button" onClick={downloadAsHtml} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/10">
                  <FileCode className="h-4 w-4 text-skyglass" />
                  Download as HTML
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.04] hover:bg-white/10" aria-label="Close whiteboard">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background }}>
        {error && <div className="absolute left-4 top-4 z-30 rounded-md border border-amberglow/30 bg-amberglow/10 px-3 py-2 text-sm text-amberglow">{error}</div>}

        {panelCollapsed ? (
          <button
            type="button"
            onClick={() => setPanelCollapsed(false)}
            title="Show board panel"
            className="absolute left-3 top-3 z-30 grid h-11 w-11 place-items-center rounded-lg border border-line bg-panel/95 text-slate-200 shadow-2xl backdrop-blur hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : (
        <div className="absolute bottom-3 left-3 top-3 z-30 w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur">
          <div className="space-y-4">
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <Palette className="h-4 w-4" />
                  Style
                </div>
                <button
                  type="button"
                  onClick={() => setPanelCollapsed(true)}
                  title="Collapse panel"
                  className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg border border-line bg-ink/50 p-2 text-xs text-slate-300">
                  Stroke
                  <input type="color" value={stroke} disabled={!canEditBoard} onChange={(event) => setStroke(event.target.value)} className="mt-2 h-9 w-full cursor-pointer rounded-md border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
                <label className="rounded-lg border border-line bg-ink/50 p-2 text-xs text-slate-300">
                  Fill
                  <input type="color" value={fill === "transparent" ? "#111827" : fill} disabled={!canEditBoard} onChange={(event) => setFill(event.target.value)} className="mt-2 h-9 w-full cursor-pointer rounded-md border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={!canEditBoard}
                    onClick={() => setStroke(color)}
                    title={color}
                    className={`h-7 w-7 rounded-full border disabled:cursor-not-allowed disabled:opacity-50 ${stroke === color ? "border-mint ring-2 ring-mint/30" : "border-white/20"}`}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <button type="button" disabled={!canEditBoard} onClick={() => setFill("transparent")} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white/[0.04] text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                <PaintBucket className="h-4 w-4" />
                No fill
              </button>
              <label className="mt-3 block text-xs font-semibold text-slate-300">
                Width <span className="float-right text-slate-400">{strokeWidth}px</span>
                <input type="range" min="1" max="24" value={strokeWidth} disabled={!canEditBoard} onChange={(event) => setStrokeWidth(Number(event.target.value))} className="mt-2 w-full accent-mint disabled:cursor-not-allowed disabled:opacity-50" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-slate-300">
                Opacity <span className="float-right text-slate-400">{Math.round(opacity * 100)}%</span>
                <input type="range" min="0.1" max="1" step="0.05" value={opacity} disabled={!canEditBoard} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-2 w-full accent-mint disabled:cursor-not-allowed disabled:opacity-50" />
              </label>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/50 p-2 text-xs font-semibold text-slate-300">
                Background
                <input
                  type="color"
                  value={background}
                  disabled={!canEditBoard}
                  onChange={(event) => {
                    setBackground(event.target.value);
                    backgroundRef.current = event.target.value;
                    emitBoard(elementsRef.current, event.target.value);
                  }}
                  className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <Users className="h-4 w-4" />
                On board
              </div>
              <div className="space-y-2">
                {boardVoiceUsers.length ? boardVoiceUsers.map((user) => (
                  <div key={user.id} className="rounded-lg border border-line bg-ink/50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: user.cursorColor || user.color || "#29d3a7" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{user.username}</p>
                        <p className="text-xs text-slate-500">{user.id === currentUser?.id ? (canEditBoard ? "You can edit" : "View only") : user.canEditBoard ? "Can edit" : "View only"}</p>
                      </div>
                      {currentUser?.host && user.id !== currentUser?.id && !user.host && (
                        <button
                          type="button"
                          onClick={() => setBoardEditPermission(user.id, !user.canEditBoard)}
                          title={user.canEditBoard ? "Remove edit permission" : "Allow editing"}
                          className={`grid h-8 w-8 place-items-center rounded-md border transition ${
                            user.canEditBoard ? "border-mint/40 bg-mint/15 text-mint" : "border-line bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {user.id === currentUser?.id ? (
                        <button
                          type="button"
                          onClick={() => onSelfMute?.(!currentBoardUser?.selfMuted)}
                          disabled={Boolean(currentBoardUser?.hostMuted)}
                          title={currentBoardUser?.hostMuted ? "Admin muted" : currentBoardUser?.selfMuted ? "Unmute mic" : "Mute mic"}
                          className={`grid h-8 w-8 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            currentBoardUser?.selfMuted || currentBoardUser?.hostMuted ? "border-amberglow/40 bg-amberglow/10 text-amberglow" : "border-line bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                          }`}
                        >
                          {currentBoardUser?.selfMuted || currentBoardUser?.hostMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenVolumeId((id) => (id === user.id ? null : user.id))}
                            title="Adjust volume"
                            className={`grid h-8 w-8 place-items-center rounded-md border transition ${
                              openVolumeId === user.id ? "border-mint/40 bg-mint/15 text-mint" : "border-line bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                            }`}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                          {user.muted ? <MicOff className="h-4 w-4 text-amberglow" /> : <Mic className="h-4 w-4 text-slate-400" />}
                        </>
                      )}
                    </div>
                    {user.id !== currentUser?.id && openVolumeId === user.id && (
                      <label className="mt-2 flex items-center gap-2 rounded-md border border-line bg-panel/70 px-2 py-2 text-xs text-slate-300">
                        <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <input
                          type="range"
                          min="0"
                          max="150"
                          value={peerVolumes[user.id] ?? 100}
                          onChange={(event) => onPeerVolumeChange?.(user.id, Number(event.target.value))}
                          aria-label={`${user.username} volume`}
                          className="h-1.5 min-w-0 flex-1 accent-mint"
                        />
                        <span className="w-9 text-right text-[11px] text-slate-400">{peerVolumes[user.id] ?? 100}%</span>
                      </label>
                    )}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-slate-500">No one else is on the board yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
        )}

        <svg
          ref={stageRef}
          className="h-full w-full touch-none"
          style={{ cursor: boardCursor }}
          onPointerDown={beginPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            <rect x="-100000" y="-100000" width="200000" height="200000" fill="transparent" />
            {elements.map(renderElement)}
            {selectedElement && (
              <g>
                {(() => {
                  const bounds = elementBounds(selectedElement);
                  const handles = selectionHandles(selectedElement);
                  return (
                    <>
                      <rect x={bounds.x - 6} y={bounds.y - 6} width={bounds.width + 12} height={bounds.height + 12} fill="none" stroke="#29d3a7" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
                      <line x1={bounds.x + bounds.width / 2} y1={bounds.y - 6} x2={bounds.x + bounds.width / 2} y2={bounds.y - 34} stroke="#29d3a7" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                      {handles.map((handle) =>
                        handle.id === "rotate" ? (
                          <circle key={handle.id} cx={handle.x} cy={handle.y} r="8" fill="#0f172a" stroke="#29d3a7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        ) : (
                          <rect key={handle.id} x={handle.x - 5} y={handle.y - 5} width="10" height="10" rx="2" fill="#0f172a" stroke="#29d3a7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        )
                      )}
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

        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-xl border border-line bg-panel/95 p-2 shadow-2xl backdrop-blur">
          <button type="button" onClick={() => setZoom(view.scale - 0.1)} title="Zoom out" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
          <span className="min-w-14 rounded-lg border border-line bg-ink/60 px-2 py-2 text-center text-sm font-semibold text-slate-200">{Math.round(view.scale * 100)}%</span>
          <button type="button" onClick={() => setZoom(view.scale + 0.1)} title="Zoom in" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

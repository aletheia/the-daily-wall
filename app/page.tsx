'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';

type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange';
type Category = 'TECH' | 'WORLD' | 'CULTURE' | 'SCIENCE';
type Filter = 'ALL' | Category;
type FactCheckStatus = 'unverified' | 'queued' | 'verified' | 'disputed' | 'inconclusive';
type FactCheck = {
  status: FactCheckStatus;
  summary?: string;
  sources?: string[];
  checkedAt?: string;
};
type Note = {
  id: string;
  title: string;
  body: string;
  category: Category;
  color: NoteColor;
  x: number;
  y: number;
  rotation: number;
  createdAt: string;
  factCheck?: FactCheck;
};
type AgentAction = {
  id: string;
  type: 'import_recent_news';
  status: 'queued';
  createdAt: string;
};
type AgentLogLevel = 'info' | 'success' | 'warning' | 'error';
type AgentActor = 'human' | 'agent' | 'system';
type AgentLog = {
  id: string;
  timestamp: string;
  level: AgentLogLevel;
  actor: AgentActor;
  message: string;
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (input: Record<string, unknown>) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void;
};

declare global {
  interface Document { modelContext?: ModelContext }
}

const COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'orange'];
const CATEGORIES: Category[] = ['TECH', 'WORLD', 'CULTURE', 'SCIENCE'];
const FACT_CHECK_STATUSES: FactCheckStatus[] = ['unverified', 'queued', 'verified', 'disputed', 'inconclusive'];
const AGENT_LOG_LEVELS: AgentLogLevel[] = ['info', 'success', 'warning', 'error'];
const AGENT_ACTORS: AgentActor[] = ['human', 'agent', 'system'];
const BASE_BOARD_WIDTH = 1600;
const NOTE_WIDTH = 245;
const LAYOUT_HORIZONTAL_GAP = 44;
const LAYOUT = [[6, 9], [38, 5], [68, 14], [16, 52], [53, 54], [72, 58], [6, 68]];
const ROTATIONS = [-3, 2, 4, 3, -2, 1, -4];
const CONFETTI_PIECES = Array.from({ length: 22 }, (_, index) => ({
  left: 3 + ((index * 19) % 92),
  top: 8 + ((index * 31) % 78),
  drift: -70 + ((index * 37) % 140),
  fall: 145 + ((index * 23) % 95),
  spin: -220 + ((index * 83) % 440),
  delay: 470 + (index % 6) * 24,
}));

const INITIAL_NOTES: Note[] = [
  { id: 'open-models', category: 'TECH', title: 'Open models close the gap', body: 'Small, specialized models are becoming the default for focused newsroom workflows.', color: 'yellow', x: 6, y: 9, rotation: -3, createdAt: '2026-08-28T07:40:00.000Z' },
  { id: 'solar-roofs', category: 'WORLD', title: 'Cities turn roofs into power', body: 'A new wave of urban solar projects is shifting the economics of local energy.', color: 'pink', x: 38, y: 5, rotation: 2, createdAt: '2026-08-28T07:41:00.000Z' },
  { id: 'tactile-ui', category: 'CULTURE', title: 'Interfaces get tactile again', body: 'Texture, depth and useful imperfection are returning to digital products.', color: 'blue', x: 68, y: 14, rotation: 4, createdAt: '2026-08-28T07:42:00.000Z' },
  { id: 'quiet-ocean', category: 'SCIENCE', title: 'A quieter way to map the sea', body: 'Distributed sensors are revealing marine life without flooding habitats with noise.', color: 'green', x: 16, y: 52, rotation: 3, createdAt: '2026-08-28T07:43:00.000Z' },
  { id: 'local-paper', category: 'CULTURE', title: 'The neighborhood newspaper returns', body: 'Independent local publishing is finding a new audience through tiny, trusted editions.', color: 'orange', x: 53, y: 54, rotation: -2, createdAt: '2026-08-28T07:44:00.000Z' },
];

const BOARD_SHADER = /* wgsl */ `
struct Params { motion: vec4f, pointer: vec4f, board: vec4f }
@group(0) @binding(0) var<uniform> params: Params;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.pointer.zw, vec2f(1.0));
  let p = uv * resolution / 2.0;
  let time = params.motion.x;
  let pointer = params.pointer.xy;
  let grain = hash(floor(p) + floor(time * 2.0)) - 0.5;
  let fibers = sin((uv.x * 920.0) + sin(uv.y * 170.0)) * 0.5 + 0.5;
  let weave = sin(uv.x * 1240.0) * sin(uv.y * 980.0) * 0.018;
  let broadFibers = sin(uv.x * 84.0 + sin(uv.y * 51.0)) * sin(uv.y * 96.0) * 0.5 + 0.5;
  let surfaceHeight = fibers * 0.018 + weave * 0.45 + broadFibers * 0.012 + grain * 0.008;
  let normal = normalize(vec3f(-dpdx(surfaceHeight) * 44.0, -dpdy(surfaceHeight) * 44.0, 1.0));
  let lightVector = normalize(vec3f(pointer - uv, 0.28));
  let diffuse = max(dot(normal, lightVector), 0.0);
  let specular = pow(max(dot(reflect(-lightVector, normal), vec3f(0.0, 0.0, 1.0)), 0.0), 18.0);
  let light = exp(-distance(uv, pointer) * 3.6);
  let noteEnergy = min(params.board.x / 12.0, 1.0);
  let edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let bevel = smoothstep(0.0, 0.045, edgeDistance);
  var color = vec3f(0.018, 0.019, 0.017);
  color += vec3f(0.03, 0.042, 0.034) * light;
  color += vec3f(grain * 0.018 + fibers * 0.009 + weave * 0.55);
  color *= 0.78 + diffuse * 0.34;
  color += vec3f(0.16, 0.19, 0.15) * specular * light;
  color += vec3f(0.012, 0.009, 0.002) * noteEnergy;
  let vignette = smoothstep(0.82, 0.2, distance(uv, vec2f(0.5)));
  color *= 0.76 + vignette * 0.32;
  color *= 0.55 + bevel * 0.45;
  color += vec3f(0.018, 0.02, 0.017) * smoothstep(0.0, 0.012, edgeDistance) * (1.0 - smoothstep(0.012, 0.045, edgeDistance));
  return vec4f(color, 1.0);
}
`;

const FACT_PANEL_SHADER = /* wgsl */ `
struct Params { motion: vec4f }
@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let time = params.motion.x;
  let sweep = smoothstep(0.0, 0.18, 1.0 - abs(uv.x - fract(time * 0.16)) * 7.0);
  let scan = 0.5 + 0.5 * sin((uv.y * 42.0) - time * 2.4);
  let edge = smoothstep(0.12, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  let ink = vec3f(0.10, 0.26, 0.14) * (0.18 + sweep * 0.32 + scan * 0.04 + edge * 0.08);
  return vec4f(ink, 0.5);
}
`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const getBoardHeight = (count: number) => Math.max(1200, Math.ceil(Math.max(count, 1) / 3) * 360 + 120);
const getBoardWidth = (count: number) => {
  const columns = Math.ceil(Math.max(count, 1) / 2);
  return Math.max(BASE_BOARD_WIDTH, columns * NOTE_WIDTH + Math.max(0, columns - 1) * LAYOUT_HORIZONTAL_GAP + 160);
};

type NoteSize = { width: number; height: number };

function estimateNoteSize(note: Note): NoteSize {
  const titleLines = Math.max(1, Math.ceil(note.title.length / 21));
  const bodyLines = Math.max(1, Math.ceil(note.body.length / 38));
  return { width: NOTE_WIDTH, height: Math.max(205, 114 + titleLines * 28 + bodyLines * 16) };
}

function organizeWall(current: Note[], renderedSizes = new Map<string, NoteSize>()): Note[] {
  if (current.length === 0) return [];
  const rows = Math.min(2, current.length);
  const columns = Math.ceil(current.length / rows);
  const boardWidth = getBoardWidth(current.length);
  const verticalGap = 48;
  const boardHeight = getBoardHeight(current.length);
  const sizes = current.map((note) => renderedSizes.get(note.id) ?? estimateNoteSize(note));
  const rowMetrics = Array.from({ length: rows }, (_, row) => {
    const first = row * columns;
    const items = sizes.slice(first, first + columns);
    return {
      width: items.reduce((total, item) => total + item.width, 0) + Math.max(0, items.length - 1) * LAYOUT_HORIZONTAL_GAP,
      height: Math.max(...items.map((item) => item.height)),
    };
  });
  const groupHeight = rowMetrics.reduce((total, row) => total + row.height, 0) + Math.max(0, rows - 1) * verticalGap;
  let cursorY = Math.max(70, (boardHeight - groupHeight) / 2);
  const positioned: Note[] = [];
  rowMetrics.forEach((rowMetric, row) => {
    const first = row * columns;
    const itemsInRow = Math.min(columns, current.length - first);
    let cursorX = (boardWidth - rowMetric.width) / 2;
    for (let column = 0; column < itemsInRow; column += 1) {
      const index = first + column;
      const note = current[index];
      const size = sizes[index];
      positioned.push({
        ...note,
        x: (cursorX / boardWidth) * 100,
        y: ((cursorY + (rowMetric.height - size.height) / 2) / boardHeight) * 100,
        rotation: ROTATIONS[index % ROTATIONS.length] * 0.28,
      });
      cursorX += size.width + LAYOUT_HORIZONTAL_GAP;
    }
    cursorY += rowMetric.height + verticalGap;
  });
  return positioned;
}

const factStatus = (note: Note): FactCheckStatus => note.factCheck?.status ?? 'unverified';
const WEB_LINK_PATTERN = /https?:\/\/[^\s]+/g;

function safeWebLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function linkedText(text: string): ReactNode[] {
  const content: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WEB_LINK_PATTERN)) {
    const start = match.index ?? cursor;
    const rawMatch = match[0];
    const trailingPunctuation = rawMatch.match(/[),.;!?]+$/)?.[0] ?? '';
    const candidate = trailingPunctuation ? rawMatch.slice(0, -trailingPunctuation.length) : rawMatch;
    const href = safeWebLink(candidate);

    if (start > cursor) content.push(text.slice(cursor, start));
    if (href) {
      content.push(
        <a
          key={`${start}-${candidate}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {candidate}
        </a>,
      );
    } else {
      content.push(candidate);
    }
    if (trailingPunctuation) content.push(trailingPunctuation);
    cursor = start + rawMatch.length;
  }

  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

function createNote(input: { title: string; body: string; category?: Category; color?: NoteColor }, index: number): Note {
  const [x, y] = LAYOUT[index % LAYOUT.length];
  return {
    id: `note-${Date.now()}-${index}`,
    title: input.title.slice(0, 90),
    body: input.body.slice(0, 420),
    category: input.category ?? 'WORLD',
    color: input.color ?? COLORS[index % COLORS.length],
    x,
    y,
    rotation: ROTATIONS[index % ROTATIONS.length],
    createdAt: new Date().toISOString(),
    factCheck: { status: 'unverified' },
  };
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [activeFilter, setActiveFilter] = useState<Filter>('ALL');
  const [headline, setHeadline] = useState('');
  const [story, setStory] = useState('');
  const [category, setCategory] = useState<Category>('WORLD');
  const [color, setColor] = useState<NoteColor>('yellow');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState('Wall opened with five stories');
  const [gpuStatus, setGpuStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [mcpStatus, setMcpStatus] = useState<'preview' | 'ready'>('preview');
  const [zoom, setZoom] = useState(1);
  const [storageReady, setStorageReady] = useState(false);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [expandedFactId, setExpandedFactId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const factCanvasRef = useRef<HTMLCanvasElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<Note[]>(INITIAL_NOTES);
  const actionsRef = useRef<AgentAction[]>([]);
  const logsRef = useRef<AgentLog[]>([]);
  const zoomRef = useRef(1);
  const pointerRef = useRef<[number, number]>([0.5, 0.5]);
  const storageReadyRef = useRef(false);
  const centeredRef = useRef(false);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number; lastX: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const panningRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const dropTimerRef = useRef<number | null>(null);
  const shredTimersRef = useRef<Map<string, number>>(new Map());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const [dragTilt, setDragTilt] = useState(0);
  const [dropTilt, setDropTilt] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [shreddingIds, setShreddingIds] = useState<string[]>([]);

  const commitNotes = useCallback((producer: Note[] | ((current: Note[]) => Note[])) => {
    setNotes((current) => {
      const next = typeof producer === 'function' ? producer(current) : producer;
      notesRef.current = next;
      return next;
    });
  }, []);

  const commitActions = useCallback((producer: AgentAction[] | ((current: AgentAction[]) => AgentAction[])) => {
    setAgentActions((current) => {
      const next = typeof producer === 'function' ? producer(current) : producer;
      actionsRef.current = next;
      return next;
    });
  }, []);

  const commitLogs = useCallback((producer: AgentLog[] | ((current: AgentLog[]) => AgentLog[])) => {
    setAgentLogs((current) => {
      const next = typeof producer === 'function' ? producer(current) : producer;
      logsRef.current = next;
      return next;
    });
  }, []);

  const appendLog = useCallback((message: string, level: AgentLogLevel = 'info', actor: AgentActor = 'system') => {
    const cleanMessage = message.trim().slice(0, 500);
    if (!cleanMessage) return null;
    const entry: AgentLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      actor,
      message: cleanMessage,
    };
    commitLogs((current) => [...current, entry].slice(-100));
    return entry;
  }, [commitLogs]);

  const clearAgentLog = useCallback(() => {
    commitLogs([]);
    setLastEvent('Cleared agent activity log');
  }, [commitLogs]);

  const resetComposer = useCallback(() => {
    setHeadline('');
    setStory('');
    setCategory('WORLD');
    setColor('yellow');
    setEditingId(null);
  }, []);

  const removeNewsNote = useCallback((noteId: string, actor: AgentActor) => {
    const note = notesRef.current.find((item) => item.id === noteId);
    if (!note) return Promise.resolve({ success: false as const, error: 'Note not found.' });
    if (shredTimersRef.current.has(note.id)) return Promise.resolve({ success: false as const, error: 'Note removal is already in progress.' });

    setShreddingIds((current) => current.includes(note.id) ? current : [...current, note.id]);
    setLastEvent(`${actor === 'agent' ? 'Agent is shredding' : 'Shredding'} “${note.title}”`);

    return new Promise<{ success: true; id: string; animation: 'shredding_to_confetti' }>((resolve) => {
      const timer = window.setTimeout(() => {
        commitNotes((current) => current.filter((item) => item.id !== note.id));
        setShreddingIds((current) => current.filter((id) => id !== note.id));
        shredTimersRef.current.delete(note.id);
        if (editingId === note.id) resetComposer();
        appendLog(`Removed “${note.title}” after shredding it into confetti.`, 'success', actor);
        setLastEvent(`${actor === 'agent' ? 'Agent removed' : 'Removed'} “${note.title}”`);
        resolve({ success: true, id: note.id, animation: 'shredding_to_confetti' });
      }, 1100);
      shredTimersRef.current.set(note.id, timer);
    });
  }, [appendLog, commitNotes, editingId, resetComposer]);

  const setBoardZoom = useCallback((value: number) => {
    const next = Math.round(clamp(value, 0.55, 1.45) * 20) / 20;
    zoomRef.current = next;
    setZoom(next);
    return next;
  }, []);

  const centerBoardView = useCallback(() => {
    window.requestAnimationFrame(() => {
      const pane = paneRef.current;
      if (!pane) return;
      pane.scrollLeft = Math.max(0, (pane.scrollWidth - pane.clientWidth) / 2);
      pane.scrollTop = Math.max(0, (pane.scrollHeight - pane.clientHeight) / 2);
    });
  }, []);

  const getRenderedNoteSizes = useCallback(() => {
    const sizes = new Map<string, NoteSize>();
    stageRef.current?.querySelectorAll<HTMLElement>('.postit[data-note-id]').forEach((element) => {
      const id = element.dataset.noteId;
      if (id) sizes.set(id, { width: element.offsetWidth, height: element.offsetHeight });
    });
    return sizes;
  }, []);

  const moveStickerViaApi = useCallback((id: string, requestedX: number, requestedY: number, actor: AgentActor, options: { log?: boolean; announce?: boolean } = {}) => {
    const current = notesRef.current;
    const target = current.find((note) => note.id === id);
    if (!target) return { success: false as const, error: 'Note not found.' };
    const x = clamp(Number(requestedX), 0, 82);
    const y = clamp(Number(requestedY), 0, 78);
    commitNotes(current.map((note) => note.id === id ? { ...note, x, y } : note));
    if (options.log !== false) appendLog(`Moved “${target.title}” to ${x.toFixed(1)}%, ${y.toFixed(1)}%.`, 'info', actor);
    if (options.announce !== false) setLastEvent(`${actor === 'agent' ? 'Agent' : 'Human'} moved “${target.title}”`);
    return { success: true as const, id, x, y };
  }, [appendLog, commitNotes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem('daily-wall-notes');
        const storedActions = window.localStorage.getItem('daily-wall-agent-actions');
        const storedLogs = window.localStorage.getItem('daily-wall-agent-logs');
        storageReadyRef.current = true;
        if (stored) {
          const parsed = JSON.parse(stored) as Note[];
          if (Array.isArray(parsed)) commitNotes(parsed.slice(0, 24));
        }
        if (storedActions) {
          const parsed = JSON.parse(storedActions) as AgentAction[];
          if (Array.isArray(parsed)) commitActions(parsed.filter((action) => action?.type === 'import_recent_news' && action?.status === 'queued').slice(-20));
        }
        if (storedLogs) {
          const parsed = JSON.parse(storedLogs) as AgentLog[];
          if (Array.isArray(parsed)) commitLogs(parsed.slice(-100).map((entry) => ({ ...entry, actor: AGENT_ACTORS.includes(entry.actor) ? entry.actor : 'system' })));
        }
      } catch {
        storageReadyRef.current = true;
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commitActions, commitLogs, commitNotes]);

  useEffect(() => {
    notesRef.current = notes;
    if (storageReadyRef.current) window.localStorage.setItem('daily-wall-notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    actionsRef.current = agentActions;
    if (storageReadyRef.current) window.localStorage.setItem('daily-wall-agent-actions', JSON.stringify(agentActions));
  }, [agentActions]);

  useEffect(() => {
    logsRef.current = agentLogs;
    if (storageReadyRef.current) window.localStorage.setItem('daily-wall-agent-logs', JSON.stringify(agentLogs));
  }, [agentLogs]);

  useEffect(() => () => {
    if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
    shredTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    shredTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const canvas = factCanvasRef.current;
    if (!canvas || !expandedFactId) return;
    let active = true;
    let stop: (() => void) | undefined;

    async function startFactPanel() {
      try {
        const { effect, frameLoop, init, surface } = await import('vgpu');
        if (!active || !canvas) return;
        const gpu = await init();
        const target = surface(gpu, canvas, { dpr: [1, 1.25] });
        const panel = effect(gpu, FACT_PANEL_SHADER, { set: { params: { motion: [0, 0, 0, 0] } } });
        const started = performance.now();
        const handle = frameLoop(gpu, (frame) => {
          panel.set({ params: { motion: [(performance.now() - started) / 1000, 0, 0, 0] } });
          frame.pass(target, panel);
        }, { fps: 30 });
        stop = () => { handle.stop(); gpu.dispose() };
      } catch (error) {
        console.error('Fact-check renderer failed', error);
        appendLog('Fact-check visual renderer failed; the text fallback remains available.', 'error', 'system');
      }
    }

    startFactPanel();
    return () => { active = false; stop?.() };
  }, [appendLog, expandedFactId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let stop: (() => void) | undefined;

    async function startBoard() {
      try {
        const { effect, frameLoop, init, surface } = await import('vgpu');
        if (!active || !canvas) return;
        const gpu = await init();
        const target = surface(gpu, canvas, { dpr: [1, 1.25] });
        const board = effect(gpu, BOARD_SHADER, {
          set: { params: { motion: [0, 0, 0, 0], pointer: [0.5, 0.5, 1, 1], board: [5, 0, 0, 0] } },
        });
        const started = performance.now();
        const handle = frameLoop(gpu, (frame) => {
          board.set({ params: {
            motion: [(performance.now() - started) / 1000, 0, 0, 0],
            pointer: [pointerRef.current[0], pointerRef.current[1], target.size[0], target.size[1]],
            board: [notesRef.current.length, 0, 0, 0],
          } });
          frame.pass(target, board);
        }, { fps: 30 });
        stop = () => { handle.stop(); gpu.dispose() };
        setGpuStatus('ready');
      } catch (error) {
        console.error('Board renderer failed', error);
        appendLog('Board renderer failed; the static board fallback is active.', 'error', 'system');
        setGpuStatus('fallback');
      }
    }

    startBoard();
    return () => { active = false; stop?.() };
  }, [appendLog]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };

    const readQueueSnapshot = () => {
      const factChecks = notesRef.current.filter((note) => factStatus(note) === 'queued');
      const actions = actionsRef.current;
      const items = [
        ...factChecks.map((note) => ({
          id: note.id,
          type: 'fact_check' as const,
          status: 'queued' as const,
          createdAt: note.createdAt,
          note,
        })),
        ...actions.map((action) => ({
          id: action.id,
          type: action.type,
          status: action.status,
          createdAt: action.createdAt,
          action,
        })),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

      return {
        success: true,
        count: items.length,
        factCheckCount: factChecks.length,
        actionCount: actions.length,
        items,
        factChecks,
        actions,
        instructions: {
          fact_check: 'Research the claim externally, log useful progress with append_agent_log, then call set_news_fact_check with the note id, verdict, summary, and source URLs.',
          import_recent_news: 'Research the 5 most relevant stories published in the previous 24 hours, log progress with append_agent_log, add exactly 5 sourced stickies with add_news_note, then call complete_agent_action with the action id.',
        },
      };
    };

    async function registerTools() {
      await context!.registerTool({
        name: 'add_news_note',
        description: 'Add a news Post-it to The Daily Wall.',
        inputSchema: {
          type: 'object',
          properties: {
            headline: { type: 'string', description: 'Short news headline.' },
            story: { type: 'string', description: 'News summary or pasted story.' },
            category: { type: 'string', enum: CATEGORIES },
            color: { type: 'string', enum: COLORS },
          },
          required: ['headline', 'story'],
        },
        execute: ({ headline: rawHeadline, story: rawStory, category: rawCategory, color: rawColor }) => {
          const cleanHeadline = String(rawHeadline ?? '').trim();
          const cleanStory = String(rawStory ?? '').trim();
          if (!cleanHeadline || !cleanStory) return { success: false, error: 'Headline and story are required.' };
          const current = notesRef.current;
          const next = createNote({
            title: cleanHeadline,
            body: cleanStory,
            category: CATEGORIES.includes(rawCategory as Category) ? rawCategory as Category : 'WORLD',
            color: COLORS.includes(rawColor as NoteColor) ? rawColor as NoteColor : undefined,
          }, current.length);
          const organized = organizeWall([...current, next].slice(-24), getRenderedNoteSizes());
          const created = organized.find((note) => note.id === next.id) ?? next;
          commitNotes(organized);
          appendLog(`Pinned “${next.title}” to the news wall.`, 'success', 'agent');
          setLastEvent(`Agent pinned “${next.title}”`);
          return { success: true, note: created, wallOrganized: true };
        },
      }, options);
      await context!.registerTool({
        name: 'update_news_note',
        description: 'Edit the headline, story, category, or color of an existing news Post-it.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }, headline: { type: 'string' }, story: { type: 'string' },
            category: { type: 'string', enum: CATEGORIES }, color: { type: 'string', enum: COLORS },
          },
          required: ['id'],
        },
        execute: ({ id, headline: newHeadline, story: newStory, category: newCategory, color: newColor }) => {
          const noteId = String(id);
          const current = notesRef.current;
          const targetNote = current.find((note) => note.id === noteId);
          if (!targetNote) return { success: false, error: 'Note not found.' };
          const updated: Note = {
            ...targetNote,
            title: newHeadline === undefined ? targetNote.title : String(newHeadline).trim().slice(0, 90),
            body: newStory === undefined ? targetNote.body : String(newStory).trim().slice(0, 420),
            category: CATEGORIES.includes(newCategory as Category) ? newCategory as Category : targetNote.category,
            color: COLORS.includes(newColor as NoteColor) ? newColor as NoteColor : targetNote.color,
          };
          commitNotes(current.map((note) => note.id === noteId ? updated : note));
          setLastEvent(`Agent edited “${updated.title}”`);
          return { success: true, note: updated };
        },
      }, options);
      await context!.registerTool({
        name: 'move_news_note',
        description: 'Move a Post-it on the wall using percentage coordinates.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, x: { type: 'number', minimum: 0, maximum: 82 }, y: { type: 'number', minimum: 0, maximum: 78 } },
          required: ['id', 'x', 'y'],
        },
        execute: ({ id, x, y }) => {
          return moveStickerViaApi(String(id), Number(x), Number(y), 'agent');
        },
      }, options);
      await context!.registerTool({
        name: 'remove_news_note',
        description: 'Shred one news Post-it into confetti, then remove it from the wall.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: ({ id }) => {
          return removeNewsNote(String(id), 'agent');
        },
      }, options);
      await context!.registerTool({
        name: 'search_news_wall',
        description: 'Search headlines, story text, and categories on the wall.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: ({ query }) => {
          const needle = String(query).toLowerCase();
          const matches = notesRef.current.filter((note) => `${note.title} ${note.body} ${note.category}`.toLowerCase().includes(needle));
          return { success: true, count: matches.length, notes: matches };
        },
      }, options);
      await context!.registerTool({
        name: 'clear_news_wall',
        description: 'Remove every Post-it from The Daily Wall.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          const removed = notesRef.current.length;
          commitNotes([]);
          setLastEvent(`Agent cleared ${removed} notes`);
          return { success: true, removed };
        },
      }, options);
      await context!.registerTool({
        name: 'get_news_wall',
        description: 'Read all current Post-its and their positions.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => ({ success: true, count: notesRef.current.length, notes: notesRef.current }),
      }, options);
      await context!.registerTool({
        name: 'get_news_note',
        description: 'Read the complete headline, story, position, and fact-check state of one Post-it.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: ({ id }) => {
          const note = notesRef.current.find((item) => item.id === String(id));
          return note ? { success: true, note } : { success: false, error: 'Note not found.' };
        },
      }, options);
      await context!.registerTool({
        name: 'organize_news_wall',
        description: 'Arrange every Post-it into two centered, non-overlapping rows while preserving all news content.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          const organized = organizeWall(notesRef.current, getRenderedNoteSizes());
          commitNotes(organized);
          appendLog(`Auto-arranged ${organized.length} stickers in two rows without overlap.`, 'info', 'agent');
          centerBoardView();
          setLastEvent(`Agent organized ${organized.length} notes`);
          return { success: true, count: organized.length, notes: organized.map(({ id, x, y }) => ({ id, x, y })) };
        },
      }, options);
      await context!.registerTool({
        name: 'get_fact_check_queue',
        description: 'Read the fact-check-only queue. For every pending queue type, use get_agent_action_queue instead.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          const queued = notesRef.current.filter((note) => factStatus(note) === 'queued');
          return { success: true, count: queued.length, notes: queued };
        },
      }, options);
      await context!.registerTool({
        name: 'set_news_fact_check',
        description: 'After external research, write a verdict, concise explanation, and source URLs back to a news Post-it.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            verdict: { type: 'string', enum: ['verified', 'disputed', 'inconclusive'] },
            summary: { type: 'string' },
            sources: { type: 'array', items: { type: 'string', format: 'uri' } },
          },
          required: ['id', 'verdict', 'summary', 'sources'],
        },
        execute: ({ id, verdict, summary, sources }) => {
          const noteId = String(id);
          const current = notesRef.current;
          const target = current.find((note) => note.id === noteId);
          if (!target) return { success: false, error: 'Note not found.' };
          if (!FACT_CHECK_STATUSES.includes(verdict as FactCheckStatus) || !['verified', 'disputed', 'inconclusive'].includes(String(verdict))) {
            return { success: false, error: 'Invalid fact-check verdict.' };
          }
          const factCheck: FactCheck = {
            status: verdict as FactCheckStatus,
            summary: String(summary).trim().slice(0, 700),
            sources: Array.isArray(sources) ? sources.map(String).slice(0, 8) : [],
            checkedAt: new Date().toISOString(),
          };
          commitNotes(current.map((note) => note.id === noteId ? { ...note, factCheck } : note));
          appendLog(`Fact-check completed for “${target.title}”: ${String(verdict)}.`, 'success', 'agent');
          setLastEvent(`Agent fact-checked “${target.title}”`);
          return { success: true, id: noteId, factCheck };
        },
      }, options);
      await context!.registerTool({
        name: 'get_agent_action_queue',
        description: 'Primary queue reader. Use this whenever the user asks to inspect or process the queue. Returns every queued fact check and recent-news import with complete content and processing instructions.',
        inputSchema: { type: 'object', properties: {} },
        execute: readQueueSnapshot,
      }, options);
      await context!.registerTool({
        name: 'append_agent_log',
        description: 'Append a short activity update to the website agent log so the user can follow research, imports, fact checks, and errors.',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Concise human-readable progress update.' },
            level: { type: 'string', enum: AGENT_LOG_LEVELS, description: 'Severity of this update.' },
          },
          required: ['message'],
        },
        execute: ({ message, level }) => {
          const safeLevel = AGENT_LOG_LEVELS.includes(level as AgentLogLevel) ? level as AgentLogLevel : 'info';
          const entry = appendLog(String(message ?? ''), safeLevel, 'agent');
          return entry ? { success: true, log: entry } : { success: false, error: 'A log message is required.' };
        },
      }, options);
      await context!.registerTool({
        name: 'complete_agent_action',
        description: 'Mark one queued website action complete after all requested work has finished. This removes its queue block and records the supplied summary in the agent log.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Queued action id from get_agent_action_queue.' },
            summary: { type: 'string', description: 'Short description of the completed work.' },
          },
          required: ['id', 'summary'],
        },
        execute: ({ id, summary }) => {
          const actionId = String(id);
          const action = actionsRef.current.find((item) => item.id === actionId);
          if (!action) return { success: false, error: 'Queued action not found.' };
          commitActions((current) => current.filter((item) => item.id !== actionId));
          const cleanSummary = String(summary ?? '').trim() || 'Agent action completed.';
          appendLog(cleanSummary, 'success', 'agent');
          setLastEvent(cleanSummary);
          return { success: true, completed: action };
        },
      }, options);
      await context!.registerTool({
        name: 'set_board_zoom',
        description: 'Set the board zoom level. Use a value from 0.55 to 1.45; zooming out reveals more working space.',
        inputSchema: { type: 'object', properties: { zoom: { type: 'number', minimum: 0.55, maximum: 1.45 } }, required: ['zoom'] },
        execute: ({ zoom: requestedZoom }) => {
          const next = setBoardZoom(Number(requestedZoom));
          setLastEvent(`Agent set board zoom to ${Math.round(next * 100)}%`);
          return { success: true, zoom: next };
        },
      }, options);
      setMcpStatus('ready');
    }

    registerTools().catch((error) => { console.error('WebMCP registration failed', error); appendLog('WebMCP tool registration failed; agent controls are unavailable.', 'error', 'system'); setMcpStatus('preview') });
    return () => controller.abort();
  }, [appendLog, centerBoardView, commitActions, commitNotes, getRenderedNoteSizes, moveStickerViaApi, removeNewsNote, setBoardZoom]);

  const visibleNotes = useMemo(() => activeFilter === 'ALL' ? notes : notes.filter((note) => note.category === activeFilter), [activeFilter, notes]);
  const counts = useMemo(() => Object.fromEntries(['ALL', ...CATEGORIES].map((item) => [item, item === 'ALL' ? notes.length : notes.filter((note) => note.category === item).length])), [notes]);
  const boardWidth = useMemo(() => getBoardWidth(notes.length), [notes.length]);
  const boardHeight = useMemo(() => getBoardHeight(notes.length), [notes.length]);
  const queuedNotes = useMemo(() => notes.filter((note) => factStatus(note) === 'queued'), [notes]);
  const queuedFactChecks = queuedNotes.length;
  const importQueued = agentActions.some((action) => action.type === 'import_recent_news');
  const totalQueuedActions = queuedFactChecks + agentActions.length;

  const autoLayoutWall = useCallback(() => {
    const applyLayout = () => {
      const organized = organizeWall(notesRef.current, getRenderedNoteSizes());
      commitNotes(organized);
      appendLog(`Auto-arranged ${organized.length} stickers in two rows without overlap.`, 'info', 'human');
      centerBoardView();
      setLastEvent(`Auto-arranged ${organized.length} notes in two centered rows`);
    };
    if (activeFilter === 'ALL') {
      applyLayout();
      return;
    }
    setActiveFilter('ALL');
    window.requestAnimationFrame(() => window.requestAnimationFrame(applyLayout));
  }, [activeFilter, appendLog, centerBoardView, commitNotes, getRenderedNoteSizes]);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!storageReady || centeredRef.current || !pane) return;
    centeredRef.current = true;
    centerBoardView();
  }, [boardHeight, centerBoardView, storageReady]);

  const zoomBoard = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    setBoardZoom(zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1));
  };

  const beginPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.postit, .zoom-controls')) return;
    const pane = paneRef.current;
    if (!pane) return;
    event.preventDefault();
    panningRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: pane.scrollLeft,
      scrollTop: pane.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const panBoard = (event: ReactPointerEvent<HTMLElement>) => {
    const panning = panningRef.current;
    const pane = paneRef.current;
    if (!panning || !pane || panning.pointerId !== event.pointerId) return;
    pane.scrollLeft = panning.scrollLeft - (event.clientX - panning.startX);
    pane.scrollTop = panning.scrollTop - (event.clientY - panning.startY);
    const board = stageRef.current?.getBoundingClientRect();
    if (board) pointerRef.current = [(event.clientX - board.left) / board.width, (event.clientY - board.top) / board.height];
  };

  const endPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (panningRef.current?.pointerId !== event.pointerId) return;
    panningRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const focusNote = (note: Note) => {
    setActiveFilter('ALL');
    window.requestAnimationFrame(() => {
      const pane = paneRef.current;
      if (!pane) return;
      const currentZoom = zoomRef.current;
      pane.scrollLeft = Math.max(0, note.x / 100 * boardWidth * currentZoom - pane.clientWidth / 2 + 122 * currentZoom);
      pane.scrollTop = Math.max(0, note.y / 100 * getBoardHeight(notesRef.current.length) * currentZoom - pane.clientHeight / 2 + 103 * currentZoom);
    });
    setLastEvent(`Focused “${note.title}”`);
  };

  const queueRecentNewsImport = () => {
    if (actionsRef.current.some((action) => action.type === 'import_recent_news')) {
      setLastEvent('Recent-news import is already waiting for an agent');
      return;
    }
    const action: AgentAction = {
      id: `import-${Date.now()}`,
      type: 'import_recent_news',
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    commitActions((current) => [...current, action].slice(-20));
    appendLog('Recent-news import queued. Waiting for a connected agent.', 'info', 'human');
    setLastEvent('Recent-news import queued for a connected agent');
  };

  const cancelAgentAction = (action: AgentAction) => {
    commitActions((current) => current.filter((item) => item.id !== action.id));
    appendLog('Recent-news import removed from the agent queue.', 'warning', 'human');
    setLastEvent('Cancelled recent-news import');
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    const cleanHeadline = headline.trim();
    const cleanStory = story.trim();
    if (!cleanHeadline || !cleanStory) { setLastEvent('Add a headline and story first'); return }
    if (editingId) {
      commitNotes((current) => current.map((note) => note.id === editingId ? { ...note, title: cleanHeadline.slice(0, 90), body: cleanStory.slice(0, 420), category, color } : note));
      setLastEvent(`Updated “${cleanHeadline}”`);
    } else {
      const next = createNote({ title: cleanHeadline, body: cleanStory, category, color }, notesRef.current.length);
      commitNotes((current) => organizeWall([...current, next].slice(-24), getRenderedNoteSizes()));
      setActiveFilter('ALL');
      setLastEvent(`Pinned “${next.title}”`);
    }
    resetComposer();
  };

  const editNote = (note: Note) => {
    setHeadline(note.title); setStory(note.body); setCategory(note.category); setColor(note.color); setEditingId(note.id);
    setLastEvent(`Editing “${note.title}”`);
  };

  const enqueueFactCheck = (note: Note) => {
    if (factStatus(note) === 'queued') return false;
    commitNotes((current) => current.map((item) => item.id === note.id ? { ...item, factCheck: { status: 'queued' } } : item));
    appendLog(`Queued “${note.title}” for fact checking.`, 'info', 'human');
    setLastEvent(`Queued “${note.title}” — ask a connected agent to process the queue`);
    return true;
  };

  const queueFactCheck = (note: Note) => {
    if (factStatus(note) !== 'queued') {
      enqueueFactCheck(note);
      return;
    }
    commitNotes((current) => current.map((item) => item.id === note.id ? { ...item, factCheck: { status: 'unverified' } } : item));
    appendLog(`Removed “${note.title}” from the fact-check queue.`, 'warning', 'human');
    setLastEvent(`Cancelled fact-check for “${note.title}”`);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, note: Note) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
    setDroppingId(null);
    setDraggingId(note.id);
    setDragTilt(0);
    setDropTilt(0);
    draggingRef.current = { id: note.id, offsetX: event.clientX - (rect.left + rect.width * note.x / 100), offsetY: event.clientY - (rect.top + rect.height * note.y / 100), lastX: event.clientX, startX: event.clientX, startY: event.clientY, x: note.x, y: note.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dragNote = (event: ReactPointerEvent<HTMLElement>) => {
    const dragging = draggingRef.current;
    const stage = stageRef.current;
    if (!dragging || !stage) return;
    if (!dragging.moved && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 5) return;
    dragging.moved = true;
    const rect = stage.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left - dragging.offsetX) / rect.width) * 100, 0, 82);
    const y = clamp(((event.clientY - rect.top - dragging.offsetY) / rect.height) * 100, 0, 78);
    setDragTilt(clamp((event.clientX - dragging.lastX) * 0.32, -4.5, 4.5));
    dragging.lastX = event.clientX;
    dragging.x = x;
    dragging.y = y;
    moveStickerViaApi(dragging.id, x, y, 'human', { log: false, announce: false });
  };

  const endDrag = () => {
    const dropped = draggingRef.current;
    if (!dropped) return;
    draggingRef.current = null;
    setDraggingId(null);
    if (!dropped.moved) {
      setDragTilt(0);
      const note = notesRef.current.find((item) => item.id === dropped.id);
      if (note) enqueueFactCheck(note);
      return;
    }
    setDropTilt(dragTilt);
    setDragTilt(0);
    setDroppingId(dropped.id);
    moveStickerViaApi(dropped.id, dropped.x, dropped.y, 'human');
    dropTimerRef.current = window.setTimeout(() => {
      setDroppingId((current) => current === dropped.id ? null : current);
      dropTimerRef.current = null;
    }, 240);
  };

  return (
    <main className="newsroom-shell">
      <section className={`news-layout${drawerOpen ? '' : ' drawer-closed'}`}>
        <header className="rail">
          <div><span className="section-code wall-code">01 / WALL</span><h1>What’s sticking <em>today?</em></h1></div>
          <p>A living wall for headlines, fragments and stories worth keeping in sight.</p>
          <div className="rail-actions">
            <span className="rail-runtime-status"><i /> VGPU {gpuStatus === 'ready' ? 'LIVE' : gpuStatus.toUpperCase()} / WEBMCP {mcpStatus === 'ready' ? 'READY' : 'PREVIEW'}</span>
            <div className="rail-action-buttons">
              <button type="button" className="header-import" onClick={queueRecentNewsImport} disabled={importQueued}>{importQueued ? 'IMPORT QUEUED' : 'IMPORT RECENT NEWS'}</button>
              <button type="button" className="drawer-toggle" onClick={() => setDrawerOpen((current) => !current)} aria-expanded={drawerOpen} aria-controls="news-drawer">{drawerOpen ? 'CLOSE DRAWER' : 'OPEN DRAWER'}</button>
              <button type="button" className="header-log" onClick={() => setLogPanelOpen((current) => !current)} aria-expanded={logPanelOpen} aria-controls="agent-log-panel">{logPanelOpen ? 'CLOSE LOGS' : 'OPEN LOGS'}</button>
            </div>
          </div>
          <nav aria-label="Filter notes">
            {(['ALL', ...CATEGORIES] as Filter[]).map((filter) => (
              <button key={filter} className={activeFilter === filter ? 'active' : ''} onClick={() => setActiveFilter(filter)}>{filter === 'ALL' ? 'ALL NOTES' : filter}<b>{String(counts[filter] ?? 0).padStart(2, '0')}</b></button>
            ))}
          </nav>
        </header>

        <section className="board-shell" id="wall" aria-label="News Post-it wall">
          <div className="zoom-controls" aria-label="Board zoom controls">
            <button type="button" className="auto-layout-control" onClick={autoLayoutWall} aria-label="Automatically arrange all notes in two centered rows without overlap">AUTO LAYOUT</button>
            <button type="button" onClick={() => setBoardZoom(zoomRef.current - 0.1)} aria-label="Zoom out">−</button>
            <button type="button" className="zoom-readout" onClick={() => setBoardZoom(1)} aria-label="Reset board zoom">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setBoardZoom(zoomRef.current + 0.1)} aria-label="Zoom in">+</button>
          </div>
          <div ref={paneRef} className={`postit-stage${isPanning ? ' is-panning' : ''}`} onWheel={zoomBoard}
            onPointerDown={beginPan} onPointerMove={panBoard} onPointerUp={endPan} onPointerCancel={endPan}
            onPointerLeave={() => { pointerRef.current = [0.5, 0.5] }}>
            <div className="board-scroll-space" style={{ width: `max(${boardWidth * zoom}px, 100%)`, height: `max(${boardHeight * zoom}px, 100%)` }}>
            <div ref={stageRef} className="board-world" style={{ width: `${boardWidth}px`, height: `${boardHeight}px`, transform: `scale(${zoom})` }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                pointerRef.current = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
              }}>
              <canvas ref={canvasRef} aria-hidden="true" />
              <div className="stage-label"><span>LIVE WALL / 28 AUG 2026</span><span>{visibleNotes.length} NOTES / DRAG EMPTY BOARD TO PAN</span></div>
              {visibleNotes.length === 0 && <div className="empty-wall"><span>THE WALL IS QUIET</span><p>Write or paste the first story.</p></div>}
              {visibleNotes.map((note) => (
                <article key={note.id} data-note-id={note.id} className={`postit ${note.color}${draggingId === note.id ? ' is-dragging' : ''}${droppingId === note.id ? ' is-dropping' : ''}${shreddingIds.includes(note.id) ? ' is-shredding' : ''}${expandedFactId === note.id ? ' is-expanded' : ''}`} style={{ left: `${note.x}%`, top: `${note.y}%`, rotate: `${note.rotation}deg`, '--drag-tilt': `${droppingId === note.id ? dropTilt : dragTilt}deg` } as CSSProperties}
                  onPointerDown={(event) => beginDrag(event, note)} onPointerMove={dragNote} onPointerUp={endDrag} onPointerCancel={endDrag}>
                  <span className="tape" />
                  <div className="note-meta"><span>{note.category}</span>{note.factCheck?.summary ? <button type="button" className={`fact-badge ${factStatus(note)}`} title="Show fact-check details" aria-expanded={expandedFactId === note.id} onPointerDown={(event) => event.stopPropagation()} onClick={() => setExpandedFactId((current) => current === note.id ? null : note.id)}>{factStatus(note).toUpperCase()}</button> : <span className={`fact-badge ${factStatus(note)}`}>{factStatus(note).toUpperCase()}</span>}</div>
                  <h2>{note.title}</h2><p className="note-body">{linkedText(note.body)}</p>
                  {expandedFactId === note.id && note.factCheck?.summary && <section className="fact-expansion" onPointerDown={(event) => event.stopPropagation()}>
                    <canvas ref={factCanvasRef} aria-hidden="true" />
                    <div><span className="fact-expansion-label">FACT-CHECK COMMENT</span><p><b>{factStatus(note)}</b> — {linkedText(note.factCheck.summary)}</p>
                    {!!note.factCheck.sources?.length && <div className="fact-sources">{note.factCheck.sources.map((source, index) => {
                      const href = safeWebLink(source);
                      return href ? <a key={`${source}-${index}`} href={href} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>SOURCE {String(index + 1).padStart(2, '0')} ↗</a> : null;
                    })}</div>}</div>
                  </section>}
                  <footer><span>JUST NOW</span><div><button className="note-action fact-action" onPointerDown={(event) => event.stopPropagation()} onClick={() => queueFactCheck(note)} aria-label={`Queue ${note.title} for a fact check`} title="Fact check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></button><button className="note-action edit-action" onPointerDown={(event) => event.stopPropagation()} onClick={() => editNote(note)} aria-label={`Edit ${note.title}`} title="Edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.4-1 10.8-10.8-3.4-3.4L5 15.6 4 20Z" /><path d="m14.8 5.8 3.4 3.4" /></svg></button><button className="note-action delete-action" onPointerDown={(event) => event.stopPropagation()} onClick={() => { void removeNewsNote(note.id, 'human') }} aria-label={`Shred ${note.title}`} title="Delete"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg></button></div></footer>
                  {shreddingIds.includes(note.id) && <span className="shred-confetti" aria-hidden="true">{CONFETTI_PIECES.map((piece, index) => <i key={index} style={{ left: `${piece.left}%`, top: `${piece.top}%`, '--confetti-x': `${piece.drift}px`, '--confetti-y': `${piece.fall}px`, '--confetti-spin': `${piece.spin}deg`, '--confetti-delay': `${piece.delay}ms` } as CSSProperties} />)}</span>}
                </article>
              ))}
            </div>
          </div>
          </div>
        </section>

        <aside className="composer" id="news-drawer">
          <section className="queue-panel" aria-label="Agent queue">
            <div className="queue-panel-head"><span className="section-code">02 / AGENT QUEUE</span><b>{String(totalQueuedActions).padStart(2, '0')}</b></div>
            <p className="queue-description">Click a Post-it to queue a fact check. A connected agent researches the claim and writes the verdict back; its colored block disappears when the verification is complete.</p>
            <div className="queue-blocks" aria-live="polite">
              {queuedNotes.map((note) => <div className="queue-block-wrap" key={note.id}><button type="button" className={`queue-block ${note.color}`} onClick={() => focusNote(note)} title={`Fact-check queued: ${note.title}`} aria-label={`Open queued note ${note.title}`}><span>?</span></button><button type="button" className="queue-remove" onClick={() => queueFactCheck(note)} title="Remove from queue" aria-label={`Remove ${note.title} from the fact-check queue`}>×</button></div>)}
              {agentActions.map((action) => <div className="queue-block-wrap" key={action.id}><span className="queue-block import" role="status" title="Recent-news import queued" aria-label="Recent-news import queued"><span>↓</span></span><button type="button" className="queue-remove" onClick={() => cancelAgentAction(action)} title="Remove from queue" aria-label="Remove recent-news import from the agent queue">×</button></div>)}
              {totalQueuedActions === 0 && <span className="queue-empty">QUEUE CLEAR</span>}
            </div>
          </section>
          <span className="section-code form-code">03 / {editingId ? 'EDIT NOTE' : 'ADD NOTE'}</span>
          <form onSubmit={submitNote}>
            <label>HEADLINE<input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={90} placeholder="What happened?" /></label>
            <label>STORY<textarea value={story} onChange={(event) => setStory(event.target.value)} maxLength={420} placeholder="Write or paste the news here…" /></label>
            <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="color-row"><span>COLOR</span>{COLORS.map((item) => <input type="radio" name="note-color" value={item} key={item} className={`swatch ${item}`} checked={color === item} onChange={() => setColor(item)} aria-label={`Use ${item} paper`} title={item} />)}</div>
            <button type="submit" className="pin-button"><span>{editingId ? 'UPDATE THE NOTE' : 'PIN TO THE WALL'}</span><b>↗</b></button>
            {editingId && <button type="button" className="cancel-button" onClick={resetComposer}>CANCEL EDIT</button>}
          </form>
          <p className="agent-note"><span /> {lastEvent} · 15 AGENT TOOLS EXPOSED</p>
        </aside>
      </section>
      <section id="agent-log-panel" className={`agent-log-panel${logPanelOpen ? ' open' : ''}`} role="dialog" aria-label="Agent activity log" aria-hidden={!logPanelOpen}>
        <header><div><span className="section-code">AGENT ACTIVITY</span><b>{String(agentLogs.length).padStart(2, '0')} ENTRIES</b></div><div className="log-header-actions"><button type="button" onClick={clearAgentLog} disabled={agentLogs.length === 0}>CLEAR LOG</button><button type="button" onClick={() => setLogPanelOpen(false)} aria-label="Close agent log">CLOSE ×</button></div></header>
        <div className="log-entries">
          {agentLogs.length === 0 && <p className="log-empty">No agent activity yet. Queue a fact check or import to begin.</p>}
          {agentLogs.length > 0 && <div className="log-columns" aria-hidden="true"><span>TIME</span><span>ACTOR</span><span>LEVEL</span><span>ACTION</span></div>}
          {[...agentLogs].reverse().map((entry) => <article key={entry.id} className={`log-entry ${entry.level}`}><time>{entry.timestamp.slice(11, 16)} UTC</time><span className={`log-actor ${entry.actor ?? 'system'}`}>{entry.actor ?? 'system'}</span><span className="log-level">{entry.level}</span><p>{entry.message}</p></article>)}
        </div>
      </section>
    </main>
  );
}

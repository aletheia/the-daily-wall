'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

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
const BOARD_WIDTH = 1600;
const LAYOUT = [[6, 9], [38, 5], [68, 14], [16, 52], [53, 54], [72, 58], [6, 68]];
const ROTATIONS = [-3, 2, 4, 3, -2, 1, -4];

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
  let light = exp(-distance(uv, pointer) * 3.2);
  let noteEnergy = min(params.board.x / 12.0, 1.0);
  var color = vec3f(0.045, 0.165, 0.135);
  color += vec3f(0.035, 0.11, 0.09) * light;
  color += vec3f(grain * 0.025 + fibers * 0.012 + weave);
  color += vec3f(0.018, 0.012, 0.0) * noteEnergy;
  let vignette = smoothstep(0.82, 0.2, distance(uv, vec2f(0.5)));
  color *= 0.76 + vignette * 0.32;
  return vec4f(color, 1.0);
}
`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const getBoardHeight = (count: number) => Math.max(1200, Math.ceil(Math.max(count, 1) / 3) * 320 + 100);

function organizeWall(current: Note[]): Note[] {
  const boardHeight = getBoardHeight(current.length);
  return current.map((note, index) => ({
    ...note,
    x: 4 + (index % 3) * 32,
    y: ((Math.floor(index / 3) * 270 + 52) / boardHeight) * 100,
    rotation: ROTATIONS[index % ROTATIONS.length] * 0.45,
  }));
}

const factStatus = (note: Note): FactCheckStatus => note.factCheck?.status ?? 'unverified';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<Note[]>(INITIAL_NOTES);
  const zoomRef = useRef(1);
  const pointerRef = useRef<[number, number]>([0.5, 0.5]);
  const storageReadyRef = useRef(false);
  const centeredRef = useRef(false);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number; lastX: number } | null>(null);
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

  const setBoardZoom = useCallback((value: number) => {
    const next = Math.round(clamp(value, 0.55, 1.45) * 20) / 20;
    zoomRef.current = next;
    setZoom(next);
    return next;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem('daily-wall-notes');
        storageReadyRef.current = true;
        if (stored) {
          const parsed = JSON.parse(stored) as Note[];
          if (Array.isArray(parsed)) commitNotes(parsed.slice(0, 24));
        }
      } catch {
        storageReadyRef.current = true;
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commitNotes]);

  useEffect(() => {
    notesRef.current = notes;
    if (storageReadyRef.current) window.localStorage.setItem('daily-wall-notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => () => {
    if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
    shredTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    shredTimersRef.current.clear();
  }, []);

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
        setGpuStatus('fallback');
      }
    }

    startBoard();
    return () => { active = false; stop?.() };
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };

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
          const organized = organizeWall([...current, next].slice(-24));
          const created = organized.find((note) => note.id === next.id) ?? next;
          commitNotes(organized);
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
          const noteId = String(id);
          const current = notesRef.current;
          if (!current.some((note) => note.id === noteId)) return { success: false, error: 'Note not found.' };
          commitNotes(current.map((note) => note.id === noteId ? { ...note, x: clamp(Number(x), 0, 82), y: clamp(Number(y), 0, 78) } : note));
          setLastEvent('Agent rearranged the wall');
          return { success: true, id: noteId, x: Number(x), y: Number(y) };
        },
      }, options);
      await context!.registerTool({
        name: 'remove_news_note',
        description: 'Remove one news Post-it from the wall.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: ({ id }) => {
          const noteId = String(id);
          const current = notesRef.current;
          if (!current.some((note) => note.id === noteId)) return { success: false, error: 'Note not found.' };
          commitNotes(current.filter((note) => note.id !== noteId));
          setLastEvent('Agent removed one note');
          return { success: true, id: noteId };
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
        description: 'Arrange every Post-it into a non-overlapping grid while preserving all news content.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          const organized = organizeWall(notesRef.current);
          commitNotes(organized);
          setLastEvent(`Agent organized ${organized.length} notes`);
          return { success: true, count: organized.length, notes: organized.map(({ id, x, y }) => ({ id, x, y })) };
        },
      }, options);
      await context!.registerTool({
        name: 'get_fact_check_queue',
        description: 'Read complete content for every Post-it whose author requested an external fact check.',
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
          setLastEvent(`Agent fact-checked “${target.title}”`);
          return { success: true, id: noteId, factCheck };
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

    registerTools().catch((error) => { console.error('WebMCP registration failed', error); setMcpStatus('preview') });
    return () => controller.abort();
  }, [commitNotes, setBoardZoom]);

  const visibleNotes = useMemo(() => activeFilter === 'ALL' ? notes : notes.filter((note) => note.category === activeFilter), [activeFilter, notes]);
  const counts = useMemo(() => Object.fromEntries(['ALL', ...CATEGORIES].map((item) => [item, item === 'ALL' ? notes.length : notes.filter((note) => note.category === item).length])), [notes]);
  const boardHeight = useMemo(() => getBoardHeight(notes.length), [notes.length]);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!storageReady || centeredRef.current || !pane) return;
    centeredRef.current = true;
    pane.scrollLeft = Math.max(0, (pane.scrollWidth - pane.clientWidth) / 2);
    pane.scrollTop = Math.max(0, (pane.scrollHeight - pane.clientHeight) / 2);
  }, [boardHeight, storageReady]);

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

  const resetComposer = () => { setHeadline(''); setStory(''); setCategory('WORLD'); setColor('yellow'); setEditingId(null) };

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
      commitNotes((current) => organizeWall([...current, next].slice(-24)));
      setActiveFilter('ALL');
      setLastEvent(`Pinned “${next.title}”`);
    }
    resetComposer();
  };

  const editNote = (note: Note) => {
    setHeadline(note.title); setStory(note.body); setCategory(note.category); setColor(note.color); setEditingId(note.id);
    setLastEvent(`Editing “${note.title}”`);
  };

  const queueFactCheck = (note: Note) => {
    commitNotes((current) => current.map((item) => item.id === note.id ? { ...item, factCheck: { status: 'queued' } } : item));
    setLastEvent(`Queued “${note.title}” for fact-checking`);
  };

  const shredNote = (note: Note) => {
    if (shredTimersRef.current.has(note.id)) return;
    setShreddingIds((current) => [...current, note.id]);
    setLastEvent(`Shredding “${note.title}”`);
    const timer = window.setTimeout(() => {
      commitNotes((current) => current.filter((item) => item.id !== note.id));
      setShreddingIds((current) => current.filter((id) => id !== note.id));
      shredTimersRef.current.delete(note.id);
      if (editingId === note.id) resetComposer();
      setLastEvent(`Removed “${note.title}”`);
    }, 720);
    shredTimersRef.current.set(note.id, timer);
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
    draggingRef.current = { id: note.id, offsetX: event.clientX - (rect.left + rect.width * note.x / 100), offsetY: event.clientY - (rect.top + rect.height * note.y / 100), lastX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dragNote = (event: ReactPointerEvent<HTMLElement>) => {
    const dragging = draggingRef.current;
    const stage = stageRef.current;
    if (!dragging || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left - dragging.offsetX) / rect.width) * 100, 0, 82);
    const y = clamp(((event.clientY - rect.top - dragging.offsetY) / rect.height) * 100, 0, 78);
    setDragTilt(clamp((event.clientX - dragging.lastX) * 0.32, -4.5, 4.5));
    dragging.lastX = event.clientX;
    commitNotes((current) => current.map((note) => note.id === dragging.id ? { ...note, x, y } : note));
  };

  const endDrag = () => {
    const dropped = draggingRef.current;
    if (!dropped) return;
    draggingRef.current = null;
    setDraggingId(null);
    setDropTilt(dragTilt);
    setDragTilt(0);
    setDroppingId(dropped.id);
    setLastEvent('Note landed on the wall');
    dropTimerRef.current = window.setTimeout(() => {
      setDroppingId((current) => current === dropped.id ? null : current);
      dropTimerRef.current = null;
    }, 240);
  };

  return (
    <main className="newsroom-shell">
      <header className="newsroom-header">
        <a href="#wall" className="news-brand"><span className="brand-pin" />THE DAILY WALL</a>
        <p>NEWS, PINNED IN PUBLIC</p>
        <div className="header-status"><span /> VGPU {gpuStatus === 'ready' ? 'LIVE' : gpuStatus.toUpperCase()} / WEBMCP {mcpStatus === 'ready' ? 'READY' : 'PREVIEW'}</div>
      </header>

      <section className="news-layout">
        <aside className="rail">
          <div><span className="section-code">01 / WALL</span><h1>What’s<br />sticking<br /><em>today?</em></h1></div>
          <p>A living wall for headlines, fragments and stories worth keeping in sight.</p>
          <nav aria-label="Filter notes">
            {(['ALL', ...CATEGORIES] as Filter[]).map((filter) => (
              <button key={filter} className={activeFilter === filter ? 'active' : ''} onClick={() => setActiveFilter(filter)}>{filter === 'ALL' ? 'ALL NOTES' : filter}<b>{String(counts[filter] ?? 0).padStart(2, '0')}</b></button>
            ))}
          </nav>
        </aside>

        <section className="board-shell" id="wall" aria-label="News Post-it wall">
          <div className="zoom-controls" aria-label="Board zoom controls">
            <button type="button" onClick={() => setBoardZoom(zoomRef.current - 0.1)} aria-label="Zoom out">−</button>
            <button type="button" className="zoom-readout" onClick={() => setBoardZoom(1)} aria-label="Reset board zoom">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setBoardZoom(zoomRef.current + 0.1)} aria-label="Zoom in">+</button>
          </div>
          <div ref={paneRef} className={`postit-stage${isPanning ? ' is-panning' : ''}`} onWheel={zoomBoard}
            onPointerDown={beginPan} onPointerMove={panBoard} onPointerUp={endPan} onPointerCancel={endPan}
            onPointerLeave={() => { pointerRef.current = [0.5, 0.5] }}>
            <div className="board-scroll-space" style={{ width: `${BOARD_WIDTH * zoom}px`, height: `${boardHeight * zoom}px` }}>
            <div ref={stageRef} className="board-world" style={{ width: `${BOARD_WIDTH}px`, height: `${boardHeight}px`, transform: `scale(${zoom})` }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                pointerRef.current = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
              }}>
              <canvas ref={canvasRef} aria-hidden="true" />
              <div className="stage-label"><span>LIVE WALL / 28 AUG 2026</span><span>{visibleNotes.length} NOTES / DRAG EMPTY BOARD TO PAN</span></div>
              {visibleNotes.length === 0 && <div className="empty-wall"><span>THE WALL IS QUIET</span><p>Write or paste the first story.</p></div>}
              {visibleNotes.map((note) => (
                <article key={note.id} className={`postit ${note.color}${draggingId === note.id ? ' is-dragging' : ''}${droppingId === note.id ? ' is-dropping' : ''}${shreddingIds.includes(note.id) ? ' is-shredding' : ''}`} style={{ left: `${note.x}%`, top: `${note.y}%`, rotate: `${note.rotation}deg`, '--drag-tilt': `${droppingId === note.id ? dropTilt : dragTilt}deg` } as CSSProperties}
                  onPointerDown={(event) => beginDrag(event, note)} onPointerMove={dragNote} onPointerUp={endDrag} onPointerCancel={endDrag}>
                  <span className="tape" />
                  <div className="note-meta"><span>{note.category}</span><span className={`fact-badge ${factStatus(note)}`} title={note.factCheck?.summary}>{factStatus(note).toUpperCase()}</span></div>
                  <h2>{note.title}</h2><p>{note.body}</p>
                  {note.factCheck?.summary && <p className="fact-summary"><b>{factStatus(note)}:</b> {note.factCheck.summary}</p>}
                  <footer><span>JUST NOW</span><div><button onPointerDown={(event) => event.stopPropagation()} onClick={() => queueFactCheck(note)} aria-label={`Queue ${note.title} for a fact check`}>?</button><button onPointerDown={(event) => event.stopPropagation()} onClick={() => editNote(note)} aria-label={`Edit ${note.title}`}>✎</button><button onPointerDown={(event) => event.stopPropagation()} onClick={() => shredNote(note)} aria-label={`Shred ${note.title}`}>×</button></div></footer>
                </article>
              ))}
            </div>
          </div>
          </div>
        </section>

        <aside className="composer">
          <div><span className="section-code">02 / {editingId ? 'EDIT NOTE' : 'ADD NOTE'}</span><h2>Write it.<br />Paste it.<br /><em>Pin it.</em></h2></div>
          <form onSubmit={submitNote}>
            <label>HEADLINE<input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={90} placeholder="What happened?" /></label>
            <label>STORY<textarea value={story} onChange={(event) => setStory(event.target.value)} maxLength={420} placeholder="Write or paste the news here…" /></label>
            <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="color-row"><span>COLOR</span>{COLORS.map((item) => <button type="button" key={item} className={`swatch ${item} ${color === item ? 'active' : ''}`} onClick={() => setColor(item)} aria-label={item} />)}</div>
            <button type="submit" className="pin-button"><span>{editingId ? 'UPDATE THE NOTE' : 'PIN TO THE WALL'}</span><b>↗</b></button>
            {editingId && <button type="button" className="cancel-button" onClick={resetComposer}>CANCEL EDIT</button>}
          </form>
          <p className="agent-note"><span /> {lastEvent} · 12 AGENT TOOLS EXPOSED</p>
        </aside>
      </section>
    </main>
  );
}

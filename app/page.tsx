'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';

type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange';
type Category = 'TECH' | 'WORLD' | 'CULTURE' | 'SCIENCE';
type Filter = 'ALL' | Category;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const notesRef = useRef<Note[]>(INITIAL_NOTES);
  const pointerRef = useRef<[number, number]>([0.5, 0.5]);
  const storageReadyRef = useRef(false);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const commitNotes = useCallback((producer: Note[] | ((current: Note[]) => Note[])) => {
    setNotes((current) => {
      const next = typeof producer === 'function' ? producer(current) : producer;
      notesRef.current = next;
      return next;
    });
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
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commitNotes]);

  useEffect(() => {
    notesRef.current = notes;
    if (storageReadyRef.current) window.localStorage.setItem('daily-wall-notes', JSON.stringify(notes));
  }, [notes]);

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
        const target = surface(gpu, canvas, { dpr: [1, 2] });
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
          commitNotes([...current, next].slice(-24));
          setLastEvent(`Agent pinned “${next.title}”`);
          return { success: true, note: next };
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
      setMcpStatus('ready');
    }

    registerTools().catch((error) => { console.error('WebMCP registration failed', error); setMcpStatus('preview') });
    return () => controller.abort();
  }, [commitNotes]);

  const visibleNotes = useMemo(() => activeFilter === 'ALL' ? notes : notes.filter((note) => note.category === activeFilter), [activeFilter, notes]);
  const counts = useMemo(() => Object.fromEntries(['ALL', ...CATEGORIES].map((item) => [item, item === 'ALL' ? notes.length : notes.filter((note) => note.category === item).length])), [notes]);

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
      commitNotes((current) => [...current, next].slice(-24));
      setActiveFilter('ALL');
      setLastEvent(`Pinned “${next.title}”`);
    }
    resetComposer();
  };

  const editNote = (note: Note) => {
    setHeadline(note.title); setStory(note.body); setCategory(note.category); setColor(note.color); setEditingId(note.id);
    setLastEvent(`Editing “${note.title}”`);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, note: Note) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    draggingRef.current = { id: note.id, offsetX: event.clientX - (rect.left + rect.width * note.x / 100), offsetY: event.clientY - (rect.top + rect.height * note.y / 100) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const dragNote = (event: ReactPointerEvent<HTMLElement>) => {
    const dragging = draggingRef.current;
    const stage = stageRef.current;
    if (!dragging || !stage) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left - dragging.offsetX) / rect.width) * 100, 0, 82);
    const y = clamp(((event.clientY - rect.top - dragging.offsetY) / rect.height) * 100, 0, 78);
    commitNotes((current) => current.map((note) => note.id === dragging.id ? { ...note, x, y } : note));
  };

  const endDrag = () => { if (draggingRef.current) setLastEvent('Note moved by hand'); draggingRef.current = null };

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

        <section ref={stageRef} className="postit-stage" id="wall" aria-label="News Post-it wall"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            pointerRef.current = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
          }} onPointerLeave={() => { pointerRef.current = [0.5, 0.5] }}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="stage-label"><span>LIVE WALL / 28 AUG 2026</span><span>{visibleNotes.length} NOTES / DRAG TO ARRANGE</span></div>
          {visibleNotes.length === 0 && <div className="empty-wall"><span>THE WALL IS QUIET</span><p>Write or paste the first story.</p></div>}
          {visibleNotes.map((note) => (
            <article key={note.id} className={`postit ${note.color}`} style={{ left: `${note.x}%`, top: `${note.y}%`, rotate: `${note.rotation}deg` }}
              onPointerDown={(event) => beginDrag(event, note)} onPointerMove={dragNote} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <span className="tape" />
              <div className="note-meta"><span>{note.category}</span><span>•</span></div>
              <h2>{note.title}</h2><p>{note.body}</p>
              <footer><span>JUST NOW</span><div><button onPointerDown={(event) => event.stopPropagation()} onClick={() => editNote(note)} aria-label={`Edit ${note.title}`}>✎</button><button onPointerDown={(event) => event.stopPropagation()} onClick={() => { commitNotes((current) => current.filter((item) => item.id !== note.id)); setLastEvent(`Removed “${note.title}”`) }} aria-label={`Remove ${note.title}`}>×</button></div></footer>
            </article>
          ))}
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
          <p className="agent-note"><span /> {lastEvent} · 07 AGENT TOOLS EXPOSED</p>
        </aside>
      </section>
    </main>
  );
}

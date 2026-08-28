'use client';

import { useEffect, useRef, useState } from 'react';

type Preset = 'solar' | 'borealis' | 'plasma' | 'mono';
type SceneState = { preset: Preset; intensity: number; accent: string; playing: boolean };
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

const DEFAULT_SCENE: SceneState = { preset: 'borealis', intensity: 1, accent: '#b7ff4a', playing: true };
const PRESETS: { id: Preset; label: string; color: string }[] = [
  { id: 'solar', label: 'Solar', color: '#ff8a3d' },
  { id: 'borealis', label: 'Borealis', color: '#b7ff4a' },
  { id: 'plasma', label: 'Plasma', color: '#d7a7ff' },
  { id: 'mono', label: 'Mono', color: '#eeeeee' },
];

const SHADER = /* wgsl */ `
struct Params {
  motion: vec4f,
  accent: vec4f,
  pointer: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn palette(t: f32, preset: f32, accent: vec3f) -> vec3f {
  let solar = vec3f(1.05, 0.25, 0.03) + vec3f(0.0, 0.45, 0.2) * cos(6.283 * (t + vec3f(0.0, 0.12, 0.3)));
  let borealis = accent * (0.8 + 0.5 * cos(6.283 * (t + vec3f(0.0, 0.18, 0.42))));
  let plasma = vec3f(0.52, 0.16, 0.95) + vec3f(0.42, 0.22, 0.1) * cos(6.283 * (t + vec3f(0.0, 0.2, 0.5)));
  let mono = vec3f(0.72 + 0.3 * cos(t * 6.283));
  if (preset < 0.5) { return solar; }
  if (preset < 1.5) { return borealis; }
  if (preset < 2.5) { return plasma; }
  return mono;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.pointer.zw, vec2f(1.0));
  let aspect = resolution.x / resolution.y;
  var p = (uv - 0.5) * vec2f(aspect, 1.0);
  let mouse = (params.pointer.xy - 0.5) * vec2f(aspect, 1.0);
  p -= mouse * 0.12;

  let time = params.motion.x;
  let intensity = params.motion.y;
  let preset = params.motion.z;
  let r = length(p);
  let a = atan2(p.y, p.x);
  var energy = 0.0;
  var haze = 0.0;

  for (var i = 0; i < 7; i++) {
    let fi = f32(i);
    let wave = sin(r * (15.0 + fi * 2.3) - time * (0.7 + fi * 0.12) + a * (2.0 + fi * 0.37));
    let band = 0.008 / max(abs(r - (0.12 + fi * 0.055 + wave * 0.018)), 0.004);
    energy += band * (0.12 + 0.03 * fi);
    haze += exp(-abs(wave) * 5.0) / (4.0 + fi);
  }

  let gridUv = abs(fract((p + time * 0.006) * 18.0) - 0.5);
  let grid = (1.0 - smoothstep(0.46, 0.5, max(gridUv.x, gridUv.y))) * 0.025;
  let grain = (hash(floor(uv * resolution / 2.0) + floor(time * 12.0)) - 0.5) * 0.035;
  let core = exp(-r * 7.0) * 1.8;
  let col = palette(r * 1.9 + time * 0.035, preset, params.accent.rgb);
  let vignette = smoothstep(0.82, 0.18, length(uv - 0.5));
  var finalColor = col * (energy * 0.085 + haze * 0.16 + core) * intensity;
  finalColor += col * grid + grain;
  finalColor *= 0.35 + 0.65 * vignette;
  finalColor = pow(max(finalColor, vec3f(0.0)), vec3f(0.86));
  return vec4f(finalColor, 1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const parsed = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneState>(DEFAULT_SCENE);
  const pointerRef = useRef<[number, number]>([0.5, 0.5]);
  const [scene, setScene] = useState<SceneState>(DEFAULT_SCENE);
  const [gpuStatus, setGpuStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [mcpStatus, setMcpStatus] = useState<'ready' | 'preview'>('preview');
  const [lastAction, setLastAction] = useState('Scene initialized');

  const updateScene = (patch: Partial<SceneState>, action: string) => {
    setScene((current) => {
      const next = { ...current, ...patch };
      sceneRef.current = next;
      return next;
    });
    setLastAction(action);
  };

  useEffect(() => { sceneRef.current = scene }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let stop: (() => void) | undefined;

    async function start() {
      try {
        const { effect, frameLoop, init, surface } = await import('vgpu');
        if (!active || !canvas) return;
        const gpu = await init();
        const target = surface(gpu, canvas, { dpr: [1, 2] });
        const field = effect(gpu, SHADER, {
          set: { params: { motion: [0, 1, 1, 0], accent: [0.72, 1, 0.29, 1], pointer: [0.5, 0.5, 1, 1] } },
        });
        const started = performance.now();
        let frozenAt = 0;
        const handle = frameLoop(gpu, (frame) => {
          const current = sceneRef.current;
          const elapsed = (performance.now() - started) / 1000;
          if (current.playing) frozenAt = elapsed;
          const [red, green, blue] = hexToRgb(current.accent);
          field.set({ params: {
            motion: [current.playing ? elapsed : frozenAt, current.intensity, PRESETS.findIndex((p) => p.id === current.preset), 0],
            accent: [red, green, blue, 1],
            pointer: [pointerRef.current[0], pointerRef.current[1], target.size[0], target.size[1]],
          } });
          frame.pass(target, field);
        });
        stop = () => { handle.stop(); gpu.dispose() };
        setGpuStatus('ready');
      } catch (error) {
        console.error('WebGPU initialization failed', error);
        setGpuStatus('fallback');
      }
    }

    start();
    return () => { active = false; stop?.() };
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };

    async function register() {
      await context!.registerTool({
        name: 'set_visual_preset', description: 'Change the Aether Field visual preset.',
        inputSchema: { type: 'object', properties: { preset: { type: 'string', enum: PRESETS.map((preset) => preset.id) } }, required: ['preset'] },
        execute: ({ preset }) => {
          const next = String(preset) as Preset;
          const match = PRESETS.find((item) => item.id === next);
          if (!match) return { success: false, error: 'Unknown preset' };
          updateScene({ preset: next, accent: match.color }, `Agent selected ${match.label}`);
          return { success: true, preset: next };
        },
      }, options);
      await context!.registerTool({
        name: 'set_field_intensity', description: 'Set shader intensity from 0.2 to 2.',
        inputSchema: { type: 'object', properties: { value: { type: 'number', minimum: 0.2, maximum: 2 } }, required: ['value'] },
        execute: ({ value }) => {
          const intensity = Math.min(2, Math.max(0.2, Number(value)));
          updateScene({ intensity }, `Agent set intensity to ${intensity.toFixed(2)}`);
          return { success: true, intensity };
        },
      }, options);
      await context!.registerTool({
        name: 'set_accent_color', description: 'Set the shader accent color using a CSS hex color.',
        inputSchema: { type: 'object', properties: { hex: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['hex'] },
        execute: ({ hex }) => {
          const accent = String(hex);
          if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return { success: false, error: 'Use a six-digit hex color.' };
          updateScene({ accent }, `Agent changed accent to ${accent}`);
          return { success: true, accent };
        },
      }, options);
      await context!.registerTool({
        name: 'set_motion', description: 'Pause or resume the animated shader.',
        inputSchema: { type: 'object', properties: { playing: { type: 'boolean' } }, required: ['playing'] },
        execute: ({ playing }) => {
          const isPlaying = Boolean(playing);
          updateScene({ playing: isPlaying }, `Agent ${isPlaying ? 'resumed' : 'paused'} motion`);
          return { success: true, playing: isPlaying };
        },
      }, options);
      await context!.registerTool({
        name: 'reset_scene', description: 'Reset Aether Field to its default visual state.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => { updateScene(DEFAULT_SCENE, 'Agent reset the scene'); return { success: true, scene: DEFAULT_SCENE } },
      }, options);
      await context!.registerTool({
        name: 'get_scene_state', description: 'Read the current Aether Field visual settings.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => ({ success: true, scene: sceneRef.current }),
      }, options);
      setMcpStatus('ready');
    }

    register().catch((error) => { console.error('WebMCP registration failed', error); setMcpStatus('preview') });
    return () => controller.abort();
  }, []);

  const selectPreset = (preset: (typeof PRESETS)[number]) => {
    updateScene({ preset: preset.id, accent: preset.color }, `${preset.label} preset selected`);
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Aether Field home"><span className="brand-mark" /><span>AETHER FIELD</span></a>
        <div className="status-row" aria-label="System status">
          <span><i className={gpuStatus === 'ready' ? 'live' : ''} />VGPU {gpuStatus === 'ready' ? 'ONLINE' : gpuStatus.toUpperCase()}</span>
          <span><i className={mcpStatus === 'ready' ? 'live' : ''} />WEBMCP {mcpStatus === 'ready' ? 'EXPOSED' : mcpStatus.toUpperCase()}</span>
        </div>
        <a className="source-link" href="https://vgpu.sh/" target="_blank" rel="noreferrer">BUILT WITH VGPU ↗</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">01 / AGENT-OPERABLE WEBGPU</p>
          <h1>A canvas<br />that <em>listens.</em></h1>
          <p className="lede">A live generative field rendered on the GPU and exposed as a set of browser-native tools for AI agents.</p>
          <div className="hero-actions">
            <button onClick={() => updateScene({ playing: !scene.playing }, scene.playing ? 'Motion paused' : 'Motion resumed')}>
              <span>{scene.playing ? 'PAUSE FIELD' : 'RESUME FIELD'}</span><span>{scene.playing ? 'Ⅱ' : '▶'}</span>
            </button>
            <span className="action-note">Move your pointer across the field</span>
          </div>
        </div>

        <div className="visual-wrap">
          <div className="visual-meta"><span>REALTIME / WGSL</span><span>60 FPS TARGET</span></div>
          <canvas ref={canvasRef}
            onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); pointerRef.current = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height] }}
            onPointerLeave={() => { pointerRef.current = [0.5, 0.5] }}
            aria-label="Interactive animated Aether Field rendered with WebGPU" />
          {gpuStatus === 'fallback' && <div className="fallback">WebGPU is unavailable in this browser.<br />The interface and WebMCP tools remain active.</div>}
          <div className="axis axis-x">X</div><div className="axis axis-y">Y</div>
        </div>
      </section>

      <section className="control-deck" aria-label="Visual controls">
        <div className="deck-intro"><p className="eyebrow">CONTROL SURFACE</p><p>Every control is mirrored as a WebMCP tool.</p></div>
        <div className="preset-control"><span className="control-label">FIELD MODE</span><div className="preset-list">
          {PRESETS.map((preset) => <button key={preset.id} className={scene.preset === preset.id ? 'selected' : ''} onClick={() => selectPreset(preset)}><i style={{ background: preset.color }} />{preset.label}</button>)}
        </div></div>
        <label className="range-control"><span className="control-label">INTENSITY <b>{scene.intensity.toFixed(2)}</b></span>
          <input type="range" min="0.2" max="2" step="0.05" value={scene.intensity} onChange={(event) => updateScene({ intensity: Number(event.target.value) }, `Intensity set to ${Number(event.target.value).toFixed(2)}`)} />
        </label>
        <label className="color-control"><span className="control-label">ACCENT</span><span className="color-value">
          <input type="color" value={scene.accent} onChange={(event) => updateScene({ accent: event.target.value }, `Accent changed to ${event.target.value}`)} />{scene.accent.toUpperCase()}
        </span></label>
      </section>

      <section className="agent-strip" aria-live="polite"><span>LAST EVENT</span><p>{lastAction}</p><span className="tool-count">06 TOOLS EXPOSED</span></section>
    </main>
  );
}

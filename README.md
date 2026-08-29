# The Daily Wall

Live: https://the-daily-wall.vercel.app/

The Daily Wall is an interactive news board where headlines and short stories become movable virtual Post-its. A person can paste stories, filter the wall, edit notes, zoom and pan the board, queue fact checks, inspect agent activity, and automatically arrange every sticky into two centered rows.

The site is also an agent-facing application: it exposes its core actions as structured [WebMCP](https://webmachinelearning.github.io/webmcp/) tools, while [WebGPU](https://gpuweb.github.io/gpuweb/) and [vgpu](https://vgpu.sh/) render the tactile animated surfaces.

## What it does

- Creates, edits, colors, moves, searches, and removes news Post-its.
- Persists notes, queues, and logs in browser `localStorage`.
- Pans and zooms across an expandable board.
- Auto-arranges notes into two centered, non-overlapping rows.
- Queues fact-check requests and recent-news imports for a connected agent.
- Displays fact-check verdicts, source links, queue state, and an actor-aware activity log.
- Uses shredding and confetti effects when a person deletes a sticky.

## WebMCP integration

[WebMCP](https://github.com/webmachinelearning/webmcp) lets a page expose JavaScript functionality as discoverable, schema-described tools for browser-connected agents. The wall registers tools with `document.modelContext.registerTool(...)`. Each registration includes a name, description, JSON Schema input, and an `execute` callback; registrations are tied to an `AbortSignal` for cleanup.

The exposed primitives include:

- `add_news_note`, `update_news_note`, `move_news_note`, and `remove_news_note`
- `get_news_wall`, `get_news_note`, and `search_news_wall`
- `organize_news_wall` and `set_board_zoom`
- `get_fact_check_queue` and `set_news_fact_check`
- `get_agent_action_queue`, `append_agent_log`, and `complete_agent_action`

This makes the relationship deliberately bidirectional at the product level:

1. The website queues work, such as a fact check or a recent-news import.
2. An agent reads that queue through WebMCP.
3. The agent performs any external research outside the page.
4. The agent reports progress and writes structured results back through WebMCP.

The page remains the source of truth for board state. Human and agent changes share the same application mutation paths, and activity records identify whether an action came from a human, agent, or system condition.

## WebGPU and vgpu

[WebGPU](https://www.w3.org/TR/webgpu/) is the browser graphics API used to run GPU rendering and compute workloads. This project requests a GPU adapter and device, renders into canvas surfaces, and uses [WGSL](https://www.w3.org/TR/WGSL/) fragment shaders for the black board texture and the animated fact-check expansion.

[vgpu](https://vgpu.sh/) provides the small rendering layer used by the app:

- `init()` creates the GPU context.
- `surface()` binds a canvas as a render target.
- `effect()` compiles a WGSL effect with uniform parameters.
- `frameLoop()` updates uniforms and draws each frame.

Pointer position, elapsed time, canvas size, and note count are sent to shader uniforms. The shader uses those values to produce grain, fibers, depth, moving light, and subtle specular response. If WebGPU is unavailable, the board keeps a usable static CSS fallback and records the failure in the system log.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Project structure

- `app/page.tsx` — wall UI, local persistence, vgpu renderers, queues, and WebMCP tools.
- `app/globals.css` — newsroom layout, Post-it styling, responsive behavior, and animations.
- `app/layout.tsx` — document shell and social metadata.
- `AGENT.md` — project-specific implementation rules for coding agents.

## References

- [vgpu documentation](https://vgpu.sh/)
- [WebMCP specification and examples](https://webmachinelearning.github.io/webmcp/)
- [WebMCP source repository](https://github.com/webmachinelearning/webmcp)
- [WebGPU specification](https://gpuweb.github.io/gpuweb/)
- [WebGPU W3C publication](https://www.w3.org/TR/webgpu/)
- [WGSL specification](https://www.w3.org/TR/WGSL/)

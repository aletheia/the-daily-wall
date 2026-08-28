# The Daily Wall — agent instructions

These instructions apply to all work in this repository.

## Product intent

The Daily Wall is a tactile, browser-local news board. People and connected agents can create, edit, arrange, inspect, fact-check, and remove news Post-its. Preserve the editorial wall metaphor, the black textured board, the compact newsroom typography, and the distinction between human, agent, and system activity.

## Development workflow

- Use the existing package manager and Vinext/Next.js structure.
- Run `npm run build` before considering a change complete.
- Keep `.openai/hosting.json` limited to Sites resource bindings.
- Make each coherent product change a separate Git commit.
- Do not overwrite unrelated working-tree changes.

## State and persistence

- Post-its, queued agent actions, and activity logs are browser-local and persist through `localStorage`.
- Route note mutations through the existing React state helpers so refs, rendering, and persistence remain synchronized.
- Keep stored records backward-compatible when adding fields; normalize older data on load.
- Preserve the current limit of 24 Post-its unless a product requirement explicitly changes it.

## WebMCP

- Register browser tools through `document.modelContext.registerTool` in the existing registration effect.
- Give every tool a stable snake_case name, a concise description, a JSON Schema input contract, and a structured success or error result.
- Bind registrations to the effect's `AbortSignal` so tools are removed when the page unloads or the effect is replaced.
- Reuse product functions instead of duplicating mutation logic. In particular, all human and agent sticker movement must flow through `moveStickerViaApi`.
- Keep agent actions observable: agent mutations should add an activity-log entry with actor `agent`; browser/runtime failures should use actor `system`.
- Do not perform external research inside the website. The website exposes queues and write-back tools; the connected agent researches externally, logs progress, and writes results back through WebMCP.
- Preserve existing tool names for compatibility. Add a new tool only when no existing primitive already provides the requested capability.

## WebGPU and vgpu

- Use the `vgpu` package for GPU initialization, surfaces, effects, and frame loops.
- Keep shader code in WGSL and pass changing values through uniforms rather than rebuilding effects every frame.
- Dispose frame loops and GPU resources when React effects are cleaned up.
- Maintain a readable CSS/text fallback whenever WebGPU initialization fails.
- Respect reduced-motion preferences for nonessential animation.

## Board behavior

- Auto-layout must place all notes in two centered, non-overlapping rows and account for rendered note dimensions.
- Expand the board horizontally when needed instead of shrinking or overlapping Post-its.
- Keep zoom controls fixed and keep the board centered after auto-layout.
- Dragging an empty part of the board pans the viewport; dragging a Post-it moves only that Post-it.
- Deletion uses the shredding-to-confetti animation for human interaction. Agent deletion must leave state and logs consistent even when no animation is visible.

## Fact checking and queues

- Clicking the checkmark queues a Post-it; it does not perform research in the browser.
- A connected agent reads `get_fact_check_queue`, researches the claim, and writes back a verdict, summary, and source URLs with `set_news_fact_check`.
- Recent-news imports are queued actions. An agent must log progress, add exactly five sourced notes, and complete the queue action only after all five are pinned.
- Queue blocks must be removable by the person and disappear when the corresponding action finishes.

## Accessibility and verification

- Preserve keyboard-operable buttons, visible focus states, accessible labels, and semantic form controls.
- Check both the human UI path and the equivalent WebMCP path when changing shared behavior.
- Do not treat a successful compile as proof of interaction behavior; verify the affected state transition when practical.

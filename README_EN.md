<p align="center">
  <!-- <h1 align="center">World-Y</h1> -->
  <p align="center"><strong>One sentence, One living world.</strong></p>
</p>

<p align="center">
  English | <a href="./README.md">中文</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-22.13%2B-339933?logo=node.js&logoColor=white" alt="Node.js 22.13+">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Phaser-3-cdf0e8?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJMMiAyMmgyMEwxMiAyeiIgZmlsbD0iIzMzMyIvPjwvc3ZnPg==" alt="Phaser 3">
  <img src="https://img.shields.io/badge/Status-Alpha-orange" alt="Alpha">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg" alt="PRs Welcome">
</p>

<p align="center">
  <code>AI Agents</code> · <code>LLM</code> · <code>Procedural Generation</code> · <code>Simulation</code> · <code>Emergent Narrative</code>
</p>

---

## Powered by Atlas Cloud

[**Atlas Cloud**](https://www.atlascloud.ai/?utm_source=github&utm_medium=link&utm_campaign=World-Y) provides World-Y with a single OpenAI-compatible API for both LLM (story & character generation) and image generation (maps, character visuals) — 59 curated LLM models + 300+ image/video models under one key.

**Quick setup — all 4 World-Y roles via Atlas Cloud:**

```env
# Orchestrator — world design & character rules
ORCHESTRATOR_BASE_URL=https://api.atlascloud.ai/v1
ORCHESTRATOR_API_KEY=<your-atlascloud-key>
ORCHESTRATOR_MODEL=deepseek-ai/deepseek-v4-pro   # strong reasoning; max_tokens ≥ 512

# Image Generation — map art & character sprites (openai-compatible)
IMAGE_GEN_BASE_URL=https://api.atlascloud.ai/v1
IMAGE_GEN_PROVIDER=openai-compatible
IMAGE_GEN_API_KEY=<your-atlascloud-key>
IMAGE_GEN_MODEL=black-forest-labs/FLUX.1-dev

# Vision Review — map quality & region detection
VISION_BASE_URL=https://api.atlascloud.ai/v1
VISION_API_KEY=<your-atlascloud-key>
VISION_MODEL=qwen/qwen2.5-vl-72b-instruct

# Simulation Engine — character decisions & dialogue (any model works)
SIMULATION_BASE_URL=https://api.atlascloud.ai/v1
SIMULATION_API_KEY=<your-atlascloud-key>
SIMULATION_MODEL=deepseek-ai/deepseek-v3-turbo   # cost-effective for high-volume calls
```

> **Note:** Set `max_tokens ≥ 512` for Orchestrator and Vision calls to avoid truncated world designs.

Get your free key → [atlascloud.ai/console/coding-plan](https://www.atlascloud.ai/console/coding-plan) · Browse all models → [atlascloud.ai/models](https://www.atlascloud.ai/models)

<details>
<summary><strong>59 LLM models available on Atlas Cloud</strong></summary>

| Category | Models |
|----------|--------|
| **DeepSeek** | deepseek-v4-pro, deepseek-v3, deepseek-v3-turbo, deepseek-v3-0324, deepseek-r1, deepseek-r1-0528, deepseek-r1-distill-llama-70b, deepseek-r1-distill-qwen-32b |
| **Qwen** | qwen3-235b-a22b, qwen3-32b, qwen3-30b-a3b, qwen3-14b, qwen3-8b, qwen2.5-72b-instruct, qwen2.5-32b-instruct, qwen2.5-vl-72b-instruct, qwen2.5-vl-7b-instruct, qwq-32b |
| **Llama** | llama-4-scout, llama-4-maverick, llama-3.3-70b-instruct, llama-3.1-70b-instruct, llama-3.1-8b-instruct |
| **Gemma** | gemma-3-27b-it, gemma-3-12b-it, gemma-3-4b-it |
| **Mistral** | mistral-small-3.1, mistral-nemo, codestral-2501 |
| **Claude** | claude-opus-4, claude-sonnet-4, claude-sonnet-3-7, claude-haiku-3-5 |
| **GPT / o-series** | gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, o3, o4-mini |
| **Gemini** | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| **Other** | phi-4, phi-4-mini, internvl3-14b, glm-4-32b, yi-lightning, moonshot-v1-8k, step-2-16k, hunyuan-turbos, doubao-1-5-pro-32k, baichuan4-air, minimax-text-01 |

</details>

---

**World-Y** turns a single text prompt into a fully autonomous AI world. The system designs the world, generates original maps and character art, then runs a living simulation where AI agents make decisions, form relationships, have conversations, and create emergent narratives — all without human intervention.

> "A cozy autumn mountain village with a blacksmith, a tavern owner, a wandering monk, and a curious child"

That's all it takes. World-Y handles the rest.

## Highlights

- **One-sentence world creation** — describe any scenario and watch it materialize
- **AI-generated maps & characters** — original art created to match your description, not templates
- **Autonomous agent simulation** — characters make decisions, form relationships, hold conversations
- **Memory & personality** — agents remember past events and act according to distinct personalities
- **Multi-day evolution** — worlds evolve across day/night cycles with scene transitions
- **God mode** — broadcast events, edit character profiles/memories, run sandbox chats with characters, and observe emergent developments
- **Timeline system** — branch, replay, and compare different simulation runs
- **Bilingual UI** — Chinese / English interface with one-click switching

<br>

> 🚧 The project is currently in Alpha — core features work, ongoing improvements ahead

## What's new in World-Y

On top of the original WorldX capabilities, this build adds a full **character & access-control layer**:

- **Core quests** — give a character a one-line quest (typing it starts it, clearing it stops it). The character first plans its own action steps, then follows them and revises them when the situation changes. Quests steer what it does, where it moves (the action menu tags ★ task-related options and the ★ next hop toward the goal) and whom it asks about; when a quest names someone, the character recognizes that person and goes looking for them.
- **Fully editable personas** — gender, age, department/position/title, skills, hobbies, fears, dislikes, background, values and speech habits are all editable in the UI, and **only what you can edit in the form feeds the prompts** (the old uneditable persona sources were removed). Edits apply instantly and are written back to the world config, surviving restarts.
- **Access control** — the whole toolbar sits behind an admin password (default `1590`, set via `ADMIN_PASSWORD` in `.env`); every character has a 12-character edit password required for non-admin profile edits (never prefilled, with explicit error feedback); character names are globally unique.
- **Status icons over heads** — 💭 idle / 💬 in conversation / 🚶 moving / per-action icons, plus a gold ★ when the character carries a core quest.
- **In-app guide & background music** — a Help button with a detailed how-to-play (Chinese / English) and a light 8-bit background loop you can toggle.
- **Helper scripts** (`scripts/`) — mirror-extend a map to 3× width, localize a world and its characters to Chinese, and synthesize the background music offline.

> Built on top of [YGYOOO/WorldX](https://github.com/YGYOOO/WorldX).

## Quick Start

### Prerequisites

- **Node.js 22.13+** (24 LTS recommended) — the database uses Node's built-in SQLite (`node:sqlite`), so installing dependencies requires no native module compilation. The full supported range is `>=22.13 <23 || >=23.4`: 22.5–22.12 and 23.0–23.3 will not work, as `node:sqlite` was still behind the `--experimental-sqlite` flag on those versions
- **API keys** — see [Model Configuration](#model-configuration) below

### Option A: Preview Mode (fastest)

Just want to see World-Y in action? Two pre-built worlds are included. You only need a **Simulation** model key.

```bash
git clone https://github.com/helper15901590/world-Y.git
cd World-Y
cp .env.example .env
# Edit .env — fill in SIMULATION_* fields only
npm install
npm run dev
```

Open `http://localhost:3200` — pick a pre-built world and hit Play.

### Option B: Full Creation

Generate your own worlds from scratch. Requires all 4 model keys.

```bash
# Edit .env — fill in all 4 model sections
npm run dev
```

Open `http://localhost:3200/create`, type a sentence, and watch your world come to life.

Or use the CLI:

```bash
npm run create -- "A cyberpunk noodle shop where hackers and androids share rumors"
```

## Model Configuration

World-Y uses **4 model roles**, each configurable independently. All roles use the OpenAI-compatible `chat/completions` protocol except Image Gen, which can also use Google AI Studio's native image API.

| Role | Env Prefix | What It Does | Recommended |
|------|-----------|-------------|-------------|
| **Orchestrator** | `ORCHESTRATOR_` | Designs world structure, characters, rules | Strong reasoning model (e.g. `gemini-3.1-pro-preview`) |
| **Image Gen** | `IMAGE_GEN_` | Generates map art and character sprites | Image-capable model (e.g. `gemini-3.1-flash-image-preview`) |
| **Vision** | `VISION_` | Reviews map quality, locates regions/elements | Strong multimodal model (e.g. `gemini-3.1-pro-preview`) |
| **Simulation** | `SIMULATION_` | Drives runtime character behavior | Any model — cheaper is fine (e.g. `gemini-2.5-flash`) |

Each role usually needs 3 env vars:

```env
{ROLE}_BASE_URL=https://openrouter.ai/api/v1    # API base URL
{ROLE}_API_KEY=sk-or-v1-xxxx                     # API key
{ROLE}_MODEL=google/gemini-3.1-pro-preview       # Model identifier
```

Image Gen can additionally set `IMAGE_GEN_PROVIDER`. `IMAGE_GEN_PROVIDER` can be `openai-compatible` (default, for OpenRouter) or `google-native` (for Google AI Studio image generation).

### Platform Examples

<details>
<summary><strong>Atlas Cloud</strong> (OpenAI-compatible — LLM + image gen, one key)</summary>

Get a key at [atlascloud.ai/console/coding-plan](https://www.atlascloud.ai/console/coding-plan):

```env
ORCHESTRATOR_BASE_URL=https://api.atlascloud.ai/v1
ORCHESTRATOR_API_KEY=<your-atlascloud-key>
ORCHESTRATOR_MODEL=deepseek-ai/deepseek-v4-pro

IMAGE_GEN_BASE_URL=https://api.atlascloud.ai/v1
IMAGE_GEN_PROVIDER=openai-compatible
IMAGE_GEN_API_KEY=<your-atlascloud-key>
IMAGE_GEN_MODEL=black-forest-labs/FLUX.1-dev

VISION_BASE_URL=https://api.atlascloud.ai/v1
VISION_API_KEY=<your-atlascloud-key>
VISION_MODEL=qwen/qwen2.5-vl-72b-instruct

SIMULATION_BASE_URL=https://api.atlascloud.ai/v1
SIMULATION_API_KEY=<your-atlascloud-key>
SIMULATION_MODEL=deepseek-ai/deepseek-v3-turbo
```

</details>

<details>
<summary><strong>OpenRouter</strong> (recommended — one key for all models)</summary>

Get a key at [openrouter.ai](https://openrouter.ai):

```env
ORCHESTRATOR_BASE_URL=https://openrouter.ai/api/v1
ORCHESTRATOR_API_KEY=sk-or-v1-xxxx
ORCHESTRATOR_MODEL=google/gemini-3.1-pro-preview

IMAGE_GEN_BASE_URL=https://openrouter.ai/api/v1
IMAGE_GEN_PROVIDER=openai-compatible
IMAGE_GEN_API_KEY=sk-or-v1-xxxx
IMAGE_GEN_MODEL=google/gemini-3.1-flash-image-preview

VISION_BASE_URL=https://openrouter.ai/api/v1
VISION_API_KEY=sk-or-v1-xxxx
VISION_MODEL=google/gemini-3.1-pro-preview

SIMULATION_BASE_URL=https://openrouter.ai/api/v1
SIMULATION_API_KEY=sk-or-v1-xxxx
SIMULATION_MODEL=google/gemini-2.5-flash-preview
```

</details>

<details>
<summary><strong>Google AI Studio</strong> (free tier available)</summary>

Get a key at [aistudio.google.com](https://aistudio.google.com/apikey):

```env
ORCHESTRATOR_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
ORCHESTRATOR_API_KEY=AIzaSy...
ORCHESTRATOR_MODEL=gemini-3.1-pro-preview

IMAGE_GEN_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
IMAGE_GEN_PROVIDER=google-native
IMAGE_GEN_API_KEY=AIzaSy...
IMAGE_GEN_MODEL=gemini-3.1-flash-image-preview

VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
VISION_API_KEY=AIzaSy...
VISION_MODEL=gemini-3.1-pro-preview

SIMULATION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
SIMULATION_API_KEY=AIzaSy...
SIMULATION_MODEL=gemini-2.5-flash-preview
```

</details>

<details>
<summary><strong>Mix & match</strong> (different platforms per role)</summary>

You can use a different platform for each role. For example, Google AI Studio for generation (free tier) and a cheaper provider for simulation:

```env
# World design — Google AI Studio
ORCHESTRATOR_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
ORCHESTRATOR_API_KEY=AIzaSy...
ORCHESTRATOR_MODEL=gemini-3.1-pro-preview

# Art generation — Google AI Studio
IMAGE_GEN_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
IMAGE_GEN_PROVIDER=google-native
IMAGE_GEN_API_KEY=AIzaSy...
IMAGE_GEN_MODEL=gemini-3.1-flash-image-preview

# Vision review — Google AI Studio
VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
VISION_API_KEY=AIzaSy...
VISION_MODEL=gemini-3.1-pro-preview

# Simulation — DeepSeek (cost-effective for high-volume runtime calls)
SIMULATION_BASE_URL=https://api.deepseek.com/v1
SIMULATION_API_KEY=sk-...
SIMULATION_MODEL=deepseek-chat
```

</details>

## Project Structure

```
World-Y/
├── orchestrator/         # LLM-driven world design & config generation
│   ├── src/
│   │   ├── index.mjs           # Pipeline entry: sentence → world
│   │   ├── world-designer.mjs  # LLM world design
│   │   └── config-generator.mjs
│   └── prompts/
│       └── design-world.md     # World design prompt template
├── generators/           # Art generation pipelines
│   ├── map/              # Map generation (multi-step with review loop)
│   └── character/        # Spritesheet generation (with chromakey)
├── server/               # Simulation engine (Express + SQLite + LLM)
│   └── src/
│       ├── core/         # WorldManager, CharacterManager
│       ├── simulation/   # SimulationEngine, DecisionMaker, DialogueGenerator
│       ├── llm/          # LLMClient, PromptBuilder
│       └── store/        # SQLite persistence (per-timeline)
├── client/               # Game client (Phaser 3 + React 19)
│   └── src/
│       ├── scenes/       # BootScene, WorldScene
│       ├── ui/           # React overlay panels
│       └── systems/      # Camera, Pathfinding, Playback
├── shared/               # Shared utilities (structured output parsing)
├── library/worlds/       # Pre-built example worlds
├── output/worlds/        # Your generated worlds
└── .env.example          # Configuration template
```

## Development

```bash
npm run dev          # Start both client and server in dev mode
npm run create       # Generate a new world via CLI
```

- Client: `http://localhost:3200`
- Server: `http://localhost:3100`


## Thanks
-  [LinuxDO](https://linux.do/)

## License

MIT

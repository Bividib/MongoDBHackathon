# RunwayOps

**Payroll Risk Command for SMEs.** An event-driven agentic incident desk for
small businesses whose cash timing is broken. RunwayOps opens a durable
Payroll Risk Case, retrieves evidence, coordinates six specialist workers,
drafts approval-ready actions, reacts to live customer and bank events, and
writes memory for future cases.

It is **not** an accounting dashboard, an AI invoice chaser, or a banking
app. The core object is a **case**, not a dashboard and not a chat thread.

Hackathon tracks: **Prolonged Coordination** (primary), **Adaptive
Retrieval** (secondary), **Multi-Agent Collaboration** (supporting).

## Setup

Install dependencies:

```bash
npm install
```

Create a local `.env` file from `.env.example` and set your Atlas connection string:

```bash
MONGO_DB_CONNECTION="mongodb+srv://..."
```

Check the Atlas connection:

```bash
npm run check:db
```

Check which local provider keys are configured:

```bash
npm run check:env
```

Check provider authentication:

```bash
npm run check:providers
```

Validate the synthetic data pack:

```bash
npm run check:data
```

Seed or reset the demo database:

```bash
npm run seed
npm run reset
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — system architecture, MongoDB modelling, six agents, AWS layer, Fireworks, ElevenLabs, fallback matrix
- [docs/demo_script.md](docs/demo_script.md) — full 3-minute stage script with timestamps, narration, visible state, and reset/failure cheatsheet
- [docs/pitch.md](docs/pitch.md) — 30-second elevator pitch and 3-minute narrative
- [docs/judging_answers.md](docs/judging_answers.md) — answers to expected judge questions
- [docs/implementation-plan.md](docs/implementation-plan.md) — day-of build plan
- [MASTER SPEC.md](MASTER%20SPEC.md) — full product brief and source of truth

# BA AI Assistant

> Turn meeting notes into structured Product Requirement Documents — with an auto-maintained Decision Log.

## What it does

BA AI Assistant helps Business Analysts and Product Managers extract structured product intelligence from raw meeting notes.

- **Organize by project** — Group meeting notes under initiatives and keep full traceability.
- **Auto-generate PRDs** — Feed selected notes into Gemini 3 Flash and get an exhaustive PRD covering executive summary, problem statement, business goals, functional requirements, risks, assumptions, and open questions.
- **Decision Log** — Every decision captured with source note, date, confidence score, and category (Product & Business / Technical / Process).
- **Export PRDs** — Download generated PRDs as Word documents.
- **Google Drive integration** — Link projects to Drive folders for context.

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React 19 + Vite 7) |
| Styling | Tailwind CSS v4 |
| UI | shadcn/ui (Radix primitives) |
| Auth | Lovable Cloud (Supabase Auth) |
| Database | Lovable Cloud (PostgreSQL + Supabase) |
| AI | Gemini 3 Flash via Lovable AI Gateway |
| Query | TanStack Query v5 |
| Forms | React Hook Form + Zod |

## Database schema

- **projects** — Initiatives with optional Google Drive folder linkage
- **meeting_notes** — Raw notes stored per project
- **prds** — Generated PRDs with structured JSON content
- **decisions** — Captured decisions with confidence, category, and source traceability

## Environment variables

Required at runtime (managed by Lovable Cloud):

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — Client auth & data
- `SUPABASE_SERVICE_ROLE_KEY` — Admin server operations
- `LOVABLE_API_KEY` — AI Gateway access for PRD generation

## Scripts

```bash
bun dev          # Start dev server
bun build        # Production build
bun build:dev    # Development build (SSR)
bun preview      # Preview production build
bun lint         # ESLint
bun format       # Prettier
```

## Key features

- **No word limits on PRD generation** — Full meeting note content is sent to the AI (up to 20 notes at once). The model can return up to 32,768 tokens (~24,000 words) for exhaustive output.
- **Delete with confirmation** — Projects can be deleted via an alert dialog that requires explicit confirmation.
- **Structured AI extraction** — PRD content is validated via Zod schema and persisted as typed JSON.

## License

Private — built with Lovable.

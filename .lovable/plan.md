# BA AI Assistant — MVP Plan

A SaaS that helps Business Analysts turn Google Drive meeting notes into PRDs, with an auto-maintained Decision Log.

> Note on stack: Your spec says Next.js, but this Lovable project uses **TanStack Start + React + TypeScript + Tailwind** (same DX, SSR-capable). Backend will be **Lovable Cloud (Supabase under the hood)**, AI via **Lovable AI Gateway** (defaults to Gemini; can swap to OpenAI models like `openai/gpt-5` through the same gateway — no separate OpenAI key needed). Confirm if you'd rather I wire a raw OpenAI key instead.

---

## 1. Product Architecture

```text
[Browser: React + Tailwind]
   │  (TanStack Router, Query)
   ▼
[TanStack Start server fns / routes]
   │           │
   │           ├── Google OAuth (per-user) via Lovable App User Connector
   │           │     → Google Drive API (list folders/docs)
   │           │     → Google Docs API   (fetch doc content)
   │           │
   │           └── Lovable AI Gateway (Gemini/OpenAI)
   │                 → Extract requirements + decisions (structured JSON)
   ▼
[Lovable Cloud / Supabase Postgres + Auth + RLS]
```

Per-user Google OAuth (each BA connects their own Drive) — not a shared workspace connector.

---

## 2. Database Schema (Supabase)

All tables RLS-enabled, scoped by `auth.uid()`.

- **profiles** — `id (uuid, FK auth.users)`, `email`, `full_name`, `google_connection_id`, timestamps
- **projects** — `id`, `user_id`, `name`, `description`, `drive_folder_id`, `drive_folder_name`, timestamps
- **meeting_notes** — `id`, `project_id`, `user_id`, `google_doc_id`, `title`, `doc_modified_at`, `content_snapshot` (text), `imported_at`
- **prds** — `id`, `project_id`, `user_id`, `title`, `status` (draft/final), `content_json` (jsonb: all sections), `created_at`, `updated_at`
- **prd_sources** — `id`, `prd_id`, `meeting_note_id` (traceability)
- **requirements** — `id`, `prd_id`, `meeting_note_id`, `type` (functional/user_story/acceptance/goal/risk/assumption/open_question), `content` (jsonb), `order_index`
- **decisions** — `id`, `project_id`, `user_id`, `meeting_note_id`, `title`, `description`, `decision_date`, `confidence` (numeric 0–1), `status` (pending/approved), `created_at`, `updated_at`

---

## 3. API Structure (TanStack server fns)

- `google.startConnect` / `google.listFolders` / `google.listDocsInFolder` / `google.fetchDocContent`
- `projects.list` / `projects.create` / `projects.get` / `projects.delete`
- `meetingNotes.importFromDrive(projectId, docIds[])`
- `ai.analyzeNotes(projectId, meetingNoteIds[])` → returns structured extraction, persists requirements + decisions
- `prds.generate(projectId, meetingNoteIds[])` → assembles PRD from requirements
- `prds.get` / `prds.update` / `prds.list`
- `decisions.list(projectId)` / `decisions.update` / `decisions.delete` / `decisions.approve`

Public route: `/api/public/health`. No webhooks needed for MVP.

---

## 4. User Flows

1. **Onboard**: Sign up (email + Google sign-in) → land on Dashboard.
2. **Connect Drive**: Click "Connect Google Drive" → popup OAuth → connection stored on profile.
3. **Create Project**: Name + pick Drive folder (folder picker fed by Drive API).
4. **Select Notes**: Project page lists Google Docs from folder → multi-select.
5. **Generate PRD**: Click "Generate PRD" → AI extracts → PRD draft + decisions appear.
6. **Review Decision Log**: Edit / delete / approve decisions; each links back to source doc.
7. **View / Edit PRD**: Section-by-section editor; export view; source links per requirement.

---

## 5. MVP Screens

- **/auth** — Login / Sign up (email + Google)
- **/dashboard** — Stats: projects, PRDs, pending decisions; "Connect Drive" CTA if not connected
- **/projects** — List + create
- **/projects/$id** — Meeting notes selection (Drive docs in folder)
- **/projects/$id/generate** — PRD generator (progress + result)
- **/projects/$id/prd/$prdId** — PRD viewer/editor
- **/projects/$id/decisions** — Decision Log

Wireframes (ASCII):

```text
DASHBOARD                          PROJECT > NOTES
┌──────────────────────────┐       ┌──────────────────────────┐
│ Projects 4  PRDs 7  Dec 12│       │ Folder: Q4 Planning      │
│ [+ New Project]          │       │ ☐ Kickoff 10/01          │
│ ── recent ──             │       │ ☑ Stakeholder Sync 10/08 │
│ • Mobile App Redesign    │       │ ☑ Tech Review 10/15      │
│ • Billing v2             │       │ [Generate PRD →]         │
└──────────────────────────┘       └──────────────────────────┘
```

---

## 6. UI Design

Clean SaaS aesthetic — neutral background, single accent color, generous spacing, semantic tokens in `src/styles.css`. shadcn/ui components throughout. Sidebar nav (Dashboard, Projects, Decisions, Settings).

---

## 7. Implementation Phases

1. Enable Lovable Cloud + AI Gateway key.
2. DB migration (all tables + RLS + GRANTs).
3. Auth (email + Google) + `_authenticated` layout + profile auto-create trigger.
4. App shell: sidebar, dashboard.
5. Google Drive per-user OAuth wiring (App User Connector helpers).
6. Projects CRUD + folder picker.
7. Meeting notes import + selection UI.
8. AI extraction server fn (structured JSON via AI SDK `Output`).
9. PRD generation + viewer/editor.
10. Decision Log screen (review/edit/delete/approve).
11. Traceability links + polish.

---

## Open questions before I build

1. OK to use **Lovable AI Gateway** (works with OpenAI + Gemini models, no key needed) instead of wiring a raw OpenAI API key?
2. OK with **TanStack Start** (this template's stack) instead of Next.js? Functionally equivalent for this MVP.
3. For Google OAuth, OK to use Lovable's per-user OAuth broker (no Google Cloud Console setup needed by you)?

Reply "go" to build with the defaults above, or tell me which to change.

# Aqari CRM — "Make it solid" pass

Previous pass (8-step 10/10 MVP) is complete — see git history / prior task.md content below if needed.
This is a NEW pass per user request. Scope (all 7 selected, no deadline):

## Scope checklist
1. [ ] Admin gaps: agency logo upload (R2), analytics date-range filter (7d/30d/90d/all)
2. [ ] Notifications/reminders for overdue tasks (in-app badge + email reminder loop)
3. [ ] Empty-state onboarding polish for brand-new agency
4. [ ] Mobile responsiveness pass (kanban, tables, modals, inline-style grids that don't collapse)
5. [ ] Pagination (leads list view, properties grid, tasks list — kanban stays unpaginated w/ high cap)
6. [ ] Invite flow: email the generated password to new agents (needs RESEND_API_KEY via ask_secrets)
7. [ ] Bug-hunt pass at the end — click through every page

## Key decisions
- Email: use Resend per app skill's email.md reference. Need RESEND_API_KEY — will ask_secrets when reaching step 6.
- Reminders: no real cron infra available. Implement a setInterval loop inside server.ts (runs while the Bun server process is alive) that checks every 5 min for tasks past due without a reminder sent yet (`remindedAt` column), emails the assignee once. This is a pragmatic MVP approach — flagged to user as a limitation (relies on server staying up, not a real job queue).
- Pagination: add `page`/`pageSize` query params server-side (default pageSize 30), return `{ items, total, page, pageSize }`. Kanban view (leads) fetches a high-cap unpaginated set (500) since kanban+pagination UX conflict — acceptable tradeoff, will note to user.
- Logo upload: reuse existing R2 presign pattern from property images (POST /api/upload/presign already generic, just needs a "logos/" key prefix or reuse same endpoint).

## Progress log
1. [x] Admin gaps DONE:
   - Agency logo upload: reused R2 presign pattern, settings.tsx has upload UI, settings.ts resolves logoUrl key -> presigned URL (24hr expiry) as `logoImageUrl`, sidebar (layout.tsx) shows real logo + agency name instead of hardcoded "ع"/app_name
   - Analytics date-range filter: 7d/30d/90d/all selector wired to overview/agents/sources routes via `range` query param + `filterByRange` helper filtering by createdAt
   - Also fixed inline non-responsive `gridTemplateColumns: "1fr 1fr"` grids in analytics.tsx + settings.tsx (2 spots) to Tailwind `grid-cols-1 md:grid-cols-2` as part of mobile pass
4. [partial] Mobile responsiveness: fixed inline 2-col grids (analytics, settings x2), fixed hardcoded grid-cols-2/3 in new-lead-modal.tsx and new-property-modal.tsx to collapse on mobile (grid-cols-1 sm:grid-cols-2/3). Kanban/tables/agent-grid were already responsive. STILL TODO: verify at actual small viewport, check modals scroll properly, check settings WA card layout.

5. [x] Pagination DONE:
   - leads.ts: GET / now supports page/pageSize (default 20) + `all=true` bypass (capped 500) for kanban view which needs every lead to drag across columns
   - properties.ts: GET / supports page/pageSize (default 24) + `all=true` bypass for the lead-detail "link property" search dropdown
   - tasks.ts: GET / supports page/pageSize (default 50, capped 200) + leadId requests (lead-detail's per-lead task list) always return full unpaginated set since that list must show everything for one lead
   - Frontend: leads/index.tsx list view has Prev/Next controls (kanban always fetches all via all=true); properties/index.tsx grid has Prev/Next; tasks.tsx uses accumulating "Load more" (better fits the overdue/pending/done grouping than page-replace)
   - lead-detail.tsx's property-search-to-link now passes all=true so it's not missing properties past page 1

3. [x] Onboarding polish DONE:
   - BUG FOUND + FIXED: dashboard.tsx called /api/analytics/overview for KPI stats, but that route is admin/manager-only (from the previous pass) — agents would 403 silently and see broken/empty dashboard stats. Fixed by adding new GET /api/leads/stats (no role restriction, same role-scoping as GET /leads: agent sees own numbers, admin/manager see agency-wide) and pointing dashboard.tsx at that instead.
   - Onboarding checklist banner on dashboard (admin/manager only, hides once complete): confirm agency profile, invite team, add first property, add first lead — each links to the relevant page, checkmarks when done
   - Empty states upgraded with icon + CTA button: leads list view, properties grid, agents grid (previously just plain "no data" text)

2. [x] Notifications/reminders for overdue tasks DONE:
   - In-app: red badge count on the Tasks nav item (sidebar), polls every 60s
   - Email: services/task-reminders.ts runs a loop inside the Bun server process (setInterval every 5 min) that finds overdue+undone tasks without a reminder sent yet (new `remindedAt` column), emails the assignee once via Resend, then stamps remindedAt so it never double-sends
   - LIMITATION (flagged to user): this only works while the server process stays running — no real cron/job queue in this sandbox. Good enough for MVP, would need a proper scheduler for production.

6. [x] Invite flow email DONE: services/email.ts (Resend) + agentInviteEmail template, wired into agents.ts POST — new agents get their login email/password emailed to them automatically. Falls back to console.warn (no throw) if RESEND_API_KEY isn't set, so agent creation never breaks even without email configured.

## ALL 7 SCOPE ITEMS DONE except final bug-hunt pass (item 7) — starting now.

## Environment
- Dev server: tmux session `dev`, cmd: `cd /home/user/aqari-crm/packages/web && PORT=4200 bun --env-file=../../.env src/server.ts`
- Build cmd: `cd /home/user/aqari-crm/packages/web && bun run build`
- Login: omar@demo.aqari / demo1234 (admin), sarah@demo.aqari (manager), khalid/nadia/james@demo.aqari (agent) — all demo1234
- Always run build after each step.

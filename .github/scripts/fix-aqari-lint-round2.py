from pathlib import Path

root = Path("packages/web/src/web/pages")

def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file_path = root / path
    content = file_path.read_text()
    if old not in content:
        if new not in content:
            raise RuntimeError(f"Expected source not found in {path}: {old[:80]}")
        return
    file_path.write_text(content.replace(old, new, count))

replace(
    "properties/new-property-modal.tsx",
    '<input type="file" accept="image/*" multiple hidden',
    '<input aria-label={t("properties.upload_photos", "Upload property photos")} type="file" accept="image/*" multiple hidden',
)

replace(
    "leads/index.tsx",
    '<td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>',
    '<td aria-label={t("common.loading", "Loading")} key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>',
)
replace(
    "leads/index.tsx",
    '<tr><td colSpan={6} className="py-16">',
    '<tr><td aria-label={t("leads.empty_state", "No leads")} colSpan={6} className="py-16">',
)
replace(
    "leads/index.tsx",
    '<td className="px-4 py-3">\n                          <Link to={`/leads/${lead.id}`}>',
    '<td aria-label={lead.name} className="px-4 py-3">\n                          <Link to={`/leads/${lead.id}`} aria-label={lead.name}>',
    1,
)

replace(
    "leads/lead-detail.tsx",
    '<input\n                  id="lead-task-title"',
    '<input\n                  aria-label={t("tasks.task_title")}\n                  id="lead-task-title"',
)
replace(
    "leads/lead-detail.tsx",
    '<input\n                  id="lead-task-due"',
    '<input\n                  aria-label={t("tasks.due_date")}\n                  id="lead-task-due"',
)

replace(
    "analytics.tsx",
    '<td style={{ padding: "0.75rem" }}>\n                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>',
    '<td aria-label={agent.name ?? t("unknown")} style={{ padding: "0.75rem" }}>\n                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>',
)

for field, label in (("name", "auth.name"), ("email", "auth.email"), ("password", "auth.password")):
    replace(
        "sign-in.tsx",
        f'<input\n                  id="auth-{field}"',
        f'<input\n                  aria-label={{t("{label}")}}\n                  id="auth-{field}"',
    )

replace(
    "settings.tsx",
    '<input\n              id="whatsapp-access-token"',
    '<input\n              aria-label={t("settings.wapiToken")}\n              id="whatsapp-access-token"',
)
replace(
    "settings.tsx",
    '<input\n              id="whatsapp-phone-number-id"',
    '<input\n              aria-label={t("settings.wapiPhone")}\n              id="whatsapp-phone-number-id"',
)

for field, label in (("name", "field.name"), ("email", "field.email"), ("password", "field.password")):
    replace(
        "agents.tsx",
        f'<input\n                  id="agent-{field}"',
        f'<input\n                  aria-label={{t("{label}")}}\n                  id="agent-{field}"',
    )
replace("agents.tsx", "                autoFocus\n", "", 1)

replace(
    "tasks.tsx",
    '<input id="task-title" className="input"',
    '<input aria-label={t("tasks.task_title", "Title")} id="task-title" className="input"',
)
replace(
    "tasks.tsx",
    '<input id="task-due" className="input"',
    '<input aria-label={t("tasks.due_date")} id="task-due" className="input"',
)

print("Applied final lint corrections")

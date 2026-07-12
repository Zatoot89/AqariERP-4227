from pathlib import Path
import re

root = Path("packages/web/src/web/pages")


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file_path = root / path
    content = file_path.read_text()
    if new in content:
        return
    if old not in content:
        print(f"WARN: expected source not found in {path}: {old[:80]}")
        return
    file_path.write_text(content.replace(old, new, count))


def add_aria_before_id(path: str, element_id: str, expression: str) -> None:
    file_path = root / path
    content = file_path.read_text()
    attribute = f"aria-label={{{expression}}}"
    if attribute in content:
        return
    pattern = re.compile(rf'(?P<indent>\s*)id="{re.escape(element_id)}"')
    updated, count = pattern.subn(
        lambda match: f'{match.group("indent")}{attribute}\n{match.group("indent")}id="{element_id}"',
        content,
        count=1,
    )
    if count == 0:
        print(f"WARN: id not found in {path}: {element_id}")
        return
    file_path.write_text(updated)


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

add_aria_before_id("leads/lead-detail.tsx", "lead-task-title", 't("tasks.task_title")')
add_aria_before_id("leads/lead-detail.tsx", "lead-task-due", 't("tasks.due_date")')

replace(
    "analytics.tsx",
    '<td style={{ padding: "0.75rem" }}>\n                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>',
    '<td aria-label={agent.name ?? t("unknown")} style={{ padding: "0.75rem" }}>\n                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>',
)

add_aria_before_id("sign-in.tsx", "auth-name", 't("auth.name")')
add_aria_before_id("sign-in.tsx", "auth-email", 't("auth.email")')
add_aria_before_id("sign-in.tsx", "auth-password", 't("auth.password")')

add_aria_before_id("settings.tsx", "whatsapp-access-token", 't("settings.wapiToken")')
add_aria_before_id("settings.tsx", "whatsapp-phone-number-id", 't("settings.wapiPhone")')

add_aria_before_id("agents.tsx", "agent-name", 't("field.name")')
add_aria_before_id("agents.tsx", "agent-email", 't("field.email")')
add_aria_before_id("agents.tsx", "agent-password", 't("field.password")')
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

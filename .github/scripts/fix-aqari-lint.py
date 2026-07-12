from pathlib import Path
root=Path('packages/web/src')

def rep(rel, old, new, count=None):
    p=root/rel
    s=p.read_text()
    if old not in s:
        if new not in s:
            print(f'WARN missing in {rel}: {old[:90]!r}')
        return
    s2=s.replace(old,new, count if count is not None else -1)
    p.write_text(s2)

rep('api/routes/analytics.ts','import { eq, desc } from "drizzle-orm";','import { eq } from "drizzle-orm";')
rep('web/pages/landing.tsx','ArrowRight, Zap, Shield, Clock','ArrowRight, Zap, Clock')
rep('web/pages/sign-up.tsx','import { useLocation } from "wouter";\n','')
rep('web/pages/agents.tsx','import { Plus, X, UserPlus, UserX, UserCheck, Users } from "lucide-react";','import { X, UserPlus, UserX, UserCheck, Users } from "lucide-react";')
rep('web/components/layout.tsx','UserCircle, BarChart3, Settings, LogOut, Menu, X, Globe','UserCircle, BarChart3, Settings, LogOut, Menu, Globe')
rep('web/pages/leads/index.tsx','import { Plus, Search, LayoutGrid, List, Phone, MessageCircle } from "lucide-react";','import { Plus, Search, LayoutGrid, List, Phone, MessageCircle, Users } from "lucide-react";')

rep('services/email.ts', '''export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return null;
  }
  const { data, error } = await resend.emails.send({''', '''export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return null;
  }
  const { data, error } = await client.emails.send({''')
rep('services/email.ts','<h2 style="color: #111;">Welcome to ${agencyName}</h2>','<h2 style="color: #111;">Welcome ${name} to ${agencyName}</h2>')
rep('services/email.ts','text: `Welcome to ${agencyName}!','text: `Welcome ${name} to ${agencyName}!')

rep('web/components/layout.tsx','<img src={agency.logoImageUrl} className="w-full h-full object-cover" />','<img src={agency.logoImageUrl} alt={`${agency.name ?? t("app_name")} logo`} className="w-full h-full object-cover" />')
rep('web/components/layout.tsx','''          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />''','''          <button
            type="button"
            aria-label={t("common.close", "Close navigation")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />''')

rep('web/pages/leads/new-lead-modal.tsx','<button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>','<button type="button" aria-label={t("common.close", "Close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>')
rep('web/pages/leads/new-lead-modal.tsx','<label className="block text-sm font-medium mb-1.5">Min Budget</label>\n              <input className="input" type="number" {...field("budgetMin")} />','<label htmlFor="lead-budget-min" className="block text-sm font-medium mb-1.5">Min Budget</label>\n              <input id="lead-budget-min" className="input" type="number" {...field("budgetMin")} />')
rep('web/pages/leads/new-lead-modal.tsx','<label className="block text-sm font-medium mb-1.5">Max Budget</label>\n              <input className="input" type="number" {...field("budgetMax")} />','<label htmlFor="lead-budget-max" className="block text-sm font-medium mb-1.5">Max Budget</label>\n              <input id="lead-budget-max" className="input" type="number" {...field("budgetMax")} />')

rep('web/pages/properties/new-property-modal.tsx','const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type } });','const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type, sizeBytes: file.size, propertyId: property?.id } });')
rep('web/pages/properties/new-property-modal.tsx','<button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>','<button type="button" aria-label={t("common.close", "Close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>')
rep('web/pages/properties/new-property-modal.tsx','<img src={src} className="w-full h-full object-cover" />','<img src={src} alt={`${t("properties.photo", "Property photo")} ${i + 1}`} className="w-full h-full object-cover" />')
rep('web/pages/properties/new-property-modal.tsx','''                        <button
                          type="button"
                          onClick={() => removeImage(i)}''','''                        <button
                          type="button"
                          aria-label={t("properties.remove_photo", "Remove photo")}
                          onClick={() => removeImage(i)}''')

rep('web/pages/properties/index.tsx','<input className="input ps-9" placeholder={t("properties.search_placeholder")} value={search} onChange={e => setSearch(e.target.value)} />','<input aria-label={t("properties.search_placeholder")} className="input ps-9" placeholder={t("properties.search_placeholder")} value={search} onChange={e => setSearch(e.target.value)} />')
rep('web/pages/properties/index.tsx','<select className="select w-auto" value={typeFilter}','<select aria-label={t("properties.all_types")} className="select w-auto" value={typeFilter}')
rep('web/pages/properties/index.tsx','<select className="select w-auto" value={statusFilter}','<select aria-label={t("properties.all_statuses")} className="select w-auto" value={statusFilter}')
rep('web/pages/properties/index.tsx','''                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpenId(m => m === prop.id ? null : prop.id); }}''','''                  <button
                    aria-label={t("common.actions", "Property actions")}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(m => m === prop.id ? null : prop.id); }}''')
rep('web/pages/properties/index.tsx','<img src={prop.imageUrls[0]} className="w-full h-full object-cover" />','<img src={prop.imageUrls[0]} alt={prop.title} className="w-full h-full object-cover" />')

rep('web/pages/leads/index.tsx','''          <input
            className="input ps-9"''','''          <input
            aria-label={t("leads.search_placeholder")}
            className="input ps-9"''')
rep('web/pages/leads/index.tsx','<select className="select w-auto" value={stageFilter}','<select aria-label={t("leads.all_stages")} className="select w-auto" value={stageFilter}')
rep('web/pages/leads/index.tsx','<select className="select w-auto" value={sourceFilter}','<select aria-label={t("leads.all_sources")} className="select w-auto" value={sourceFilter}')
rep('web/pages/leads/index.tsx','<button onClick={() => setView("kanban")} className=','<button aria-label={t("leads.kanban_view", "Kanban view")} onClick={() => setView("kanban")} className=')
rep('web/pages/leads/index.tsx','<button onClick={() => setView("list")} className=','<button aria-label={t("leads.list_view", "List view")} onClick={() => setView("list")} className=')
rep('web/pages/leads/index.tsx','''                        <Link to={`/leads/${lead.id}`}>
                          <div className="kanban-card" onClick={e => {
                            // Don't navigate if we just dropped
                            if (draggingId.current) e.preventDefault();
                          }}>''','''                        <Link
                          to={`/leads/${lead.id}`}
                          onClick={e => {
                            if (draggingId.current) e.preventDefault();
                          }}
                        >
                          <div className="kanban-card">''')
rep('web/pages/leads/index.tsx','''                                  href={`tel:${lead.phone}`}
                                  onClick={e => e.stopPropagation()}''','''                                  href={`tel:${lead.phone}`}
                                  aria-label={`${t("leads.call", "Call")} ${lead.name}`}
                                  onClick={e => e.stopPropagation()}''')
rep('web/pages/leads/index.tsx','''                                  href={`https://wa.me/${lead.whatsappId}`}
                                  target="_blank"''','''                                  href={`https://wa.me/${lead.whatsappId}`}
                                  aria-label={`${t("leads.whatsapp", "WhatsApp")} ${lead.name}`}
                                  target="_blank"''')

for field,label in [('name','auth.name'),('email','auth.email'),('password','auth.password')]:
    rep('web/pages/sign-in.tsx',f'<label className="block text-sm font-medium mb-1.5">{{t("{label}")}}</label>',f'<label htmlFor="auth-{field}" className="block text-sm font-medium mb-1.5">{{t("{label}")}}</label>')
    rep('web/pages/sign-in.tsx',f'''                <input
                  className="input"
                  type="{'text' if field=='name' else field}"''',f'''                <input
                  id="auth-{field}"
                  className="input"
                  type="{'text' if field=='name' else field}"''',1)

rep('web/pages/leads/lead-detail.tsx','''            <textarea
              className="input flex-1 resize-none min-h-[60px] text-sm"''','''            <textarea
              aria-label={t("leads.note_placeholder")}
              className="input flex-1 resize-none min-h-[60px] text-sm"''')
rep('web/pages/leads/lead-detail.tsx','''            <button
              className="btn-primary px-3 self-end"''','''            <button
              aria-label={t("leads.add_note", "Add note")}
              className="btn-primary px-3 self-end"''')
rep('web/pages/leads/lead-detail.tsx','''                <input
                  className="input text-sm mb-2"''','''                <input
                  aria-label={t("properties.search_placeholder", "Search properties")}
                  className="input text-sm mb-2"''')
rep('web/pages/leads/lead-detail.tsx','                  autoFocus\n','',2)
rep('web/pages/leads/lead-detail.tsx','<button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600">','<button aria-label={t("common.close", "Close")} onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600">')
for id_,label,text in [('lead-task-title','tasks.task_title','<input\n                  className="input"'),('lead-task-type','tasks.type','<select\n                  className="select"'),('lead-task-due','tasks.due_date','<input\n                  type="datetime-local"')]:
    rep('web/pages/leads/lead-detail.tsx',f'<label className="label">{{t("{label}")}}</label>',f'<label htmlFor="{id_}" className="label">{{t("{label}")}}</label>',1)
    rep('web/pages/leads/lead-detail.tsx',text,text.replace('<input','<input\n                  id="'+id_+'"').replace('<select','<select\n                  id="'+id_+'"'),1)
rep('web/pages/leads/lead-detail.tsx','''        <input
          className="input flex-1"''','''        <input
          aria-label={t("leads.wa_placeholder", "WhatsApp message")}
          className="input flex-1"''')
rep('web/pages/leads/lead-detail.tsx','''        <button
          className="btn-primary px-3"''','''        <button
          aria-label={t("leads.send_message", "Send message")}
          className="btn-primary px-3"''')

rep('web/pages/tasks.tsx','<button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>','<button type="button" aria-label={t("common.close", "Close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>')
rep('web/pages/tasks.tsx','<label className="block text-sm font-medium mb-1.5">{t("tasks.task_title", "Title")} *</label>','<label htmlFor="task-title" className="block text-sm font-medium mb-1.5">{t("tasks.task_title", "Title")} *</label>')
rep('web/pages/tasks.tsx','<input className="input" required value={form.title}','<input id="task-title" className="input" required value={form.title}')
rep('web/pages/tasks.tsx','<label className="block text-sm font-medium mb-1.5">{t("tasks.type")}</label>','<label htmlFor="task-type" className="block text-sm font-medium mb-1.5">{t("tasks.type")}</label>',1)
rep('web/pages/tasks.tsx','<select className="select" value={form.type}','<select id="task-type" className="select" value={form.type}',1)
rep('web/pages/tasks.tsx','<label className="block text-sm font-medium mb-1.5">{t("tasks.due_date")}</label>','<label htmlFor="task-due" className="block text-sm font-medium mb-1.5">{t("tasks.due_date")}</label>',1)
rep('web/pages/tasks.tsx','<input className="input" type="datetime-local" value={form.dueAt}','<input id="task-due" className="input" type="datetime-local" value={form.dueAt}',1)
rep('web/pages/tasks.tsx','<label className="block text-sm font-medium mb-1.5">{t("tasks.assigned_to", "Assigned To")}</label>','<label htmlFor="task-assignee" className="block text-sm font-medium mb-1.5">{t("tasks.assigned_to", "Assigned To")}</label>')
rep('web/pages/tasks.tsx','<select className="select" value={form.assignedTo}','<select id="task-assignee" className="select" value={form.assignedTo}',1)

rep('web/pages/settings.tsx','const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type } });','const res = await api.upload.presign.$post({ json: { filename: file.name, contentType: file.type, sizeBytes: file.size } });')
rep('web/pages/settings.tsx','<img src={logoPreview} className="w-full h-full object-cover" />','<img src={logoPreview} alt={t("settings.agencyLogo", "Agency logo")} className="w-full h-full object-cover" />')
rep('web/pages/settings.tsx','<input type="file" accept="image/*" hidden','<input aria-label={t("settings.uploadLogo", "Upload logo")} type="file" accept="image/*" hidden')
rep('web/pages/settings.tsx','''            <input
              type="password"
              className="form-input"''','''            <input
              aria-label={t("settings.waAccessToken", "WhatsApp access token")}
              type="password"
              className="form-input"''')
rep('web/pages/settings.tsx','''            <input
              className="form-input"
              placeholder="Phone Number ID"''','''            <input
              aria-label={t("settings.waPhoneNumberId", "WhatsApp phone number ID")}
              className="form-input"
              placeholder="Phone Number ID"''')

rep('web/pages/analytics.tsx','<select className="select w-auto" value={range}','<select aria-label={t("analytics.date_range", "Analytics date range")} className="select w-auto" value={range}')

rep('web/pages/agents.tsx','<button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">','<button aria-label={t("common.close", "Close")} onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">')
for id_,label in [('agent-name','field.name'),('agent-email','field.email'),('agent-role','field.role')]:
    rep('web/pages/agents.tsx',f'<label className="label">{{t("{label}")}}</label>',f'<label htmlFor="{id_}" className="label">{{t("{label}")}}</label>',1)
rep('web/pages/agents.tsx','''                <input
                  className="input"''','''                <input
                  id="agent-name"
                  className="input"''',1)
rep('web/pages/agents.tsx','''                <input
                  type="email"''','''                <input
                  id="agent-email"
                  type="email"''',1)
rep('web/pages/agents.tsx','''                <select
                  className="select"''','''                <select
                  id="agent-role"
                  className="select"''',1)
rep('web/pages/agents.tsx','<label className="label">{t("field.password")}','<label htmlFor="agent-password" className="label">{t("field.password")}')
rep('web/pages/agents.tsx','''                <input
                  type="password"''','''                <input
                  id="agent-password"
                  type="password"''',1)
rep('web/pages/agents.tsx','                  autoFocus\n','',2)
rep('web/pages/agents.tsx','''              <select
                className="select text-xs py-0.5 px-1.5 h-auto"''','''              <select
                aria-label={t("field.role")}
                className="select text-xs py-0.5 px-1.5 h-auto"''')
rep('web/pages/agents.tsx','''        <button
          onClick={() => activeMut.mutate(isActive ? 0 : 1)}''','''        <button
          aria-label={isActive ? t("agents.deactivate", "Deactivate") : t("agents.reactivate", "Reactivate")}
          onClick={() => activeMut.mutate(isActive ? 0 : 1)}''')

print('done')

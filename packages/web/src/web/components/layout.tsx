import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { setLanguage } from "../lib/i18n";
import { authClient, clearToken } from "../lib/auth";
import { api } from "../lib/api";
import { useProfile } from "../hooks/use-profile";
import { useAgency } from "../hooks/use-agency";
import {
  LayoutDashboard, Users, Building2, CheckSquare,
  UserCircle, BarChart3, Settings, LogOut, Menu, X, Globe
} from "lucide-react";

const NAV_ITEMS = [
  { key: "dashboard", icon: LayoutDashboard, path: "/dashboard", adminOnly: false },
  { key: "leads", icon: Users, path: "/leads", adminOnly: false },
  { key: "properties", icon: Building2, path: "/properties", adminOnly: false },
  { key: "tasks", icon: CheckSquare, path: "/tasks", adminOnly: false },
  { key: "agents", icon: UserCircle, path: "/agents", adminOnly: true },
  { key: "analytics", icon: BarChart3, path: "/analytics", adminOnly: true },
  { key: "settings", icon: Settings, path: "/settings", adminOnly: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdminOrManager } = useProfile();
  const { agency } = useAgency();
  const visibleNavItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdminOrManager);

  // Overdue task badge on the Tasks nav item — polls periodically.
  const { data: tasksData } = useQuery({
    queryKey: ["nav-tasks-overdue"],
    queryFn: async () => (await api.tasks.$get({ query: { done: "0", pageSize: "200" } })).json(),
    refetchInterval: 60_000,
  });
  const overdueCount = ((tasksData as any)?.tasks ?? []).filter((t: any) => t.dueAt && t.dueAt < Date.now()).length;

  const handleSignOut = async () => {
    await authClient.signOut();
    clearToken();
    window.location.href = "/";
  };

  const toggleLanguage = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    setLanguage(next as "en" | "ar");
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
            {agency?.logoImageUrl ? (
              <img src={agency.logoImageUrl} className="w-full h-full object-cover" />
            ) : (
              "ع"
            )}
          </div>
          <span className="text-white font-bold text-lg tracking-tight truncate">{agency?.name || t("app_name")}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map(({ key, icon: Icon, path }) => {
          const isActive = location === path || (path !== "/dashboard" && location.startsWith(path));
          return (
            <Link key={key} to={path} onClick={() => setSidebarOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}>
                <Icon size={18} />
                <span className="text-sm font-medium flex-1">{t(`nav.${key}`)}</span>
                {key === "tasks" && overdueCount > 0 && (
                  <span className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1" style={{ backgroundColor: "#ef4444", color: "#fff" }}>
                    {overdueCount > 9 ? "9+" : overdueCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <button
          onClick={toggleLanguage}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
        >
          <Globe size={18} />
          <span>{i18n.language === "ar" ? "English" : "عربي"}</span>
        </button>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          <span>{t("auth.sign_out")}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      {/* Desktop sidebar */}
      <aside className="sidebar hidden md:flex flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="sidebar flex flex-col !transform-none" style={{ width: "var(--sidebar-w)" }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="main-content">
        {/* Top bar (mobile) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <span className="font-bold text-sm" style={{ color: "var(--primary)" }}>{t("app_name")}</span>
          <button onClick={toggleLanguage} className="p-1.5 rounded-lg hover:bg-gray-100 text-xs font-medium">
            {i18n.language === "ar" ? "EN" : "ع"}
          </button>
        </div>

        <main className="p-4 md:p-6 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

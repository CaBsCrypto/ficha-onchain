"use client";
/**
 * NotificationBell — Campana de Notificaciones In-App interactiva (Fase 4).
 * ---------------------------------------------------------------------------
 * Muestra el contador de notificaciones no leídas y un panel desplegable con:
 * - Alertas preventivas de salud generadas por IA (tendencias de laboratorios).
 * - Registros de accesos de médicos (Ley 20.584).
 * - Vencimientos de recetas e hitos de solicitudes a prestadores.
 */
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/auth/authed-fetch";

export interface NotificationItem {
  id: number;
  type: "health_alert" | "access_log" | "rx_expiry" | "record_request" | "system";
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

interface Props {
  patientEmail: string;
}

export function NotificationBell({ patientEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "health_alert" | "access_log">("all");
  const panelRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    if (!patientEmail) return;
    setLoading(true);
    try {
      const res = await authedFetch(
        `/api/patient/notifications?patientEmail=${encodeURIComponent(patientEmail)}`
      );
      const json = (await res.json()) as {
        success?: boolean;
        unreadCount?: number;
        notifications?: NotificationItem[];
      };
      if (res.ok && json.notifications) {
        setNotifications(json.notifications);
        setUnreadCount(json.unreadCount ?? 0);
      }
    } catch {
      // Ignore network errors on bell polling
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 30000); // poll every 30 seconds
    return () => clearInterval(interval);
  }, [patientEmail]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAsRead(id: number) {
    try {
      await authedFetch("/api/patient/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientEmail, notificationId: id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    try {
      await authedFetch("/api/patient/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientEmail, markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "health_alert") return n.type === "health_alert" || n.type === "rx_expiry";
    if (activeTab === "access_log") return n.type === "access_log";
    return true;
  });

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón de la campana */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-xl bg-slate-100/80 text-slate-600 transition-colors hover:bg-slate-200/80 hover:text-slate-900"
        title="Centro de notificaciones"
      >
        <span className="text-base">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Desplegable de notificaciones */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden ring-1 ring-slate-900/5 animate-fadeIn">
          {/* Cabecera del panel */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ink">Notificaciones</h4>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  {unreadCount} nueva(s)
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-[11px] font-semibold text-clinical hover:underline"
              >
                Marcar leídas
              </button>
            )}
          </div>

          {/* Filtros por pestaña */}
          <div className="flex border-b border-slate-100 px-4 py-2 gap-1 bg-slate-50/40">
            {[
              { id: "all", label: "Todas" },
              { id: "health_alert", label: "🧠 Alertas IA" },
              { id: "access_log", label: "🩺 Accesos" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={
                  activeTab === t.id
                    ? "rounded-full bg-clinical/10 px-2.5 py-1 text-[11px] font-bold text-clinical"
                    : "rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-ink"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Lista scrollable */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 && (
              <div className="py-8 text-center text-xs text-muted">Cargando notificaciones...</div>
            )}

            {!loading && filteredNotifications.length === 0 && (
              <div className="py-8 text-center space-y-1">
                <p className="text-xs font-semibold text-slate-600">Sin notificaciones</p>
                <p className="text-[11px] text-muted">No tienes avisos pendientes en esta sección.</p>
              </div>
            )}

            {filteredNotifications.map((item) => {
              const iconMap = {
                health_alert: "🧠",
                access_log: "🩺",
                rx_expiry: "💊",
                record_request: "📋",
                system: "⚙️",
              };

              const icon = iconMap[item.type] || "🔔";
              const dateStr = new Date(item.created_at).toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.read) void markAsRead(item.id);
                  }}
                  className={`p-4 transition-colors cursor-pointer flex items-start gap-3 ${
                    item.read ? "bg-white hover:bg-slate-50/70" : "bg-sky-50/40 hover:bg-sky-50/70"
                  }`}
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className={`text-xs truncate ${item.read ? "font-semibold text-ink" : "font-bold text-sky-950"}`}>
                        {item.title}
                      </p>
                      {!item.read && <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0"></span>}
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{item.message}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{dateStr}</span>
                      {item.link && (
                        <Link
                          href={item.link}
                          onClick={() => setOpen(false)}
                          className="text-[10px] font-bold text-clinical hover:underline"
                        >
                          Ver detalle →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
// Copyright © 2026 Browns Studio
// DemoSwitcher — floating pill to switch roles during demo/testing
// Only visible when trustleaf_demo_user = true in localStorage

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveUserRole, type UserRole } from "../lib/user-role";

const ROLES = [
  { role: "patient" as UserRole,    label: "Paciente",   emoji: "🧬", portal: "/patient" },
  { role: "doctor" as UserRole,     label: "Médico",     emoji: "🩺", portal: "/doctor" },
  { role: "dispensary" as UserRole, label: "Farmacia",   emoji: "💊", portal: "/farmacia" },
  { portal: "/caregiver",           label: "Cuidador",   emoji: "🧠", role: "patient" as UserRole },
];

export default function DemoSwitcher() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setVisible(localStorage.getItem("trustleaf_demo_user") === "true");
    }
  }, []);

  if (!visible) return null;

  function go(role: UserRole, portal: string) {
    saveUserRole(role);
    setOpen(false);
    router.push(portal);
  }

  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2">
      {/* Role buttons — shown when open */}
      {open && (
        <div className="flex flex-col gap-1.5 mb-1">
          {ROLES.map(r => (
            <button
              key={r.portal}
              onClick={() => go(r.role, r.portal)}
              className="flex items-center gap-2 bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-sm font-semibold text-white hover:bg-[#253046] transition-colors shadow-lg"
            >
              <span>{r.emoji}</span>
              <span>{r.label}</span>
            </button>
          ))}
          <button
            onClick={() => {
              if (typeof window !== "undefined") localStorage.removeItem("trustleaf_demo_user");
              router.push("/login");
            }}
            className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 rounded-xl px-3 py-2 text-xs text-red-400 hover:bg-red-900/50 transition-colors"
          >
            <span>🚪</span>
            <span>Salir demo</span>
          </button>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-[#10B981] text-[#0F172A] font-bold text-lg flex items-center justify-center shadow-xl hover:bg-[#34D399] transition-colors"
        title="Demo mode — cambiar rol"
      >
        {open ? "✕" : "🎭"}
      </button>
    </div>
  );
}

"use client";

import { useLanguage } from "@/hooks/useLanguage";

export function Footer() {
  const { t } = useLanguage();
  const cols = t.footer.columns;
  const year = 2026;

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-clinical text-white">
                <span className="text-sm font-bold">T</span>
              </span>
              <span className="text-ink">
                Trust<span className="text-clinical">Leaf</span>
              </span>
            </div>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-clinical" />
              {t.footer.built}
            </p>
          </div>

          {[cols.product, cols.company, cols.legal].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-ink">{col.title}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted transition-colors hover:text-clinical">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 text-sm text-muted sm:flex-row">
          <p>© {year} TrustLeaf. {t.footer.rights}</p>
          <p className="text-xs">Santiago · Chile 🇨🇱</p>
        </div>
      </div>
    </footer>
  );
}

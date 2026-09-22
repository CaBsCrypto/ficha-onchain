"use client";

import { useLanguage } from "@/hooks/useLanguage";

export function Footer() {
  const { t, lang } = useLanguage();
  const cols = t.footer.columns;
  const year = 2026;

  // Most footer links are still placeholders; resolve the ones that have a
  // real destination today. Keyed by label text (EN + ES).
  const hrefFor = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("problem") || l.includes("problema")) return "#problem";
    if (l.includes("solut") || l.includes("soluci") || l.includes("soluç")) return "#solution";
    if (l.includes("how") || l.includes("cómo") || l.includes("como")) return "#how";
    if (l.includes("roadmap")) return "#roadmap";
    if (l.includes("tract") || l.includes("tracc")) return "/traction";
    if (l.includes("veri")) return "/verify";
    if (l.includes("médic") || l.includes("medic") || l.includes("doctor")) return "/login/doctor";
    if (l.includes("pacient") || l.includes("patient")) return "/login/patient";
    if (l.includes("priva")) return "#waitlist";
    return "#";
  };

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-8 grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
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
                    <a
                      href={hrefFor(link)}
                      className="text-sm text-muted transition-colors hover:text-clinical"
                    >
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
          <a href={`/login/doctor?lang=${lang}`} className="text-xs text-muted underline-offset-4 hover:text-clinical hover:underline">
            {lang === 'pt' ? 'Acesso para médicos' : lang === 'es' ? 'Acceso para médicos' : 'Doctor access'}
          </a>
          <p className="text-xs">Santiago · Chile 🇨🇱</p>
        </div>
      </div>
    </footer>
  );
}

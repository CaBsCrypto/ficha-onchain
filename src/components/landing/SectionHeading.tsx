import { Reveal } from "@/components/ui/Reveal";

export function SectionHeading({
  kicker,
  title,
  subtitle,
  align = "center",
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  const alignment = align === "center" ? "text-center mx-auto" : "text-left";
  return (
    <Reveal className={`max-w-2xl ${alignment}`}>
      <p className="text-base font-semibold uppercase tracking-wider text-clinical">
        {kicker}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base leading-relaxed text-muted sm:text-xl">{subtitle}</p>
      )}
    </Reveal>
  );
}

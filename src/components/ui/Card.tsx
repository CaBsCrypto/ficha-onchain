import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds a hover lift + border glow. */
  interactive?: boolean;
}

export function Card({ children, className, interactive, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200/70 bg-white p-8 shadow-sm",
        interactive &&
          "transition-all duration-300 hover:-translate-y-1 hover:border-clinical/30 hover:shadow-xl hover:shadow-clinical/5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

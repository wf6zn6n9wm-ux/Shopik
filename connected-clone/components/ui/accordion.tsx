"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AccordionItem = {
  title: React.ReactNode;
  content: React.ReactNode;
};

export function Accordion({
  items,
  defaultOpen = 0,
  className,
}: {
  items: AccordionItem[];
  defaultOpen?: number | null;
  className?: string;
}) {
  const [open, setOpen] = React.useState<number | null>(defaultOpen);

  return (
    <div className={cn("divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className="px-5 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold text-ink sm:text-lg">
                {item.title}
              </span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-brand transition-transform duration-300",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-300 ease-in-out",
                isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="text-ink-soft leading-relaxed">{item.content}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

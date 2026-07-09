"use client";

import * as React from "react";
import { ChevronDown, Menu, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navItems, courses } from "@/lib/data";
import { cn } from "@/lib/utils";

export function Header() {
  const [open, setOpen] = React.useState(false);
  const [coursesOpen, setCoursesOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-shadow",
        scrolled ? "bg-white/90 shadow-soft backdrop-blur" : "bg-white",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-20">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-ink">
            Connected
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          <div
            className="relative"
            onMouseEnter={() => setCoursesOpen(true)}
            onMouseLeave={() => setCoursesOpen(false)}
          >
            <button className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light">
              Курси
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  coursesOpen && "rotate-180",
                )}
              />
            </button>
            {coursesOpen && (
              <div className="absolute left-0 top-full w-72 pt-2">
                <div className="rounded-2xl border border-ink/10 bg-white p-2 shadow-card">
                  {courses.map((c) => (
                    <a
                      key={c.id}
                      href="#courses"
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-light"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-xs font-bold text-brand-dark">
                        {c.badge}
                      </span>
                      <span className="text-sm font-medium text-ink">
                        {c.title}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {navItems.slice(1).map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-light"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button className="hidden sm:inline-flex">Записатися</Button>
          <button
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Меню"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-ink/10 bg-white lg:hidden">
          <nav className="container-page flex flex-col gap-1 py-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-ink hover:bg-brand-light"
              >
                {item.label}
              </a>
            ))}
            <Button className="mt-2 w-full">Записатися</Button>
          </nav>
        </div>
      )}
    </header>
  );
}

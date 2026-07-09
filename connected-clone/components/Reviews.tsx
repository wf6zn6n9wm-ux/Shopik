"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Play, Star } from "lucide-react";
import { reviews } from "@/lib/data";
import { cn } from "@/lib/utils";

export function Reviews() {
  const [active, setActive] = React.useState(0);
  const count = reviews.length;
  const prev = () => setActive((i) => (i - 1 + count) % count);
  const next = () => setActive((i) => (i + 1) % count);
  const r = reviews[active];

  return (
    <section id="reviews" className="section bg-white">
      <div className="container-page">
        <div className="flex flex-col items-center text-center">
          <span className="eyebrow">Відгуки студентів</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Нам довіряють тисячі вступників
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {/* Carousel */}
          <div className="flex flex-col justify-between rounded-2xl border border-ink/10 bg-brand-light/40 p-8 shadow-soft">
            <div>
              <div className="flex items-center gap-1 text-accent-amber">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-current" />
                ))}
              </div>
              <p className="mt-5 text-xl font-medium leading-relaxed text-ink">
                «{r.text}»
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                  {r.name.charAt(0)}
                </span>
                <div className="text-left">
                  <p className="font-bold text-ink">{r.name}</p>
                  <p className="text-sm text-ink-soft">{r.role}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={prev}
                  aria-label="Попередній відгук"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 bg-white hover:border-brand hover:text-brand"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={next}
                  aria-label="Наступний відгук"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 bg-white hover:border-brand hover:text-brand"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {reviews.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`Відгук ${i + 1}`}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === active ? "w-6 bg-brand" : "w-2 bg-ink/20",
                  )}
                />
              ))}
            </div>
          </div>

          {/* Video testimonial */}
          <div className="group relative overflow-hidden rounded-2xl bg-ink shadow-card">
            <div className="flex aspect-video w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,theme(colors.brand.DEFAULT),theme(colors.ink.DEFAULT))]">
              <button
                aria-label="Дивитись відео-відгук"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-brand-dark shadow-card transition-transform group-hover:scale-110"
              >
                <Play className="ml-1 h-8 w-8 fill-current" />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink to-transparent p-6">
              <p className="font-marker text-2xl text-white">
                Історія вступу нашої випускниці
              </p>
              <p className="text-sm text-white/70">Відео-відгук · 2:14</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

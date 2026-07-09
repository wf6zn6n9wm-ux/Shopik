"use client";

import * as React from "react";
import { ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { courses } from "@/lib/data";

export function Courses() {
  const [track, setTrack] = React.useState<"magistracy" | "phd">("magistracy");
  const visible = courses.filter((c) => c.track === track);

  return (
    <section id="courses" className="section bg-white">
      <div className="container-page">
        <div className="flex flex-col items-center text-center">
          <span className="eyebrow">Наші напрями</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Оберіть курс для свого вступу
          </h2>
          <p className="mt-4 max-w-2xl text-ink-soft">
            Програми побудовані під формат офіційних іспитів і ведуть вас від
            базового рівня до впевненого результату.
          </p>

          <div className="mt-8">
            <Tabs
              tabs={[
                { value: "magistracy", label: "Магістратура" },
                { value: "phd", label: "Аспірантура" },
              ]}
              value={track}
              onValueChange={(v) => setTrack(v as "magistracy" | "phd")}
            />
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <div
              key={c.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-soft transition-shadow hover:shadow-card"
            >
              <div
                className={`bg-gradient-to-br ${c.color} p-6 text-white`}
              >
                <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                  {c.badge}
                </span>
                <h3 className="mt-4 text-xl font-bold text-white">{c.title}</h3>
                <p className="mt-1 text-sm text-white/85">{c.subtitle}</p>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <p className="text-ink-soft">{c.description}</p>

                <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
                  <Clock className="h-4 w-4 text-brand" />
                  Тривалість: {c.duration}
                </div>

                <div className="mt-6 flex items-end justify-between gap-2 border-t border-ink/10 pt-4">
                  <div>
                    {c.oldPrice && (
                      <span className="mr-2 text-sm text-ink-soft line-through">
                        {c.oldPrice}
                      </span>
                    )}
                    <span className="text-2xl font-extrabold text-ink">
                      {c.price}
                    </span>
                  </div>
                  <Button size="sm" className="shrink-0">
                    Детальніше
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

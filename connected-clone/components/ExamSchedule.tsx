import { CalendarDays } from "lucide-react";
import { examSchedule } from "@/lib/data";

export function ExamSchedule() {
  return (
    <section id="schedule" className="section bg-white">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[1fr,1.3fr] lg:items-start">
          {/* Heading + sticky note */}
          <div className="lg:sticky lg:top-28">
            <span className="eyebrow">Розклад 2026</span>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
              Ключові дати вступної кампанії
            </h2>
            <p className="mt-4 text-ink-soft">
              Тримайте дедлайни під контролем — ми нагадаємо про кожен важливий
              етап.
            </p>

            {/* Sticky note */}
            <div className="mt-8 max-w-xs rotate-[-2deg] rounded-xl bg-accent-amber/90 p-5 shadow-card">
              <p className="font-marker text-2xl text-ink">
                Не відкладай реєстрацію на останній день! ✍️
              </p>
            </div>
          </div>

          {/* Timeline */}
          <ol className="relative space-y-8 border-l-2 border-brand/30 pl-8">
            {examSchedule.map((e) => (
              <li key={e.date} className="relative">
                <span className="absolute -left-[2.55rem] flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <p className="text-sm font-bold uppercase tracking-wide text-brand">
                  {e.date}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink">{e.title}</p>
                {e.note && (
                  <p className="mt-1 font-marker text-xl text-accent-rose">
                    {e.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

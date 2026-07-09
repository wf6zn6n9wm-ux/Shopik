import { ArrowRight } from "lucide-react";
import { courses } from "@/lib/data";

export function CoursesSecondary() {
  return (
    <section className="section bg-brand-light/40">
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="eyebrow">Усі програми</span>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
              Наші курси
            </h2>
          </div>
          <a
            href="#courses"
            className="inline-flex items-center gap-2 font-semibold text-brand-dark underline-offset-4 hover:underline"
          >
            Переглянути всі
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <a
              key={c.id}
              href="#courses"
              className="group flex items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-soft transition-shadow hover:shadow-card"
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-sm font-bold text-white`}
              >
                {c.badge}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{c.title}</p>
                <p className="truncate text-sm text-ink-soft">{c.subtitle}</p>
              </div>
              <ArrowRight className="ml-auto h-5 w-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-1 group-hover:text-brand" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

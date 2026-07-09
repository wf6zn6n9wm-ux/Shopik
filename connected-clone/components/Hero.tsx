import { ArrowRight, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stats } from "@/lib/data";

const bullets = [
  "Живі онлайн-заняття та записи",
  "Індивідуальний план підготовки",
  "Підтримка куратора до вступу",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-light/60 to-white">
      <div className="container-page grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
        {/* Left */}
        <div>
          <span className="eyebrow">
            <Star className="h-4 w-4 fill-current" />
            Онлайн-школа підготовки до вступу
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight text-ink sm:text-5xl lg:text-6xl">
            Підготовка до{" "}
            <span className="text-brand">ЄВІ, ТЗНК, ЄФВВ</span> та ЄВВ
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            Готуємо до вступу в магістратуру та аспірантуру з нуля до
            результату. Структуровані курси, живі заняття та підтримка на
            кожному кроці.
          </p>

          <ul className="mt-6 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-3 text-ink">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg">
              Обрати курс
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline">
              Безкоштовна консультація
            </Button>
          </div>
        </div>

        {/* Right — founder photo + stats */}
        <div className="relative">
          <div className="relative mx-auto max-w-md">
            <div className="aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand/20 to-accent-violet/20 shadow-card">
              {/* Founder photo placeholder */}
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,theme(colors.brand.light),transparent_60%)]">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand text-4xl font-extrabold text-white">
                    C
                  </div>
                  <p className="px-8 font-marker text-2xl text-ink-soft">
                    фото засновника
                  </p>
                </div>
              </div>
            </div>

            {/* Floating stat card */}
            <div className="absolute -bottom-6 -left-6 rounded-2xl bg-white p-4 shadow-card">
              <p className="text-3xl font-extrabold text-brand">93%</p>
              <p className="text-sm text-ink-soft">студентів вступають</p>
            </div>
            <div className="absolute -right-4 top-6 rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-center gap-1 text-accent-amber">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">4.9 / 5.0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="container-page pb-16">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-soft sm:grid-cols-4 sm:p-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold text-brand sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

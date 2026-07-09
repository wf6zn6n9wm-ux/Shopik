import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { universities } from "@/lib/data";

export function Universities() {
  // Duplicate the list so the marquee can loop seamlessly.
  const row = [...universities, ...universities];

  return (
    <section className="section bg-brand-light/40">
      <div className="container-page">
        <div className="text-center">
          <span className="eyebrow">Наші студенти вступають до</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Провідні університети України
          </h2>
        </div>
      </div>

      {/* Logo marquee */}
      <div className="relative mt-10 overflow-hidden">
        <div className="flex w-max animate-marquee gap-4">
          {row.map((u, i) => (
            <div
              key={i}
              className="flex h-20 items-center whitespace-nowrap rounded-2xl border border-ink/10 bg-white px-8 text-lg font-bold text-ink-soft shadow-soft"
            >
              {u}
            </div>
          ))}
        </div>
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-brand-light/40 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-brand-light/40 to-transparent" />
      </div>

      {/* CTA panel */}
      <div className="container-page mt-12">
        <div className="flex flex-col items-center justify-between gap-6 rounded-[2rem] bg-brand p-8 text-center text-white sm:p-12 lg:flex-row lg:text-left">
          <div>
            <h3 className="text-2xl font-extrabold sm:text-3xl">
              Готові розпочати підготовку?
            </h3>
            <p className="mt-2 text-white/90">
              Залиште заявку — підберемо курс під ваш вступ і дамо безкоштовну
              консультацію.
            </p>
          </div>
          <Button size="lg" variant="white" className="shrink-0">
            Залишити заявку
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
}

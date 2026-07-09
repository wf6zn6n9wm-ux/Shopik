import { MessageCircle, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MoreQuestions() {
  return (
    <section className="section bg-white">
      <div className="container-page">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* CTA */}
          <div className="flex flex-col justify-center rounded-[2rem] border border-ink/10 bg-brand-light/50 p-8 sm:p-10">
            <MessageCircle className="h-10 w-10 text-brand" />
            <h3 className="mt-4 text-2xl font-extrabold sm:text-3xl">
              Залишились питання?
            </h3>
            <p className="mt-3 text-ink-soft">
              Напишіть нам — менеджер відповість, допоможе обрати курс і
              розкаже про знижки та розстрочку.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button size="lg">Поставити питання</Button>
              <Button size="lg" variant="outline">
                Замовити дзвінок
              </Button>
            </div>
          </div>

          {/* YouTube */}
          <a
            href="#"
            className="group relative flex flex-col justify-end overflow-hidden rounded-[2rem] bg-ink p-8 text-white shadow-card sm:p-10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(244,63,94,0.4),transparent_60%)]" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent-rose px-4 py-1.5 text-sm font-semibold">
                <Youtube className="h-4 w-4" />
                YouTube
              </span>
              <h3 className="mt-4 text-2xl font-extrabold sm:text-3xl">
                Безкоштовні уроки на нашому каналі
              </h3>
              <p className="mt-2 text-white/80">
                Розбори завдань, лайфхаки та поради щодо вступу — нові відео
                щотижня.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 font-semibold text-accent-rose underline-offset-4 group-hover:underline">
                Перейти на канал →
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight, Sparkles } from "lucide-react";

export function PromoBanner() {
  return (
    <a
      href="#"
      className="group block bg-gradient-to-r from-accent-blue to-accent-violet text-white"
    >
      <div className="container-page flex flex-col items-center justify-center gap-2 py-2.5 text-center text-sm font-medium sm:flex-row sm:gap-3">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          Безкоштовний вебінар «Як вступити до магістратури у 2026 році»
        </span>
        <span className="inline-flex items-center gap-1 font-semibold underline-offset-4 group-hover:underline">
          Зареєструватися
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </a>
  );
}

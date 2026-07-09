import { steps } from "@/lib/data";

export function Steps() {
  return (
    <section id="steps" className="section bg-brand-light/40">
      <div className="container-page">
        <div className="max-w-2xl">
          <span className="eyebrow">Як проходить навчання</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            5 кроків до вступу
          </h2>
          <p className="mt-4 text-ink-soft">
            Прозорий шлях від першої заявки до зарахування — ви завжди знаєте,
            що робити далі.
          </p>
        </div>

        <ol className="mt-12 space-y-4">
          {steps.map((s) => (
            <li
              key={s.n}
              className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-soft sm:flex-row sm:items-center sm:gap-6"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-xl font-extrabold text-white">
                {s.n}
              </span>
              <div>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-ink-soft">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

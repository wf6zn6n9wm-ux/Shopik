import { Compass, HeartHandshake, Rocket, Quote } from "lucide-react";

const features = [
  {
    icon: Compass,
    title: "Стратегія вступу",
    text: "Не лише знання, а й чіткий план: куди подаватись, які дедлайни та як максимізувати шанси.",
  },
  {
    icon: HeartHandshake,
    title: "Спільнота та мотивація",
    text: "Ви навчаєтесь у групі однодумців, де легше тримати темп і не здаватися на півдорозі.",
  },
  {
    icon: Rocket,
    title: "Навички на майбутнє",
    text: "Англійська, логіка та академічне письмо лишаються з вами далеко після іспиту.",
  },
];

export function MoreThanPrep() {
  return (
    <section className="section bg-white">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Більше, ніж підготовка</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Ми супроводжуємо вас до вступу
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="text-center md:text-left">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light text-brand-dark md:mx-0">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-xl font-bold">{f.title}</h3>
                <p className="mt-2 text-ink-soft">{f.text}</p>
              </div>
            );
          })}
        </div>

        {/* Founder quote */}
        <div className="mt-16 overflow-hidden rounded-[2rem] bg-ink text-white">
          <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[auto,1fr]">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand text-4xl font-extrabold">
              C
            </div>
            <div>
              <Quote className="h-8 w-8 text-brand" />
              <blockquote className="mt-3 text-xl font-medium leading-relaxed sm:text-2xl">
                «Ми створили Connected, щоб вступ перестав бути лотереєю. Кожен
                студент заслуговує на чіткий план і підтримку — і саме це ми
                даємо».
              </blockquote>
              <p className="mt-5 font-marker text-2xl text-brand">
                Засновник Connected
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { TrendingUp, Users, Clock3, BadgeCheck } from "lucide-react";

const panels = [
  {
    icon: TrendingUp,
    value: "93%",
    title: "Вступають за результатами",
    text: "Більшість наших студентів отримують бал, достатній для вступу на бюджет чи контракт.",
    className: "bg-brand text-white",
  },
  {
    icon: Clock3,
    value: "150+",
    title: "Годин практики",
    text: "Реальні завдання у форматі іспиту, розбори помилок і пробні тести під контролем викладача.",
    className: "bg-white text-ink border border-ink/10",
  },
  {
    icon: Users,
    value: "1 на 1",
    title: "Підтримка куратора",
    text: "Особистий куратор тримає вас у графіку, перевіряє ДЗ і відповідає на питання щодня.",
    className: "bg-white text-ink border border-ink/10",
  },
  {
    icon: BadgeCheck,
    value: "5 років",
    title: "Досвіду підготовки",
    text: "Методики, відточені на тисячах студентів, та актуальні матеріали під зміни іспитів.",
    className: "bg-accent-violet text-white",
  },
];

export function WhyChoose() {
  return (
    <section id="why" className="section bg-brand-light/40">
      <div className="container-page">
        <div className="max-w-2xl">
          <span className="eyebrow">Чому обирають Connected</span>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
            Результат, який можна виміряти
          </h2>
          <p className="mt-4 text-ink-soft">
            Ми не просто «проходимо програму» — ми доводимо вас до конкретного
            балу, потрібного для вступу.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {panels.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className={`flex flex-col rounded-2xl p-6 shadow-soft ${p.className}`}
              >
                <Icon className="h-8 w-8" />
                <p className="mt-4 text-4xl font-extrabold">{p.value}</p>
                <p className="mt-2 text-lg font-bold">{p.title}</p>
                <p className="mt-2 text-sm opacity-90">{p.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

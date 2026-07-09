import { Accordion } from "@/components/ui/accordion";
import { faqs } from "@/lib/data";

export function Faq() {
  return (
    <section id="faq" className="section bg-brand-light/40">
      <div className="container-page">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="eyebrow">Часті питання</span>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
              Відповідаємо на головне
            </h2>
          </div>

          <Accordion
            className="mt-10"
            items={faqs.map((f) => ({ title: f.q, content: f.a }))}
          />
        </div>
      </div>
    </section>
  );
}

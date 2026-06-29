import {
  GraduationCap,
  Instagram,
  Send,
  Youtube,
  Facebook,
  Mail,
  Phone,
} from "lucide-react";
import { navItems, courses } from "@/lib/data";

export function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="container-page py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr,1fr,1fr,1fr]">
          {/* Brand */}
          <div>
            <a href="#" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="text-xl font-extrabold">Connected</span>
            </a>
            <p className="mt-4 max-w-xs text-sm text-white/70">
              Онлайн-школа підготовки до ЄВІ, ТЗНК, ЄФВВ та ЄВВ. Допомагаємо
              вступити до магістратури та аспірантури.
            </p>
            <div className="mt-6 flex gap-3">
              {[Instagram, Send, Youtube, Facebook].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-brand"
                  aria-label="Соцмережа"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Courses */}
          <div>
            <h4 className="font-bold text-white">Курси</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              {courses.map((c) => (
                <li key={c.id}>
                  <a href="#courses" className="hover:text-brand">
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Nav */}
          <div>
            <h4 className="font-bold text-white">Навігація</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              {navItems.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="hover:text-brand">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contacts */}
          <div>
            <h4 className="font-bold text-white">Контакти</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand" />
                +380 (00) 000-00-00
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand" />
                hello@connected.com.ua
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-white/60 sm:flex-row">
          <p>© 2026 Connected. Усі права захищені.</p>
          <div className="flex items-center gap-3">
            <span>Оплата:</span>
            {["Visa", "Mastercard", "Apple Pay", "Google Pay"].map((p) => (
              <span
                key={p}
                className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

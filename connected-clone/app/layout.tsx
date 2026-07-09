import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Підготовка до ЄВІ, ТЗНК, ЄФВВ та ЄВВ | Connected",
  description:
    "Онлайн-школа підготовки до ЄВІ, ТЗНК, ЄФВВ та ЄВВ для вступу в магістратуру та аспірантуру. Живі заняття, індивідуальний план і підтримка до вступу.",
  keywords: ["ЄВІ", "ТЗНК", "ЄФВВ", "ЄВВ", "магістратура", "аспірантура", "підготовка до вступу"],
  openGraph: {
    title: "Підготовка до ЄВІ, ТЗНК, ЄФВВ та ЄВВ | Connected",
    description:
      "Онлайн-школа підготовки до вступу в магістратуру та аспірантуру.",
    locale: "uk_UA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}

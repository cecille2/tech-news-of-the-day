import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Daily Briefing",
  description: "A $0, self-hosted daily topic-intelligence briefing.",
  manifest: "/manifest.json",
};

const NAV = [
  { href: "/", label: "Today" },
  { href: "/following", label: "Following" },
  { href: "/saved", label: "Saved" },
  { href: "/archive", label: "Archive" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <nav className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-1 gap-y-2">
            <span className="font-semibold mr-4">Daily Briefing</span>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm px-3 py-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

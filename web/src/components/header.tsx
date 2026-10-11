"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation, LanguageToggle } from "@/lib/i18n";

export function Header() {
  const { t } = useTranslation();
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/parent", label: t("nav.parent") },
    { href: "/history", label: t("nav.history") },
  ];

  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-white/5">
      <div className="flex flex-col gap-1">
        <Link href="/" className="group inline-block">
          <h1 className="gradient-text text-3xl font-extrabold tracking-tight transition-opacity group-hover:opacity-90">
            {t("app.title")}
          </h1>
        </Link>
        <p className="text-slate-400 text-sm">
          {t("app.description")}
        </p>
      </div>

      <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
        <nav className="flex items-center gap-1.5" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700/80"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <LanguageToggle />
      </div>
    </header>
  );
}

export default Header;

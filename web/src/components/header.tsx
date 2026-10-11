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
    <header className="flex items-center justify-between gap-4 w-full pb-5 pt-1 border-b border-slate-200/60" aria-label="Application Header">
      {/* Brand Emblem & App Title */}
      <Link href="/" className="flex items-center gap-3 group">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-[0_6px_14px_rgba(37,99,235,0.25),inset_0_2px_4px_rgba(255,255,255,0.35)] transition-transform group-hover:scale-105 shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
        <div>
          <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors block leading-tight">
            Bad Air Day Protocol
          </span>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block mt-0.5">
            School Safety Network
          </span>
        </div>
      </Link>

      {/* Navigation & Language Switcher */}
      <div className="flex items-center gap-2.5">
        <nav
          className="flex items-center gap-1 p-1 bg-white border border-slate-200/80 rounded-2xl shadow-[0_4px_12px_rgba(15,23,42,0.04),inset_0_1px_2px_rgba(255,255,255,0.95)]"
          aria-label="Main Navigation"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
                  isActive
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
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

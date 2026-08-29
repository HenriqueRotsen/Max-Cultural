"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/planning/actions";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  type: string;
  createdAt: string;
  readAt: string | null;
};

export function NotificationBell({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--navy)] hover:bg-[var(--gray-50)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        <span>Avisos</span>
        {unread > 0 ? (
          <span className="accent-fill rounded-full px-2 py-0.5 text-xs font-bold">
            {unread}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-400)]">
            Notificações
          </p>
          <button
            type="button"
            className="text-xs text-[var(--gold)] hover:underline"
            disabled={pending}
            onClick={() => start(() => markAllNotificationsRead())}
          >
            Marcar todas
          </button>
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-2 py-4 text-center text-sm text-[var(--gray-500)]">
              Sem avisos
            </li>
          ) : (
            items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href || "/notificacoes"}
                  className={`block rounded-lg px-3 py-2 text-sm hover:bg-[var(--gray-50)] ${
                    n.readAt ? "opacity-60" : ""
                  }`}
                  onClick={() => {
                    if (!n.readAt) start(() => markNotificationRead(n.id));
                  }}
                >
                  <p className="font-semibold text-[var(--navy)]">{n.title}</p>
                  <p className="text-xs text-[var(--gray-500)]">{n.body}</p>
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="mt-2 border-t border-[var(--border)] px-2 pt-2">
          <Link
            href="/notificacoes"
            className="block rounded-lg px-3 py-2 text-center text-xs font-semibold text-[var(--gold)] hover:bg-[var(--gray-50)]"
          >
            Ver todas e configurações
          </Link>
        </div>
      </div>
    </details>
  );
}

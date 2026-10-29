"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/planning/actions";
import { notificationTypeLabel } from "@/lib/planning/notification-settings";
import { formatDate } from "@/lib/format";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  type: string;
  createdAt: string;
  readAt: string | null;
};

export function NotificationsList({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--gray-500)]">Nenhuma notificação neste filtro.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((n) => {
        const inner = (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--gray-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-500)]">
                {notificationTypeLabel(n.type)}
              </span>
              {!n.readAt ? (
                <span className="rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                  Nova
                </span>
              ) : null}
              <span className="text-xs text-[var(--gray-400)]">
                {formatDate(n.createdAt)}
              </span>
            </div>
            <p className="mt-1 font-semibold text-[var(--navy)]">{n.title}</p>
            <p className="text-sm text-[var(--gray-500)]">{n.body}</p>
          </>
        );

        const className = `card block p-4 transition hover:border-[#c5d0e4] ${
          n.readAt ? "opacity-70" : ""
        }`;

        if (n.href) {
          return (
            <li key={n.id}>
              <Link
                href={n.href}
                className={className}
                onClick={() => {
                  if (!n.readAt) start(() => markNotificationRead(n.id));
                }}
              >
                {inner}
              </Link>
            </li>
          );
        }

        return (
          <li key={n.id}>
            <button
              type="button"
              className={`${className} w-full text-left`}
              disabled={pending || Boolean(n.readAt)}
              onClick={() => {
                if (!n.readAt) start(() => markNotificationRead(n.id));
              }}
            >
              {inner}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function MarkAllNotificationsButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={pending}
      onClick={() => start(() => markAllNotificationsRead())}
    >
      Marcar todas como lidas
    </button>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationForm } from "@/components/notification-form";

const LATER_KEY = "projektraum:notify-later";

/**
 * Fragt einmal nach den E-Mail-Wünschen – sobald man die erste Aufgabe hat
 * (selbst angelegt oder von jemandem zugeordnet). Vorher ergibt die Frage keinen Sinn.
 */
export function NotificationPrompt({ userId, email, needed }: { userId: string; email: string; needed: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    if (!needed || open) return;
    try {
      if (sessionStorage.getItem(LATER_KEY)) return;
    } catch {
      /* ohne Speicher einfach fragen */
    }
    const [own, assigned] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("created_by", userId),
      supabase.from("task_assignees").select("task_id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    if ((own.count ?? 0) + (assigned.count ?? 0) > 0) setOpen(true);
  }, [needed, open, supabase, userId]);

  useEffect(() => {
    check();
    const onCreated = () => setTimeout(check, 600);
    window.addEventListener("projektraum:task-created", onCreated);
    return () => window.removeEventListener("projektraum:task-created", onCreated);
  }, [check]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function later() {
    try {
      sessionStorage.setItem(LATER_KEY, "1");
    } catch {
      /* ignorieren */
    }
    setOpen(false);
  }

  if (!needed) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="np-title"
      onCancel={(e) => {
        e.preventDefault();
        later();
      }}
      className="m-auto w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-32px)] rounded-2xl bg-(--c-hover) p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="np-title" className="text-xl font-extrabold tracking-tight">
            Sollen wir dich per E-Mail erinnern?
          </h2>
          <p className="text-(--c-text-2)">
            Du hast deine erste Aufgabe. Damit nichts untergeht, kann Projektraum dir E-Mails schicken. Du kannst das später jederzeit unter{" "}
            <Link href="/einstellungen" onClick={later} className="font-semibold text-(--c-accent) underline underline-offset-4">
              E-Mail &amp; Kalender
            </Link>{" "}
            ändern.
          </p>
        </div>
        {open && (
          <NotificationForm
            userId={userId}
            email={email}
            initial={null}
            onSaved={() =>
              setTimeout(() => {
                setOpen(false);
                router.refresh();
              }, 1200)
            }
            secondary={
              <button type="button" onClick={later} className="h-11 px-3 font-semibold text-(--c-text-2) hover:text-(--c-ink)">
                Später entscheiden
              </button>
            }
          />
        )}
      </div>
    </dialog>
  );
}

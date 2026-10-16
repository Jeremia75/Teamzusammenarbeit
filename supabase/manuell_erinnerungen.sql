-- Im Supabase SQL Editor einfügen und ausführen (einmalig).
-- Damit zeigt die Glocke auch Erinnerungen an (Art "reminder").
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'mention', 'comment', 'done', 'reminder'));

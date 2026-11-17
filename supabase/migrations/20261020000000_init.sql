-- AntTipid schema. Shapes follow frontend/src/types.ts; money is numeric(14,2) pesos.
-- Every row belongs to one auth user. The API reaches these tables as the `authenticated` role with the
-- caller's JWT claims set (backend/db.py), so the RLS policies below apply to it as well as to direct clients.

-- Wallets ---------------------------------------------------------------------------------------------
create table public.wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  type            text not null check (type in ('cash', 'e_wallet', 'bank', 'credit_card', 'savings')),
  -- Balance the user typed when adding the wallet; the shown balance adds its transactions on top.
  opening_balance numeric(14, 2) not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  -- Target for the composite foreign keys below, so a row can only point at its own user's wallets.
  unique (id, user_id)
);
create index wallets_user_idx on public.wallets (user_id);

-- Categories ------------------------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  kind       text not null check (kind in ('expense', 'income')),
  icon       text not null default 'other' check (length(icon) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index categories_user_idx on public.categories (user_id);

-- Transactions ----------------------------------------------------------------------------------------
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('expense', 'income', 'transfer')),
  amount       numeric(14, 2) not null check (amount > 0),
  title        text not null check (length(title) <= 200),
  date         date not null,
  wallet_id    uuid not null,
  to_wallet_id uuid,
  category_id  uuid,
  note         text not null default '' check (length(note) <= 2000),
  source       text not null default 'manual' check (source in ('manual', 'receipt')),
  -- Storage path in the private `receipts` bucket: {user_id}/{transaction_id}.webp (or .jpg from Safari).
  receipt_path text,
  created_at   timestamptz not null default now(),
  -- Wallets and categories in use can't be deleted (the API turns this into a 409); a wallet in use is archived instead.
  foreign key (wallet_id, user_id) references public.wallets (id, user_id),
  foreign key (to_wallet_id, user_id) references public.wallets (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id),
  -- Transfers move money between two different wallets and have no category; the others need a category.
  check (
    (kind = 'transfer' and to_wallet_id is not null and to_wallet_id <> wallet_id and category_id is null)
    or (kind <> 'transfer' and to_wallet_id is null and category_id is not null)
  ),
  check (receipt_path is null or receipt_path like user_id::text || '/%')
);
create index transactions_user_date_idx on public.transactions (user_id, date desc, created_at desc);
create index transactions_wallet_idx on public.transactions (wallet_id);
create index transactions_to_wallet_idx on public.transactions (to_wallet_id) where to_wallet_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;

-- Line items read from a scanned receipt. The transaction amount stays the receipt total.
create table public.receipt_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  position       smallint not null,
  name           text not null check (length(name) between 1 and 200),
  qty            numeric(10, 3) not null check (qty > 0),
  price          numeric(14, 2) not null check (price >= 0),
  created_at     timestamptz not null default now(),
  unique (transaction_id, position)
);
create index receipt_items_user_idx on public.receipt_items (user_id);

-- Budgets ---------------------------------------------------------------------------------------------
-- One limit per category per user, applied to every month; category_id null is the overall monthly budget.
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid,
  limit_amount numeric(14, 2) not null check (limit_amount > 0),
  warn_at      smallint not null default 80 check (warn_at between 1 and 100),
  created_at   timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  unique nulls not distinct (user_id, category_id)
);

-- Row level security: each user sees and changes only their own rows ---------------------------------
do $$
declare t text;
begin
  foreach t in array array['wallets', 'categories', 'transactions', 'receipt_items', 'budgets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy "own rows" on public.%I for all to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Default categories for every new user ---------------------------------------------------------------
-- Same list as the mock data (frontend/src/mocks/db.ts); icon keys match components/category-icon.tsx.
create function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, kind, icon)
  values
    (new.id, 'Food & dining', 'expense', 'food'),
    (new.id, 'Groceries', 'expense', 'groceries'),
    (new.id, 'Transport', 'expense', 'transport'),
    (new.id, 'Bills & utilities', 'expense', 'bills'),
    (new.id, 'Load & internet', 'expense', 'phone'),
    (new.id, 'Shopping', 'expense', 'shopping'),
    (new.id, 'Health', 'expense', 'health'),
    (new.id, 'Going out', 'expense', 'fun'),
    (new.id, 'Salary', 'income', 'salary'),
    (new.id, 'Freelance', 'income', 'freelance'),
    (new.id, 'Gifts', 'income', 'gift');
  return new;
end $$;
revoke execute on function public.seed_default_categories() from public, anon, authenticated;

create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row execute function public.seed_default_categories();

-- Receipt photos --------------------------------------------------------------------------------------
-- Private bucket; objects live under {user_id}/ and only that user can touch them. 1 MB cap, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "receipts: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts: own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts: own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create extension if not exists pgcrypto;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  text text,
  source text default 'bale',
  raw_data jsonb,
  created_at timestamptz default now()
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  tracking_id text unique,
  title text not null,
  description text,
  status text default 'ثبت شد',
  category text,
  created_at timestamptz default now()
);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  created_at timestamptz default now()
);

create table if not exists knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  approved boolean default false,
  created_at timestamptz default now()
);

create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question text,
  options jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  tracking_id text unique,
  title text not null,
  description text,
  status text default 'ثبت شد',
  category text,
  priority text default 'عادی',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  period text,
  created_at timestamptz default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table messages enable row level security;
alter table issues enable row level security;
alter table ideas enable row level security;
alter table knowledge enable row level security;
alter table polls enable row level security;
alter table cases enable row level security;
alter table reports enable row level security;
alter table settings enable row level security;

# D-Tail Studio 4.0 — CLOUD SYNC

A D-Tail Studio 4.0 premium detailing workspace with optional direct Supabase cloud sync.

## Supabase setup

1. Open the Supabase project connected to this app.
2. Open **SQL Editor** and run the complete `supabase-schema.sql` file once.
3. The app uses the Supabase **publishable** browser key. Never put a Supabase secret/service-role key into `config.js`.
4. Open the app and create a D-Tail account with email + password from the Cloud login screen.
5. Use the same account on iPhone/iPad/PC/Mac. The same jobs, customers, cars, stock, monthly goal and uploaded job photos are then loaded from Supabase.

### First cloud login behavior

If this browser already has local D-Tail data and the cloud database is empty, the app migrates the local jobs/customers/cars/stock/goal to Supabase automatically during the first successful login. If cloud data already exists, the cloud dataset is loaded instead.

## Files

- `index.html` — UI
- `app.js` — application logic + Supabase sync/auth
- `config.js` — D-Tail Studio Supabase project configuration
- `supabase-schema.sql` — database, RLS policies and private photo storage bucket
- `assets/dtail-icon.svg` — app icon

# D-Tail Studio 3.0

A D-Tail Studio webapp redesign with:

- responsive phone / iPad / desktop UI
- one shared job record powering both calendar and work sheet
- full inventory visualizer (no 6-item limit)
- correct inventory valuation, including legacy `%` fill-level items
- designed print/PDF work sheets
- customer + car records
- local fallback mode
- optional Supabase cloud sync and login
- local/JSON backup + legacy localStorage importer
- local D-Tail AI (no OpenAI API required)
- PWA shell

## Cloud mode setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase-schema.sql`.
3. Copy `config.example.js` to `config.js` if needed.
4. Put your Supabase Project URL and anon/publishable key into `config.js`.
5. Deploy the folder to GitHub Pages or Vercel.
6. Register the D-Tail account from the app. Use the same account on iPhone, iPad and PC/Mac.

Important: do NOT put a `service_role` key in `config.js`.

The app uses Supabase Auth + row-level security so each logged-in studio user sees only their own data.

## Legacy import

Open **Rendszer → Régi localStorage adatok importálása** on a device that still has the old D-Tail app data. In cloud mode the imported data is uploaded to the shared workspace.

## Notes

The local mode remains usable without Supabase, but local mode is device-local by design. For phone/iPad/PC synchronization, configure Supabase cloud mode.

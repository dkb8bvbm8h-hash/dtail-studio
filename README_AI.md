# D-Tail Studio AI PRO

Ez a csomag tartalmazza:
- a D-Tail Studio iPad/PWA frontend teljes verzióját
- D-Tail AI helyi intelligenciát
- valódi OpenAI Responses API backend-et Vercel serverless functionként
- készletfigyelést és üzleti adat-pillanatképet
- biztonságos API-key kezelést környezeti változóval

## 1. Backend
A repository gyökerében:
- `api/chat.js`
- `package.json`
- `vercel.json`

Vercel import után állítsd be:
- `OPENAI_API_KEY` = a saját titkos API-kulcsod
- `OPENAI_MODEL` = `gpt-5.6-luna` (alapértelmezett)

NE tedd a kulcsot az index.html-be vagy GitHubra.

## 2. Frontend
A GitHub Pages-es D-Tail appban a D-Tail AI panel alján van egy:
"AI backend címe" mező.
Ide a Vercel backend teljes címe kell, például:
`https://sajat-dtail-ai.vercel.app/api/chat`

Mentés után a D-Tail AI LIVE módban kommunikál a backenddel.

## 3. Adatkezelés
A frontend csak a kérdéshez szükséges, normalizált üzleti adat-pillanatképet küldi:
- munkalapok
- szolgáltatások
- összegek
- státuszok
- készlet
- összesítések

A kulcs soha nem kerül a böngészőbe.

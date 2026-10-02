# D-Tail Studio ULTIMATE

Teljes D-Tail Studio rendszer:
- Dashboard
- Munkalapok / fizetés / lezárás
- Ügyfelek és több autóhoz kapcsolható előzmények
- Időpontok
- Készlet + minimumszint + piros/sárga/zöld riasztás
- Pénzügyi dashboard + anyagköltség/fedezet
- BEFORE/AFTER fotók
- Munkalap nyomtatás/PDF mentés a böngésző nyomtatási párbeszédéből
- Havi cél
- ügyfélszintek
- JSON backup/restore
- Demo adatok
- D-Tail AI local intelligence
- valódi OpenAI Responses API backend
- iPad/PWA + startup sound

Backend:
1. Vercelben importáld a repót.
2. Environment Variables:
   OPENAI_API_KEY = saját kulcs
   OPENAI_MODEL = gpt-6-luna
3. Deploy.
4. A D-Tail AI oldalon az AI backend URL mezőbe írd a Vercel `/api/chat` URL-jét.

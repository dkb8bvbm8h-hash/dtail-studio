import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `
Te vagy a D-Tail Studio belső AI asszisztense.
A D-Tail Studio prémium autókozmetika / detailing vállalkozás.
Magyarul válaszolj, természetes, tömör, üzleti hangnemben.
A felhasználó a saját D-Tail rendszerének adatait adja át neked.
Ezekből számolj és következtess, de ne találj ki hiányzó adatot.
Pénzügyi számításnál mindig jelezd, ha az adat becslés vagy hiányos.
Készletnél különböztesd meg: RENDBEN, HAMAROSAN RENDELNI, RENDELÉS SZÜKSÉGES.
Adj konkrét, röviden végrehajtható javaslatokat.
Ha ügyféladatot látsz, csak a D-Tail üzleti feladatához szükséges mértékben használd.
Ne állítsd, hogy megtettél valamit, ha csak javaslatot adtál.
`;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) return json(res, 500, { error: "OPENAI_API_KEY nincs beállítva a backendben." });

  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();
    const data = body.data || {};

    if (!question) return json(res, 400, { error: "Hiányzik a kérdés." });

    // Keep the context bounded. The frontend sends a normalized business snapshot.
    const context = JSON.stringify(data).slice(0, 120000);

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "low" },
      instructions: SYSTEM,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `D-Tail üzleti adat-pillanatkép:\n${context}\n\nFelhasználói kérdés:\n${question}`
            }
          ]
        }
      ]
    });

    return json(res, 200, {
      ok: true,
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      answer: response.output_text || "Nem érkezett szöveges válasz."
    });
  } catch (err) {
    console.error(err);
    return json(res, 500, {
      error: "Az AI kérés nem sikerült.",
      detail: err?.message || "Ismeretlen hiba"
    });
  }
}

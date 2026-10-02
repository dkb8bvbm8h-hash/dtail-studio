import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SYSTEM = `Te vagy a D-Tail Studio belső AI üzleti asszisztense. Magyarul válaszolj. A D-Tail egy prémium autókozmetika. A kapott munkalap-, készlet-, ügyfél- és pénzügyi adatból dolgozz. Ne találj ki adatot. Különítsd el a tényt, becslést és javaslatot. Készletnél használd a RENDBEN / HAMAROSAN RENDELNI / RENDELÉS SZÜKSÉGES állapotokat. Válaszolj tömören, konkrétan és végrehajthatóan.`;
function out(res,status,body){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.end(JSON.stringify(body));}
export default async function handler(req,res){
 if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
 if(req.method!=="POST")return out(res,405,{error:"Method not allowed"});
 if(!process.env.OPENAI_API_KEY)return out(res,500,{error:"OPENAI_API_KEY nincs beállítva."});
 try{
  const b=req.body||{},q=String(b.question||"").trim();if(!q)return out(res,400,{error:"Hiányzik a kérdés."});
  const context=JSON.stringify(b.data||{}).slice(0,140000);
  const r=await client.responses.create({model:process.env.OPENAI_MODEL||"gpt-6-luna",instructions:SYSTEM,input:[{role:"user",content:[{type:"input_text",text:`D-Tail adat-pillanatkép:\n${context}\n\nKérdés:\n${q}`}]}]});
  return out(res,200,{ok:true,answer:r.output_text||"Nem érkezett szöveges válasz."});
 }catch(e){console.error(e);return out(res,500,{error:"AI backend hiba",detail:e?.message||"ismeretlen"});}
}

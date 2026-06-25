import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { formatINR } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { getDashboardData } from '@/lib/analytics';
import { tenantHasFeature } from '@/lib/features';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ q: z.string().min(1).max(500) });

async function askGemini(
  qRaw: string,
  d: Awaited<ReturnType<typeof getDashboardData>>
): Promise<{ reply: string; lang: Lang } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'AIzaSy-xxxx' || apiKey.includes('xxxx')) {
    return null;
  }

  try {
    // Model is env-overridable so a Google model retirement (e.g. gemini-1.5-flash
    // was sunset → 404) is a config change, not a code change.
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are the Cafe OS AI Sales Assistant, a helpful, expert Indian Cafe operations co-pilot.
You have access to live analytics data for the user's cafe outlet.
Your task is to answer the user's question accurately and helpfully using the provided live analytics JSON data.
Ground all your responses, sales figures, and inventory details in the provided live analytics data.

Expected Output Format:
Your output MUST be a JSON object matching this schema:
{
  "reply": "Your markdown-formatted response string",
  "lang": "en" | "ml"
}

Formatting rules for "reply":
- Use standard HTML/markdown tags for rendering in the web interface.
- Highlight important metrics, names, and numbers using <b>...</b> tags.
- Highlight recommended actions/tips/next steps using <span class="msg-act">...</span> tags (e.g. <span class="msg-act">Tip: set up a buy-one-get-one promotion.</span>).
- Avoid raw markdown asterisks (like **text**) in the final string; use <b>...</b> instead for consistency.

Language rules for "reply" and "lang":
- Determine the language based on the user's question. If the user asks in Malayalam (or uses Malayalam characters), respond in Malayalam and set "lang" to "ml".
- Otherwise, respond in English (with Indian English context/ Hinglish if appropriate) and set "lang" to "en".`;

    const prompt = `User question: "${qRaw}"

Live Analytics Data:
${JSON.stringify(d, null, 2)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              reply: {
                type: 'string',
                description: 'The response string containing HTML tags like <b> for highlights and <span class="msg-act"> for recommendations.'
              },
              lang: {
                type: 'string',
                enum: ['en', 'ml'],
                description: 'The language of the response.'
              }
            },
            required: ['reply', 'lang']
          }
        }
      })
    });

    if (!response.ok) {
      console.error('Gemini API returned error status:', response.status);
      return null;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Gemini API returned empty text');
      return null;
    }

    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.reply === 'string' && (parsed.lang === 'en' || parsed.lang === 'ml')) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('Failed to query Gemini API:', err);
    return null;
  }
}

/**
 * POST /api/dashboard/assistant — the Owner Dashboard's Sales Assistant.
 *
 * Owner/manager only. Answers are grounded in the SAME live analytics the
 * dashboard renders, so the numbers always agree with the tiles. This is an
 * intentionally deterministic responder; swapping in a Gemini (1.5 Flash) call
 * is a drop-in replacement here — feed `data` as context and return the reply.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // feature gate (G9): the AI assistant is a plan feature (Pro+)
  if (!(await tenantHasFeature(session.tenantId, 'ai_assistant')))
    return NextResponse.json({ error: 'feature_not_in_plan', feature: 'ai_assistant' }, { status: 402 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const data = await getDashboardData(session.outletId);
  const geminiResult = await askGemini(parsed.data.q, data);
  const { reply, lang } = geminiResult || answer(parsed.data.q, data);
  // `lang` tells the client which voice (ml-IN / en-IN) to read the reply with
  return NextResponse.json({ reply, lang });
}

type Lang = 'en' | 'ml';

function answer(qRaw: string, d: Awaited<ReturnType<typeof getDashboardData>>): { reply: string; lang: Lang } {
  const q = qRaw.toLowerCase();
  // any Malayalam codepoint in the question ⇒ answer in Malayalam
  const lang: Lang = /[ഀ-ൿ]/.test(qRaw) ? 'ml' : 'en';
  const r = (en: string, ml: string) => ({ reply: lang === 'ml' ? ml : en, lang });
  // intent match: English regex OR any Malayalam keyword present in the raw text
  const has = (en: RegExp, mlWords: string[]) => en.test(q) || mlWords.some((w) => qRaw.includes(w));

  const { kpi, topItems, hourly, menuQuadrant, lowStock, loyalty } = d;
  const peak = hourly.indexOf(Math.max(...hourly));
  const peakStr = Math.max(...hourly) > 0 ? `${fmtHour(peak)}–${fmtHour((peak + 1) % 24)}` : null;

  // sales / performance
  if (has(/(sales|why|up|down|today|how.*doing|revenue)/, ['വിൽപ്പന', 'വില്പന', 'വരുമാനം', 'ഇന്ന്', 'എങ്ങനെ', 'കച്ചവടം'])) {
    if (kpi.todayOrders === 0)
      return r(
        `No orders have settled today yet, so there's nothing to compare. As soon as the till rings up sales they'll show here — today's total, order count, AOV and footfall all update live.`,
        `ഇന്ന് ഇതുവരെ ഓർഡറുകളൊന്നും സെറ്റിൽ ആയിട്ടില്ല, അതിനാൽ താരതമ്യം ചെയ്യാൻ ഒന്നുമില്ല. ടിൽ വിൽപ്പന തുടങ്ങുമ്പോൾ ഇവിടെ കാണാം — ഇന്നത്തെ ആകെ തുക, ഓർഡർ എണ്ണം, ശരാശരി ബിൽ, ഫുട്ട്ഫാൾ എല്ലാം തത്സമയം അപ്ഡേറ്റ് ആകും.`,
      );
    const dirEn =
      kpi.salesDeltaPct == null ? 'with no prior day to compare against'
        : kpi.salesDeltaPct >= 0 ? `<b>${kpi.salesDeltaPct}% ahead</b> of yesterday`
          : `<b>${Math.abs(kpi.salesDeltaPct)}% behind</b> yesterday`;
    const dirMl =
      kpi.salesDeltaPct == null ? 'താരതമ്യം ചെയ്യാൻ തലേന്നത്തെ ഡാറ്റ ഇല്ല'
        : kpi.salesDeltaPct >= 0 ? `ഇന്നലെയെക്കാൾ <b>${kpi.salesDeltaPct}% മുന്നിൽ</b>`
          : `ഇന്നലെയെക്കാൾ <b>${Math.abs(kpi.salesDeltaPct)}% പിന്നിൽ</b>`;
    return r(
      `Today you've done <b>${formatINR(kpi.todaySalesPaise)}</b> across <b>${kpi.todayOrders}</b> orders (AOV ${formatINR(kpi.aovPaise)}), ${dirEn}.${peakStr ? ` Your strongest hour tends to be <b>${peakStr}</b>.` : ''}${topItems[0] ? ` ${topItems[0].name} is leading the mix.` : ''} <span class="msg-act">Tip: keep an upsell prompt on the hero item at the till.</span>`,
      `ഇന്ന് നിങ്ങൾ <b>${formatINR(kpi.todaySalesPaise)}</b> വിറ്റു, <b>${kpi.todayOrders}</b> ഓർഡറുകളിൽ (ശരാശരി ബിൽ ${formatINR(kpi.aovPaise)}), ${dirMl}.${peakStr ? ` ഏറ്റവും തിരക്കുള്ള സമയം സാധാരണ <b>${peakStr}</b> ആണ്.` : ''}${topItems[0] ? ` ${topItems[0].name} മുന്നിട്ടു നിൽക്കുന്നു.` : ''} <span class="msg-act">നുറുങ്ങ്: ടില്ലിൽ ഹീറോ ഐറ്റത്തിന് ഒരു അപ്സെൽ പ്രോംപ്റ്റ് വെക്കൂ.</span>`,
    );
  }

  // what to promote
  if (has(/(promote|tonight|push|feature|special)/, ['പ്രമോട്ട്', 'പ്രചരിപ്പിക്ക', 'പ്രൊമോഷൻ', 'ഇന്ന് രാത്രി', 'സ്പെഷ്യൽ', 'ഓഫർ'])) {
    const puzzle = menuQuadrant.find((m) => m.quad === 'puzzle');
    const dog = menuQuadrant.find((m) => m.quad === 'dog');
    if (!puzzle && !topItems[0])
      return r(
        `Once a few orders land I can read the menu mix and tell you exactly what to push. Right now there isn't enough sales data to rank items.`,
        `കുറച്ച് ഓർഡറുകൾ വന്നാൽ മെനു മിക്സ് വായിച്ച് എന്ത് പ്രമോട്ട് ചെയ്യണമെന്ന് കൃത്യമായി പറയാം. ഇപ്പോൾ ഐറ്റങ്ങൾ റാങ്ക് ചെയ്യാൻ മതിയായ ഡാറ്റ ഇല്ല.`,
      );
    if (puzzle)
      return r(
        `Feature <b>${puzzle.name}</b> — it's a <b>Puzzle</b> (high margin, low volume), so every extra sale is high-value. Put it on the PWA home${dog ? ` and pair it with <b>${dog.name}</b> to revive a slow line` : ''}.${peakStr ? ` Time the push just before your <b>${peakStr}</b> peak.` : ''} <span class="msg-act">I can draft the PWA banner + a WhatsApp blast.</span>`,
        `<b>${puzzle.name}</b> ഫീച്ചർ ചെയ്യൂ — ഇത് ഒരു <b>Puzzle</b> ആണ് (ഉയർന്ന മാർജിൻ, കുറഞ്ഞ വിൽപ്പന), അതിനാൽ ഓരോ അധിക വിൽപ്പനയും വിലപ്പെട്ടതാണ്. PWA ഹോമിൽ വെക്കൂ${dog ? `, ഒപ്പം <b>${dog.name}</b> ചേർത്ത് മന്ദഗതിയിലുള്ള ഒരു ലൈൻ ഉണർത്തൂ` : ''}.${peakStr ? ` <b>${peakStr}</b> പീക്കിന് തൊട്ടുമുമ്പ് പ്രമോട്ട് ചെയ്യൂ.` : ''} <span class="msg-act">PWA ബാനറും WhatsApp സന്ദേശവും ഞാൻ തയ്യാറാക്കാം.</span>`,
      );
    return r(
      `Lean on <b>${topItems[0]!.name}</b> tonight — it already has momentum, so a small "today only" nudge converts well. <span class="msg-act">I can draft the PWA banner.</span>`,
      `ഇന്ന് രാത്രി <b>${topItems[0]!.name}</b>-ൽ ശ്രദ്ധിക്കൂ — ഇതിന് ഇതിനകം മൊമെന്റം ഉണ്ട്, ഒരു ചെറിയ "ഇന്ന് മാത്രം" ഓഫർ നന്നായി കൺവേർട്ട് ചെയ്യും. <span class="msg-act">PWA ബാനർ ഞാൻ തയ്യാറാക്കാം.</span>`,
    );
  }

  // win-back / loyalty
  if (has(/(win|back|lapsed|loyal|retain|repeat|customer)/, ['ഉപഭോക്താ', 'കസ്റ്റമർ', 'തിരികെ', 'തിരിച്ച്', 'ലോയൽറ്റി', 'വിശ്വസ്ത'])) {
    return r(
      `You have <b>${loyalty.customers}</b> known customers, ${loyalty.repeatPct}% of them repeat visitors, holding <b>${loyalty.pointsLiability.toLocaleString('en-IN')} points</b> in outstanding liability. A targeted WhatsApp win-back to lapsed Gold guests typically recovers ~40%. <span class="msg-act">Draft: "We miss you ☕ Here's ₹50 off — valid 7 days."</span>`,
      `നിങ്ങൾക്ക് <b>${loyalty.customers}</b> അറിയാവുന്ന ഉപഭോക്താക്കളുണ്ട്, അവരിൽ ${loyalty.repeatPct}% ആവർത്തിച്ച് വരുന്നവർ, <b>${loyalty.pointsLiability.toLocaleString('en-IN')} പോയിന്റ്</b> ബാക്കിയുണ്ട്. ലാപ്സായ ഗോൾഡ് ഉപഭോക്താക്കൾക്ക് WhatsApp വിൻ-ബാക്ക് സാധാരണ ~40% തിരികെ കൊണ്ടുവരും. <span class="msg-act">ഡ്രാഫ്റ്റ്: "നിങ്ങളെ മിസ് ചെയ്യുന്നു ☕ ₹50 ഓഫ് — 7 ദിവസം സാധു."</span>`,
    );
  }

  // inventory
  if (has(/(stock|inventory|reorder|ingredient|low)/, ['സ്റ്റോക്ക്', 'സാധനം', 'സാധനങ്ങൾ', 'ഇൻവെന്ററി', 'റീഓർഡർ', 'തീർന്നു'])) {
    if (lowStock.length === 0)
      return r(
        `Inventory looks healthy — nothing is at or below its reorder level right now.`,
        `ഇൻവെന്ററി ആരോഗ്യകരമാണ് — ഇപ്പോൾ ഒന്നും റീഓർഡർ ലെവലിന് താഴെയല്ല.`,
      );
    const names = lowStock.map((s) => `<b>${s.name}</b> (${s.qty})`).join(', ');
    return r(
      `${lowStock.length} item${lowStock.length === 1 ? '' : 's'} need attention: ${names}. <span class="msg-act">I can raise a draft purchase order for these.</span>`,
      `${lowStock.length} സാധന${lowStock.length === 1 ? 'ത്തിന്' : 'ങ്ങൾക്ക്'} ശ്രദ്ധ വേണം: ${names}. <span class="msg-act">ഇവയ്ക്ക് ഒരു ഡ്രാഫ്റ്റ് പർച്ചേസ് ഓർഡർ ഞാൻ ഉണ്ടാക്കാം.</span>`,
    );
  }

  // busiest time
  if (has(/(busy|peak|hour|when|time|rush|staff|roster)/, ['തിരക്ക്', 'പീക്ക്', 'സമയം', 'എപ്പോൾ', 'റഷ്', 'സ്റ്റാഫ്'])) {
    if (!peakStr)
      return r(
        `Not enough order history yet to spot a reliable peak. Check back after a full day of trade.`,
        `വിശ്വസനീയമായ പീക്ക് കണ്ടെത്താൻ മതിയായ ഓർഡർ ചരിത്രം ഇല്ല. ഒരു ദിവസത്തെ വ്യാപാരത്തിന് ശേഷം പരിശോധിക്കൂ.`,
      );
    return r(
      `Over the last 7 days your busiest window is <b>${peakStr}</b>. Schedule your strongest staff and finish prep just before it. <span class="msg-act">I can suggest a roster around that peak.</span>`,
      `കഴിഞ്ഞ 7 ദിവസത്തിൽ നിങ്ങളുടെ ഏറ്റവും തിരക്കുള്ള സമയം <b>${peakStr}</b> ആണ്. മികച്ച സ്റ്റാഫിനെ നിയോഗിക്കൂ, അതിന് തൊട്ടുമുമ്പ് പ്രെപ് പൂർത്തിയാക്കൂ. <span class="msg-act">ആ പീക്കിന് ചുറ്റും ഒരു റോസ്റ്റർ നിർദ്ദേശിക്കാം.</span>`,
    );
  }

  // fallback
  return r(
    `Here's the snapshot: <b>${formatINR(kpi.todaySalesPaise)}</b> today across ${kpi.todayOrders} orders, AOV ${formatINR(kpi.aovPaise)}, footfall ${kpi.footfall}. Ask me about <b>sales</b>, <b>what to promote</b>, <b>win-back</b>, <b>inventory</b>, or your <b>busiest hours</b>.`,
    `ചുരുക്കം: ഇന്ന് <b>${formatINR(kpi.todaySalesPaise)}</b>, ${kpi.todayOrders} ഓർഡറുകൾ, ശരാശരി ബിൽ ${formatINR(kpi.aovPaise)}, ഫുട്ട്ഫാൾ ${kpi.footfall}. <b>വിൽപ്പന</b>, <b>എന്ത് പ്രമോട്ട് ചെയ്യണം</b>, <b>വിൻ-ബാക്ക്</b>, <b>ഇൻവെന്ററി</b>, അല്ലെങ്കിൽ <b>തിരക്കുള്ള സമയം</b> എന്നിവയെക്കുറിച്ച് ചോദിക്കൂ.`,
  );
}

const fmtHour = (h: number) =>
  h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

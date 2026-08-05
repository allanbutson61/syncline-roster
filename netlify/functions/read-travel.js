/* ============================================================
   read-travel

   Reads an FMG travel email or PDF and returns the movements
   as JSON.

   The API key stays here on the server and is never sent to the
   browser. Set it in Netlify under:
     Site configuration -> Environment variables -> ANTHROPIC_API_KEY
   Then redeploy.
   ============================================================ */

const INSTRUCTION = [
  "You extract FIFO travel movements for an Australian mine site workforce from the message below.",
  "",
  "Return ONLY a JSON array and nothing else - no markdown fences, no explanation.",
  "Each element must be:",
  '{"name": string, "date": "YYYY-MM-DD", "direction": "IN" or "OUT",',
  '"period": "AM" or "PM", "mode": "FLY" or "DRIVE", "flight": string or null,',
  '"confirmed": true or false}',
  "",
  "Rules:",
  "1. DATES ARE AUSTRALIAN: day/month/year. 02/12/2026 is 2 December 2026, NOT 12 February.",
  "   Always return the date as YYYY-MM-DD.",
  "2. The person's name may appear only once, often in a Description or Subject line",
  "   (for example 'Reschedule, Colin RADONICH'). Apply that name to every movement in",
  "   the message unless a different name is clearly given for a particular movement.",
  "3. IN means travelling to site. OUT means travelling home.",
  "4. AM or PM comes from the DEPARTURE time of that leg. 0600 is AM, 1430 is PM.",
  "   If no time is given, use AM for IN and PM for OUT.",
  "5. Accommodation lines are NOT movements. Ignore anything describing a camp or village",
  "   stay, such as 'Flying Fish (FF) from 02/12/2026 to 16/12/2026'. Only actual flights",
  "   or drives count.",
  "6. Mode is FLY for a plane or flight number, DRIVE for a vehicle or self drive.",
  "7. confirmed is true when the line says confirmed, ticketed or issued. It is false when",
  "   it says waitlisted, pending, requested or to be confirmed.",
  "8. Put the flight number in 'flight' when there is one, for example QF2920.",
  "9. If there are no movements, return [].",
].join("\n");

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Send a POST request." }, 405);

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    return json({ error: "Email reading is not switched on. Add ANTHROPIC_API_KEY in the Netlify environment variables, then redeploy." }, 501);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }

  const { text, pdf } = body || {};
  if (!text && !pdf) return json({ error: "Send either the email text or a PDF." }, 400);

  const content = pdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
        { type: "text", text: INSTRUCTION },
      ]
    : INSTRUCTION + "\n\n--- MESSAGE ---\n" + text;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic API error", res.status, detail);
      if (res.status === 401) {
        return json({ error: "The API key was rejected. Check ANTHROPIC_API_KEY in Netlify - no spaces or line breaks, starts with sk-ant- - then redeploy." }, 502);
      }
      if (res.status === 400 && detail.includes("model")) {
        return json({ error: "That model name is not available on this account. Tell Claude and it will change it." }, 502);
      }
      if (res.status === 429) {
        return json({ error: "Rate limited or out of credit on the Anthropic account. Try again shortly or top up." }, 502);
      }
      return json({ error: `The reading service returned an error (${res.status}). Use manual entry for now.` }, 502);
    }

    const data = await res.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    let movements;
    try {
      movements = JSON.parse(clean);
    } catch {
      console.error("Unparseable response", clean.slice(0, 500));
      return json({ error: "Could not make sense of that message. Try the manual entry." }, 422);
    }
    if (!Array.isArray(movements)) {
      return json({ error: "Could not make sense of that message. Try the manual entry." }, 422);
    }

    return json({ movements });
  } catch (e) {
    console.error(e);
    return json({ error: "Could not reach the reading service. Check the site is online." }, 502);
  }
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/read-travel" };

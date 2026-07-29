/* ============================================================
   read-travel

   Reads a travel email and returns the movements as JSON.

   The API key stays here on the server. It is never sent to the
   browser. Set it in Netlify under:
     Site configuration → Environment variables → ANTHROPIC_API_KEY

   Until that variable is set this returns a clear message and
   the app falls back to manual travel entry.
   ============================================================ */

const INSTRUCTION =
  "Extract every FIFO travel movement for a mine site workforce from the message below. " +
  "Return ONLY a JSON array and nothing else — no markdown fences, no explanation. " +
  'Each element: {"name": string exactly as written, "date": "YYYY-MM-DD", ' +
  '"direction": "IN" or "OUT", "period": "AM" or "PM" or null, ' +
  '"mode": "FLY" or "DRIVE" or null, "flight": string or null, "confirmed": true or false}. ' +
  "IN means travelling to site, OUT means travelling home. Treat a booking described as " +
  "confirmed, ticketed or issued as confirmed:true; treat waitlisted, pending or " +
  "to-be-confirmed as confirmed:false. If the year is missing assume the current year. " +
  "If there are no movements return [].";

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Send a POST request." }, 405);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return json(
      { error: "Email reading isn't switched on yet. Add ANTHROPIC_API_KEY in the Netlify environment variables, then redeploy." },
      501
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }

  const { text, pdf } = body || {};
  if (!text && !pdf) {
    return json({ error: "Send either the email text or a PDF." }, 400);
  }

  const content = pdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
        { type: "text", text: INSTRUCTION },
      ]
    : INSTRUCTION + "\n\n---\n" + text;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Anthropic API error", res.status, detail);
      return json({ error: `The reading service returned an error (${res.status}).` }, 502);
    }

    const data = await res.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = raw.replace(/```json|```/g, "").trim();

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

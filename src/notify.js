/* ============================================================
   notify

   Emails the administrators when a leave entry affects travel,
   or when site crew raise a travel change request.

   Netlify → Project configuration → Environment variables:

     RESEND_API_KEY   a key from resend.com
     NOTIFY_FROM      e.g. roster@notify.synclinehaulage.com.au
                      the domain must be verified with Resend
     NOTIFY_TO        comma separated administrator addresses

   Until those are set this returns 501 and the app records the
   action on screen without sending anything. Nothing breaks.
   ============================================================ */

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Send a POST request." }, 405);

  const key = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.NOTIFY_FROM || "").trim();
  const to = (process.env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  /* the app asks whether email is switched on, so it can say so on screen */
  if (body.check) {
    const missing = [];
    if (!key) missing.push("RESEND_API_KEY");
    if (!from) missing.push("NOTIFY_FROM");
    if (!to.length) missing.push("NOTIFY_TO");
    return json({ configured: missing.length === 0, missing, from, to });
  }

  if (!key || !from || !to.length) {
    const missing = [!key && "RESEND_API_KEY", !from && "NOTIFY_FROM", !to.length && "NOTIFY_TO"]
      .filter(Boolean).join(", ");
    return json({ error: `Email is not configured. Missing in Netlify: ${missing}.` }, 501);
  }

  const subject = body.test ? "Test message" : body.subject;
  const text = body.test
    ? `This is a test from Syncline Roster Control.\n\nIf you are reading this, email notifications are working. `
      + `Travel actions and travel change requests will arrive at this address.\n\nSent by ${body.by || "an administrator"}.`
    : body.body;

  if (!subject || !text) return json({ error: "Missing subject or body." }, 400);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from, to,
        subject: `[Syncline Roster] ${subject}`,
        text: `${text}\n\n—\nSent by Syncline Roster Control.\nhttps://syncline-roster.netlify.app`,
      }),
    });

    const detail = await res.text();
    if (!res.ok) {
      console.error("Resend error", res.status, detail);
      if (res.status === 401 || res.status === 403)
        return json({ error: "Resend rejected the API key. Check RESEND_API_KEY in Netlify." }, 502);
      if (/domain is not verified|not verified/i.test(detail))
        return json({ error: `The sending domain in NOTIFY_FROM (${from}) is not verified with Resend yet.` }, 502);
      if (/you can only send testing emails/i.test(detail))
        return json({ error: "Resend will only send to your own address until a domain is verified. Verify the domain, then try again." }, 502);
      return json({ error: `The email service returned an error (${res.status}). ${detail.slice(0, 200)}` }, 502);
    }
    return json({ sent: true, to });
  } catch (e) {
    console.error(e);
    return json({ error: "Could not reach the email service." }, 502);
  }
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { path: "/api/notify" };

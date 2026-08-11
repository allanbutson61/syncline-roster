/* ============================================================
   notify

   Emails the administrator when a leave entry affects travel,
   or when site crew raise a travel change request.

   To switch it on, set these in Netlify under
   Site configuration -> Environment variables:

     RESEND_API_KEY    a key from resend.com
     NOTIFY_FROM       e.g. roster@synclinehaulage.com.au
                       (the domain must be verified with Resend)
     NOTIFY_TO         comma separated list of administrator
                       email addresses

   Until those are set this returns 501 and the app records the
   action on screen without sending anything. Nothing breaks.
   ============================================================ */

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Send a POST request." }, 405);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM;
  const to = (process.env.NOTIFY_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!key || !from || !to.length) {
    return json({ error: "Email is not configured. Set RESEND_API_KEY, NOTIFY_FROM and NOTIFY_TO in Netlify." }, 501);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Could not read the request." }, 400);
  }

  const { subject, body: text } = body || {};
  if (!subject || !text) return json({ error: "Missing subject or body." }, 400);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to,
        subject: `[Syncline Roster] ${subject}`,
        text: `${text}\n\n—\nSent by Syncline Roster Control.`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Resend error", res.status, detail);
      return json({ error: `The email service returned an error (${res.status}).` }, 502);
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

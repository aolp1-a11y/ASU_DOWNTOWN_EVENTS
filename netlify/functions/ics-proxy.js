// Proxies /ics-proxy/* to Sun Devil Central in production
export async function handler(event) {
  // Map /.netlify/functions/ics-proxy/<path> → https://sundevilcentral.eoss.asu.edu/<path>
  const path = event.path.replace(/^\/.netlify\/functions\/ics-proxy/, "");
  const target = `https://sundevilcentral.eoss.asu.edu${path}`;

  const r = await fetch(target, {
    headers: { Accept: "text/calendar, text/plain;q=0.9,*/*;q=0.8" },
  });

  const body = await r.text();
  return {
    statusCode: r.status,
    headers: {
      "content-type": r.headers.get("content-type") || "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
    body,
  };
}

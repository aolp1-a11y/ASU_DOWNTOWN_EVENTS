// Netlify function: proxy /ics-proxy/* to Sun Devil Central
export async function handler(event) {
  const path = event.path.replace(/^\/.netlify\/functions\/ics-proxy/, "");
  const qs = event.rawQuery ? `?${event.rawQuery}` : "";
  const target = `https://sundevilcentral.eoss.asu.edu${path}${qs}`;

  try {
    const r = await fetch(target, {
      redirect: "follow",
      headers: {
        // look like a normal browser hitting the site
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/calendar, text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
        // some CampusGroups endpoints return HTML unless there's a referer
        "Referer": "https://sundevilcentral.eoss.asu.edu/events",
      },
    });

    const contentType = r.headers.get("content-type") || "";
    const text = await r.text();

    // If origin returned an HTML error page, pass that through as text
    const headers = {
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    };

    if (/text\/calendar/i.test(contentType) || text.startsWith("BEGIN:VCALENDAR")) {
      return {
        statusCode: r.status,
        headers: { ...headers, "content-type": "text/calendar; charset=utf-8" },
        body: text,
      };
    } else {
      // return what we got so the frontend can detect/fallback
      return {
        statusCode: r.status,
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
        body: text,
      };
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: `Proxy error fetching ${target}\n${String(err)}`,
    };
  }
}

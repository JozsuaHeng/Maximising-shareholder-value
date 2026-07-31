// Cloudflare Pages Function — same idea as functions/api/finnhub.js, but
// for Twelve Data (used only for the price chart). Holds
// TWELVE_DATA_API_KEY server-side as a Cloudflare secret.
//
// Called like: /api/twelvedata?path=/time_series&symbol=AAPL&interval=1day
// Forwards to: https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&apikey=<secret>

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path");

  if (!path) {
    return new Response(JSON.stringify({ error: "Missing 'path' parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = context.env.TWELVE_DATA_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ status: "error", message: "TWELVE_DATA_API_KEY not configured on the server" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  url.searchParams.delete("path");
  url.searchParams.set("apikey", key);

  const targetUrl = `https://api.twelvedata.com${path}?${url.searchParams.toString()}`;

  try {
    const res = await fetch(targetUrl);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: "Upstream request failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

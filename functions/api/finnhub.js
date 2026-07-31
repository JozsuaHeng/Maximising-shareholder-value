// Cloudflare Pages Function — runs on Cloudflare's servers, not in the
// browser. Its whole job is to hold FINNHUB_API_KEY server-side (set as a
// secret in the Cloudflare Pages dashboard, never committed to git) and
// attach it to the real Finnhub request, so the key never appears in
// anything the browser can see.
//
// Called like: /api/finnhub?path=/quote&symbol=AAPL
// Forwards to: https://finnhub.io/api/v1/quote?symbol=AAPL&token=<secret>

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path");

  if (!path) {
    return new Response(JSON.stringify({ error: "Missing 'path' parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = context.env.FINNHUB_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "FINNHUB_API_KEY not configured on the server" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  url.searchParams.delete("path");
  url.searchParams.set("token", key);

  const targetUrl = `https://finnhub.io/api/v1${path}?${url.searchParams.toString()}`;

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
    return new Response(JSON.stringify({ error: "Upstream request failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

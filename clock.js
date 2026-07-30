// Live clock: your local time (from the browser's own timezone setting —
// no network call needed, more reliable than IP-based geolocation) plus a
// simple NYSE market-hours countdown. US market holidays are NOT accounted
// for (that would need a maintained holiday calendar) — the countdown can
// be off by a day around holidays like Thanksgiving or July 4th.
//
// City/country (below the clock) IS looked up via a free IP-geolocation
// API (ipwho.is) — that one genuinely needs a network call, and reflects
// wherever the browser's connection is actually exiting from (can be off
// if you're on a VPN).

const clockTimeEl = document.getElementById("clockTime");
const clockMetaEl = document.getElementById("clockMeta");
const clockLocationEl = document.getElementById("clockLocation");

function nextMarketOpen(nyNow) {
  const candidate = new Date(nyNow);
  candidate.setHours(9, 30, 0, 0);
  if (candidate <= nyNow) candidate.setDate(candidate.getDate() + 1);
  while ([0, 6].includes(candidate.getDay())) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

function getMarketStatus() {
  const now = new Date();
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nyNow.getDay();
  const minutesNow = nyNow.getHours() * 60 + nyNow.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isDuringHours = minutesNow >= 570 && minutesNow < 960; // 9:30am–4:00pm

  if (isWeekday && isDuringHours) {
    const close = new Date(nyNow);
    close.setHours(16, 0, 0, 0);
    const diffMin = Math.round((close - nyNow) / 60000);
    return { status: "open", label: `Market open · closes in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m` };
  }

  const open = nextMarketOpen(nyNow);
  const diffMin = Math.round((open - nyNow) / 60000);
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const sameDay = open.toDateString() === nyNow.toDateString();
  const dayLabel = sameDay ? "today" : open.toLocaleDateString("en-US", { weekday: "long" });
  return { status: "closed", label: `Market closed · opens ${dayLabel} in ${h}h ${m}m` };
}

function tzAbbreviation(date) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(date).find(p => p.type === "timeZoneName");
    return part ? part.value : "";
  } catch {
    return "";
  }
}

function tickClock() {
  const now = new Date();
  clockTimeEl.textContent = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tz = tzAbbreviation(now);
  const market = getMarketStatus();
  clockMetaEl.textContent = `${tz} · ${market.label}`;
  clockMetaEl.className = "clock-meta " + (market.status === "open" ? "positive" : "");
}

async function initLocation() {
  try {
    const res = await fetch("https://ipwho.is/");
    const data = await res.json();
    if (data && data.success && data.city) {
      clockLocationEl.textContent = `${data.city}, ${data.country}`;
      clockLocationEl.classList.remove("hidden");
    }
  } catch {
    // Silent — some networks block this; the clock itself doesn't depend on it.
  }
}

tickClock();
setInterval(tickClock, 1000);
initLocation();

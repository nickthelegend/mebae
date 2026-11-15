/**
 * Request caps for the coach. In-memory per function instance: Vercel may run
 * several instances, so the true ceiling is (instances × cap). That is the
 * documented trade-off for a zero-dependency proxy; the daily cap is the
 * spend guard, the per-IP window stops one client from draining it.
 */
export class Limiter {
  constructor({ perMinute = 8, perIpDay = 60, globalDay = 400, now = () => Date.now() } = {}) {
    this.perMinute = perMinute;
    this.perIpDay = perIpDay;
    this.globalDay = globalDay;
    this.now = now;
    this.day = '';
    this.global = 0;
    this.ips = new Map();
  }

  /** Returns null if allowed (and counts it), or { error, message, retryAfter }. */
  take(ip) {
    const t = this.now();
    const day = new Date(t).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.global = 0;
      this.ips.clear();
    }
    if (this.global >= this.globalDay)
      return { error: 'daily_cap', message: 'The coach has reached its daily request cap. It resets at 00:00 UTC.', retryAfter: secondsToMidnight(t) };
    const rec = this.ips.get(ip) ?? { day: 0, recent: [] };
    rec.recent = rec.recent.filter((x) => t - x < 60_000);
    if (rec.day >= this.perIpDay)
      return { error: 'rate_limited', message: 'Too many coach requests from this device today.', retryAfter: secondsToMidnight(t) };
    if (rec.recent.length >= this.perMinute)
      return { error: 'rate_limited', message: 'Too many coach requests in a minute. Wait a moment.', retryAfter: Math.ceil((60_000 - (t - rec.recent[0])) / 1000) };
    rec.recent.push(t);
    rec.day++;
    this.ips.set(ip, rec);
    this.global++;
    return null;
  }
}

function secondsToMidnight(t) {
  const d = new Date(t);
  return Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t) / 1000);
}

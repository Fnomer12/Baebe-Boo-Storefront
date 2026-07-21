type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let requestsSinceSweep = 0;

function sweepExpiredBuckets(now: number) {
  requestsSinceSweep += 1;
  if (requestsSinceSweep < 100) return;
  requestsSinceSweep = 0;
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
}

export function rateLimit(
  request: Request,
  key: string,
  limit: number,
  windowMs: number
) {
  const ip =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  sweepExpiredBuckets(now);
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  const allowed = current.count <= limit;

  return {
    allowed,
    retryAfter: Math.ceil((current.resetAt - now) / 1000),
  };
}

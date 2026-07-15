export const isConvexId = (value: string) => /^[a-z0-9]{32}$/.test(value);

export const parsePublicLimit = (request: Request, fallback: number, maximum = 100) => {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw Object.assign(new Error("limit must be a positive integer."), { code: "invalid_request" });
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw Object.assign(new Error("limit is too large."), { code: "invalid_request" });
  }
  return Math.min(parsed, maximum);
};

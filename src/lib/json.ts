const jsonValue = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(jsonValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]),
    );
  }
  return value;
};

export const toJsonValue = <Value>(value: Value) => jsonValue(value);

export const jsonResponse = (value: unknown, init?: ResponseInit) =>
  Response.json(toJsonValue(value), init);

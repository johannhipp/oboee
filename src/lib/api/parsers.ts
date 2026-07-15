import {
  parsePositiveBaseUnits,
  parseTokenAmount,
} from "../../../shared/domain/money";
import { normalizeTags } from "../../../shared/domain/strings";
import type { RfsStatus } from "../../../shared/domain/status";
import { HttpProblem } from "./http";

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const readJsonObject = async (request: Request) => {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpProblem(
      "INVALID_JSON",
      "Request body must be valid JSON.",
      400,
    );
  }
  if (!isObject(value)) {
    throw new HttpProblem(
      "INVALID_ARGUMENT",
      "Request body must be a JSON object.",
      400,
    );
  }
  return value;
};

const requiredString = (
  object: Record<string, unknown>,
  field: string,
  message = `${field} must be a string.`,
) => {
  const value = object[field];
  if (typeof value !== "string") {
    throw new HttpProblem("INVALID_ARGUMENT", message, 400);
  }
  return value;
};

const requiredStringArray = (
  object: Record<string, unknown>,
  field: string,
) => {
  const value = object[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpProblem(
      "INVALID_ARGUMENT",
      `${field} must be an array of strings.`,
      400,
    );
  }
  return value;
};

const requiredPositiveBaseUnits = (
  object: Record<string, unknown>,
  field: string,
) => {
  const value = requiredString(
    object,
    field,
    `${field} must be a positive integer string.`,
  );
  const parsed = parsePositiveBaseUnits(value);
  if (parsed === null) {
    throw new HttpProblem(
      "INVALID_ARGUMENT",
      `${field} must be a positive integer string.`,
      400,
    );
  }
  return parsed;
};

export const parseCreateRfsRequest = async (request: Request) => {
  const body = await readJsonObject(request);
  return {
    title: requiredString(body, "title"),
    description: requiredString(body, "description"),
    scope: requiredString(body, "scope"),
    tags: normalizeTags(requiredStringArray(body, "tags")),
    fundingThresholdBaseUnits: requiredPositiveBaseUnits(
      body,
      "fundingThresholdBaseUnits",
    ),
    minimumContributionBaseUnits: requiredPositiveBaseUnits(
      body,
      "minimumContributionBaseUnits",
    ),
  };
};

export const parseSubmitSkillRequest = async (request: Request) => {
  const body = await readJsonObject(request);
  return {
    contentMarkdown: requiredString(body, "contentMarkdown"),
    summary: requiredString(body, "summary"),
    tags: normalizeTags(requiredStringArray(body, "tags")),
    purchasePriceBaseUnits: requiredPositiveBaseUnits(
      body,
      "purchasePriceBaseUnits",
    ),
  };
};

export const parseFundRequest = async (request: Request) => {
  const body = await readJsonObject(request);
  const amount = requiredString(
    body,
    "amount",
    "amount must be a positive decimal string.",
  );
  const amountBaseUnits = parseTokenAmount(amount);
  if (amountBaseUnits === null || amountBaseUnits <= BigInt(0)) {
    throw new HttpProblem(
      "INVALID_ARGUMENT",
      "amount must be a positive decimal string.",
      400,
    );
  }
  return { amount, amountBaseUnits };
};

export const parseWalletRequest = async (request: Request) => {
  const body = await readJsonObject(request);
  return { walletAddress: requiredString(body, "walletAddress") };
};

export const readTagParams = (searchParams: URLSearchParams) => {
  const tags = normalizeTags(
    searchParams.getAll("tags").flatMap((value) => value.split(",")),
  );
  return tags.length > 0 ? tags : undefined;
};

const readStatus = (value: string | null): RfsStatus | undefined => {
  if (value === null) {
    return undefined;
  }
  if (value === "open" || value === "funded" || value === "published") {
    return value;
  }
  throw new HttpProblem("INVALID_STATUS", "status filter is invalid.", 400);
};

export const parseMarketplaceQuery = (url: string) => {
  const searchParams = new URL(url).searchParams;
  const rawLimit = searchParams.get("limit");
  let limit: number | undefined;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new HttpProblem(
        "INVALID_PAGINATION",
        "limit must be an integer from 1 to 50.",
        400,
      );
    }
  }
  return {
    status: readStatus(searchParams.get("status")),
    q: searchParams.get("q") ?? undefined,
    authorId: searchParams.get("authorId") ?? undefined,
    tags: readTagParams(searchParams),
    cursor: searchParams.get("cursor") ?? undefined,
    limit,
  };
};

export const requireIdempotencyKey = (headers: Headers) => {
  const value = headers.get("Idempotency-Key")?.trim();
  if (!value) {
    throw new HttpProblem(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key is required.",
      400,
    );
  }
  return value;
};

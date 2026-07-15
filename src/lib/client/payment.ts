import { buildTempoPaymentCommand } from "../payment-command";

export type PaymentInstruction = {
  command: string;
  intent: "fund" | "purchase";
};

type PaymentRequest = {
  intent: PaymentInstruction["intent"];
  method: "GET" | "POST";
  url: string;
  jsonBody?: Record<string, string>;
};

export const paymentInstructionFromResponse = (
  response: Response,
  request: PaymentRequest,
): PaymentInstruction | null => {
  if (response.status !== 402) {
    return null;
  }
  const challenge = response.headers.get("WWW-Authenticate");
  if (!challenge) {
    throw new Error("The payment service returned an invalid challenge.");
  }
  return {
    intent: request.intent,
    command: buildTempoPaymentCommand({
      challenge,
      method: request.method,
      url: request.url,
      ...(request.jsonBody ? { jsonBody: request.jsonBody } : {}),
    }),
  };
};

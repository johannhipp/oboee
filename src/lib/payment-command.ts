import { TEMPO_MODERATO_RPC_URL } from "./tempo";

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

interface PaymentCommandOptions {
  challenge: string;
  method: "GET" | "POST";
  url: string;
  jsonBody?: Record<string, string>;
}

export const buildTempoPaymentCommand = ({
  challenge,
  method,
  url,
  jsonBody,
}: PaymentCommandOptions) => {
  const curlParts = [
    "curl --fail-with-body --silent --show-error",
    `-X ${method}`,
    shellQuote(url),
    '-H "Authorization: $AUTHORIZATION"',
  ];
  if (jsonBody) {
    curlParts.push("-H 'Content-Type: application/json'");
    curlParts.push(`--data ${shellQuote(JSON.stringify(jsonBody))}`);
  }

  return [
    ': "${MPPX_ACCOUNT:?Set MPPX_ACCOUNT to an explicitly selected Tempo Moderato account}"',
    `AUTHORIZATION=$(./node_modules/.bin/mppx sign --account "$MPPX_ACCOUNT" --rpc-url ${shellQuote(TEMPO_MODERATO_RPC_URL)} --challenge ${shellQuote(challenge)})`,
    curlParts.join(" \\\n  "),
  ].join("\n");
};

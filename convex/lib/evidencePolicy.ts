export type ScannerResult = {
  malwareDetected: boolean;
  contentTypeMatches: boolean;
  reportReference: string;
};

export const scannerState = (result: ScannerResult) =>
  result.malwareDetected || !result.contentTypeMatches ? "quarantined" as const : "clean" as const;

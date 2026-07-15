type SubmittableStatus = "open" | "funded" | "published";

export const canSubmitRfs = (
  rfs: { claimantUserId?: string; status: SubmittableStatus },
  viewerUserId: string | undefined,
) =>
  Boolean(
    viewerUserId &&
      rfs.claimantUserId === viewerUserId &&
      rfs.status === "funded",
  );

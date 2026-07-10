export type TransitionTable<State extends string, Event extends string> = Readonly<
  Partial<Record<State, Readonly<Partial<Record<Event, State>>>>>
>;

const transition = <State extends string, Event extends string>(
  table: TransitionTable<State, Event>,
  state: State,
  event: Event,
) => table[state]?.[event] ?? null;

export const rfsStates = [
  "draft",
  "funding_open",
  "application_open",
  "assignment_provisional",
  "assigned",
  "submitted",
  "evaluation_open",
  "revision_open",
  "human_review",
  "finalized",
  "cancelled",
] as const;
export type RfsState = (typeof rfsStates)[number];
export const rfsEvents = [
  "publish",
  "cancel",
  "funded",
  "funding_expired",
  "applications_closed",
  "assignment_confirmed",
  "assignment_rejected",
  "submission_received",
  "evaluation_opened",
  "revision_requested",
  "human_review_required",
  "decision_finalized",
] as const;
export type RfsEvent = (typeof rfsEvents)[number];

export const rfsTransitions: TransitionTable<RfsState, RfsEvent> = {
  draft: { publish: "funding_open", cancel: "cancelled" },
  funding_open: { funded: "application_open", funding_expired: "cancelled", cancel: "cancelled" },
  application_open: { applications_closed: "assignment_provisional", cancel: "cancelled" },
  assignment_provisional: { assignment_confirmed: "assigned", assignment_rejected: "application_open", cancel: "cancelled" },
  assigned: { submission_received: "submitted", human_review_required: "human_review", cancel: "cancelled" },
  submitted: { evaluation_opened: "evaluation_open" },
  evaluation_open: { revision_requested: "revision_open", human_review_required: "human_review", decision_finalized: "finalized" },
  revision_open: { submission_received: "evaluation_open", human_review_required: "human_review", decision_finalized: "finalized" },
  human_review: { revision_requested: "revision_open", decision_finalized: "finalized" },
};

export const transitionRfs = (state: RfsState, event: RfsEvent) =>
  transition(rfsTransitions, state, event);

export const assessmentStates = ["pending", "evaluating", "held", "human_review", "finalized"] as const;
export type AssessmentState = (typeof assessmentStates)[number];
export const assessmentEvents = ["open", "hold", "assign_human", "clear_hold", "finalize"] as const;
export type AssessmentEvent = (typeof assessmentEvents)[number];
export const assessmentTransitions: TransitionTable<AssessmentState, AssessmentEvent> = {
  pending: { open: "evaluating" },
  evaluating: { hold: "held", assign_human: "human_review", finalize: "finalized" },
  held: { assign_human: "human_review" },
  human_review: { clear_hold: "evaluating", finalize: "finalized" },
};
export const transitionAssessment = (state: AssessmentState, event: AssessmentEvent) =>
  transition(assessmentTransitions, state, event);

export const disputeStates = ["open", "assigned", "resolved"] as const;
export type DisputeState = (typeof disputeStates)[number];
export const disputeEvents = ["assign", "resolve"] as const;
export type DisputeEvent = (typeof disputeEvents)[number];
export const disputeTransitions: TransitionTable<DisputeState, DisputeEvent> = {
  open: { assign: "assigned" },
  assigned: { resolve: "resolved" },
};
export const transitionDispute = (state: DisputeState, event: DisputeEvent) =>
  transition(disputeTransitions, state, event);

export const obligationStates = ["pending", "held", "queued", "settled", "cancelled"] as const;
export type ObligationState = (typeof obligationStates)[number];
export const obligationEvents = ["hold", "release", "queue", "settle", "cancel"] as const;
export type ObligationEvent = (typeof obligationEvents)[number];
export const obligationTransitions: TransitionTable<ObligationState, ObligationEvent> = {
  pending: { hold: "held", queue: "queued", cancel: "cancelled" },
  held: { release: "pending", cancel: "cancelled" },
  queued: { settle: "settled" },
};
export const transitionObligation = (state: ObligationState, event: ObligationEvent) =>
  transition(obligationTransitions, state, event);

export const transferStates = ["pending", "broadcast", "confirmed", "failed", "cancelled"] as const;
export type TransferState = (typeof transferStates)[number];
export const transferEvents = ["broadcast", "confirm", "fail", "retry", "cancel"] as const;
export type TransferEvent = (typeof transferEvents)[number];
export const transferTransitions: TransitionTable<TransferState, TransferEvent> = {
  pending: { broadcast: "broadcast", cancel: "cancelled" },
  broadcast: { confirm: "confirmed", fail: "failed" },
  failed: { retry: "pending", cancel: "cancelled" },
};
export const transitionTransfer = (state: TransferState, event: TransferEvent) =>
  transition(transferTransitions, state, event);

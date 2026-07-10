import { describe, expect, it } from "vitest";

import {
  assessmentEvents,
  assessmentStates,
  assessmentTransitions,
  disputeEvents,
  disputeStates,
  disputeTransitions,
  obligationEvents,
  obligationStates,
  obligationTransitions,
  rfsEvents,
  rfsStates,
  rfsTransitions,
  transferEvents,
  transferStates,
  transferTransitions,
  transitionAssessment,
  transitionDispute,
  transitionObligation,
  transitionRfs,
  transitionTransfer,
  type TransitionTable,
} from "./stateMachines";

function assertTransitionMatrix<State extends string, Event extends string>(args: {
  states: readonly State[];
  events: readonly Event[];
  table: TransitionTable<State, Event>;
  apply: (state: State, event: Event) => State | null;
}) {
  for (const state of args.states) {
    for (const event of args.events) {
      expect(args.apply(state, event), `${state} + ${event}`).toBe(
        args.table[state]?.[event] ?? null,
      );
    }
  }
}

describe("state-machine transition matrices", () => {
  it("covers every RFS state/event pair", () => {
    assertTransitionMatrix({ states: rfsStates, events: rfsEvents, table: rfsTransitions, apply: transitionRfs });
  });

  it("covers every assessment state/event pair", () => {
    assertTransitionMatrix({
      states: assessmentStates,
      events: assessmentEvents,
      table: assessmentTransitions,
      apply: transitionAssessment,
    });
  });

  it("covers every dispute state/event pair", () => {
    assertTransitionMatrix({
      states: disputeStates,
      events: disputeEvents,
      table: disputeTransitions,
      apply: transitionDispute,
    });
  });

  it("covers every obligation state/event pair", () => {
    assertTransitionMatrix({
      states: obligationStates,
      events: obligationEvents,
      table: obligationTransitions,
      apply: transitionObligation,
    });
  });

  it("covers every transfer state/event pair", () => {
    assertTransitionMatrix({
      states: transferStates,
      events: transferEvents,
      table: transferTransitions,
      apply: transitionTransfer,
    });
  });
});

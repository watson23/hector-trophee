import type { Card, EventDoc, Round } from "../types";
import { courses } from "../data/courses";
import { draftRoundOf } from "./draftNight";
import { teamCardId } from "./engine";

/**
 * What the organiser should do next — read off the tournament's state, so Admin can
 * open on a task rather than on tabs. A helper who has never seen the screen gets one
 * button and one sentence: draw the tee times, open the round, close the round, run the
 * draft. When there is nothing to do, it says so.
 */
export type TodayAction = "draw" | "open" | "close" | "reopen" | "draft" | "conclude" | "done" | "idle";

export interface TodayTask {
  action: TodayAction;
  title: string;
  body: string;
  /** The round the action concerns, when it concerns one. */
  roundId?: string;
  /** The Admin tab the task is done on, when it is not a one-tap action. */
  tab?: "groups" | "pairs";
  /** False for a status line with nothing to tap yet ("14 of 20 cards in"). */
  enabled: boolean;
  /** A quiet secondary action — reopening a closed round — rather than the day's job. */
  quiet?: boolean;
}

/** Cards a round expects: one per player in a flight, or one per pair on a scramble. */
export function expectedCardIds(round: Round, event: EventDoc): string[] {
  const inFlights = round.groups.flatMap((g) => g.playerIds);
  if (round.formats.some((f) => f.teamCard)) {
    const seen = new Set<string>();
    for (const id of inFlights) {
      const pair = event.pairs.find((p) => p.aId === id || p.bId === id);
      if (pair) seen.add(teamCardId(pair.id));
    }
    return [...seen];
  }
  return inFlights;
}

function isComplete(card: Card | undefined): boolean {
  if (!card) return false;
  for (let h = 1; h <= 18; h++) if (!card.holes?.[String(h)]) return false;
  return true;
}

export function todayTasks(
  event: EventDoc,
  rounds: Round[],
  cards: Record<string, Record<string, Card>>,
): TodayTask[] {
  const ordered = [...rounds].sort((a, b) => a.seq - b.seq);
  const courseName = (r: Round) => courses[r.courseId]?.shortName ?? r.courseId;
  const tasks: TodayTask[] = [];

  // A round in play owns the screen: nothing else should be done while it is.
  const open = ordered.find((r) => r.status === "open");
  if (open) {
    const expected = expectedCardIds(open, event);
    const done = expected.filter((id) => isComplete(cards[open.id]?.[id])).length;
    const all = expected.length > 0 && done === expected.length;
    tasks.push({
      action: "close",
      roundId: open.id,
      title: all ? `Close round ${open.seq}` : `Round ${open.seq} is live`,
      body: all
        ? "Every card is in. Closing makes the round final on every phone and takes a backup."
        : `${done} of ${expected.length} cards complete. Close it once they are all in.`,
      enabled: all,
    });
    return tasks;
  }

  const draft = draftRoundOf(ordered);
  const next = ordered.find((r) => r.status === "upcoming");

  // Thursday, in the bus: the tee sheet is drawn before round 1 is opened.
  if (draft && next?.id === draft.id) {
    const placed = new Set(draft.groups.flatMap((g) => g.playerIds));
    const unplaced = event.players.filter((p) => !placed.has(p.id)).length;
    if (unplaced > 0) {
      tasks.push({
        action: "draw",
        roundId: draft.id,
        tab: "groups",
        title: "Draw the tee times",
        body: `${unplaced} of ${event.players.length} still in the hat. Draw a name; they pick a tee time.`,
        enabled: true,
      });
    }
  }

  // Thursday night: round 1 is in, the pairs are not.
  if (draft?.status === "final" && !event.draftConcluded) {
    const target = Math.floor(event.players.length / 2);
    if (event.pairs.length < target) {
      tasks.push({
        action: "draft",
        tab: "pairs",
        title: "Run the draft",
        body: `${event.pairs.length} of ${target} pairs stand. The round 1 order says who picks next.`,
        enabled: true,
      });
    } else {
      tasks.push({
        action: "conclude",
        title: "Conclude the draft",
        body: "All pairs stand. Concluding puts the Round tab and the board back to normal on every phone.",
        enabled: true,
      });
    }
  }

  // The way back: the most recently closed round can be reopened — a wrong tap on
  // Close, or a card that turns out to need fixing after the fact. Quiet, two taps.
  const lastFinal = [...ordered].reverse().find((r) => r.status === "final");
  if (lastFinal) {
    tasks.push({
      action: "reopen",
      roundId: lastFinal.id,
      title: `Reopen round ${lastFinal.seq}`,
      body: "Puts the round back on everyone's Play tab for corrections. Close it again when done.",
      enabled: true,
      quiet: true,
    });
  }

  if (next) {
    const drawPending = tasks.some((t) => t.action === "draw");
    tasks.push({
      action: "open",
      roundId: next.id,
      title: `Open round ${next.seq}`,
      body: `${next.day} · ${next.teeTimeWindow} · ${courseName(next)}. Puts the round on everyone's Play tab and freezes the handicaps it is played off.${
        drawPending ? " Draw the tee times first." : ""
      }`,
      enabled: true,
    });
  } else if (!tasks.some((t) => t.action !== "reopen")) {
    tasks.unshift({
      action: "done",
      title: "The week is played",
      body: "Every round is final. Nothing left to run.",
      enabled: false,
    });
  }

  return tasks;
}

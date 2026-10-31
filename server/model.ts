import { z } from "zod";
export const DAY = 86400000;
export const palette = ["coral", "sage", "lavender", "butter", "blue"] as const;
export const deckInput = z.object({
  title: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(1).max(50),
  description: z.string().trim().max(300).default(""),
  color: z.enum(palette).default("coral"),
});
export const cardInput = z.object({
  front: z.string().trim().min(1).max(1200),
  back: z.string().trim().min(1).max(3000),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(6)
    .default([])
    .transform((tags) => [...new Set(tags)]),
});
export const noteInput = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(16000),
});
export const backupInput = z.object({
  format: z.literal("studylens-library"),
  version: z.literal(1),
  decks: z
    .array(
      deckInput.extend({
        cards: z.array(cardInput).max(100),
        notes: z.array(noteInput).max(20),
      }),
    )
    .min(1)
    .max(20),
});
export type Grade = "again" | "hard" | "good" | "easy";
export type Schedule = {
  state: "new" | "learning" | "review";
  dueAt: number;
  interval: number;
  ease: number;
  successes: number;
  lapses: number;
};
export type Card = Schedule &
  z.infer<typeof cardInput> & {
    id: string;
    deckId: string;
    version: number;
    createdAt: number;
  };
export type Note = z.infer<typeof noteInput> & {
  id: string;
  deckId: string;
  updatedAt: number;
};
export type Deck = z.infer<typeof deckInput> & {
  id: string;
  createdAt: number;
};
export type Review = {
  id: string;
  sessionId: string;
  cardId: string;
  deckId: string;
  grade: Grade;
  at: number;
  before: Schedule;
  after: Schedule;
};
export type Study = {
  id: string;
  deckId: string | null;
  queue: { id: string; version: number }[];
  index: number;
  revealed: boolean;
  results: { cardId: string; grade: Grade }[];
  startedAt: number;
  finishedAt: number | null;
};
export type Workspace = {
  revision: number;
  createdAt: number;
  goal: number;
  decks: Deck[];
  cards: Card[];
  notes: Note[];
  reviews: Review[];
  study: Study | null;
  receipts: { key: string; sessionId: string; cardId: string; grade: Grade }[];
};
export class Fault extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function schedule(old: Schedule, grade: Grade, now: number): Schedule {
  let ease = old.ease,
    successes = old.successes,
    interval = old.interval,
    lapses = old.lapses;
  if (grade === "again")
    return {
      state: "learning",
      dueAt: now + 600000,
      interval: 0,
      ease: Math.max(1.3, ease - 0.2),
      successes: 0,
      lapses: lapses + (old.state === "review" ? 1 : 0),
    };
  if (grade === "hard") {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.15);
  }
  if (grade === "good") {
    interval =
      successes === 0
        ? 1
        : successes === 1
          ? 6
          : Math.max(1, Math.round(interval * ease));
    successes++;
  }
  if (grade === "easy") {
    interval =
      successes === 0 ? 4 : Math.max(4, Math.round(interval * ease * 1.3));
    ease = Math.min(3, ease + 0.15);
    successes++;
  }
  interval = Math.min(365, interval);
  return {
    state: "review",
    dueAt: now + interval * DAY,
    interval,
    ease: Math.round(ease * 100) / 100,
    successes,
    lapses,
  };
}
export function snapshot(c: Schedule): Schedule {
  return {
    state: c.state,
    dueAt: c.dueAt,
    interval: c.interval,
    ease: c.ease,
    successes: c.successes,
    lapses: c.lapses,
  };
}
export function dayKey(n: number) {
  return new Date(n).toISOString().slice(0, 10);
}
export function assert(
  condition: unknown,
  status: number,
  msg: string,
): asserts condition {
  if (!condition) throw new Fault(status, msg);
}

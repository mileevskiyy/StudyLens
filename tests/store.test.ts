import { test } from "node:test";
import { strict as a } from "node:assert";
import { randomUUID as uuid } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { DAY } from "../server/model.ts";
function setup() {
  let now = 1700000000000;
  const s = new Store(":memory:", () => now),
    t = s.create();
  return { s, t, advance: (ms: number) => (now += ms) };
}
function fresh(s: Store, t: string) {
  const d = s.deck(t, { title: "Test collection", subject: "Testing" });
  const c = s.card(t, d.id, { front: "What?", back: "Why." });
  return { d, c };
}
test("each demo has isolated identities and a seeded library with no fictional review history", () => {
  const { s, t } = setup(),
    b = s.create();
  a.equal(s.get(t).decks.length, 4);
  a.equal(s.get(t).cards.length, 20);
  a.equal(s.get(t).reviews.length, 0);
  a.notEqual(s.get(t).cards[0].id, s.get(b).cards[0].id);
  const { d } = fresh(s, t);
  a.throws(() => s.card(b, d.id, { front: "x", back: "y" }), /not found/);
  s.close();
});
test("a review cannot be rated before revealing the answer", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  a.equal(r.current?.back, undefined);
  a.throws(
    () =>
      s.rate(t, { sessionId: r.id, cardId: c.id, grade: "good", key: uuid() }),
    /Reveal/,
  );
  a.equal(s.get(t).reviews.length, 0);
  s.close();
});
test("revealed rating atomically saves history, schedule, receipt and completion", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  const key = uuid();
  s.rate(t, { sessionId: r.id, cardId: c.id, grade: "good", key });
  const w = s.get(t);
  a.equal(w.reviews.length, 1);
  a.equal(w.cards.find((x) => x.id === c.id)?.interval, 1);
  a.equal(w.study?.results.length, 1);
  a.ok(w.study?.finishedAt);
  a.equal(w.receipts.length, 1);
  a.equal(s.overview(t).stats.reviewedToday, 1);
  s.close();
});
test("replaying a rating is harmless and changing its payload is a conflict", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  const input = {
    sessionId: r.id,
    cardId: c.id,
    grade: "good" as const,
    key: uuid(),
  };
  s.rate(t, input);
  a.equal(s.rate(t, input).replayed, true);
  a.equal(s.get(t).reviews.length, 1);
  a.throws(() => s.rate(t, { ...input, grade: "easy" }), /already used/);
  s.close();
});
test("a stale second submission with another key does not rate the next card", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t);
  s.card(t, d.id, { front: "Second", back: "Two" });
  const r = s.start(t, d.id)!;
  const id = r.current!.id;
  s.reveal(t, r.id);
  s.rate(t, { sessionId: r.id, cardId: id, grade: "good", key: uuid() });
  s.reveal(t, r.id);
  a.throws(
    () =>
      s.rate(t, { sessionId: r.id, cardId: id, grade: "good", key: uuid() }),
    /another card/,
  );
  a.equal(s.get(t).reviews.length, 1);
  s.close();
});
test("edited card versions invalidate an active review", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  s.editCard(t, c.id, c.version, { front: "Changed", back: "Answer" });
  a.throws(
    () =>
      s.rate(t, { sessionId: r.id, cardId: c.id, grade: "easy", key: uuid() }),
    /changed/,
  );
  a.equal(s.get(t).reviews.length, 0);
  s.close();
});
test("optimistic card edits reject a stale version", () => {
  const { s, t } = setup(),
    { c } = fresh(s, t);
  s.editCard(t, c.id, 1, { front: "Changed", back: "Answer" });
  a.throws(
    () => s.editCard(t, c.id, 1, { front: "Lost update", back: "x" }),
    /changed/,
  );
  s.close();
});
test("an active review is resumed and cannot silently be replaced", () => {
  const { s, t } = setup();
  s.start(t, null);
  a.throws(() => s.start(t, null), /current review/);
  s.leave(t);
  a.ok(s.start(t, null));
  s.close();
});
test("Again returns only after its due time, and not in the same snapshot queue", () => {
  const { s, t, advance } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  s.rate(t, { sessionId: r.id, cardId: c.id, grade: "again", key: uuid() });
  a.throws(() => s.start(t, d.id), /Nothing is due/);
  advance(600000);
  a.equal(s.start(t, d.id)?.current?.id, c.id);
  s.close();
});
test("daily counts use UTC boundaries, while history persists across dates", () => {
  const { s, t, advance } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  s.rate(t, { sessionId: r.id, cardId: c.id, grade: "good", key: uuid() });
  advance(DAY);
  a.equal(s.overview(t).stats.reviewedToday, 0);
  a.equal(s.overview(t).stats.totalReviewed, 1);
  a.equal(s.overview(t).stats.calendar.length, 28);
  s.close();
});
test("deleted collections remove notes/cards and cancel review but preserve historical events", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t);
  s.note(t, d.id, { title: "Note", body: "Useful" });
  const r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  s.rate(t, { sessionId: r.id, cardId: c.id, grade: "good", key: uuid() });
  s.delete(t, "deck", d.id);
  const w = s.get(t);
  a.ok(!w.cards.some((x) => x.deckId === d.id));
  a.ok(!w.notes.some((x) => x.deckId === d.id));
  a.equal(w.study, null);
  a.equal(w.reviews.length, 1);
  s.close();
});
test("export contains content only; reimport allocates new IDs and fresh schedules", () => {
  const { s, t } = setup();
  const raw = s.export(t);
  a.equal(raw.decks.length, 4);
  a.ok(!("id" in raw.decks[0]));
  a.ok(!("dueAt" in raw.decks[0].cards[0]));
  const r = s.import(t, raw);
  a.equal(r.cards, 20);
  a.equal(s.get(t).decks.length, 8);
  const ids = s.get(t).cards.map((c) => c.id);
  a.equal(new Set(ids).size, 40);
  a.ok(
    s
      .get(t)
      .cards.slice(20)
      .every((c) => c.state === "new"),
  );
  s.close();
});
test("malformed and oversized imports do not partially add collections", () => {
  const { s, t } = setup(),
    raw = s.export(t);
  const before = s.get(t);
  a.throws(() =>
    s.import(t, { ...raw, decks: [raw.decks[0], { title: "Broken" }] }),
  );
  a.deepEqual(s.get(t), before);
  const huge = {
    ...raw,
    decks: Array.from({ length: 17 }, () => raw.decks[0]),
  };
  a.throws(() => s.import(t, huge), /exceed/);
  a.deepEqual(s.get(t), before);
  s.close();
});
test("a failed database write rolls back review, receipt, schedule and queue movement", () => {
  const { s, t } = setup(),
    { d, c } = fresh(s, t),
    r = s.start(t, d.id)!;
  s.reveal(t, r.id);
  const before = s.get(t);
  s.db.exec(
    "CREATE TRIGGER reject_write BEFORE UPDATE OF payload ON workspaces BEGIN SELECT RAISE(ABORT,'forced'); END",
  );
  a.throws(
    () =>
      s.rate(t, { sessionId: r.id, cardId: c.id, grade: "good", key: uuid() }),
    /forced/,
  );
  a.deepEqual(s.get(t), before);
  s.close();
});
test("limits bound collections, cards, notes and goals", () => {
  const { s, t } = setup(),
    { d } = fresh(s, t);
  for (let i = 1; i < 100; i++)
    s.card(t, d.id, { front: "Question " + i, back: "Answer" });
  a.throws(
    () => s.card(t, d.id, { front: "Overflow", back: "Answer" }),
    /limit/,
  );
  for (let i = 0; i < 20; i++) s.note(t, d.id, { title: "Note", body: "Text" });
  a.throws(
    () => s.note(t, d.id, { title: "Overflow", body: "Text" }),
    /20 notes/,
  );
  a.throws(() => s.goal(t, 0));
  a.throws(() => s.goal(t, 101));
  a.equal(s.goal(t, 15).goal, 15);
  s.close();
});
test("review queues take at most fifty due cards in deterministic order", () => {
  const { s, t } = setup(),
    { d } = fresh(s, t);
  for (let i = 1; i < 70; i++)
    s.card(t, d.id, { front: "Question " + i, back: "Answer" });
  a.equal(s.start(t, d.id)?.total, 50);
  s.close();
});
test("idle workspaces expire after 24h and cannot be used", () => {
  const { s, t, advance } = setup();
  advance(DAY + 1);
  a.throws(() => s.get(t), /expired/);
  s.create();
  a.equal(
    (s.db.prepare("SELECT count(*) AS n FROM workspaces").get() as any).n,
    1,
  );
  s.close();
});
test("optional file-backed storage survives closing and reopening the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "studylens-")),
    path = join(dir, "test.sqlite");
  try {
    let s = new Store(path);
    const t = s.create();
    s.goal(t, 25);
    s.close();
    s = new Store(path);
    a.equal(s.get(t).goal, 25);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("serialized workspace bounds reject a large import without partial content", () => {
  const { s, t } = setup();
  const huge = {
    format: "studylens-library",
    version: 1,
    decks: Array.from({ length: 15 }, (_, i) => ({
      title: "Large notes " + i,
      subject: "Testing",
      description: "",
      color: "sage",
      cards: [],
      notes: Array.from({ length: 20 }, () => ({
        title: "Full page",
        body: "x".repeat(16000),
      })),
    })),
  };
  const before = s.get(t);
  a.throws(() => s.import(t, huge), /workspace is full/);
  a.deepEqual(s.get(t), before);
  s.close();
});

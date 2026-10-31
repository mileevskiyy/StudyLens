import { DatabaseSync } from "node:sqlite";
import { randomUUID as uuid, createHash } from "node:crypto";
import {
  DAY,
  assert,
  cardInput,
  deckInput,
  noteInput,
  backupInput,
  schedule,
  snapshot,
  dayKey,
  type Workspace,
  type Grade,
} from "./model.ts";
import { seed } from "./seed.ts";
export class Store {
  db: DatabaseSync;
  constructor(
    path = ":memory:",
    private clock = () => Date.now(),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (token TEXT PRIMARY KEY, touched INTEGER NOT NULL, payload TEXT NOT NULL)",
    );
  }
  hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
  create() {
    const now = this.clock();
    this.db.prepare("DELETE FROM workspaces WHERE touched<?").run(now - DAY);
    assert(
      Number(
        (this.db.prepare("SELECT count(*) AS n FROM workspaces").get() as any)
          .n,
      ) < 200,
      503,
      "The demo is busy. Please try again later.",
    );
    const token = uuid() + uuid();
    const payload = JSON.stringify(seed(now));
    const total = (
      this.db
        .prepare(
          "SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) AS n FROM workspaces",
        )
        .get() as any
    ).n;
    assert(
      Number(total) + Buffer.byteLength(payload) < 48 * 1024 * 1024,
      503,
      "The demo is busy. Please try again later.",
    );
    this.db
      .prepare("INSERT INTO workspaces VALUES (?,?,?)")
      .run(this.hash(token), now, payload);
    return token;
  }
  get(token: string): Workspace {
    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE token=?")
      .get(this.hash(token)) as any;
    assert(
      row && row.touched >= this.clock() - DAY,
      401,
      "Your workspace expired. Open a fresh demo to continue.",
    );
    this.db
      .prepare("UPDATE workspaces SET touched=? WHERE token=?")
      .run(this.clock(), this.hash(token));
    return JSON.parse(row.payload);
  }
  remove(token: string) {
    this.db
      .prepare("DELETE FROM workspaces WHERE token=?")
      .run(this.hash(token));
  }
  change<T>(token: string, fn: (w: Workspace, now: number) => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const w = this.get(token);
      const result = fn(w, this.clock());
      w.revision++;
      const payload = JSON.stringify(w);
      assert(
        Buffer.byteLength(payload) < 4 * 1024 * 1024,
        422,
        "This workspace is full. Export your library before continuing in a fresh demo.",
      );
      const bytes = (
        this.db
          .prepare(
            "SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) AS n FROM workspaces WHERE token<>?",
          )
          .get(this.hash(token)) as any
      ).n;
      assert(
        Number(bytes) + Buffer.byteLength(payload) < 48 * 1024 * 1024,
        503,
        "The demo is busy. Please try again later.",
      );
      this.db
        .prepare("UPDATE workspaces SET payload=? WHERE token=?")
        .run(payload, this.hash(token));
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  overview(token: string) {
    const w = this.get(token),
      now = this.clock(),
      today = dayKey(now);
    const calendar = Array.from({ length: 28 }, (_, i) => {
      const day = dayKey(now - (27 - i) * DAY);
      return {
        day,
        count: w.reviews.filter((r) => dayKey(r.at) === day).length,
      };
    });
    return {
      ...w,
      study: this.publicStudy(w),
      now,
      stats: {
        due: w.cards.filter((c) => c.dueAt <= now).length,
        reviewedToday: w.reviews.filter((r) => dayKey(r.at) === today).length,
        totalReviewed: w.reviews.length,
        learned: w.cards.filter((c) => c.state === "review").length,
        calendar,
        grades: ["again", "hard", "good", "easy"].map((grade) => ({
          grade,
          count: w.reviews.filter((r) => r.grade === grade).length,
        })),
        forecast: Array.from({ length: 7 }, (_, i) => {
          const day = dayKey(now + i * DAY);
          return {
            day,
            count: w.cards.filter((c) => dayKey(Math.max(now, c.dueAt)) === day)
              .length,
          };
        }),
      },
      receipts: undefined,
    };
  }
  publicStudy(w: Workspace) {
    const s = w.study;
    if (!s) return null;
    const item = s.queue[s.index],
      card = w.cards.find((c) => c.id === item?.id);
    return {
      ...s,
      queue: undefined,
      current: card
        ? {
            id: card.id,
            deckId: card.deckId,
            front: card.front,
            tags: card.tags,
            back: s.revealed ? card.back : undefined,
            intervals: Object.fromEntries(
              ["again", "hard", "good", "easy"].map((g) => [
                g,
                schedule(card, g as Grade, this.clock()).dueAt - this.clock(),
              ]),
            ),
          }
        : null,
      total: s.queue.length,
    };
  }
  deck(token: string, raw: unknown) {
    const input = deckInput.parse(raw);
    return this.change(token, (w, now) => {
      assert(
        w.decks.length < 20,
        422,
        "A workspace can contain up to 20 collections.",
      );
      const d = { ...input, id: uuid(), createdAt: now };
      w.decks.push(d);
      return d;
    });
  }
  editDeck(token: string, id: string, raw: unknown) {
    const input = deckInput.parse(raw);
    return this.change(token, (w) => {
      const d = w.decks.find((d) => d.id === id);
      assert(d, 404, "Collection not found.");
      Object.assign(d, input);
      return d;
    });
  }
  card(token: string, deckId: string, raw: unknown) {
    const input = cardInput.parse(raw);
    return this.change(token, (w, now) => {
      assert(
        w.decks.some((d) => d.id === deckId),
        404,
        "Collection not found.",
      );
      assert(
        w.cards.length < 500 &&
          w.cards.filter((c) => c.deckId === deckId).length < 100,
        422,
        "Card limit reached (100 per collection, 500 per workspace).",
      );
      const c = {
        ...input,
        id: uuid(),
        deckId,
        version: 1,
        createdAt: now,
        state: "new" as const,
        dueAt: now,
        interval: 0,
        ease: 2.5,
        successes: 0,
        lapses: 0,
      };
      w.cards.push(c);
      return c;
    });
  }
  editCard(token: string, id: string, version: number, raw: unknown) {
    const input = cardInput.parse(raw);
    return this.change(token, (w) => {
      const c = w.cards.find((c) => c.id === id);
      assert(c, 404, "Card not found.");
      assert(
        c.version === version,
        409,
        "This card changed. Refresh before editing.",
      );
      Object.assign(c, input);
      c.version++;
      return c;
    });
  }
  note(token: string, deckId: string, raw: unknown, id?: string) {
    const input = noteInput.parse(raw);
    return this.change(token, (w, now) => {
      assert(
        w.decks.some((d) => d.id === deckId),
        404,
        "Collection not found.",
      );
      if (id) {
        const n = w.notes.find((n) => n.id === id && n.deckId === deckId);
        assert(n, 404, "Note not found.");
        Object.assign(n, input, { updatedAt: now });
        return n;
      }
      assert(
        w.notes.filter((n) => n.deckId === deckId).length < 20,
        422,
        "A collection can contain up to 20 notes.",
      );
      const n = { ...input, id: uuid(), deckId, updatedAt: now };
      w.notes.push(n);
      return n;
    });
  }
  delete(token: string, kind: "card" | "note" | "deck", id: string) {
    return this.change(token, (w) => {
      const exists =
        kind === "card"
          ? w.cards.some((c) => c.id === id)
          : kind === "note"
            ? w.notes.some((n) => n.id === id)
            : w.decks.some((d) => d.id === id);
      assert(exists, 404, "Item not found.");
      if (kind === "card") w.cards = w.cards.filter((c) => c.id !== id);
      if (kind === "note") w.notes = w.notes.filter((n) => n.id !== id);
      if (kind === "deck") {
        w.decks = w.decks.filter((d) => d.id !== id);
        w.cards = w.cards.filter((c) => c.deckId !== id);
        w.notes = w.notes.filter((n) => n.deckId !== id);
      }
      if (kind !== "note") w.study = null;
      return { ok: true };
    });
  }
  start(token: string, deckId: string | null) {
    return this.change(token, (w, now) => {
      if (deckId)
        assert(
          w.decks.some((d) => d.id === deckId),
          404,
          "Collection not found.",
        );
      assert(
        !w.study || w.study.finishedAt !== null,
        409,
        "Finish or leave your current review first.",
      );
      const cards = w.cards
        .filter((c) => (!deckId || c.deckId === deckId) && c.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
        .slice(0, 50);
      assert(
        cards.length,
        422,
        "Nothing is due yet. Add a card or come back later.",
      );
      w.study = {
        id: uuid(),
        deckId,
        queue: cards.map((c) => ({ id: c.id, version: c.version })),
        index: 0,
        revealed: false,
        results: [],
        startedAt: now,
        finishedAt: null,
      };
      return this.publicStudy(w);
    });
  }
  reveal(token: string, sessionId: string) {
    return this.change(token, (w) => {
      const s = w.study;
      assert(
        s && s.id === sessionId && s.finishedAt === null,
        409,
        "This review session has ended.",
      );
      const item = s.queue[s.index],
        c = w.cards.find((c) => c.id === item?.id);
      assert(
        c && c.version === item.version,
        409,
        "This card changed. Leave this review and start again.",
      );
      s.revealed = true;
      return this.publicStudy(w);
    });
  }
  rate(
    token: string,
    input: { sessionId: string; cardId: string; grade: Grade; key: string },
  ) {
    return this.change(token, (w, now) => {
      const old = w.receipts.find((r) => r.key === input.key);
      if (old) {
        assert(
          old.sessionId === input.sessionId &&
            old.cardId === input.cardId &&
            old.grade === input.grade,
          409,
          "That request key was already used for a different rating.",
        );
        return { replayed: true, study: this.publicStudy(w) };
      }
      assert(
        w.reviews.length < 10000,
        422,
        "Demo review history is full. Export your library and open a fresh demo.",
      );
      const s = w.study;
      assert(
        s && s.id === input.sessionId && s.finishedAt === null,
        409,
        "This review session has ended.",
      );
      assert(s.revealed, 409, "Reveal the answer before rating it.");
      const item = s.queue[s.index];
      assert(
        item.id === input.cardId,
        409,
        "The review has moved to another card.",
      );
      const c = w.cards.find((c) => c.id === item.id);
      assert(
        c && c.version === item.version,
        409,
        "This card changed. Leave this review and start again.",
      );
      const before = snapshot(c),
        after = schedule(c, input.grade, now);
      Object.assign(c, after);
      c.version++;
      w.reviews.push({
        id: uuid(),
        sessionId: s.id,
        cardId: c.id,
        deckId: c.deckId,
        grade: input.grade,
        at: now,
        before,
        after,
      });
      w.receipts.push({ ...input });
      s.results.push({ cardId: c.id, grade: input.grade });
      s.index++;
      s.revealed = false;
      if (s.index === s.queue.length) s.finishedAt = now;
      return { replayed: false, study: this.publicStudy(w) };
    });
  }
  leave(token: string) {
    return this.change(token, (w, now) => {
      if (w.study && w.study.finishedAt === null) w.study.finishedAt = now;
      return { ok: true };
    });
  }
  goal(token: string, goal: number) {
    return this.change(token, (w) => {
      assert(
        Number.isInteger(goal) && goal >= 5 && goal <= 100,
        422,
        "Choose a daily goal between 5 and 100 reviews.",
      );
      w.goal = goal;
      return { goal };
    });
  }
  export(token: string) {
    const w = this.get(token);
    return {
      format: "studylens-library",
      version: 1,
      decks: w.decks.map((d) => ({
        title: d.title,
        subject: d.subject,
        description: d.description,
        color: d.color,
        cards: w.cards
          .filter((c) => c.deckId === d.id)
          .map(({ front, back, tags }) => ({ front, back, tags })),
        notes: w.notes
          .filter((n) => n.deckId === d.id)
          .map(({ title, body }) => ({ title, body })),
      })),
    };
  }
  import(token: string, raw: unknown) {
    const input = backupInput.parse(raw);
    return this.change(token, (w, now) => {
      assert(
        w.decks.length + input.decks.length <= 20 &&
          w.cards.length +
            input.decks.reduce((a, d) => a + d.cards.length, 0) <=
            500,
        422,
        "Import would exceed the workspace collection or card limit.",
      );
      let count = 0;
      for (const d of input.decks) {
        const id = uuid();
        w.decks.push({
          id,
          title: d.title,
          subject: d.subject,
          color: d.color,
          description: d.description,
          createdAt: now,
        });
        for (const c of d.cards) {
          w.cards.push({
            ...c,
            id: uuid(),
            deckId: id,
            version: 1,
            createdAt: now,
            state: "new",
            dueAt: now,
            interval: 0,
            ease: 2.5,
            successes: 0,
            lapses: 0,
          });
          count++;
        }
        for (const n of d.notes)
          w.notes.push({ ...n, id: uuid(), deckId: id, updatedAt: now });
      }
      return { decks: input.decks.length, cards: count };
    });
  }
  close() {
    this.db.close();
  }
}

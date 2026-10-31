import { test } from "node:test";
import { strict as a } from "node:assert";
import { DAY, schedule, type Schedule } from "../server/model.ts";
const fresh: Schedule = {
    state: "new",
    dueAt: 0,
    interval: 0,
    ease: 2.5,
    successes: 0,
    lapses: 0,
  },
  now = 1700000000000;
test("Again schedules a ten-minute learning step, not an immediate duplicate", () => {
  const s = schedule(fresh, "again", now);
  a.equal(s.dueAt, now + 600000);
  a.equal(s.state, "learning");
  a.equal(s.lapses, 0);
});
test("Good advances first and second successful recalls to one and six days", () => {
  const first = schedule(fresh, "good", now),
    second = schedule(first, "good", now + DAY);
  a.equal(first.interval, 1);
  a.equal(second.interval, 6);
  a.equal(second.dueAt, now + 7 * DAY);
});
test("subsequent Good uses the prior interval and ease factor", () => {
  a.equal(
    schedule(
      { ...fresh, state: "review", interval: 6, successes: 2 },
      "good",
      now,
    ).interval,
    15,
  );
});
test("Easy gives new cards four days and raises ease", () => {
  const s = schedule(fresh, "easy", now);
  a.equal(s.interval, 4);
  a.equal(s.ease, 2.65);
  a.equal(s.successes, 1);
});
test("Hard uses a conservative interval without recording a successful recall", () => {
  const s = schedule({ ...fresh, interval: 10, successes: 3 }, "hard", now);
  a.equal(s.interval, 12);
  a.equal(s.successes, 3);
  a.equal(s.ease, 2.35);
});
test("a failed review increments lapses and resets successful recall count", () => {
  const s = schedule(
    { ...fresh, state: "review", successes: 3, interval: 10 },
    "again",
    now,
  );
  a.equal(s.lapses, 1);
  a.equal(s.successes, 0);
  a.equal(s.interval, 0);
});
test("ease and intervals remain bounded through repeated ratings", () => {
  let s = fresh;
  for (let i = 0; i < 200; i++) s = schedule(s, "easy", now);
  a.equal(s.interval, 365);
  a.equal(s.ease, 3);
  for (let i = 0; i < 200; i++) s = schedule(s, "again", now);
  a.equal(s.ease, 1.3);
});
test("the scheduler does not mutate its input", () => {
  const copy = { ...fresh };
  schedule(fresh, "good", now);
  a.deepEqual(fresh, copy);
});

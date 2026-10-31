# Architecture and invariants

## Data ownership

The only SQLite table is `workspaces(token, touched, payload)`. The token column holds a SHA-256 digest of the session cookie. The payload contains bounded collections, cards, notes, reviews, an optional current study session and rating receipts. Every API operation resolves its workspace through the session cookie; clients cannot supply a workspace ID.

The aggregate revision increments on writes. Card edits additionally use optimistic version checks. Deck and note edits use last-write-wins behavior within a workspace. Review events remain after content deletion, preserving actual activity counts; deleted content stops contributing to due forecasts and current-card counts.

## Rating transaction

1. Begin `IMMEDIATE` transaction.
2. Resolve the unexpired workspace.
3. Check for an existing request key. Matching payload returns a replay; differing payload conflicts.
4. Validate active session, revealed answer, current card and captured card version.
5. Compute the next schedule using the pure scheduling function.
6. Save before/after evidence, increment card version, record receipt and advance the queue.
7. Check serialized payload bounds, save the aggregate and commit.
8. Roll back on every exception.

All application database operations are synchronous in one Node process. There is no asynchronous work inside an open transaction. A forced SQLite trigger failure in the test suite verifies that the aggregate stays unchanged after a failed rating write.

The browser creates a random UUID for each rating submission. If a transport response is lost, refreshing retrieves committed progress. The server prevents duplicate or stale effects; the browser does not automatically retry failed writes.

## Queue lifecycle

`idle → active, hidden answer → active, revealed answer → next hidden card / finished`

A review snapshots no more than 50 currently due cards. Queue order is stable. A grade never puts a card back into the same snapshot. On Again, the card is due in ten minutes and can appear in a later session. Editing a queued card produces a version conflict; the user can leave and restart to obtain a fresh queue. Deleting cards or collections cancels the current snapshot. Refresh restores an unfinished session and its reveal state.

## API surface

| Method     | Path                                                   | Purpose                                                                          |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| GET        | `/api/health`                                          | Readiness                                                                        |
| POST       | `/api/demo`                                            | Create and seed a new isolated workspace; replace any existing current workspace |
| GET        | `/api/session`                                         | Session presence and CSRF token                                                  |
| GET        | `/api/workspace`                                       | Library, current review and derived progress                                     |
| POST / PUT | `/api/decks`, `/api/decks/:id`                         | Create or edit collection                                                        |
| POST       | `/api/decks/:id/cards`                                 | Create card                                                                      |
| PUT        | `/api/cards/:id`                                       | Edit card with expected version                                                  |
| POST / PUT | `/api/decks/:id/notes`, `/api/decks/:id/notes/:noteId` | Create or edit note                                                              |
| DELETE     | `/api/cards/:id`, `/api/notes/:id`, `/api/decks/:id`   | Remove content                                                                   |
| POST       | `/api/review/start`                                    | Snapshot due cards for one collection or all collections                         |
| POST       | `/api/review/reveal`                                   | Reveal current answer                                                            |
| POST       | `/api/review/rate`                                     | Commit one rating                                                                |
| POST       | `/api/review/leave`                                    | Finish snapshot without changing unreviewed cards                                |
| PUT        | `/api/goal`                                            | Set 5–100 reviews per UTC day                                                    |
| GET / POST | `/api/export`, `/api/import`                           | Portable content backup and additive import                                      |
| POST       | `/api/logout`                                          | Delete current workspace and clear cookie                                        |

API responses disable caching. Mutations use server validation, CSRF checks and configured Origin checks. Unknown resource IDs never cross workspace boundaries. Body parsing is capped at 1.5 MB; the UI accepts import files up to 1.4 MB. Field limits further bound note, question and answer sizes.

## Analytics definitions

- **Review events:** accepted ratings, including Again and Hard. Replays do not count.
- **Today:** ratings whose timestamps fall on today's UTC date.
- **Cards in review:** existing cards whose scheduler state is `review`; this is not a mastery percentage.
- **Activity calendar:** 28 UTC dates, including today, with actual event counts.
- **Recall distribution:** counts of the learner's chosen ratings, not independently measured recall accuracy.
- **Forecast:** existing cards grouped by their current due dates; overdue cards roll into today's bucket. It does not simulate future ratings.

## Storage and operational boundaries

The public demo runs an in-memory SQLite database. Session access renews its 24-hour inactivity deadline. Expired records are pruned when a new workspace is created. Creation is capped at 200 workspaces. Updates reject a workspace above 4 MiB; both creation and updates enforce a 48 MiB combined serialized-payload ceiling. SQLite counts payloads as bytes, including non-ASCII content. This is not a global process-memory limit. Indexes, runtime overhead, request bodies and the frontend bundle consume additional memory.

The optional file database provides local restart persistence, not backups, replication, account recovery or horizontal scaling. Multiple server processes would need explicit shared storage and a redesigned session/capacity layer. Session cookies should be treated as access credentials. The disposable demo is for sample study content rather than sensitive records.

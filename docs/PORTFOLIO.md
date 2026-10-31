# StudyLens — portfolio wording

## CV

**StudyLens — spaced-practice learning workspace** | React, TypeScript, Node.js, Express, SQLite

- Built a learning workflow connecting collection-based notes, tagged flashcards, answer recall and server-managed review schedules in a responsive editorial interface.
- Implemented deterministic interval scheduling and versioned review snapshots, with atomic rating transitions, idempotency receipts and conflict detection for edited or stale cards.
- Developed isolated demo workspaces, validated content import/export and activity analytics based on actual review events, supported by domain, API and browser tests.

## LinkedIn project description

StudyLens is a full-stack learning workspace that turns notes into flashcards and schedules deliberate follow-up practice. It includes collection management, tagged cards, review sessions, a daily practice goal, an activity calendar and a portable JSON library format.

The technical focus is consistent state: a rating updates its schedule, history and queue position together inside a SQLite transaction. Review snapshots carry card versions, so an obsolete edit or delayed submission cannot silently replace newer state. Session-bound workspaces isolate demo visitors, while export/import keeps the content portable without transferring credentials or internal IDs.

The visual direction uses warm paper tones, subject covers and serif typography, with a focused review screen and mobile layouts. The scheduling model is deliberately transparent; progress charts report real activity and self-assessed ratings rather than claiming a measured improvement in memory.

## Discussion points for an interview

- Why use a bounded JSON aggregate in SQLite, and when would normalized tables be preferable?
- What can happen when a rating is committed but its HTTP response is lost?
- How do request identities and card versions solve different problems?
- Why does Again appear in a later session instead of being added repeatedly to the same queue?
- Which analytics describe observed behavior, and which would require a scientifically validated memory model?
- How would durable accounts, timezone support and a larger history alter the design?

Use project wording after reviewing the code and being able to explain these decisions. Do not describe the demo as a deployed educational product with real users or measured learning outcomes.

# Verification evidence

Verified locally on 31 October 2026 with Node.js 24 and Chromium through Playwright.

| Check | Observed result |
| --- | --- |
| `npm test` | 28 passing domain, storage and API tests |
| `npm run build` | TypeScript checking and Vite production build pass |
| `npm run test:e2e` | Complete collection → note → card → review → progress → export/import scenario passes |
| Desktop layout | Entry, workspace and revealed review inspected at 1440 px width |
| Mobile layout | Today workspace inspected at 390 px width; no document-level horizontal overflow |

The domain suite checks all rating transitions and bounds, input immutability, ten-minute eligibility, UTC date changes, duplicate rating keys, stale submissions, optimistic card edits, queue replacement conflicts, rollback after a forced SQLite failure, cross-workspace isolation, content deletion, portable imports, limits, expiry and reopening a file-backed database.

The API scenario checks unauthenticated access, allowed/disallowed origins, CSRF enforcement, cookie attributes, invalid goals, content export/import, session rotation and logout.

The browser scenario creates a collection and note, uses the note-to-card draft, edits the draft, reveals and rates a card, checks session completion and progress after reload, downloads a JSON export, imports it, searches the duplicated collection and inspects the mobile layout.

Screenshots are available in this directory: `entry.png`, `workspace.png`, `review.png` and `mobile.png`. They are verification artifacts rather than claimed production usage. The sample activity count in the mobile screenshot comes from that browser test.

## Verification limits

These checks establish functional behavior in the covered scenarios. They are not load tests, a formal security audit, a full accessibility audit, scientific validation of the scheduler, or measured learning outcomes. The free demo's data is deliberately disposable. GitHub Actions and public deployment status should be checked for the specific published commit rather than inferred from the local results.

# Maintenance and architecture

## Upgrading an existing bot

1. Stop every bot process using the database and take a backup. Use the **same** `MIKADATABASENAME` as the existing installation. Old installations may use `test`; this upgrade does not move collections between databases.
2. Run `npm ci`, then `npm run db:check`. This is read-only and lists duplicate natural keys. Reconcile reported duplicates deliberately, preserving the intended configuration, warnings, XP, and pending recommendations. Mika does not guess which duplicate to discard.
3. Run `npm run db:migrate`. It refuses to write while duplicates remain. It links existing pending recommendations to unique active keys, gives warnings stable IDs, and creates indexes. Run it again safely after an interruption. Keep the bot stopped until it completes.
4. Run `npm run deploy:commands`. This replaces the application's global command set. Normal startup no longer registers commands.
5. Check role settings and restart with `npm start`. Auto-role and mute-role now reject privileged/managed roles and enforce role hierarchy. Main database connection and required unique indexes are checked before Discord login.

Migration preserves the existing configuration field names and array storage format, now with typed entries and one source of defaults. This avoids forcing a destructive configuration conversion. New configuration/profile edits use optimistic concurrency: conflicting stale edits ask the user to reopen and retry.

Timed mutes created by this version are persisted and checked every 15 seconds, including after restart. Mutes created by older versions have no stored expiry to recover; inspect and clear those manually as needed. Re-muting replaces the expiry, and manual unmute clears the persisted state.

Legacy bot XP rows can affect rank until identified. Preview and apply the existing cleanup tool once if necessary:

```sh
node scripts/remove-bot-levels.js
node scripts/remove-bot-levels.js --apply
```

It only removes rows for accounts Discord confirms are bots. Unresolvable users are retained. Normal leaderboards also remember confirmed bot accounts and exclude them from subsequent indexed queries.

## Search and API traffic

Public anime data uses bounded local caches in front of the optional Mongo cache:

| Data | Persistent lifetime | Local copy |
| --- | --- | --- |
| Anime details | 24 hours | Up to 60 seconds; 1,000 entries per client cache |
| Search/random result snapshots | 15 minutes | Up to 60 seconds; 300 entries |
| Genres and curated tags | 24 hours | Catalog reused for 24 hours |
| Valid empty search | Not persisted | 30 seconds; 200 entries |
| Autocomplete choices | Not persisted | 5 seconds; 64 queries |

Local entries loaded from Mongo never outlive the stored expiry. Another process may retain a short local copy after an eviction; this is acceptable for public metadata. Private profiles do not use this shared public cache.

Search stores bounded result snapshots, avoiding one detail read per suggestion. Old ID-list entries remain readable until they expire. Access timestamps are sampled at most once per minute per loaded record. Search/detail/random requests share in-flight work, obsolete autocomplete requests are cancelled, and every caller has its own deadline. A selected result reuses its detail entry. Cache writes run outside the reply path.

AniList uses a bounded queue and a conservative 24-request/minute budget with 2.5-second spacing, respecting Retry-After/reset headers. Dispatched requests still count after cancellation. Kitsu is separately throttled. Timeouts cover response bodies, with a 2 MiB body limit. Autocomplete has an end-to-end 2.5-second budget; normal slash commands and eligible components acknowledge before database/network work. Modal opening happens from an already prepared control.

The application is configured for **one shard/process**. Before increasing process count or running multiple replicas behind the same outbound IP, introduce a shared provider budget; independent process limiters do not coordinate with each other.

Cold random filters start on a valid first page; subsequent rolls use the known page range. Equivalent genre/tag sets share keys. Kitsu never silently drops tags or multiple genres. If it cannot honor a filter, the command reports unavailability.

### Persistent cache size

Eviction is by sampled `lastAccessedAt`, with periodic trimming and TTL checks. The planning budget is 440 MiB, leaving room within a 512 MiB tier; actual storage depends on content and indexes and should be monitored.

| Kind | Entry cap | Planning size per entry |
| --- | --- | --- |
| Detail | 100,000 | 2 KiB |
| Search/random snapshot | 2,000 | 64 KiB maximum cached value |
| Catalog | 8 | 0.5 KiB |
| Guess pool | 12,000 | 8 KiB (including title context) |

The search cap is lower than the old ID-list cache because snapshots are larger. Oversized search values are not stored. Guess inventory is bounded and briefly reused, and existing screenshots can serve rounds when providers are unavailable. Meme batches retain only validated posts in a small, consumed pool for one minute.

Set `MIKA_AUTOCOMPLETE_TIMING=1` for cache/provider timings, response latency, and deduplication counts. Logs contain a query hash and length, not raw query text. Measure response latency and provider request counts on the deployment before claiming a production speedup.

## Guessing game

- Commands stay `/guess play`, `/guess stats`, and `/guess leaderboard`. Public hints distinguish a correct answer, a recognizable partial/related title, and an incorrect answer. Small spelling mistakes are accepted; conflicting season/part numbers are not. Related titles and format are cached when preparing the pool, never fetched per guess. Older entries gain that context gradually; hints stay generic when context is missing.
- Close guesses receive a direct reply. Generic wrong-answer feedback requires replying to the screenshot or a hint, so normal chat is left alone. Feedback is limited to once per player every 3 seconds, once per channel per second, and 8 replies per round. Correct answers are always checked, including during feedback cooldowns. A reply targets its round; otherwise a correct personal answer has priority over an automatic round.
- Every reveal has a **🎲 Play again** button valid for 10 minutes. Personal buttons belong to their player; automatic-round buttons let any eligible member start a personal round. Buttons use the same channel restrictions, permissions, locks and rolling ten-play quota as `/guess play`. Failed starts retain the existing refund behavior.
- `/config guess` accepts whole minutes from **10 to 1440**, default **10**. Existing values below 10 are treated as 10 without rewriting the saved document. On startup or a setting change, the first round waits the interval plus a stable server offset of up to 10 minutes. Later rounds wait the full interval after completion, plus 0–30 seconds of positive jitter. Queue delays can add more time; rounds never catch up with a burst.
- One process-wide automatic-round queue admits at most **5 starts/second**, **4 concurrent jobs**, and **1,000 waiting servers**. Duplicate pending jobs are suppressed. Excess servers retry after 30–60 seconds instead of expanding the queue. Disabling/changing a schedule cancels waiting work and checks again before posting. The scheduler exposes `queueStats()` for diagnostics.
- Automatic rounds only serve eligible cached screenshots. If none are eligible, that drop is skipped while one shared job warms the pool. Personal cold starts wait at most 2.5 seconds for that job, then report that different anime are being prepared and refund the play. Warm starts use cached screenshots immediately. No provider requests run inside the per-server selection lock.
- Pool maintenance starts at bot startup and runs at most once per minute, independent of player demand. Each pass checks up to 12 candidates and adds up to 4 new franchises toward a target of 200 with relationship metadata and usable screenshots. Growth gets priority, with remaining time for at most 2 legacy metadata upgrades and 1 stale refresh. No new work starts after a 20-second pass budget; an already dispatched request may finish later. Jobs coalesce across servers and use the existing shared provider rate limits. Provider failures retain usable saved screenshots.
- Guess candidates use a dedicated AniList query, separate from `/randomanime`. It rotates broad, genre, and release-era scopes and samples up to 40 pages (1,000 entries) per scope, retaining score >=70, popularity >=10,000, non-adult, released/airing titles with MAL IDs. A shared shuffled page feeds background batches; cached IDs and represented franchises are skipped before fetching screenshots. Relation links from skipped sequels are retained to connect later movies.
- Selection draws a franchise uniformly before choosing an entry and then a screenshot. AniList relationship IDs group sequels, movies, side stories and spin-offs transitively; character crossovers and manga adaptations do not join groups. Legacy entries start with exact-ID protection and gain franchise metadata gradually; missing/incomplete provider relationships can still leave an unlinked entry separate.
- Each player retains their last **20 franchises per server**, shared across channels, slash starts and replay, even after a restart. Server history prefers avoiding the last **50 franchises** across personal and automatic rounds. When necessary, only its oldest eligible entry is relaxed; personal history and the immediately preceding server franchise are never relaxed. A one-title exhausted pool cannot reopen itself just by changing screenshots. History stores bounded ID snapshots in the main database so optional public-cache loss cannot erase it. Reservations happen before posting; a failed Discord send refunds the play but may conservatively retain the history entry.
- `/guess stats` is private from its initial acknowledgement and edits that original response. It does not delete a public placeholder and replace it with a follow-up. Play and leaderboard remain public.
- Screenshot requests for the same anime share one fetch. Valid empty/404 results are cached for 5 minutes; failures get a separate 10-second backoff. Pool counts and lightweight relationship inventory are reused for 60 seconds, with a bounded 400-entry local record cache retained for up to 24 hours so an optional-cache outage cannot shrink the pool to one minute of titles. Per-server selection and screenshot/history reservations share one serialized queue (at most 8 pending/running reservations per server), preventing concurrent rounds from choosing against stale history.
- The guessing leaderboard resolves only the visible ten-player page, with three concurrent name lookups per page and bounded shared caches. Pagination acknowledges before fetching names.

Diversity tests include 10,000 seeded rounds over 200 franchises, franchise weighting, the repeated-movie regression, concurrent reservations, restart persistence, refunds, legacy upgrades and optional-cache outages. The 3,000-server tests use simulated clocks and providers. They check scheduling, queue bounds, spacing and cancellation, not production throughput. These controls are process-local; multiple bot replicas still need shared coordination. Monitor queue delay, Mongo latency and provider rate limits before scaling out. This update needs a bot restart; no additional database migration or command redeployment is required after the repository-checkup upgrade.

## Data integrity and delivery

- Natural-key indexes prevent duplicate guild/user records. XP increments and rolling play quotas use atomic updates; XP cooldowns are reserved before asynchronous work and also enforced in MongoDB.
- Config reads use isolated snapshots for five seconds, invalidated after a save. Editors load fresh documents. Profile name autocomplete uses a normalized prefix query, projection, two-character minimum, coalescing, and a server-side query timeout. Full profile discovery remains bounded substring search.
- Recommendation quotas and a unique pending record are reserved **before** a DM. A definite Discord rejection releases the reservation. An ambiguous network failure keeps it to prevent duplicate delivery; the user is told delivery is uncertain. The bot never automatically resends an uncertain DM. Pending records expire after 30 days.
- Accepting a recommendation acquires a short processing lease and updates the profile before finalizing the recommendation. Failed saves release the lease. After a crash, acceptance can be retried when the lease expires; adding an already-watching show is idempotent.
- Warning removal matches stable warning IDs, with a conservative legacy-field match. `/clearwarns` clears active warnings while preserving infraction history; `/clearinfractions` clears history. History is never removed merely because its array index matches the active warning index. These two legacy collections are still separate; backups remain important.
- Timed role-mute operations use a persisted per-member lease. Discord role changes and Mongo writes cannot be one transaction; conservative persisted state and repeatable expiry removal handle interruptions. Missing permissions are logged and expiry is retried.
- Audit attribution requires matching action, target, and a recent timestamp. Missing permissions, unmatched entries, or delayed audit records produce an unknown actor rather than blaming the latest log entry.

## Validation and deployment

CI runs lint and the test suite on Node 22 and 24. Integration tests use an isolated MongoDB 7.0.24 process with Unix sockets disabled; no production database or Discord server is used.

Regression coverage includes concurrent recommendation deliveries, recipient notice caps, failed saves, concurrent XP/play reservations, stale profile edits, cache read counts, Unicode queries, stalled HTTP bodies, role delegation, persisted mute expiry, and duplicate-safe migration checks.

A PR does not deploy or restart the running bot. After merge, follow the upgrade steps above and verify `/search`, `/config`, recommendation acceptance, and timed mute expiry in a test server before rollout.

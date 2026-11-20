# Custom email alerts

The Pages worker reads `/alerts-feed.json` through the static asset binding on every dispatch. The feed uses the existing call ID, the call's source type, and the directory outlet ID when an entry exists. Alerts link to the directory entry or to the call's entry on the Calls page. Keep the source call ID stable throughout a submission window. Give a new window its own ID.

## Filters

- Empty selections mean Any. Choices within each group are combined with OR, and the genre, kind, region, and pay filters are combined with AND.
- Kinds come from the call type in `data/calls.json`. Genres are keyword matches against the outlet name and notes and the call title and details. The labels are Books & reviews, Arts & visual culture, Film & TV, Music, Poetry, and General culture. General culture also covers listings without a genre match. The patterns are in `build.py` and approximate what a listing covers.
- The region mapping looks for worldwide markers and country names or abbreviations in the directory region field. For calls without a directory entry, the outlet name supplies any country hint (for example, “The Wire (UK)” and “AICA-USA”). Choose “Open to writers anywhere” by itself for worldwide calls only. A country choice includes worldwide calls and listings tagged with that country. “Other regions” covers listings without a recognized region. Always confirm eligibility on the call's own page.
- Minimum pay uses the outlet's `pay_usd_max`, the top of its recorded per-piece range in USD. Explicitly unpaid calls have a value of zero. A missing per-piece figure, including per-word rates and calls without a directory rate, is included only with “Include calls without a stated per-piece rate.”

## Dispatch rules

All dispatch dates use Asia/Seoul (UTC+9). Deadlines include the deadline day.

| Alert | Rule |
| --- | --- |
| Opened, dated | The opening date is today or up to 7 days ago and the deadline, if any, is today or later. For a call without a deadline, its opening date must also be after the member's first live dispatch date. |
| Opened, no opening date | Entries in the active call list are treated as open if their deadline, if any, is today or later. The worker records their first sighting and can send an opening alert for up to 7 days after the sighting. For a call with no deadline, the sighting must be after the member's first live dispatch began. |
| 7-day reminder | The deadline is 3 through 7 days away. |
| 2-day reminder | The deadline is today or 1–2 days away. |

On the first live dispatch after enabling alerts, a member only gets matches with a stated deadline today or later. This sets a baseline and avoids a backlog of rolling calls. A run groups all new matches for a member into one email and reserves one D1 row per member, call and alert type before sending. A failed send releases its rows so the next dispatch can retry matches still in their date windows. Existing dedup rows also apply if a member turns alerts back on.

## Production configuration

| Pages variable | Value |
| --- | --- |
| `ALERTS_CRON_SECRET` | Secret used in the `X-Pitchboard-Cron` header for every internal endpoint. |
| `ALLOW_D1_MIGRATE` | Set to `on` temporarily to enable the D1 migration endpoint. Leave it unset for normal operation. |
| `RESEND_API_KEY` | Secret for the Resend HTTP API. Verify the sending domain in Resend for `The Pitchboard <pitchboard@soulbound.co.kr>`. |
| `ALERTS_SENDING` | Set to `on` to send. Sending also requires the Resend key and the existing `SESSION_SECRET`. |
| `IP_HASH_SALT` | Secret used to hash client IPs for pay-report limits and corroboration. Keep it stable so the same connection continues to count as one. |

The existing `DB` binding and `0001_members.sql` schema remain in use. If the database still needs the alerts and pay reports schema, take a backup, set `ALLOW_D1_MIGRATE` to `on` in the Pages environment, and call the migration endpoint. Remove `ALLOW_D1_MIGRATE` after the migration succeeds. Store the backup privately because it includes member addresses and stored IP hashes.

| Method and path | Behavior |
| --- | --- |
| `GET /api/internal/backup` | JSON arrays for `members`, `alert_prefs`, `alert_sends`, `pay_reports`, and `alert_call_seen`. Missing tables return empty arrays. |
| `POST /api/internal/migrate` | Idempotently applies `migrations/0002_alerts_and_pay_reports.sql`, embedded in the worker. Authenticated requests receive `404` with `{"error":"not_found"}` unless `ALLOW_D1_MIGRATE` is `on`. |
| `POST /api/internal/alerts/dispatch` | Run daily from the external scheduler. Add `?dry_run=1` to preview. |
| `GET /api/internal/pay-reports` | Lists reports for review and includes the distinct connection count per outlet. |
| `POST /api/internal/pay-reports/<id>` | Sets a report's status using a JSON body with `status` set to `approved` or `rejected`. |

For dispatch, `matched` counts member digests with undelivered matches, `sent` counts successful emails, `skipped` counts digests skipped because sending was bypassed or the rows were already claimed or preferences changed, and `remaining` counts failed or deferred digests. Dry runs and disabled sending leave all dispatch state untouched. The worker attempts at most 15 emails per request, allowing for 47 subrequests if every attempt fails. If a successful batch leaves deferred matches, call the endpoint again to continue. See the [Workers subrequest limits](https://developers.cloudflare.com/workers/platform/limits/) and [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).

Each email includes a signed unsubscribe URL in the body and in the `List-Unsubscribe` header. Both clicking the link and the mail client's one-click POST turn alerts off immediately. Rotating `SESSION_SECRET` also invalidates existing unsubscribe links. Members can always turn alerts off in their preferences.

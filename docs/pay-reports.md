# Critic pay reports

Outlet pages accept anonymous amounts for a piece or a word, the currency, the piece type, and the year of payment. The API records the report and a SHA-256 hash made from Cloudflare's client IP and the private `IP_HASH_SALT`. It accepts up to three reports per connection per outlet in a rolling 30-day window and ten reports per connection overall per Seoul calendar day. The worker stores the hash and has no fields for a name, email, raw IP, or user agent.

## Currency and outlier checks

| Currency | USD per unit |
| --- | ---: |
| USD | 1 |
| GBP | 1.33 |
| EUR | 1.15 |
| CAD | 0.72 |
| AUD | 0.66 |
| KRW | 0.0007 |

The worker uses fixed approximate rates. GBP, CAD, and AUD use the same values as [the directory](../data/FX_NOTE.md). The permitted range is above zero and up to USD 20,000 per piece or USD 5 per word. “Other” retains the original amount for review, up to one billion in the original currency. With no currency code for conversion, its stored USD value is empty and it stays out of the public figures.

Each report starts as pending. The worker flags a USD per-piece report when it exceeds three times the outlet's recorded `pay_usd_max` or falls below one-tenth of it. For either unit, it also flags rates greater than three times or below one-third of the median of other comparable reports for that outlet and unit. The comparison uses converted reports that are unflagged or approved and excludes rejected reports. If a reference figure is missing, that comparison is skipped.

## Publication and review

The current year and the previous two calendar years form the automatic publication window. For each outlet and unit, recent unflagged pending reports can enter the aggregate once there are at least two recent eligible reports from two distinct connection hashes. Recent approved reports can supply corroboration. Approved USD reports always count, including older reports and flagged reports. Rejected reports always stay out.

The public summary returns a count, median, minimum, maximum, and latest year for each qualifying unit in USD. When neither unit qualifies, the endpoint returns only `{"shown":false}`. The public outlet page displays critic reports below the directory rate as “Critic-reported pay (unverified).” Directory pay and sorting continue to use the outlet data.

Reviewers can list reports at `GET /api/internal/pay-reports` and approve or reject them through `POST /api/internal/pay-reports/<id>`. The review list shows the distinct connection count per outlet and omits the hashes. See the [internal endpoint configuration](alerts.md#production-configuration).

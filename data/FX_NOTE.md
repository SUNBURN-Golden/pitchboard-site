# pay_usd_max / pay_usd_per_word

Added 2026-10-20 (KST). `pay_usd_max` is the top of the stated pay range in `pays`, converted to USD and rounded to a whole dollar. `null` means the amount is unstated, unconfirmed (third-party only), unpaid, or per-word only.
`pay_usd_per_word` is the stated per-word rate in USD (top of range), else `null`. Where only a floor is stated ("from $350", "$1,000+") the floor is used.
Canadian outlets quoting "$" are read as CAD; Australian outlets quoting "$" as AUD.

Approximate FX used (Oct 2026): 1 GBP = 1.33 USD, 1 CAD = 0.72 USD, 1 AUD = 0.66 USD.

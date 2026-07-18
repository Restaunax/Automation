# QA update — email-safe test runs + a green nightly

**Subject:** Automation update — email tests are now opt-in (tags), and the nightly is green again

Hi team,

Two changes just landed on the `Automation` suite. Short version: **running the
tests locally no longer sends emails**, and the nightly should be **green** again.
Here's what you need to know.

---

## 1. Emails are the reason — and here's the fix

Our backend sends transactional email through Mailtrap, which caps at **500
messages/month**, and we were hitting it. The suite was the main cause: a demo
submission sends **2 emails** (one to the customer, one to the company inbox),
`globalSetup` was submitting one on **every** run, and a full run adds up to
**~21 emails**. Run that a few times a day locally and the month's quota is gone.

**What changed:** email-sending tests are now **tagged `@email`** (with `@demo`
for the demo subset) and are **excluded from the default run**. There are no more
`SEND_DEMO_EMAILS` / `SEND_ACCOUNT_EMAILS` env flags — delete them from your
`.env`; they do nothing now. `globalSetup` no longer submits a demo at all.

The upshot: **`npm test` (and the nightly) send zero email.** You only send email
when you explicitly ask to.

## 2. The commands you'll actually use

| I want to…                     | Command                           | Sends email? |
| ------------------------------ | --------------------------------- | ------------ |
| Run the normal suite           | `npm test`                        | No           |
| Run just the test I'm writing  | `npx playwright test -g "TC-142"` | No           |
| Watch/pick tests interactively | `npm run test:ui`                 | No           |
| Validate the email flows       | `npm run test:email`              | ⚠️ ~19       |
| Validate just the demo flow    | `npm run test:demo`               | ⚠️ a few     |
| Full validation incl. email    | `npm run test:all`                | ⚠️ ~21       |

Rule of thumb: **when you're writing or checking one test, run just that test** —
don't run the whole suite to check one thing. Only reach for `test:email` /
`test:demo` when you're specifically validating an email flow and the Mailtrap
quota has headroom.

## 3. CI

- **Nightly** (`e2e-nightly.yml`): runs everything **except** `@email` — no
  emails, every night.
- **Weekly email job** (`e2e-email-weekly.yml`, new): runs the `@email` group on
  a Monday schedule + on-demand (`workflow_dispatch`). ~19 emails × ~4/mo ≈ 76/mo
  — safely under the cap, so the email flows still get real coverage.

## 4. The nightly is green again

The nightly had been failing every night for ~2 weeks. Root causes, now fixed:

- **TC-142 (Daily Report):** the test asserted a hardcoded revenue number that no
  longer matched what the backend records (it prices orders server-side). Fixed to
  assert against the real menu-item price.
- **TC-99 (customer checkout):** the storefront changed — the menu's cart button
  now goes straight to `/checkout`; the test was waiting on an old pop-up that no
  longer exists. Fixed.
- **Coupon tests (TC-157/159/162):** intermittent timing flakes — added proper
  waits for the table/rows to load before interacting.
- **Gift-card purchase tests (TC-165/166/169):** these send a recipient email, so
  they moved into the `@email` group (run them via `test:email`). Their
  intermittency gets diagnosed on the next deliberate email run.

## 5. One heads-up (not a blocker)

QA has a backlog of ~80 leftover "Automation Items" menu categories from old runs
that the teardown can't auto-delete (they hold archived items the delete API
can't see — and we intentionally did **not** change the backend guard for a test).
New runs no longer add to it; the teardown log now shows a single summary line
instead of 80+ warnings. Clearing the backlog needs a one-time manual admin pass
when someone has a minute — happy to do it.

Full detail lives in `TEST_PLAN.md → Test execution strategy` and `RUNNING_TESTS.md`.
Shout if anything's unclear.

Thanks,

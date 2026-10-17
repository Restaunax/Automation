# Local clone storage — why `.git` can be 14 GiB, and the fix

**Audience:** anyone (human or AI assistant) on a computer with an older clone of
this repo. If you were pointed here with "fix the storage issue", follow
[§3 Fix it](#3-fix-it) on the machine you are on.

---

## 1. Symptom

The Automation folder is ~15 GB and almost all of it is `.git`:

```bash
du -sh .git          # bloated: ~14G   healthy: a few MB
```

The repo on GitHub is only ~80 MB. The extra space exists only in local clones.

## 2. Cause

`e2e.yml` publishes the Allure test report to the **`gh-pages`** branch on every
CI run. Until Oct 2026 every publish stacked a new commit on the previous one, so
every report ever published — including large Playwright trace zips — stayed in
git history. `gh-pages` reached ~12 GiB over ~243 deploys.

That has been fixed on GitHub (see [`e2e.yml`](../.github/workflows/e2e.yml)):

- `force_orphan: true` on the `peaceiris/actions-gh-pages` step — each publish
  replaces `gh-pages` with a single commit, no history.
- The "Strip Playwright trace zips" step keeps traces out of the published report.

**Do not remove either setting** — `gh-pages` would start growing again.

But any clone that fetched `gh-pages` before the fix still holds the old history:
git keeps it alive through reflogs and never cleans it up on its own. A clone
that still fetches `gh-pages` also keeps collecting each new nightly report, so
it slowly grows again even after the fix.

Code history is **not** affected (all code branches together are ~5 MB), so no
history rewrite or force-push is needed — this is a per-machine cleanup only.

## 3. Fix it

Run from the repo root. First a dry run — it changes nothing and reports whether
it is safe:

```bash
git pull
bash scripts/slim-clone.sh --check
```

If it prints `✓ Safe to clean`, run it for real:

```bash
bash scripts/slim-clone.sh
```

Expect `.git` to go from ~14G to a few MB. The gc step can take a few minutes.

What the script does ([`scripts/slim-clone.sh`](../scripts/slim-clone.sh)):

1. Sets the fetch refspec to all branches **except** `gh-pages`
   (`^refs/heads/gh-pages`) so it is never downloaded again.
2. Refuses to continue if any local branch (or detached HEAD) has commits that
   are on no remote branch, or if there are stash entries — expiring reflogs
   would lose those.
3. Deletes the `origin/gh-pages` (and any local `gh-pages`) ref, expires all
   reflogs, and runs `git gc --prune=now`.

Uncommitted changes in the working tree, `.env`, `node_modules` and untracked
files are not touched.

### If the check fails

- **"Local work not on GitHub"** — push the listed branches
  (`git push -u origin <branch>`), or delete them if they are abandoned
  (`git branch -D <branch>`), then re-run. _AI assistants: ask the user which
  — don't delete a branch on your own._
- **"You have stash entries"** — inspect with `git stash list` / `git stash show -p
stash@{N}`; commit what matters or `git stash clear`. _AI assistants: ask the
  user before clearing._

### Alternative: re-clone

If the machine has no local work worth keeping, deleting the folder and
re-cloning gives the same result:

```bash
git clone --single-branch --branch qa https://github.com/Restaunax/Automation.git
```

Copy `.env` from the old folder first — it is not in git. Then
`npm install && npx playwright install chromium`.

## 4. Verify

```bash
du -sh .git                                  # a few MB
git config --get-all remote.origin.fetch     # includes ^refs/heads/gh-pages
git branch -r | grep -x '  origin/gh-pages'  # prints nothing
```

(`origin/ci/gh-pages-size` is an ordinary code branch, not the report branch.)

## 5. New clones

Always clone with `--single-branch --branch qa` (as in
[`RUNNING_TESTS.md`](../RUNNING_TESTS.md#1-one-time-setup)). A plain
`git clone` fetches `gh-pages` too — only ~80 MB today, but it grows with every
nightly report. If you already did a plain clone, run the script once.

The hosted reports are viewed at <https://restaunax.github.io/Automation/>; you
never need `gh-pages` locally.

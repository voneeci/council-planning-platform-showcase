# ADR 0004: Flyway for schema migrations

**Status:** Accepted, 2026-09-05
**Context:** `DATA-MODEL-PROJECT-PLAN.md` §3 and §6, decided as part
of §6's 5 resolved decisions, after two prior reversals on the same
day. Written up as its own ADR 2026-09-09, per §6's own list of the
ADRs this plan owed.

## Decision

Use Flyway (plain versioned `.sql` files under `migrations/sql/`, run
via `migrations/run_flyway.py`, a thin wrapper loading credentials
from `.env`) for every schema change to `calc.*` and every structural
change to `dbo.*`, from `V001` onward - currently at `V231`.

## Why - three positions, in order, each overturned by a fact that changed

This is worth recording in full; each reversal turned on something
real, not indecision:

1. **First position: a full migration framework**, reasoned about
   purely on how the choice would read to a prospective reseller
   consultancy evaluating the demo. **Rejected** - migration tooling
   is invisible to an end client regardless of which tool is chosen;
   that reasoning never actually held up once stated plainly.
2. **Second position: lightweight** - numbered `.sql` files plus a
   small bespoke Python runner, matching the pattern already used by
   this project's own `run_sql.py`/`grafana_api.py` scripts. Reasoning:
   Flyway's install/setup tax appeared to compete with the (separate,
   demo-content) Sept 14 deadline.
3. **Settled on Flyway**, once it was clear **Phase 1 is built
   entirely inside the isolated `calc` schema (`DATA-MODEL-PROJECT-PLAN.md`
   §4) and can't affect the Sept 14 demo either way** - the deadline
   was never actually a constraint on this decision, since the
   existing 8 dashboards stay fully demoable regardless of how far
   Phase 1 has gotten. Combined with the install-and-leave operating
   model (§3's own table: the client's own IT team inherits long-term
   maintenance with no ongoing support relationship, and is far more
   likely to already know Flyway - a standard, widely-taught
   tool - than a bespoke script pattern invented for this project
   alone), there was no real reason left to defer adopting it. Starting
   with Flyway from Phase 1 means never needing a "convert everything
   at first handover" step.

## Flyway over Liquibase specifically

Plain versioned `.sql` files, no XML/YAML changelog abstraction layer
on top of them - every migration is exactly the SQL Server DDL/DML it
runs, readable and reviewable without translating a changelog format
first. SQL Server support is a first-class citizen in Flyway rather
than one dialect among many. Liquibase's real strength - genuine
database-engine portability - buys nothing here: this project is
committed to SQL Server regardless (the `mssql` datasource is baked
into every dashboard panel), so paying Liquibase's abstraction cost for
portability this project will never use would be pure overhead.

## Consequences

- **231 migrations and counting**, every one of them a plain,
  reviewable `.sql` file with a comment block explaining its own
  reasoning - this project's own git history is Flyway's version
  history, so `git log migrations/sql/` is a real audit trail of every
  schema decision, in order, without needing a separate changelog.
- Flyway's `validate` step (`migrations/run_flyway.py info`/`validate`)
  catches the "someone edited an already-applied migration file" class
  of error automatically - every migration this project ships is
  checksummed against what actually ran.
- **Forward-only, by design and by practice** - this project has never
  edited an applied migration's history to "fix" it; a mistake gets a
  new migration that corrects it (e.g. `V160` reverting `V158`/`V159`'s
  `SAGD11` redefinition, rather than editing `V158` itself). Anyone
  inheriting this project can trust that the migration files on disk
  are exactly what ran, in the order they ran, with no silent rewrites.
- The client's own IT team needs `migrations/run_flyway.py migrate` and
  a `.env` with real credentials to apply schema changes - no other
  tooling, no reseller-specific dependency, matching the install-and-
  leave model this decision was made for.

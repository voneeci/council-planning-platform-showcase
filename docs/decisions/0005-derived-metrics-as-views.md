# ADR 0005: Derived metrics are live SQL views, not a batch-computed job

**Status:** Accepted, 2026-09-05 (implicit in `DATA-MODEL-PROJECT-PLAN.md`
§2's original design; never revisited or seriously reconsidered since).
Written up as its own ADR 2026-09-09, per §6's own list of the ADRs
this plan owed. **Amended 2026-09-16** — one of this ADR's own two
"Revisit only if" conditions was met; see the Amendment section below.
The decision itself still stands for every other derived metric; this
is a scoped, one-metric exception, not a reversal. **Extended
2026-09-30 by ADR 0007**: every dashboard now reads stored copies of
the derived views (`snap.*`), rebuilt after every promote and migrate;
the views themselves stay live, as decided here. The V232 snapshot
described below was retired by V298 (its figures are now
`snap.sroi_components` and `snap.sagd1`).

## Decision

Every derived metric in `calc.*` (anything `calc.dim_datapoint`
classifies `data_type = 'derived'` - `SAGD1`, the `SROI0x` chain, every
`calc.v_*` emissions/intensity/rollup calculation) is implemented as a
SQL `VIEW`, recomputed live on every query. None are pre-computed and
stored as extra rows by a scheduled batch job.

## Why

- **No "did anyone remember to re-run the job" failure mode.** A
  batch-computed figure is only as current as its last successful run
  - a job that silently fails, or simply hasn't run yet since an input
  changed, leaves a stale number sitting in a table looking exactly as
  authoritative as a correct one. A view can't go stale this way: the
  moment `calc.fact_metric_value` or a `calc.ref_*` table changes, the
  next query against the view reflects it, automatically, with no
  separate recompute step to forget.
- **Proven directly, more than once, this session.** `calc.v_water_emissions`'s
  correction (§12.8) - fixing one flawed trusted input - cascaded
  automatically through `calc.v_total_emissions` and `calc.v_sroi02`
  with zero manual re-editing, exactly the "change an input, everything
  downstream recomputes" property this decision exists to guarantee.
  The solar-netting change (`V143`) and every real-anchor correction
  throughout this project's history worked the same way, because
  nothing was ever a stored, independently-updatable copy of a
  calculation.
- **Fits this project's existing all-SQL panel-query style directly.**
  Every Grafana panel in this project is already a raw SQL query
  against the `mssql` datasource - a `calc.v_*` view is just another
  table-shaped thing a panel can `SELECT FROM`, no different in kind
  from querying `calc.fact_metric_value` directly. A batch-computed
  table would look identical from a panel's perspective but carry the
  staleness risk above for no visible benefit.

## Consequences

- **No calculation job to schedule, monitor, or fail** - there is
  nothing running on a cron/scheduler anywhere in this project's
  calculation path. The write-back layer's staging/promotion scripts
  (`Database update information and documents/`, Phase 4) are the closest thing to a "job" this
  project has, and even they only ever touch `calc.fact_metric_value`
  (real inputs) and `calc.ref_*` (real reference data) - never a
  derived-metric table, because there isn't one.
- **A metric marked `'derived'` with no `calc.v_*` view behind it is
  always a bug, not a style choice** - this happened twice
  (`SAGD6`/`SAGD7`, `docs/Claude working docs/CALCULATION-ENGINE-BUILD-LOG.md` 2026-09-09;
  `TBM01`-`10`/`CEW02`/`CEW05` earlier) and both times the fix was
  building the real view, never deciding a batch job was acceptable
  after all.
- **Revisit only if**: a formula needs procedural logic a
  single `SELECT` can't express (none has, across 90 views, at this
  project's data volume), or live recomputation ever becomes a real
  performance problem. **The second condition was met, once** - see
  the Amendment below.

## Amendment (2026-09-16): one metric, not a reversal

`SAGD1` (the Sustainability Return Indicator) and the 7-view
`SROI01`-`07` chain behind it turned out to be exactly the "real
performance problem" this ADR's own exit clause anticipated - not from
data volume (this schema never approaches that), but from **query-plan
compile cost**: the 7-way join those views require compiles in 33s-256s
from a cold plan cache, confirmed by direct timing
(`CLAUDE.md`'s "SROI/SAGD1 compile instability" section,
`migrations/sql/V232__snapshot_sroi_and_sagd1_for_dashboard_load_time.sql`).
An `OPTION (FORCE ORDER)` hint (`V226`) helped but didn't hold under
real dashboard traffic.

**The fix (`V232`) is a scoped exception, not a reversal of this
decision**: the 4 dashboard panels that display `SAGD1`/the SROI
components (Overarching panels 5/20/22, Homepage panel 12) now read a
snapshot table (`calc.snap_sroi_components`, and a thin derived view
`calc.v_sagd1_snap`) refreshed by hand via
`calc.usp_refresh_sroi_snapshot` - not automatically, and not on a
schedule. This means, for this one metric only, the "no calculation
job to schedule, monitor, or fail" and "did anyone remember to re-run
the job" points above no longer hold: someone genuinely has to
remember to run the refresh after an update that changes an SROI
input, or the 4 panels keep showing the old figure with nothing on
screen to flag it (see `ANNUAL_UPDATE_GUIDE.md`).

**What's unchanged**: `calc.v_sagd1` and `calc.v_sroi01`-`07`
themselves are untouched, schema-bound, and still fully live - this
decision's reasoning still applies to them and to every one of the
other ~85 derived views in this schema. Query them directly (as the
Metric Catalogue, Data Model Guide worked examples, and the golden-value
regression test all still do) and you get a live, fresh recomputation,
exactly as this ADR describes. Only the 4 dashboard panels' own query
was repointed at the cache, purely to keep dashboard load time
reasonable - the metric's calculation and its source of truth in the
data model did not change.

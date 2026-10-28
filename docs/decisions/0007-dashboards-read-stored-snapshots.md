# ADR 0007: Dashboards read stored snapshots of the derived views

**Status:** Accepted and implemented, 2026-09-30 (base V296-V298,
fleet V009; amended 2026-10-11, V391: a migrate rebuilds only the
stale snapshots; build plan and measurements in
`docs/DASHBOARD-SNAPSHOT-PLAN.md`). After a SQL Server restart, the
dashboards' 201 queries took 6.1 s cold in total, and every dashboard
under 1.2 s (was up to 45.5 s). Extends ADR 0005's 2026-09-16
amendment from one metric to every derived view a dashboard reads. ADR
0005's decision itself stands: derived metrics are still defined as live
views.

**Context:** The figures change once a year, at the annual update, and
are then viewed many times. Yet every dashboard load recomputes them
from `calc.v_*` views. On a host short of memory, SQL Server's working
set gets trimmed (to about 126 MB on the demo laptop, 2026-09-29), and
the first viewer afterwards pays to read views, statistics and pages
back in.

That was measured on 2026-09-29 (`dashboards/time_dashboard_queries.py`,
164 panel and variable queries across 11 dashboards):

- **Slow queries.** 8 queries took 2 to 25 s cold (Cost and Benefit
  45.5 s summed over 28 queries, Buildings 23.5 s, Biodiversity 13.7 s).
- **Warm.** Every dashboard's queries sum to under 1 s once warm.
- **Not compile cost.** Re-running the slow ones with a forced
  recompile once memory was warm took under 1 s each. So the cost was
  bringing the objects back into memory, not the SROI-style compile
  search that ADR 0005's amendment fixed.
- **Snapshot dashboards.** The two dashboards that already read stored
  results stayed at 0.3 s total, even cold: Fleet Transition Planner
  (`fleet.snap_vehicle_vci`) and Overarching (`calc.snap_sroi_components`).

## Decision

1. **Dashboards read snapshots, never derived views.** Every derived
   view a base dashboard panel reads gets a stored copy in a new
   `snap` schema, with the same columns and types (`calc.v_total_emissions`
   → `snap.total_emissions`). Panels read `snap.*`, or `calc` fact,
   dimension and reference tables directly, which are already stored.
   Products follow the same rule in their own schema (`fleet.snap_*`,
   as `fleet.snap_vehicle_vci` already does).
2. **The views stay the method.** `calc.v_*` remain schema-bound, live
   and authoritative. The Metric Catalogue, worked examples,
   golden-value tests and ad hoc queries keep reading them. A snapshot
   is a copy for display, never a source.
3. **One refresh for everything, run automatically.**
   - `snap.usp_refresh` rebuilds every registered snapshot from its
     source view in a single transaction and logs it in
     `snap.refresh_log`. It runs at the end of every `promote.py` run
     that wrote anything, and after every Flyway migrate (in
     `run_flyway.py`'s post-migrate step, after statistics are updated). So neither a data update nor a view change
     can leave the dashboards stale without someone noticing.
   - A product refreshes its own snapshots in its own promote, as fleet
     already does.
4. **Staleness is tested, not trusted.** A test compares every snapshot
   with its live view, both ways. Another test fails if any dashboard
   panel reads a `calc.v_*` view.

## Why

- **Speed that doesn't depend on the host.** It matches the fastest
  measured case (stored results, 0.3 s cold), and it holds on a
  memory-starved laptop as well as on a council server. Server sizing
  still matters, but the dashboards no longer depend on it.
- **One rule, not a list of exceptions.** Snapshotting only the slow
  views would leave a list to maintain and re-measure. "Dashboards read
  `snap`" can be checked by a test.
- **Cheap to keep current.** Reading all 72 `calc` views the dashboards
  use takes 2.3 s (3,662 rows), so refreshing on every promote and
  migrate costs nothing noticeable.
- **Closes a gap from ADR 0005's amendment.** Today the SROI snapshot is
  refreshed by hand (`EXEC calc.usp_refresh_sroi_snapshot`), and
  `promote.py` doesn't run it. It folds into the automatic refresh.

## Consequences

- **More tables.** 74 base snapshot tables and 7 fleet ones (as
  built). They are generated from the views' own column types (V232's
  lesson: a mismatched precision changed a result), never written by
  hand.
- **Changing a view's columns means changing its snapshot table too.**
  The refresh then fails loudly on the next migrate, and the column-drift
  test fails before that.
- **Between a hand edit and the next promote or migrate, dashboards show
  the previous figures.** That covers an edit made directly in SQL,
  outside the pipeline. `snap.refresh_log` shows when they were last
  refreshed, and the parity test catches it.
- **A failed refresh doesn't undo a promotion.** `promote.py` commits
  each step. It reports the failure and the command to re-run.
- **Revisit if** data starts changing more often than a dashboard is
  viewed (live monitoring feeds, for example). Snapshots then trade
  freshness for speed the wrong way.

## Amendment, 2026-10-11: a migrate rebuilds only the stale snapshots (V391)

Rebuilding every snapshot after every migrate took 2.5 minutes warm
and about 10 minutes after a view chain was rebuilt, even for a
migration that changed one budget figure. Rebuilding only the
snapshot that was edited would leave the ones above it stale: change
the solar yield and the electricity, emissions and Sustainability
Return Indicator snapshots all move too.

So `run_flyway.py` now rebuilds the snapshots the applied migrations
made stale, worked out by `migrations/snapshot_scope.py`:

- **What changed:** every object an applied script writes rows to or
  redefines (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, CREATE, ALTER,
  DROP, a procedure it runs), plus every object the database created
  or altered since the migrate began.
- **Who reads it:** SQL Server's dependency records for every view,
  function and procedure, followed to the bottom of each snapshot's
  view. A snapshot that reads a stale snapshot is stale too.
- **Always rebuilt:** a snapshot table the migrate recreated, one
  never refreshed, and an empty one.
- **Products whole or not at all:** the Buildings Transition Planner
  plans its capital program between its two passes.
- **Everything, when unsure:** a fresh install, a failed migrate,
  dynamic SQL that runs in a script, a script it can't read, missing
  dependency records, or `--full-refresh`. The annual update
  (`promote.py`) and `refresh_snapshots.py` still rebuild everything.

`snap.usp_refresh` takes `@tables`, a comma-separated list (V391);
left out, it rebuilds every snapshot as before. V391's own migrate took
21 seconds (it changed only the procedure, so no snapshot was rebuilt);
`refresh_snapshots.py --check` then found all 109 snapshots matching
their views.

**The risk** is a stale snapshot the scope misses. It only looks at
what the migrations changed, so a snapshot already stale beforehand (a
direct SQL edit, a failed refresh) stays stale until
`refresh_snapshots.py` runs, as before. The parity tests and
`refresh_snapshots.py --check` compare every snapshot with its view,
and catch both.

## Alternatives considered

- **Snapshot only the slow views.** Fewer tables, but a moving list,
  and the next slow view is found by a viewer. Rejected for the reasons
  above.
- **Indexed views.** SQL Server's own stored views. Most dashboard views
  use window functions, outer joins or CTEs, which indexed views don't
  allow.
- **Query Store plan forcing.** It fixes plan choice, not the first-touch
  memory cost measured here.
- **A job that keeps the cache warm.** It adds a scheduler to a platform
  that has none (ADR 0005), and it loses to memory trimming anyway.
- **`min server memory` on SQL Server.** Worth setting on a council
  server, and it goes in the IT Handbook as advice. But it is host
  configuration outside the platform, so it can't be the whole fix.
- **Grafana query caching.** Grafana Enterprise and Cloud only.

## Amendment, 2026-10-11: panels read the figures through a snapshot too (V394)

Decision 1 let panels read `calc` fact, dimension and reference tables
directly, since they are already stored. 77 panel queries read
`calc.fact_metric_value` that way. Part F (flexible-model plan) takes a
dormant or not_applicable metric off the dashboards in the snapshots,
and those queries would have gone round it: a metric marked dormant
after its figures were loaded would still have shown them (Reece:
"Shouldn't the panel queries hit the snapshot tables?").

So the figures have a snapshot like every view: `calc.v_metric_value_shown`
(every figure whose metric isn't dormant or not_applicable) is copied
to `snap.metric_value`, clustered on code, year and facility, and every
panel and variable query reads it. `calc.fact_metric_value` keeps every
figure. A test fails if a dashboard names `fact_metric_value` again.
Dimension and reference tables (`calc.dim_period`, `calc.ref_*`) are
still read directly: a status doesn't apply to them.

At the same time (V392, V393) a calculated metric's status follows its
inputs, and the refresh works the statuses out first, then leaves the
snapshot of a dormant or not_applicable metric empty
(`snap.v_snapshot_metric_status` says which, and why). The comparison
with the views allows for it, so the parity tests stay exact.

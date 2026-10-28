"""Where this comes from (V304-V306, fleet V013-V014).

Every chart links to a dashboard that shows where its figures come from: for a metric, how it is worked out, its
inputs and the published rates it uses; for Cost and Benefit, the published figures a chart is built from; for the
Fleet and Buildings Transition Planners, their measures, registers and references. These tests hold that together:
(a) every chart has its link, and every link names figures that exist;
(b) every calculated metric's inputs and rates reach the page;
(c) both pages' queries run as Grafana's own login, for a calculated figure, a recorded one and a reference;
(d) the Fleet Transition Planner button shows only where the model is installed.
"""
import json
import os
import re
import sys
from urllib.parse import parse_qs, urlparse

import pytest

from conftest import REPO
from test_products import _login

sys.path.insert(0, os.path.join(REPO, "dashboards"))
sys.path.insert(0, os.path.join(REPO, "products", "fleet", "dashboards"))
sys.path.insert(0, os.path.join(REPO, "products", "buildings", "dashboards"))
import add_trace_links  # noqa: E402
try:   # a product's own trace: only in a package with that product (a council that bought the base alone has neither)
    import buildings_trace  # noqa: E402
except ImportError:
    buildings_trace = None
try:
    import fleet_trace  # noqa: E402
except ImportError:
    fleet_trace = None

BASE_TRACE = os.path.join(REPO, "dashboards", "Where_this_comes_from.v2.json")
FLEET_TRACE = fleet_trace.MIRROR if fleet_trace else None
PRODUCT_TRACES = [m for m in (fleet_trace, buildings_trace) if m]


def _fleet_installed(cur):
    cur.execute("SELECT OBJECT_ID('fleet.ref_measure', 'U')")
    return cur.fetchone()[0] is not None


def _buildings_installed(cur):
    cur.execute("SELECT OBJECT_ID('bldg.ref_measure', 'U')")
    return cur.fetchone()[0] is not None


def _links():
    """[(file, chart title, url)] for every "Where this comes from" link on every dashboard."""
    out = []
    files = add_trace_links.dashboard_files() + (
        ([fleet_trace.FLEET_DASHBOARD] if fleet_trace else []) +
        ([buildings_trace.BUILDINGS_DASHBOARD] if buildings_trace else []))
    for path in files:
        doc = json.load(open(path, encoding="utf-8"))
        for e in doc["spec"]["elements"].values():
            for link in e["spec"].get("links", []):
                if link.get("title") == add_trace_links.LINK_TITLE:
                    out.append((os.path.basename(path), e["spec"]["title"], link["url"]))
    return out


# ---------------------------------------------------- (a) every chart links, to figures that exist
def test_every_chart_links_to_where_its_figures_come_from():
    assert add_trace_links.missing_links() == []
    for product_trace in PRODUCT_TRACES:
        assert product_trace.missing_links() == []


def test_every_link_names_figures_that_exist(cur):
    cur.execute("SELECT datapoint_code FROM calc.dim_datapoint")
    metrics = {r[0] for r in cur.fetchall()} | {"none"}
    cur.execute("SELECT DISTINCT ref_table FROM calc.v_trace_reference")
    references = {r[0] for r in cur.fetchall()} | {"none"}
    fleet = _fleet_installed(cur)
    if fleet:
        cur.execute("SELECT measure_code FROM fleet.ref_measure")
        measures = {r[0] for r in cur.fetchall()} | {"none"}
        cur.execute("SELECT DISTINCT ref_table FROM fleet.v_trace_reference")
        fleet_refs = {r[0] for r in cur.fetchall()} | {"none"}
    buildings = _buildings_installed(cur)
    if buildings:
        cur.execute("SELECT measure_code FROM bldg.ref_measure")
        bldg_measures = {r[0] for r in cur.fetchall()} | {"none"}
        cur.execute("SELECT DISTINCT ref_table FROM bldg.v_trace_reference")
        bldg_refs = {r[0] for r in cur.fetchall()} | {"none"}
    bad, n = [], 0
    for f, title, url in _links():
        q = parse_qs(urlparse(url).query)
        n += 1
        if url.startswith(add_trace_links.TRACE_URL):
            bad += [(f, title, m) for m in q.get("var-metric", []) if m not in metrics]
            bad += [(f, title, r) for r in q.get("var-reference", []) if r not in references]
            if q.get("var-metric") == ["none"] and q.get("var-reference") == ["none"]:
                bad.append((f, title, "links to nothing"))
        elif fleet_trace and url.startswith(fleet_trace.URL):
            if fleet:
                bad += [(f, title, m) for m in q.get("var-measure", []) if m not in measures]
                bad += [(f, title, r) for r in q.get("var-reference", []) if r not in fleet_refs]
        elif buildings_trace and url.startswith(buildings_trace.URL):
            if buildings:
                bad += [(f, title, m) for m in q.get("var-measure", []) if m not in bldg_measures]
                bad += [(f, title, r) for r in q.get("var-reference", []) if r not in bldg_refs]
        elif (not fleet_trace and "/fleet-transition-planner-where-this-comes-from" in url) or \
                (not buildings_trace and "/buildings-transition-planner-where-this-comes-from" in url):
            continue   # a base dashboard's product row, shown only where the product is installed (test_products)
        else:
            bad.append((f, title, url))
    assert n > 150
    assert bad == []


# ---------------------------------------------------- (b) inputs and rates reach the page
def test_every_calculated_metrics_inputs_are_traced(cur):
    cur.execute("SELECT datapoint_code FROM calc.dim_datapoint")
    codes = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT datapoint_code, dependencies FROM calc.dim_datapoint WHERE data_type <> 'input'")
    expected = {(m, d.strip()) for m, deps in cur.fetchall() for d in (deps or "").split(",") if d.strip() in codes}
    cur.execute("SELECT metric_code, input_code FROM calc.v_trace_input")
    traced = {tuple(r) for r in cur.fetchall()}
    assert expected - traced == set()


def test_every_calculated_metric_has_its_rates(cur):
    """Each reference table a calculated metric depends on gives it at least one line of rates on the page. The one
    exception is a total of other metrics (fleet emissions), whose parts carry their own emission factors."""
    cur.execute("SELECT DISTINCT ref_table FROM calc.v_trace_reference")
    tables = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT datapoint_code, dependencies FROM calc.dim_datapoint WHERE data_type <> 'input'")
    expected = {(m, d.strip()) for m, deps in cur.fetchall() for d in (deps or "").split(",") if d.strip() in tables}
    cur.execute("SELECT DISTINCT metric_code, ref_table FROM calc.v_trace_rate")
    traced = {tuple(r) for r in cur.fetchall()}
    missing = expected - traced - {("CALC_FLEET_EMISSIONS_TOTAL", "calc.ref_emission_factor")}
    assert missing == set()


def test_every_reference_line_has_a_source(cur):
    cur.execute("SELECT ref_table, item FROM calc.v_trace_reference WHERE NULLIF(LTRIM(source_note), '') IS NULL")
    assert cur.fetchall() == []
    cur.execute("SELECT ref_table, item FROM calc.v_trace_reference WHERE item IS NULL")
    assert cur.fetchall() == []


# the products' lines that are the council's own records (their registers), which carry no link
PRODUCT_RECORDS = {"fleet.register", "bldg.register", "bldg.assessments", "bldg.appliances", "bldg.energy", "bldg.bills"}


def _unlinked(cur, view, allowed_flags):
    cur.execute(f"SELECT ref_table, item, quality_flag FROM {view} WHERE source_url IS NULL")
    return [(t, i) for t, i, q in cur.fetchall() if t not in PRODUCT_RECORDS and (q or "") not in allowed_flags]


def test_every_figure_on_the_page_is_linked(cur):
    """"We must have sources accessible for every single metric." Every line on each "Where this
    comes from" page has a link to its published source, unless it is the council's own record or modelled from other
    lines (V333; fleet V017; Buildings V002 on)."""
    views = ["calc.v_trace_reference"]
    if _fleet_installed(cur):
        views.append("fleet.v_trace_reference")
    if _buildings_installed(cur):
        views.append("bldg.v_trace_reference")
    missing = {v: _unlinked(cur, v, {"council records", "modelled", "pending"}) for v in views}
    # the Buildings Transition Planner's settings (energy rating bands and defaults) are the council's: they cite its
    # council source (bldg V021)
    if "bldg.v_trace_reference" in views:
        cur.execute("""SELECT r.ref_table, r.item FROM bldg.v_trace_reference r
                       JOIN bldg.ref_source_citation c ON c.table_name = REPLACE(r.ref_table, 'bldg.', '') AND c.row_code = r.item_code
                       JOIN bldg.ref_source s ON s.source_id = c.source_id AND s.source_kind = 'council'
                       WHERE r.source_url IS NULL""")
        settings = {tuple(r) for r in cur.fetchall()}
        missing["bldg.v_trace_reference"] = [d for d in missing["bldg.v_trace_reference"] if tuple(d) not in settings]
    assert not any(missing.values()), missing


def test_no_figure_is_waiting_for_its_source(cur):
    """Lines whose published source is still being confirmed (calc.ref_source P01). Expected to fail until the follow-up research on those sources is in."""
    cur.execute("SELECT ref_table, item FROM calc.v_trace_reference WHERE quality_flag = N'pending'")
    pending = cur.fetchall()
    if pending:
        pytest.xfail(f"{len(pending)} line(s) wait for a confirmed source: {[tuple(p) for p in pending]}")


# ---------------------------------------------------- the page's wording (V323)
def test_every_active_metric_says_what_it_means(cur):
    """Its plain wording, the source the page, the Data Dictionary and the Metric Catalogue show."""
    cur.execute("SELECT datapoint_code FROM calc.dim_datapoint WHERE status = 'active' "
                "AND NULLIF(LTRIM(description), '') IS NULL")
    assert cur.fetchall() == []


def test_formula_text_has_no_filler(cur):
    cur.execute("SELECT datapoint_code, formula_sql FROM calc.dim_datapoint WHERE formula_sql IS NOT NULL")
    assert [c for c, f in cur.fetchall() if re.search(r"\b(real|genuine|genuinely)\b", f, re.I)] == []


def test_formula_text_names_the_activity_index(cur):
    """No metric multiplies by an invented activity index: the six that did were rebuilt from their inputs (V360 to
    V362) and the index table dropped (V362)."""
    cur.execute("SELECT OBJECT_ID('calc.ref_narrative_activity_index')")
    assert cur.fetchone()[0] is None
    cur.execute("""SELECT datapoint_code FROM calc.dim_datapoint
                   WHERE datapoint_code IN ('CALC_CONTRACTOR_FUEL_EMISSIONS', 'CALC_CORPORATE_WASTE_TONNES',
                                            'CALC_REFRIGERANT_BUILDINGS_EMISSIONS', 'CALC_REFRIGERANT_FLEET_EMISSIONS',
                                            'CALC_EMPLOYEE_COMMUTING_VEHICLE_KM', 'CALC_BUSINESS_TRAVEL_EMISSIONS')
                     AND formula_sql LIKE N'%[_]INDEX%'""")
    assert cur.fetchall() == []
    cur.execute("SELECT OBJECT_NAME(object_id) FROM sys.sql_modules WHERE definition LIKE N'%narrative_activity_index%'")
    assert cur.fetchall() == []


def test_tree_canopy_value_is_traced_to_net_sequestration(cur):
    cur.execute("SELECT depends_on_code FROM calc.datapoint_dependency WHERE datapoint_code = 'CALC_SROI03'")
    assert [r[0] for r in cur.fetchall()] == ["CALC_TREE_CARBON_SEQUESTRATION"]


# ---------------------------------------------------- (c) both pages' queries run as Grafana's login
def _panel_sql(path):
    doc = json.load(open(path, encoding="utf-8"))
    for e in doc["spec"]["elements"].values():
        for q in e["spec"].get("data", {}).get("spec", {}).get("queries", []):
            sql = q["spec"]["query"]["spec"].get("rawSql")
            if sql:
                yield e["spec"]["title"], sql
    for v in doc["spec"]["variables"]:
        q = v["spec"].get("query")
        if isinstance(q, dict):
            yield v["spec"]["name"], q["spec"]["__legacyStringValue"]


# the panels' titles as the pages have them (retitled on the pages 13 and 14 October 2026, read back from Grafana)
@pytest.mark.parametrize("metric, reference, expect_rows", [
    ("'CALC_TOTAL_ELECTRICITY_EMISSIONS'", "'none'", {"The figures on this chart, and how each is worked out", "Published rates and sources behind this chart",
                                                      "What each calculated figure is worked out from"}),
    ("'TBE'", "'none'", {"The figures on this chart, and how each is worked out"}),
    ("'none'", "'calc.ref_leisure_centre_case_study','dbo.ComplianceStatus'", {"Published rates and sources behind this chart"}),
])
def test_where_this_comes_from_answers_as_grafana(env, metric, reference, expect_rows):
    cn = _login(env, "GRAFANA_DB_READER_USER", "GRAFANA_DB_READER_PASSWORD")
    try:
        cur = cn.cursor()
        with_rows = set()
        for title, sql in _panel_sql(BASE_TRACE):
            cur.execute(sql.replace("$metric", metric).replace("$reference", reference))
            if cur.fetchall():
                with_rows.add(title)
        assert expect_rows <= with_rows
    finally:
        cn.close()


def test_fleet_where_this_comes_from_answers_as_grafana(env, cur):
    if not fleet_trace or not _fleet_installed(cur):
        pytest.skip("the Fleet Transition Planner isn't installed here")
    cn = _login(env, "GRAFANA_DB_READER_USER", "GRAFANA_DB_READER_PASSWORD")
    try:
        c = cn.cursor()
        counts = {}
        for title, sql in _panel_sql(FLEET_TRACE):
            c.execute(sql.replace("$measure", "'VCI_BAND','STRATEGY_CAPEX'")
                         .replace("$reference", "'fleet.register','fleet.ref_vehicle_class'"))
            counts[title] = len(c.fetchall())
        assert counts["The measures on this chart"] == 2
        assert counts["The vehicle register and published references this chart uses"] > 1
    finally:
        cn.close()


# ---------------------------------------------------- (d) the product's button
def test_fleet_button_shows_only_where_the_model_is_installed():
    if not fleet_trace:
        pytest.skip("the package has no Fleet Transition Planner (its button's targets come with it)")
    for path in fleet_buttons_targets():
        doc = json.load(open(path, encoding="utf-8"))
        # straight under the dashboard's own buttons, a row of its own inside the first row
        first = doc["spec"]["layout"]["spec"]["rows"][0]
        assert first["spec"]["layout"]["kind"] == "RowsLayout"
        inner = first["spec"]["layout"]["spec"]["rows"]
        assert [r["spec"]["title"] for r in inner][1] == "Fleet Transition Planner button"
        row = inner[1]
        items = row["spec"]["conditionalRendering"]["spec"]["items"]
        assert items == [{"kind": "ConditionalRenderingVariable",
                          "spec": {"variable": "fleet_pdfm_installed", "operator": "equals", "value": "installed"}}]
        assert [v["spec"]["name"] for v in row["spec"]["variables"]] == ["fleet_pdfm_installed"]
        panel = doc["spec"]["elements"][row["spec"]["layout"]["spec"]["items"][0]["spec"]["element"]["name"]]
        assert "/d/fleetpdfm/" in panel["spec"]["vizConfig"]["spec"]["options"]["getOption"]


def fleet_buttons_targets():
    import fleet_buttons
    return fleet_buttons.TARGETS


def test_internal_dashboard_flag_matches_the_panels(cur):
    """The Data Dictionary's "Internal Dashboard?" is TRUE exactly for the active metrics a base dashboard panel reads
    (dashboards/mark_dashboard_metrics.py), and FALSE for every other metric, a switched-off one included (golden
    run, Run 2, finding 35: the promotions set it again after their rebuild). Run that script after changing a panel."""
    sys.path.insert(0, os.path.join(REPO, "dashboards"))
    import mark_dashboard_metrics
    shown = mark_dashboard_metrics.shown_codes(cur)
    cur.execute("""SELECT d.Code, d.[Internal Dashboard?] FROM dbo.DataDictionary d
                   JOIN calc.dim_datapoint c ON c.datapoint_code = d.Code""")
    wrong = [(code, flag) for code, flag in cur.fetchall() if (flag == "TRUE") != (code in shown)]
    assert not wrong, f"run dashboards/mark_dashboard_metrics.py: {wrong}"

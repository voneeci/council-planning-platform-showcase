# -*- coding: utf-8 -*-
"""Shared fixtures for the test suite -- see tests/TESTING-SUITE-RECORD.md.

Every DB-touching test gets its own connection via the `db`/`cur`
fixtures, which roll back on teardown (autocommit=False, cn.rollback()
in a finally block). Nothing here ever commits, so the live tables are
untouched no matter what a test does -- including a test that expects
its own write to fail.
"""

# Excerpt for the public showcase: the test markers and the connection and rollback fixtures.
# Helpers referenced here (load_env, GOLDEN_PERIOD_KEY, _golden_year_in_place) live in the private repository.

import os

import pyodbc
import pytest

MARKERS = {
    "install": "passes on any council's data: schema, views, pipeline behaviour, dashboards (the default)",
    "demo": "golden values from the demonstration council's synthetic data; no longer apply after the transplant",
    "dev": "needs files only the development repository has (plans, working documents, the history rebuild)",
}


def pytest_configure(config):
    for name, why in MARKERS.items():
        config.addinivalue_line("markers", f"{name}: {why}")


def pytest_collection_modifyitems(config, items):
    """Every test is exactly one of install, demo or dev (client delivery plan, step 5); one with no marker is an
    install check. A module's `pytestmark` applies to all its tests, so a file that mixes kinds marks each test.
    install.py runs `-m "install or demo"` on the demonstration and `-m install` once the council's own data is in."""
    for item in items:
        marked = sorted({m.name for m in item.iter_markers() if m.name in MARKERS})
        if len(marked) > 1:
            raise pytest.UsageError(f"{item.nodeid} is marked {' and '.join(marked)}: give it one of "
                                    f"{', '.join(MARKERS)}")
        if not marked:
            item.add_marker(pytest.mark.install)

def _raw_connect(autocommit=False):
    env = load_env(ENV_PATH)
    server, port = env["DB_SERVER"].split(",")
    # FLYWAY_TARGET_DB_OVERRIDE lets a disposable database (transplant
    # practice runs; backups/make_db_clone.py and restore_table.py use
    # this helper) point here instead of the real DEMO_DB_NAME, without
    # touching .env -- same mechanism
    # migrations/run_flyway.py already uses. A no-op for the regular
    # suite: unset, this resolves to DEMO_DB_NAME exactly as before.
    db_name = os.environ.get("FLYWAY_TARGET_DB_OVERRIDE") or env["DEMO_DB_NAME"]
    conn_str = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={server},{port};DATABASE={db_name};"
        f"UID={env['DEMO_DB_USER']};PWD={env['DEMO_DB_PASSWORD']};"
        "Encrypt=no;TrustServerCertificate=yes;"
    )
    return pyodbc.connect(conn_str, autocommit=autocommit)

@pytest.fixture
def db():
    """A connection dedicated to one test; every write is rolled back
    at teardown regardless of whether the test itself committed
    intent -- these pipeline functions never call cn.commit()."""
    cn = _raw_connect(autocommit=False)
    try:
        _golden_year_in_place(cn)
        yield cn
    finally:
        cn.rollback()
        cn.close()


@pytest.fixture
def cur(db):
    return db.cursor()

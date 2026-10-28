# Sample files

A few files from the private codebase, chosen to show how the platform is built and tested. They are shown as written, but they depend on the rest of the codebase, so they won't run on their own.

| File | What it shows |
|---|---|
| [tests/conftest_excerpt.py](tests/conftest_excerpt.py) | How every database test gets its own connection and rolls back at the end, so testing never changes live figures. Also how each test is marked as an install, demonstration or development check. |
| [tests/test_trace.py](tests/test_trace.py) | The tests behind the "Where this comes from" pages: every chart links to its sources, every linked figure exists, and the pages work through the dashboards' read-only login. |
| [dashboards/house_theme.js](dashboards/house_theme.js) | The shared look for every chart: one palette with fixed meanings, colours checked for contrast and colour blindness, and common defaults. |

Credentials are never stored in code. Connection details come from a local settings file that is never committed.

These samples are shared for viewing only. See [NOTICE.md](../NOTICE.md).

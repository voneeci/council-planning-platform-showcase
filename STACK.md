# Stack

The Council Planning Platform's full technology stack, as at October 2026.

## Languages

- Python 3.14 (3.10 minimum)
- T-SQL
- JavaScript (Node.js 24)
- HTML and CSS
- Markdown

## Database and migrations

- Microsoft SQL Server 2022 or later (built on 2025); SQL Server 2022 Express for packaged installs
- Flyway 13.5.0 for numbered, repeatable migrations
- Microsoft SqlPackage
- Microsoft ODBC Driver 18 (18.7) and pyodbc 5.3

## Dashboards and front end

- Grafana 13.2.4
- Business Charts panel (volkovlabs-echarts-panel 7.2.5) with Apache ECharts
- marked 12.0.2 and DOMPurify 3.1.6 for safe Markdown rendering
- tkinter for the setup wizard; Inno Setup 7.1 for the Windows installer

## Back end and APIs

- Python standard library `http.server`
- Model Context Protocol (MCP) Python SDK 2.2.0 for the read-only database and wiki server
- requests 2, the Grafana HTTP API and the Anthropic Messages API

## AI and retrieval

- Anthropic Claude and Microsoft 365 Copilot
- Snowflake arctic-embed-m-v1.5 embeddings, run in the browser with onnxruntime-web 1.29

## Documents and data tooling

- openpyxl 3.1 for Excel templates and workbooks
- Headless Google Chrome for PDF output
- markdownify 1.2, Beautiful Soup 4.15, lxml 6.1 and PyMuPDF 1.28

## Testing

- pytest 9
- Headless Microsoft Edge for browser checks
- Node.js scripts

## Video creation and editing

- Descript for editing video and transcripts
- claude.ai and Claude Code
- Google Chrome and Playwright for browser automation
- Node.js and Python, with Pillow for images and NumPy for numerical work
- ffmpeg and ffprobe for encoding and inspecting video
- Vosk for offline speech recognition
- cloudflared (Cloudflare Tunnel) for secure tunnels

## Source control

- Git and GitHub

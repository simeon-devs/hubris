"""`python -m hubris.mcp_server` — the stdio MCP entrypoint any client
(Claude Desktop, MCP Inspector, a script) can spawn to operate the twin."""

import anyio

from hubris.mcp_server.server import main

if __name__ == "__main__":
    anyio.run(main)

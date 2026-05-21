"""`mathtrainer` console command: starts the server and opens the browser."""
from __future__ import annotations

import threading
import webbrowser

import uvicorn

HOST = "127.0.0.1"
PORT = 8000


def main() -> None:
    url = f"http://{HOST}:{PORT}"
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"mathtrainer running at {url}  (Ctrl+C to stop)")
    uvicorn.run("mathtrainer.app:app", host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()

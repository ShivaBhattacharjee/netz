"""Stand-in for the Anthropic API that fails on purpose, to check AI failure handling (EDGE-CASES.md section 2) against a running worker.

Run:    MODE=429 python3 scripts/fake-anthropic.py
Worker: ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://127.0.0.1:9999 pnpm worker

MODE is one of 429, 529, 401, timeout, badjson, refusal, maxtokens.
"""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODE = os.environ.get("MODE", "429")


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: dict, headers: dict | None = None) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def error(self, code: int, kind: str, message: str, headers: dict | None = None) -> None:
        self.reply(code, {"type": "error", "error": {"type": kind, "message": message}}, headers)

    def message(self, text: str, stop_reason: str) -> None:
        self.reply(200, {
            "id": "msg_fake",
            "type": "message",
            "role": "assistant",
            "model": "fake",
            "content": [{"type": "text", "text": text}] if text else [],
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {"input_tokens": 1000, "output_tokens": 200},
        })

    def do_GET(self) -> None:
        if MODE == "401":
            return self.error(401, "authentication_error", "invalid x-api-key")
        self.reply(200, {"type": "model", "id": self.path.rsplit("/", 1)[-1], "display_name": "fake", "created_at": "2026-01-01T00:00:00Z"})

    def do_POST(self) -> None:
        self.rfile.read(int(self.headers.get("content-length", 0)))
        print(f"POST {self.path} -> {MODE}", flush=True)
        if MODE == "429":
            return self.error(429, "rate_limit_error", "Number of requests has exceeded your rate limit", {"retry-after": "120"})
        if MODE == "529":
            return self.error(529, "overloaded_error", "Overloaded")
        if MODE == "401":
            return self.error(401, "authentication_error", "invalid x-api-key")
        if MODE == "timeout":
            time.sleep(75)
            return None
        if MODE == "badjson":
            return self.message("this is not json", "end_turn")
        if MODE == "refusal":
            return self.message("", "refusal")
        if MODE == "maxtokens":
            return self.message('{"title": "Hand-thrown Terra', "max_tokens")
        return self.error(500, "api_error", f"unknown MODE {MODE}")

    def log_message(self, *_args) -> None:
        return None


if __name__ == "__main__":
    print(f"fake Anthropic API on http://127.0.0.1:9999, MODE={MODE}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 9999), Handler).serve_forever()

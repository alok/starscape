"""Static dev server with caching off, so edited ES modules always reload."""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # The module graph opens ~20 connections at once; the default backlog of 5 drops some, and the browser then
    # stalls for seconds on SYN retries.
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8848
    Server(("127.0.0.1", port), NoCache).serve_forever()

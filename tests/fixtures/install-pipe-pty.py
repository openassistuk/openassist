"""Exercise the actual public entrypoint via curl | bash under a controlling PTY."""
import errno
import http.server
import os
import pathlib
import pty
import select
import shlex
import signal
import subprocess
import sys
import threading
import time

entrypoint = pathlib.Path(sys.argv[1]).read_bytes()
bootstrap = b'''#!/usr/bin/env bash
set -euo pipefail
printf 'BOOTSTRAP flags=%s\\n' "$*"
if [[ " $* " != *" --non-interactive "* && -t 0 && -t 1 ]]; then
  echo PROMPT
  read -r answer
  [[ "$answer" == ready ]]
  echo INTERACTIVE_OK
else
  echo NONINTERACTIVE_OK
fi
'''

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(entrypoint if self.path == '/install.sh' else bootstrap)
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:' + str(server.server_port)
env = dict(os.environ, OPENASSIST_BOOTSTRAP_URL=base + '/bootstrap.sh')

def command(flags):
    return 'curl -fsSL ' + shlex.quote(base + '/install.sh') + ' | bash -s -- ' + flags

for flags in ['', '--interactive', '--non-interactive']:
    pid, fd = pty.fork()
    if pid == 0:
        os.execvpe('bash', ['bash', '-c', command(flags)], env)
    output = b''
    answered = False
    deadline = time.monotonic() + 10
    try:
        while time.monotonic() < deadline:
            if select.select([fd], [], [], .1)[0]:
                try:
                    data = os.read(fd, 4096)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not data:
                    break
                output += data
                if b'PROMPT' in output and not answered:
                    os.write(fd, b'ready\n')
                    answered = True
            if b'_OK' in output:
                break
        expected = b'NONINTERACTIVE_OK' if flags == '--non-interactive' else b'INTERACTIVE_OK'
        assert expected in output, (flags, output.decode(errors='replace'))
    finally:
        os.close(fd)
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        os.waitpid(pid, 0)

result = subprocess.run(['bash', '-c', command('--non-interactive --skip-service')], env=env,
                        stdin=subprocess.DEVNULL, capture_output=True, timeout=10, check=True)
assert b'NONINTERACTIVE_OK' in result.stdout and b'--skip-service' in result.stdout
server.shutdown()
print('Piped PTY, explicit interactive/non-interactive flags, and non-TTY handoff passed.')

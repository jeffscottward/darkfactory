#!/usr/bin/env bash
# Manage the CI browser lane's local HTTPS proxy (portless) on a GitHub runner.
#
# Usage: scripts/ci/portless-proxy.sh start|ready|stop
#
# Environment: RUNNER_TEMP and PORTLESS_PORT are required; start also needs
# GITHUB_ENV. State lives in "$RUNNER_TEMP": portless-proxy.log (combined
# output) and portless-proxy.pid (the recorded process group id).
#
# start  Launch `pnpm exec portless proxy start --foreground --skip-trust`
#        under `timeout` (which leads its own process group) with a fresh,
#        owner-only state directory, and export PORTLESS_STATE_DIR and
#        NODE_EXTRA_CA_CERTS (the generated CA) to later steps via GITHUB_ENV.
#        Records the pid once it is a live process group leader.
# ready  Succeeds once the recorded leader is alive, the port accepts TCP, and
#        an HTTPS GET to https://darkfactory.localhost:$PORTLESS_PORT, verified
#        against the generated CA, returns `x-portless: 1` within 15 seconds.
# stop   Sends TERM, then KILL after 5 seconds, to the recorded process group
#        only, then requires the port to close within 10 seconds.
#
# Every subcommand prints the tail of the proxy log and exits non-zero on
# failure. stop is safe to run when start never ran.
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${PORTLESS_PORT:?PORTLESS_PORT is required}"
[[ "$PORTLESS_PORT" =~ ^[1-9][0-9]*$ ]] || {
  echo "PORTLESS_PORT must be a port number" >&2
  exit 2
}

log_file="$RUNNER_TEMP/portless-proxy.log"
pid_file="$RUNNER_TEMP/portless-proxy.pid"

fail() {
  echo "portless-proxy: $*" >&2
  if [[ -f "$log_file" ]]; then
    echo "--- tail of $log_file ---" >&2
    tail --bytes=65536 "$log_file" >&2 || true
  fi
  exit 1
}

port_open() {
  (echo >"/dev/tcp/127.0.0.1/$PORTLESS_PORT") 2>/dev/null
}

# Succeeds when $1 is a live process that leads its own process group.
is_group_leader() {
  local pgid
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || return 1
  pgid="$(ps -o pgid= -p "$1" 2>/dev/null)" || return 1
  [[ "${pgid//[[:space:]]/}" == "$1" ]]
}

read_pid() {
  local pid=""
  [[ -s "$pid_file" ]] && IFS= read -r pid <"$pid_file"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && echo "$pid"
}

# Polls command "$2..." every 0.25 seconds until it succeeds or $1 seconds pass.
wait_until() {
  local deadline=$((SECONDS + $1))
  shift
  until "$@"; do
    ((SECONDS < deadline)) || return 1
    sleep 0.25
  done
}

group_gone() { ! kill -0 -- "-$1" 2>/dev/null; }
port_closed() { ! port_open; }

https_ready() {
  node --input-type=module -e '
    const url = new URL("https://darkfactory.localhost")
    url.port = process.env.PORTLESS_PORT
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) })
    await response.body?.cancel()
    process.exit(response.headers.get("x-portless") === "1" ? 0 : 1)
  ' 2>/dev/null
}

start() {
  : "${GITHUB_ENV:?GITHUB_ENV is required}"
  umask 077
  rm -f "$log_file" "$pid_file"
  local state_dir pid
  state_dir="$(mktemp -d "$RUNNER_TEMP/darkfactory-portless.XXXXXX")"
  printf 'PORTLESS_STATE_DIR=%s\nNODE_EXTRA_CA_CERTS=%s\n' \
    "$state_dir" "$state_dir/ca.pem" >>"$GITHUB_ENV"
  PORTLESS_STATE_DIR="$state_dir" \
    timeout --signal=TERM --kill-after=5s 20m \
    pnpm exec portless proxy start --foreground --skip-trust \
    >"$log_file" 2>&1 </dev/null &
  pid=$!
  # timeout moves itself into a new process group right after it starts.
  wait_until 5 is_group_leader "$pid" || fail "proxy did not start as a process group leader"
  echo "$pid" >"$pid_file"
}

ready() {
  local pid
  pid="$(read_pid)" || fail "no recorded proxy pid"
  local deadline=$((SECONDS + 15))
  until is_group_leader "$pid" && port_open && https_ready; do
    is_group_leader "$pid" || fail "proxy process $pid exited"
    ((SECONDS < deadline)) || fail "proxy was not ready on port $PORTLESS_PORT within 15s"
    sleep 0.25
  done
  echo "portless proxy ready on port $PORTLESS_PORT"
}

stop() {
  local pid
  if pid="$(read_pid)" && ! group_gone "$pid"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    if ! wait_until 5 group_gone "$pid"; then
      kill -KILL -- "-$pid" 2>/dev/null || true
      wait_until 5 group_gone "$pid" || fail "proxy process group $pid survived KILL"
    fi
  fi
  wait_until 10 port_closed || fail "port $PORTLESS_PORT is still open"
  rm -f "$pid_file"
}

case "${1:-}" in
  start | ready | stop) "$1" ;;
  *)
    echo "Usage: $0 start|ready|stop" >&2
    exit 2
    ;;
esac

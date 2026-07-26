#!/bin/sh
set -eu

NODE_VERSION=22.13.1
N_VERSION=10.2.0
BUN_VERSION=1.3.14
COREPACK_VERSION=0.34.7
PNPM_VERSION=11.16.0
PM2_VERSION=7.0.3
PORTLESS_VERSION=0.13.0
VARLOCK_VERSION=1.13.0
UV_VERSION=0.11.32
GRAPHIFY_VERSION=0.9.2
PLAYWRIGHT_VERSION=1.61.1

MODE=apply
case "${1:-}" in
  "") ;;
  --check) MODE=check ;;
  --dry-run) MODE=dry-run ;;
  *) printf '%s\n' "usage: $0 [--check|--dry-run]" >&2; exit 2 ;;
esac

LOCAL_BIN=${DARKFACTORY_INSTALL_LOCAL_BIN:-"$HOME/.local/bin"}
TOOL_HOME=${DARKFACTORY_INSTALL_TOOL_HOME:-"$HOME/.local/share/darkfactory"}
NPM_GLOBAL_PREFIX="$TOOL_HOME/npm-global"
PATH="$LOCAL_BIN:$NPM_GLOBAL_PREFIX/bin:$PATH"
NPM_CONFIG_PREFIX=$NPM_GLOBAL_PREFIX
export PATH NPM_CONFIG_PREFIX
BLOCKERS=0

case "${DARKFACTORY_INSTALL_PLATFORM:-}" in
  macos) PLATFORM=macos ;;
  debian|ubuntu) PLATFORM=debian ;;
  "")
    case "$(uname -s 2>/dev/null || printf unknown)" in
      Darwin) PLATFORM=macos ;;
      Linux)
        if [ -r /etc/os-release ] && grep -Eq '^ID=(debian|ubuntu)$|^ID_LIKE=.*(debian|ubuntu)' /etc/os-release; then
          PLATFORM=debian
        else
          printf '%s\n' "unsupported platform: Linux distribution must be Debian or Ubuntu" >&2
          exit 2
        fi
        ;;
      *) printf '%s\n' "unsupported platform: macOS, Debian, or Ubuntu is required" >&2; exit 2 ;;
    esac
    ;;
  *) printf '%s\n' "unsupported platform: $DARKFACTORY_INSTALL_PLATFORM" >&2; exit 2 ;;
esac

executable_exists() {
  case "$1" in
    */*) [ -x "$1" ] ;;
    *) command -v "$1" >/dev/null 2>&1 ;;
  esac
}

command_version() {
  executable_exists "$1" || return 1
  command_name=$1
  shift
  version_output=$("$command_name" "$@" 2>/dev/null || true)
  for version_word in $version_output
  do
    version_candidate=$version_word
    while [ -n "$version_candidate" ]
    do
      case "$version_candidate" in
        [0-9]*) break ;;
        *) version_candidate=${version_candidate#?} ;;
      esac
    done
    version_major=${version_candidate%%.*}
    version_remainder=${version_candidate#*.}
    version_minor=${version_remainder%%.*}
    version_patch=${version_remainder#*.}
    version_patch=${version_patch%%[!0-9]*}
    [ -n "$version_major" ] && [ -n "$version_minor" ] && [ -n "$version_patch" ] || continue
    case "$version_major:$version_minor:$version_patch" in
      *[!0-9:]*) continue ;;
    esac
    printf '%s.%s.%s\n' "$version_major" "$version_minor" "$version_patch"
    return
  done
  return 1
}

version_is_at_least() {
  candidate=$1
  required_major=$2
  required_minor=$3
  candidate_major=${candidate%%.*}
  candidate_remainder=${candidate#*.}
  candidate_minor=${candidate_remainder%%.*}
  [ -n "$candidate_major" ] && [ -n "$candidate_minor" ] || return 1
  case "$candidate_major:$candidate_minor" in
    *[!0-9:]*) return 1 ;;
  esac
  [ "$candidate_major" -gt "$required_major" ] \
    || { [ "$candidate_major" -eq "$required_major" ] && [ "$candidate_minor" -ge "$required_minor" ]; }
}

node_is_compatible() { version_is_at_least "$1" 22 13; }
python_is_compatible() { version_is_at_least "$1" 3 10; }

ok() { printf '%s\n' "[ok] $1"; }
plan() { printf '%s\n' "[plan] $*"; }
manual_blocker() {
  BLOCKERS=$((BLOCKERS + 1))
  printf '%s\n' "[manual blocker] $1" >&2
}
post_install_blocker() {
  BLOCKERS=$((BLOCKERS + 1))
  printf '%s\n' "[post-install blocker] $1" >&2
}
post_install_configuration() {
  printf '%s\n' "[post-install configuration] $1" >&2
}

run_command() {
  if [ "$MODE" = dry-run ]; then
    plan "$@"
  else
    printf '%s\n' "[run] $*"
    "$@"
  fi
}

run_root_command() {
  if [ "$(id -u)" -eq 0 ]; then
    run_command "$@"
  elif command -v sudo >/dev/null 2>&1; then
    run_command sudo "$@"
  else
    manual_blocker "root or sudo access is required to install operating-system packages"
    return 1
  fi
}

docker_cli_is_ready() {
  command -v docker >/dev/null 2>&1 \
    && docker --version >/dev/null 2>&1 \
    && docker compose version >/dev/null 2>&1
}

resolve_python_command() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi
  if [ "$PLATFORM" = macos ] && command -v brew >/dev/null 2>&1; then
    python_prefix=$(brew --prefix python@3.13 2>/dev/null || true)
    for python_candidate in \
      "$python_prefix/bin/python3.13" \
      "$python_prefix/libexec/bin/python3"
    do
      if [ -n "$python_prefix" ] && [ -x "$python_candidate" ]; then
        printf '%s\n' "$python_candidate"
        return
      fi
    done
  fi
  return 1
}

install_pinned_node() {
  bootstrap_npm=$1
  node_bootstrap="$TOOL_HOME/node-bootstrap"
  managed_node="$TOOL_HOME/node-$NODE_VERSION"
  run_command mkdir -p "$node_bootstrap" "$managed_node" "$LOCAL_BIN"
  run_command "$bootstrap_npm" install --prefix "$node_bootstrap" --no-save --package-lock=false "n@$N_VERSION"
  run_command env "N_PREFIX=$managed_node" "$node_bootstrap/node_modules/.bin/n" "$NODE_VERSION"
  for node_command in node npm npx
  do
    managed_command="$managed_node/bin/$node_command"
    if [ "$MODE" = dry-run ] || [ -x "$managed_command" ]; then
      run_command ln -sfn "$managed_command" "$LOCAL_BIN/$node_command"
    else
      manual_blocker "Node $NODE_VERSION installed without the expected $managed_command executable"
    fi
  done
  hash -r 2>/dev/null || true
}

node_version=$(command_version node --version || true)
npm_version=$(command_version npm --version || true)
PYTHON_COMMAND=$(resolve_python_command || true)
python_version=""
if [ -n "$PYTHON_COMMAND" ]; then
  python_version=$(command_version "$PYTHON_COMMAND" --version || true)
fi

need_node=0
need_python=0
need_docker=0
node_is_compatible "$node_version" && [ -n "$npm_version" ] || need_node=1
python_is_compatible "$python_version" || need_python=1
docker_cli_is_ready || need_docker=1

if [ "$MODE" = check ]; then
  if [ "$need_node" -eq 0 ]; then
    ok "Node $node_version with npm"
  else
    manual_blocker "Node >=22.13 and npm are required (found ${node_version:-missing})"
  fi
  if [ "$need_python" -eq 0 ]; then
    ok "Python $python_version"
  else
    manual_blocker "Python >=3.10 with venv support is required (found ${python_version:-missing})"
  fi
  if [ "$need_docker" -eq 0 ]; then
    ok "Docker CLI and Compose"
  else
    manual_blocker "Docker CLI with Compose is required"
  fi
else
  bootstrap_npm=""
  brew_node_installed=0
  brew_python_installed=0

  if [ "$PLATFORM" = macos ]; then
    brew_required=0
    if { [ "$need_node" -eq 1 ] && [ -z "$npm_version" ]; } \
      || [ "$need_python" -eq 1 ] \
      || [ "$need_docker" -eq 1 ]; then
      brew_required=1
    fi
    if [ "$brew_required" -eq 1 ] && ! command -v brew >/dev/null 2>&1; then
      manual_blocker "Homebrew is the required bootstrap precondition for missing macOS system packages"
    elif [ "$brew_required" -eq 1 ]; then
      if [ "$need_node" -eq 1 ] && [ -z "$npm_version" ]; then
        run_command brew install node@22
        brew_node_installed=1
      fi
      if [ "$need_python" -eq 1 ]; then
        run_command brew install python@3.13
        brew_python_installed=1
      fi
      if [ "$need_docker" -eq 1 ]; then
        run_command brew install --cask docker
      fi
    fi

    if [ "$MODE" = apply ] && [ "$brew_node_installed" -eq 1 ]; then
      brew_node_prefix=$(brew --prefix node@22)
      [ -x "$brew_node_prefix/bin/npm" ] && bootstrap_npm="$brew_node_prefix/bin/npm"
    fi
    if [ "$MODE" = apply ] && [ "$brew_python_installed" -eq 1 ]; then
      brew_python_prefix=$(brew --prefix python@3.13)
      for python_candidate in \
        "$brew_python_prefix/bin/python3.13" \
        "$brew_python_prefix/libexec/bin/python3"
      do
        if [ -x "$python_candidate" ]; then
          PYTHON_COMMAND=$python_candidate
          break
        fi
      done
    fi
  elif [ "$need_node" -eq 1 ] || [ "$need_python" -eq 1 ] || [ "$need_docker" -eq 1 ]; then
    if command -v apt-get >/dev/null 2>&1; then
      run_root_command apt-get update
      run_root_command apt-get install --yes ca-certificates nodejs npm python3 python3-venv python3-pip docker.io docker-compose-v2
    else
      manual_blocker "apt-get is required to install Debian or Ubuntu system packages"
    fi
  fi

  hash -r 2>/dev/null || true
  npm_version=$(command_version npm --version || true)
  if [ -z "$bootstrap_npm" ] && [ -n "$npm_version" ]; then
    bootstrap_npm=$(command -v npm)
  fi
  if [ "$MODE" = dry-run ] && [ "$need_node" -eq 1 ]; then
    bootstrap_npm=npm
  fi

  if [ "$need_node" -eq 1 ]; then
    if [ -n "$bootstrap_npm" ]; then
      install_pinned_node "$bootstrap_npm"
    else
      manual_blocker "npm is required to install pinned Node $NODE_VERSION through n $N_VERSION"
    fi
  fi

  if [ "$MODE" = dry-run ] && [ "$need_node" -eq 1 ] && [ -n "$bootstrap_npm" ]; then
    node_version=$NODE_VERSION
    npm_version=planned
  else
    node_version=$(command_version node --version || true)
    npm_version=$(command_version npm --version || true)
  fi
  if node_is_compatible "$node_version" && [ -n "$npm_version" ]; then
    ok "Node $node_version with npm"
  else
    manual_blocker "Node >=22.13 with npm remains unavailable after installation"
  fi

  if [ "$MODE" = apply ]; then
    PYTHON_COMMAND=$(resolve_python_command || true)
  elif [ "$MODE" = dry-run ] && [ "$need_python" -eq 1 ]; then
    PYTHON_COMMAND=python3
    python_version=3.10.0
  fi
  if [ -n "$PYTHON_COMMAND" ] && [ "$MODE" != dry-run ]; then
    python_version=$(command_version "$PYTHON_COMMAND" --version || true)
  fi
  if python_is_compatible "$python_version"; then
    ok "Python $python_version"
  else
    manual_blocker "Python >=3.10 with venv support remains unavailable after installation"
  fi

  if docker_cli_is_ready; then
    DOCKER_READY=1
    ok "Docker CLI and Compose"
  elif [ "$MODE" = dry-run ] && [ "$need_docker" -eq 1 ]; then
    DOCKER_READY=1
    ok "Docker CLI and Compose (planned)"
  else
    DOCKER_READY=0
    manual_blocker "Docker CLI and Compose remain unavailable after installation"
  fi
fi

if [ -n "$npm_version" ] || { [ "$MODE" = dry-run ] && [ "$need_node" -eq 1 ]; }; then
  NPM_READY=1
else
  NPM_READY=0
fi

ensure_npm_tool() {
  label=$1
  executable=$2
  package=$3
  expected=$4
  actual=$(command_version "$executable" --version || true)
  if [ "$actual" = "$expected" ]; then
    ok "$label $actual"
  elif [ "$MODE" = check ]; then
    manual_blocker "$label $expected is required (found ${actual:-missing})"
  elif [ "$NPM_READY" -eq 1 ]; then
    run_command npm install --global "$package@$expected"
    if [ "$MODE" = apply ]; then
      hash -r 2>/dev/null || true
      actual=$(command_version "$executable" --version || true)
      [ "$actual" = "$expected" ] \
        && ok "$label $actual" \
        || manual_blocker "$label $expected remains unavailable after installation"
    fi
  else
    manual_blocker "$label $expected cannot be installed without npm"
  fi
}

ensure_npm_global_package() {
  ensure_npm_tool "$@"
}

ensure_npm_tool "Bun" bun bun "$BUN_VERSION"
ensure_npm_tool "Corepack" corepack corepack "$COREPACK_VERSION"

bun_version=$(command_version bun --version || true)
corepack_version=$(command_version corepack --version || true)
if [ "$MODE" = dry-run ] && [ "$NPM_READY" -eq 1 ]; then
  bun_version=$BUN_VERSION
  corepack_version=$COREPACK_VERSION
fi

pnpm_version=$(command_version corepack pnpm --version || true)
if [ "$pnpm_version" = "$PNPM_VERSION" ]; then
  ok "pnpm $pnpm_version"
elif [ "$MODE" = check ]; then
  manual_blocker "pnpm $PNPM_VERSION is required (found ${pnpm_version:-missing})"
elif [ "$corepack_version" = "$COREPACK_VERSION" ]; then
  run_command corepack enable
  run_command corepack install --global "pnpm@$PNPM_VERSION"
  if [ "$MODE" = apply ]; then
    pnpm_version=$(command_version corepack pnpm --version || true)
    [ "$pnpm_version" = "$PNPM_VERSION" ] \
      && ok "pnpm $pnpm_version" \
      || manual_blocker "pnpm $PNPM_VERSION remains unavailable after installation"
  else
    pnpm_version=$PNPM_VERSION
  fi
else
  manual_blocker "Corepack $COREPACK_VERSION is required before pnpm can be selected"
fi

ensure_npm_global_package "PM2" pm2 pm2 "$PM2_VERSION"
ensure_npm_global_package "Varlock" varlock varlock "$VARLOCK_VERSION"

uv_version=$(command_version uv --version || true)
UV_COMMAND=$(command -v uv 2>/dev/null || true)
if [ "$uv_version" = "$UV_VERSION" ]; then
  ok "uv $uv_version"
elif [ "$MODE" = check ]; then
  manual_blocker "uv $UV_VERSION is required (found ${uv_version:-missing})"
elif python_is_compatible "$python_version" && [ -n "$PYTHON_COMMAND" ]; then
  managed_uv="$TOOL_HOME/uv-$UV_VERSION/bin/uv"
  run_command mkdir -p "$TOOL_HOME" "$LOCAL_BIN"
  run_command "$PYTHON_COMMAND" -m venv "$TOOL_HOME/uv-$UV_VERSION"
  run_command "$TOOL_HOME/uv-$UV_VERSION/bin/python" -m pip install --disable-pip-version-check "uv==$UV_VERSION"
  UV_COMMAND=$managed_uv
  if [ "$MODE" = apply ]; then
    if [ ! -e "$LOCAL_BIN/uv" ] || [ -L "$LOCAL_BIN/uv" ]; then
      run_command ln -sfn "$managed_uv" "$LOCAL_BIN/uv"
    else
      manual_blocker "$LOCAL_BIN/uv exists and is not installer-managed; use $managed_uv explicitly"
    fi
    uv_version=$(command_version "$managed_uv" --version || true)
    [ "$uv_version" = "$UV_VERSION" ] \
      && ok "uv $uv_version" \
      || manual_blocker "uv $UV_VERSION remains unavailable after installation"
  fi
else
  manual_blocker "Python >=3.10 is required before uv $UV_VERSION can be installed"
fi

graphify_version=$(command_version graphify --version || true)
if [ "$graphify_version" = "$GRAPHIFY_VERSION" ]; then
  ok "Graphify $graphify_version"
elif [ "$MODE" = check ]; then
  manual_blocker "Graphify graphifyy $GRAPHIFY_VERSION is required (found ${graphify_version:-missing})"
elif [ -n "${UV_COMMAND:-}" ]; then
  run_command env "UV_TOOL_BIN_DIR=$LOCAL_BIN" "$UV_COMMAND" tool install --force "graphifyy==$GRAPHIFY_VERSION"
  if [ "$MODE" = apply ]; then
    graphify_version=$(command_version graphify --version || true)
    [ "$graphify_version" = "$GRAPHIFY_VERSION" ] \
      && ok "Graphify $graphify_version" \
      || manual_blocker "Graphify $GRAPHIFY_VERSION remains unavailable after installation"
  fi
else
  manual_blocker "uv $UV_VERSION is required before Graphify can be installed"
fi

portless_version=$(command_version bunx --bun --no-install portless --version || true)
playwright_version=$(command_version bunx --bun --no-install playwright --version || true)
browser_marker="$TOOL_HOME/playwright-$PLAYWRIGHT_VERSION-chromium.installed"

if [ "$MODE" = check ]; then
  [ "$portless_version" = "$PORTLESS_VERSION" ] \
    || manual_blocker "workspace portless $PORTLESS_VERSION is required (found ${portless_version:-missing})"
  [ "$playwright_version" = "$PLAYWRIGHT_VERSION" ] \
    || manual_blocker "workspace Playwright $PLAYWRIGHT_VERSION is required (found ${playwright_version:-missing})"
  [ -r "$browser_marker" ] \
    || manual_blocker "workspace Chromium for Playwright $PLAYWRIGHT_VERSION is required"
else
  if [ "$portless_version" != "$PORTLESS_VERSION" ] \
    || [ "$playwright_version" != "$PLAYWRIGHT_VERSION" ]; then
    if [ "$pnpm_version" = "$PNPM_VERSION" ] && [ "$bun_version" = "$BUN_VERSION" ]; then
      run_command corepack pnpm install --frozen-lockfile
      if [ "$MODE" = apply ]; then
        portless_version=$(command_version bunx --bun --no-install portless --version || true)
        playwright_version=$(command_version bunx --bun --no-install playwright --version || true)
        [ "$portless_version" = "$PORTLESS_VERSION" ] \
          || manual_blocker "workspace portless $PORTLESS_VERSION remains unavailable after installation"
        [ "$playwright_version" = "$PLAYWRIGHT_VERSION" ] \
          || manual_blocker "workspace Playwright $PLAYWRIGHT_VERSION remains unavailable after installation"
      else
        portless_version=$PORTLESS_VERSION
        playwright_version=$PLAYWRIGHT_VERSION
      fi
    else
      manual_blocker "exact Bun and pnpm pins are required before workspace dependencies can be installed"
    fi
  else
    ok "workspace portless $portless_version and Playwright $playwright_version"
  fi

  if [ "$playwright_version" = "$PLAYWRIGHT_VERSION" ] && [ ! -r "$browser_marker" ]; then
    run_command mkdir -p "$TOOL_HOME"
    if [ "$PLATFORM" = debian ]; then
      run_command bunx --bun --no-install playwright install --with-deps chromium
    else
      run_command bunx --bun --no-install playwright install chromium
    fi
    run_command touch "$browser_marker"
  fi
fi

if [ "${DOCKER_READY:-0}" -eq 1 ] || { [ "$MODE" = check ] && [ "$need_docker" -eq 0 ]; }; then
  if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    ok "Docker daemon"
  else
    post_install_blocker "Docker daemon must be started manually"
  fi
fi

if [ -r "$HOME/.portless/ca.pem" ]; then
  if [ "$PLATFORM" = macos ] && command -v security >/dev/null 2>&1 \
    && security verify-cert -c "$HOME/.portless/ca.pem" -p ssl >/dev/null 2>&1; then
    ok "portless trust"
  elif [ "$PLATFORM" = debian ] && command -v openssl >/dev/null 2>&1 \
    && openssl verify -CApath /etc/ssl/certs "$HOME/.portless/ca.pem" >/dev/null 2>&1; then
    ok "portless trust"
  else
    post_install_blocker "portless trust must be established manually with bun run dev:trust"
  fi
else
  post_install_blocker "portless trust must be established manually with bun run dev:trust"
fi

post_install_configuration "Provider credentials remain conditional and manual before operator-run provider workflows; accounts were not inspected."

if [ "$BLOCKERS" -ne 0 ]; then
  printf '%s\n' "$BLOCKERS prerequisite blocker(s) require manual action" >&2
  [ "$MODE" = dry-run ] && exit 0
  exit 1
fi

printf '%s\n' "Prerequisites are ready; no services, certificates, accounts, or application data were changed."

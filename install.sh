#!/bin/sh
# Vixana command line installer for Linux and macOS.
#
#   curl -fsSL https://YOUR-SITE/install.sh | sh
#
# What it does, all inside your home folder (no sudo):
#   1. downloads Vixana's source once the owner approves it (or copies it from VIXANA_SOURCE): it shows a link and a
#      code; you sign in on the website with Google, ask for approval if you have none, and allow this install,
#   2. makes a Python environment with the CPU engine's packages,
#   3. adds a `vixana` command to ~/.local/bin.
# To remove Vixana: rm -rf ~/.local/share/vixana/cli ~/.local/share/vixana/venvs/cli ~/.local/bin/vixana
#
# Settings (environment variables):
#   VIXANA_VERSION  the release to install (default: 6.2.0)
#   VIXANA_SOURCE   a .tar.gz URL or a local folder with the Vixana source (default: that release's
#                   vixana-cli-<version>.tar.gz, after the owner's approval)
#   VIXANA_ACCOUNTS the Vixana accounts server (default: the project's Supabase function)
#   VIXANA_HOME     where Vixana keeps its files (default: ~/.local/share/vixana)
#   VIXANA_BIN_DIR  where the `vixana` command goes (default: ~/.local/bin)
#   VIXANA_PYTHON   the Python to build the environment with (default: the first of python3.12, 3.13, 3.11)

set -eu

VERSION="${VIXANA_VERSION:-6.2.0}"
SOURCE="${VIXANA_SOURCE:-}"
ACCOUNTS="${VIXANA_ACCOUNTS:-https://atwozbhkjbuvqzdbpgam.supabase.co/functions/v1/accounts}"
VHOME="${VIXANA_HOME:-$HOME/.local/share/vixana}"
APP="$VHOME/cli"
VENV="$VHOME/venvs/cli"
BIN="${VIXANA_BIN_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Vixana install stopped: %s\n' "$*" >&2; exit 1; }

say "Installing the Vixana command line into $VHOME"

# ---- Python 3.11 to 3.13 (the engine's packages have wheels for these) ----
PY="${VIXANA_PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3.12 python3.13 python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys, venv; sys.exit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)' 2>/dev/null; then
      PY="$c"; break
    fi
  done
fi
if [ -z "$PY" ]; then
  if command -v uv >/dev/null 2>&1; then
    PY="uv"
  else
    fail "Vixana needs Python 3.11, 3.12 or 3.13 with venv. Install one (for example: sudo apt install python3.12-venv, sudo dnf install python3.12, or brew install python@3.12), or install uv (https://docs.astral.sh/uv/), then run this again."
  fi
fi

# ---- the owner's approval (docs/release/DOWNLOADS.md) ----
if command -v curl >/dev/null 2>&1; then HAVE=curl
elif command -v wget >/dev/null 2>&1; then HAVE=wget
else fail "needs curl or wget to download Vixana"; fi
post() {  # post PATH JSON -> the server's answer
  if [ "$HAVE" = curl ]; then
    curl -sS -X POST -H 'content-type: application/json' --data "$2" "$ACCOUNTS$1"
  else
    wget -qO- --header='content-type: application/json' --post-data="$2" "$ACCOUNTS$1"
  fi
}
jget() { printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }
approved_link() {
  file="vixana-cli-$VERSION.tar.gz"
  host="$(hostname 2>/dev/null | tr -cd 'A-Za-z0-9._-' | cut -c1-60)"
  start="$(post /api/install/start "{\"file\":\"$file\",\"tag\":\"v$VERSION\",\"label\":\"install.sh on ${host:-this computer}\"}")" \
    || fail "could not reach the Vixana server"
  code="$(jget "$start" code)"; secret="$(jget "$start" device_secret)"; link="$(jget "$start" verification_url)"
  [ -n "$code" ] && [ -n "$secret" ] || fail "the Vixana server said: $(jget "$start" error)"
  say ""
  say "Every Vixana download is approved by its owner. To continue:"
  say "  1. Open $link"
  say "  2. Sign in with Google and check that the page shows the code $code"
  say "  3. If you have no approval yet, press Ask for approval there and send the email"
  say "  4. Once approved, press Allow. This window waits up to an hour."
  say ""
  for opener in xdg-open open; do
    if command -v "$opener" >/dev/null 2>&1; then "$opener" "$link" >/dev/null 2>&1 & break; fi
  done
  waited=0
  while [ "$waited" -lt 3600 ]; do
    sleep 3; waited=$((waited + 3))
    answer="$(post /api/install/poll "{\"device_secret\":\"$secret\"}")" || continue
    case "$(jget "$answer" status)" in
      ready) LINK="$(jget "$answer" url)"; [ -n "$LINK" ] && return 0; fail "the server gave no download link" ;;
      denied) fail "the install was refused on the website" ;;
      expired) fail "the code expired; run the install command again" ;;
      pending) if [ $((waited % 60)) -eq 0 ]; then say "  still waiting for approval ($((waited / 60)) min)"; fi ;;
      *) fail "the Vixana server said: $(jget "$answer" error)" ;;
    esac
  done
  fail "no approval within an hour; run the install command again"
}

# ---- source ----
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
if [ -n "$SOURCE" ] && [ -d "$SOURCE" ]; then
  say "Copying the source from $SOURCE"
  SRC="$(cd "$SOURCE" && pwd)"
else
  if [ -n "$SOURCE" ]; then LINK="$SOURCE"; else approved_link; SOURCE="vixana-cli-$VERSION.tar.gz"; fi
  say "Downloading $SOURCE"
  if [ "$HAVE" = curl ]; then
    curl -fsSL "$LINK" -o "$TMP/src.tar.gz" || fail "could not download $SOURCE"
  else
    wget -q "$LINK" -O "$TMP/src.tar.gz" || fail "could not download $SOURCE"
  fi
  mkdir "$TMP/src"
  tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" || fail "the download is not a .tar.gz archive"
  SRC="$(find "$TMP/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi
[ -f "$SRC/vixana_cli/__main__.py" ] || fail "$SOURCE does not look like the Vixana source (no vixana_cli/)"

# Keep only what the command line runs: the engine, the CLI, and the engines' frozen settings.
NEW="$APP.new"
rm -rf "$NEW"
mkdir -p "$NEW/docs/release" "$NEW/docs/research" "$NEW/requirements"
for d in backend vixana_cli; do
  cp -R "$SRC/$d" "$NEW/$d"
done
# a local checkout may hold its own runs and databases: never copy them into an install
rm -rf "$NEW/backend/outputs" "$NEW/backend/data" "$NEW/backend/mlruns"
find "$NEW" -name __pycache__ -type d -prune -exec rm -rf {} +
cp "$SRC/docs/release/v6.0.0_freeze.json" "$NEW/docs/release/"
for n in amlb_unseen_options core_v5_7_freeze core_v5_7_1_freeze core_v5_7_1_final_freeze v5_2_portfolio \
         vs_autogluon_v2_options core_g1_final_freeze; do
  cp "$SRC/docs/research/$n.json" "$NEW/docs/research/"
done
cp "$SRC/backend/requirements.txt" "$SRC/deploy/server/requirements-server.txt" "$NEW/requirements/"
[ -f "$SRC/LICENSE.md" ] && cp "$SRC/LICENSE.md" "$NEW/"
find "$NEW" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
rm -rf "$APP"
mv "$NEW" "$APP"

# ---- Python environment ----
mkdir -p "$VHOME/venvs"
if [ ! -x "$VENV/bin/python" ]; then
  say "Making the Python environment"
  if [ "$PY" = "uv" ]; then
    uv venv --quiet --python 3.12 "$VENV" || fail "uv could not make a Python 3.12 environment"
  else
    "$PY" -m venv "$VENV" || fail "$PY could not make a Python environment (install its venv package)"
  fi
fi
say "Installing the engine's packages (a few minutes the first time)"
if [ "$PY" = "uv" ]; then
  uv pip install --quiet --python "$VENV/bin/python" --extra-index-url https://download.pytorch.org/whl/cpu \
    -r "$APP/requirements/requirements-server.txt" || fail "package install failed"
else
  "$VENV/bin/python" -m pip install --quiet --disable-pip-version-check --upgrade pip >/dev/null
  "$VENV/bin/python" -m pip install --quiet --disable-pip-version-check \
    --extra-index-url https://download.pytorch.org/whl/cpu -r "$APP/requirements/requirements-server.txt" \
    || fail "package install failed (see the messages above)"
fi

# ---- the command ----
mkdir -p "$BIN"
cat > "$BIN/vixana" <<EOF
#!/bin/sh
# Vixana command line (installed by install.sh). Remove with: rm -rf "$APP" "$VENV" "$BIN/vixana"
export PYTHONPATH="$APP\${PYTHONPATH:+:\$PYTHONPATH}"
export VIXANA_HOME="\${VIXANA_HOME:-$VHOME}"
exec "$VENV/bin/python" -m vixana_cli "\$@"
EOF
chmod +x "$BIN/vixana"

"$BIN/vixana" --version >/dev/null 2>&1 || fail "the command was installed but does not start; run $BIN/vixana --version to see why"

say ""
say "Vixana is installed. Try:"
say "  vixana            open the interactive session"
say "  vixana doctor     check this computer"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) say ""
     say "$BIN is not on your PATH yet. Add this line to your shell profile (~/.bashrc, ~/.zshrc):"
     say "  export PATH=\"$BIN:\$PATH\"" ;;
esac

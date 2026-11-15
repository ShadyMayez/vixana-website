#!/bin/sh
# Vixana command line installer for Linux and macOS.
#
#   curl -fsSL https://YOUR-SITE/install.sh | sh
#
# What it does, all inside your home folder (no sudo):
#   1. downloads Vixana's source (or copies it from VIXANA_SOURCE),
#   2. makes a Python environment with the CPU engine's packages,
#   3. adds a `vixana` command to ~/.local/bin.
# To remove Vixana: rm -rf ~/.local/share/vixana/cli ~/.local/share/vixana/venvs/cli ~/.local/bin/vixana
#
# Settings (environment variables):
#   VIXANA_VERSION  the release to install (default: 6.1.0)
#   VIXANA_SOURCE   a .tar.gz URL or a local folder with the Vixana source (default: that release's
#                   vixana-cli-<version>.tar.gz from github.com/ShadyMayez/vixana-website/releases)
#   VIXANA_HOME     where Vixana keeps its files (default: ~/.local/share/vixana)
#   VIXANA_BIN_DIR  where the `vixana` command goes (default: ~/.local/bin)
#   VIXANA_PYTHON   the Python to build the environment with (default: the first of python3.12, 3.13, 3.11)

set -eu

RELEASES="https://github.com/ShadyMayez/vixana-website/releases"
VERSION="${VIXANA_VERSION:-6.1.0}"
SOURCE="${VIXANA_SOURCE:-$RELEASES/download/v$VERSION/vixana-cli-$VERSION.tar.gz}"
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

# ---- source ----
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
if [ -d "$SOURCE" ]; then
  say "Copying the source from $SOURCE"
  SRC="$(cd "$SOURCE" && pwd)"
else
  say "Downloading $SOURCE"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$SOURCE" -o "$TMP/src.tar.gz" || fail "could not download $SOURCE"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$SOURCE" -O "$TMP/src.tar.gz" || fail "could not download $SOURCE"
  else
    fail "needs curl or wget to download Vixana"
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

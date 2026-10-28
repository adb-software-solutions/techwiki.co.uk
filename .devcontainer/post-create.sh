#!/usr/bin/env bash
# Post-create script for techwiki devcontainer
set -Eeuo pipefail
error_trap() {
	local code=$?
	echo "❌ post-create failed at line $LINENO: ${BASH_COMMAND} (exit $code)"
	exit $code
}
trap error_trap ERR

# Consistent path to rc
BASHRC="/root/.bashrc"

# Make pnpm happy in non-interactive shells
export SHELL="${SHELL:-/bin/bash}"
export PNPM_HOME="${PNPM_HOME:-/usr/local/share/pnpm}"
export PATH="$PNPM_HOME:$PATH"

echo "Setting up techwiki development environment..."

# Change to workspace directory
cd /workspace

# Create devcontainer .env file if it doesn't exist
if [ ! -f .devcontainer/.env ]; then
	echo "Creating devcontainer environment file..."
	cp .devcontainer/.env.example .devcontainer/.env
	echo "Please update .devcontainer/.env with your actual credentials"
fi

echo "Installing frontend dependencies..."
# One pnpm workspace: this installs website and auth-frontend too.
pnpm install

# Wait for database to be ready using Python and psycopg2
echo "Waiting for database to be ready..."
until /opt/venv/bin/python -c "
import sys
import psycopg2
try:
    psycopg2.connect(
        dbname='techwiki_dev',
        user='techwiki',
        password='techwiki_dev_password',
        host='db',
        port=5432,
    )
except psycopg2.OperationalError:
    sys.exit(-1)
sys.exit(0)
"; do
	sleep 1
done
echo "PostgreSQL is available"

# Run Django migrations
echo "Running Django migrations..."
cd /workspace
source /opt/venv/bin/activate
python backend/manage.py migrate --noinput

# Install pre-commit hooks if available (ensure it's installed in venv)
if [ -f .pre-commit-config.yaml ]; then
	if ! command -v pre-commit >/dev/null 2>&1; then
		pip install pre-commit >/dev/null 2>&1 || true
	fi
	echo "Installing pre-commit hooks..."
	pre-commit install || echo "Pre-commit not available"
fi

# Setup git safe directory
git config --global --add safe.directory /workspace
bash .devcontainer/scripts/install-claude
bash .devcontainer/scripts/install-codex

###############################################################################
# Bash prompt fix: ensure (venv) shows in every interactive bash in VS Code
# We append to /root/.bashrc at the END (idempotently) so it runs after any PS1=
###############################################################################
MARK_BEGIN="# >>> techwiki: ensure (venv) prompt begin >>>"
MARK_END="# <<< techwiki: ensure (venv) prompt end <<<"

# Remove previous block if present (to keep idempotent on rebuilds)
if grep -qF "$MARK_BEGIN" "$BASHRC" 2>/dev/null; then
	awk -v s="$MARK_BEGIN" -v e="$MARK_END" '
    $0==s {inblk=1; next}
    $0==e {inblk=0; next}
    !inblk {print}
  ' "$BASHRC" >"${BASHRC}.tmp" && mv "${BASHRC}.tmp" "$BASHRC"
fi

# Append our guarded block
cat >>"$BASHRC" <<'EOF'
# >>> techwiki: ensure (venv) prompt begin >>>
# Always show (venv) in interactive bash shells and ensure /opt/venv is active.
# Place this at the END so it runs after any PS1 reassignments in the file.
if [ -n "$PS1" ]; then
  unset VIRTUAL_ENV_DISABLE_PROMPT
  export VIRTUAL_ENV_PROMPT="(venv) "
  if [ -f /opt/venv/bin/activate ]; then
    . /opt/venv/bin/activate
  fi
  if [ -n "$VIRTUAL_ENV" ] && [[ "$PS1" != *"(venv)"* ]] && [[ "$PS1" != *"($(basename "$VIRTUAL_ENV"))"* ]]; then
    PS1="${VIRTUAL_ENV_PROMPT:-($(basename "$VIRTUAL_ENV")) }$PS1"
  fi
fi
# <<< techwiki: ensure (venv) prompt end <<<
EOF

###############################################################################
# Persistent Bash history (via Docker volume mounted at /root/.history)
# - We store the file at /root/.history/.bash_history
# - We also symlink /root/.bash_history -> /root/.history/.bash_history
# - Terminals share history live and it survives rebuilds
###############################################################################
HIST_DIR="/root/.history"
HIST_FILE="${HIST_DIR}/.bash_history"
HIST_BEGIN="# >>> techwiki: persistent bash history begin >>>"
HIST_END="# <<< techwiki: persistent bash history end <<<"

# Ensure directory exists (volume mount) and file present
mkdir -p "$HIST_DIR"
touch "$HIST_FILE"
chmod 700 "$HIST_DIR"
chmod 600 "$HIST_FILE"

# Symlink traditional location to our persistent file
ln -sf "$HIST_FILE" /root/.bash_history

# Remove prior block if present
if grep -qF "$HIST_BEGIN" "$BASHRC" 2>/dev/null; then
	awk -v s="$HIST_BEGIN" -v e="$HIST_END" '
    $0==s {inblk=1; next}
    $0==e {inblk=0; next}
    !inblk {print}
  ' "$BASHRC" >"${BASHRC}.tmp" && mv "${BASHRC}.tmp" "$BASHRC"
fi

# Append persistent history config at the very end (after PS1 edits)
cat >>"$BASHRC" <<EOF
${HIST_BEGIN}
# Persist bash history to a Docker volume-backed file
export HISTFILE="${HIST_FILE}"
export HISTSIZE=50000
export HISTFILESIZE=100000
export HISTCONTROL=ignoredups:erasedups
export HISTTIMEFORMAT='%F %T '

# Append new commands immediately and read in commands from other terminals
shopt -s histappend
PROMPT_COMMAND="history -a; history -n; \${PROMPT_COMMAND}"
${HIST_END}
EOF

###############################################################################
# Bash completion (system + common CLIs) — idempotent
###############################################################################
COMP_DIR="/etc/bash_completion.d"
COMP_BEGIN="# >>> techwiki: bash-completion begin >>>"
COMP_END="# <<< techwiki: bash-completion end <<<"

mkdir -p "$COMP_DIR"

# Remove previous block if present
if grep -qF "$COMP_BEGIN" "$BASHRC" 2>/dev/null; then
	awk -v s="$COMP_BEGIN" -v e="$COMP_END" '
    $0==s {inblk=1; next}
    $0==e {inblk=0; next}
    !inblk {print}
  ' "$BASHRC" >"${BASHRC}.tmp" && mv "${BASHRC}.tmp" "$BASHRC"
fi

# Append sourcing + QoL bindings at the very end (after PS1 edits)
cat >>"$BASHRC" <<'EOF'
# >>> techwiki: bash-completion begin >>>
# Enable programmable completion
if [ -n "$PS1" ]; then
  if [ -r /etc/profile.d/bash_completion.sh ]; then
    . /etc/profile.d/bash_completion.sh
  elif [ -f /usr/share/bash-completion/bash_completion ]; then
    . /usr/share/bash-completion/bash_completion
  fi
fi

# Friendlier tab-complete behavior
bind "set completion-ignore-case on"
bind "set show-all-if-ambiguous on"
bind "set menu-complete-display-prefix on"
# <<< techwiki: bash-completion end <<<
EOF

# ---- Generate completion scripts (guarded if tools exist) ----
# gh (GitHub CLI)
if command -v gh >/dev/null 2>&1; then
	gh completion -s bash >"${COMP_DIR}/gh"
fi

# npm + npx
if command -v npm >/dev/null 2>&1; then
	npm completion >"${COMP_DIR}/npm"
	cp -f "${COMP_DIR}/npm" "${COMP_DIR}/npx"
fi

# pnpm (explicit shell name is required)
if command -v pnpm >/dev/null 2>&1; then
	pnpm completion bash >"${COMP_DIR}/pnpm"
fi

# pip
if command -v python >/dev/null 2>&1; then
	python -m pip completion --bash >"${COMP_DIR}/pip" 2>/dev/null || true
fi

# kubectl (future)
if command -v kubectl >/dev/null 2>&1; then
	kubectl completion bash >"${COMP_DIR}/kubectl"
fi

# terraform (future)
if command -v terraform >/dev/null 2>&1; then
	terraform -install-autocomplete >/dev/null 2>&1 || true
fi

###############################################################################
# Starship prompt (emoji-free, shows venv + git) — idempotent
###############################################################################
STARSHIP_LINE="# >>> techwiki: starship init >>>"
if ! grep -qF "$STARSHIP_LINE" "$BASHRC" 2>/dev/null; then
	# Init starship in bash
	cat >>"$BASHRC" <<'EOF'
# >>> techwiki: starship init >>>
if command -v starship >/dev/null 2>&1; then
  eval "$(starship init bash)"
fi
# <<< techwiki: starship init <<<
EOF
fi

# Minimal, no-emoji config
mkdir -p /root/.config
cat >/root/.config/starship.toml <<'EOF'
add_newline = false
format = "$directory$git_branch$git_status$python$cmd_duration$character"

[directory]
truncation_length = 3
truncate_to_repo = true

[git_status]
disabled = true

[cmd_duration]
min_time = 1000

[character]
# Escape the dollar so it's treated literally
success_symbol = "\\$ "
error_symbol = "! "
EOF

echo "Development environment setup complete!"
echo ""
echo "Quick start commands:"
echo "  Backend:         cd /workspace && python backend/manage.py runserver 0.0.0.0:8000"
echo "  Website:         cd /workspace/website && pnpm dev"
echo "  Auth Frontend:   cd /workspace/auth-frontend && pnpm dev"
echo ""
echo "Access URLs:"
echo "  Django Admin:    http://localhost:8000/admin/ (admin/admin)"
echo "  Website:         http://localhost:3000/"
echo "  Auth Frontend:   http://localhost:5173/"
echo ""

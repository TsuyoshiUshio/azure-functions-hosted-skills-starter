#!/usr/bin/env bash
set -euo pipefail

agent=''
workspace=$PWD
source=''
preview=false
telemetry=()
prompt='Read https://aka.ms/hosted-skills-starter and set up Azure Functions Hosted Skills in this workspace.'
while (($#)); do
  case "$1" in
    --agent|--workspace|--source)
      if (($# < 2)) || [[ -z $2 ]]; then printf 'Missing value for %s\n' "$1" >&2; exit 1; fi
      case "$1" in --agent) agent=$2 ;; --workspace) workspace=$2 ;; --source) source=$2 ;; esac
      shift 2 ;;
    --preview) preview=true; shift ;;
    --no-telemetry) telemetry=(--no-telemetry); shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
done
case "$agent" in
  claude|codex|copilot|vscode) ;;
  *) printf 'Choose --agent claude, codex, copilot, or vscode.\n' >&2; exit 1 ;;
esac
if ! command -v node >/dev/null 2>&1 ||
   ! node -e 'let [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' ||
   ! command -v git >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  printf 'Terminal setup needs Node.js 22.13+, npx, and Git. No files were changed; no tools were installed.\n\nContinue with your coding agent:\n%s\n' "$prompt" >&2
  exit 2
fi

staging=''
cleanup() {
  if [[ -n $staging ]]; then
    if ! rm -rf -- "$staging"; then
      printf 'Setup staging was retained at %s. Review and remove it manually.\n' "$staging" >&2
      return 1
    fi
    staging=''
  fi
}
trap 'status=$?; if ! cleanup; then status=1; fi; exit "$status"' EXIT
trap 'printf "Setup did not finish. Review the workspace before retrying, or give your agent:\n%s\n" "$prompt" >&2' ERR

directory_path() {
  (
    cd -- "$1"
    case "$OSTYPE" in
      # Native Git and Bash may use different Windows /tmp mounts.
      msys*|cygwin*) cygpath -m "$(pwd -P)" ;;
      *) pwd -P ;;
    esac
  )
}
workspace=$(directory_path "$workspace")
if [[ -z $source ]]; then
  launcher_root=$(directory_path "$(dirname -- "${BASH_SOURCE[0]}")")
  if [[ -f $launcher_root/starter.config.json ]]; then source=$launcher_root; fi
fi
if [[ -z $source ]]; then
  staging=$(mktemp -d "${TMPDIR:-/tmp}/hosted-skills-starter.XXXXXXXX")
  native_staging=$(directory_path "$staging")
  staging=$native_staging
  source=$staging/source
  git clone --quiet --depth 1 -- https://github.com/Azure-Samples/azure-functions-hosted-skills-starter.git "$source"
  revision=$(git -C "$source" rev-parse --verify HEAD)
  if [[ ! $revision =~ ^[a-f0-9]{40}$ ]]; then printf 'Could not resolve the source revision.\n' >&2; exit 1; fi
  git -C "$source" checkout --quiet --detach "$revision"
fi
source=$(directory_path "$source")
if [[ ! -f $source/scripts/setup.mjs ]]; then printf 'The selected source is not a starter distribution.\n' >&2; exit 1; fi
args=("$source/scripts/setup.mjs" --agent "$agent" --workspace "$workspace" "${telemetry[@]}")
if ! plan=$(node "${args[@]}"); then
  printf 'Preview could not finish. Ask your agent to review and merge the existing files:\n%s\n' "$prompt" >&2
  exit 1
fi
printf '%s\n' "$plan"
token=$(printf '%s' "$plan" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{let t=JSON.parse(s).planToken;if(!/^[a-f0-9]{64}$/.test(t))throw Error("Invalid approval token");process.stdout.write(t)})')
outcome='preview'
if ! $preview; then
  printf 'Apply this exact setup plan? [y/N] '
  answer=''
  read -r answer || true
  case "$answer" in
    y|Y|yes|YES|Yes)
      node "${args[@]}" --apply --expect-plan "$token"
      outcome='installed' ;;
    *) outcome='declined' ;;
  esac
fi
cleanup
case "$outcome" in
  installed)
    printf '\n=== Hosted Skills setup complete! ===\nConfigured for %s. Reload your agent and review its trust prompts.\n' "$agent"
    printf 'Create: Use azure-functions-hosted-skills to create a weekly Microsoft AI briefing. Every Monday at 08:00 JST, summarize Microsoft AI news from the past seven days using official Microsoft sources, include source links, and post it to an existing Teams thread. Show a plan first; do not deploy or send messages yet.\n'
    printf 'Migrate: Use azure-functions-hosted-skills-migrate to migrate my GitHub Actions workflow at `.github/workflows/weekly-releases.yml`: every Friday at 09:00 JST, it reads new GitHub releases and posts a Teams digest. Preserve its repository list, schedule, and destination. Show a migration plan; do not deploy or send messages yet.\n' ;;
  declined) printf 'Setup canceled. No workspace files were changed.\n' ;;
  preview) printf 'Preview only. No workspace files were changed.\n' ;;
esac

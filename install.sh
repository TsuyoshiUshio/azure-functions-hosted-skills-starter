#!/bin/sh
set -eu

ref=
destination=./my-hosted-skill
agent=all
json=false
fail() { printf 'Download/bootstrap failed: %s\n' "$*" >&2; exit 2; }
while [ "$#" -gt 0 ]; do
    case "$1" in
        --ref|--destination|--agent)
            [ "$#" -ge 2 ] || fail "Missing value for $1"
            case "$1" in --ref) ref=$2 ;; --destination) destination=$2 ;; --agent) agent=$2 ;; esac
            shift 2 ;;
        --json) json=true; shift ;;
        *) fail "Unknown argument: $1" ;;
    esac
done
[ "${#ref}" -eq 40 ] || fail '--ref must be a full lowercase Git commit SHA.'
case "$ref" in *[!0-9a-f]*) fail '--ref must be a full lowercase Git commit SHA.' ;; esac
case "$agent" in all|copilot|claude|codex) ;; *) fail "Unknown agent: $agent" ;; esac
for tool in curl tar mktemp rm sh; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required OS utility missing: $tool"
done
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
trap 'exit 2' HUP INT TERM
url="https://codeload.github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/tar.gz/$ref"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 120 "$url" -o "$temporary/starter.tar.gz" ||
    fail 'Cannot download this commit. For a private repository use an authenticated checkout and bootstrap.sh.'
tar -xzf "$temporary/starter.tar.gz" -C "$temporary"
source=$temporary/azure-functions-hosted-skills-starter-$ref
if [ "$json" = true ]; then
    sh "$source/bootstrap.sh" --destination "$destination" --agent "$agent" --json
else
    sh "$source/bootstrap.sh" --destination "$destination" --agent "$agent"
fi

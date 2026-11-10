#!/bin/sh
set -eu

ref=main
destination=.
agent=
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
if [ "$ref" != main ]; then
    [ "${#ref}" -eq 40 ] || fail '--ref must be main or a full lowercase Git commit SHA.'
    case "$ref" in *[!0-9a-f]*) fail '--ref must be main or a full lowercase Git commit SHA.' ;; esac
fi
if [ -z "$agent" ]; then
    [ "$json" = false ] || fail 'Specify --agent copilot, claude, codex, or all with --json.'
    printf 'Coding agent (copilot / claude / codex / all): ' >&2
    IFS= read -r agent || fail 'Agent selection required; pass --agent explicitly for noninteractive use.'
    agent=${agent%"$(printf '\r')"}
fi
case "$agent" in all|copilot|claude|codex) ;; *) fail "Unknown agent: $agent" ;; esac
for tool in curl tar mktemp rm sh awk; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required OS utility missing: $tool"
done
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
trap 'exit 2' HUP INT TERM
commit=$ref
if [ "$ref" = main ]; then
    commit=$(curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
        --connect-timeout 15 --max-time 30 -H 'Accept: application/vnd.github.sha' \
        'https://api.github.com/repos/TsuyoshiUshio/azure-functions-hosted-skills-starter/commits/main') ||
        fail 'Cannot resolve latest main; no fallback was used.'
    [ "${#commit}" -eq 40 ] || fail 'GitHub returned an invalid main commit SHA.'
    case "$commit" in *[!0-9a-f]*) fail 'GitHub returned an invalid main commit SHA.' ;; esac
fi
url="https://codeload.github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter/tar.gz/$commit"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 120 "$url" -o "$temporary/starter.tar.gz" ||
    fail 'Cannot download this commit. For a private repository use an authenticated checkout and bootstrap.sh.'
tar -xzf "$temporary/starter.tar.gz" -C "$temporary"
source=$temporary/azure-functions-hosted-skills-starter-$commit
printf '{"repository":"TsuyoshiUshio/azure-functions-hosted-skills-starter","ref":"%s","commit":"%s"}\n' \
    "$ref" "$commit" > "$source/cache/installer-source.json"
if command -v sha256sum >/dev/null 2>&1; then
    digest=$(sha256sum "$source/cache/installer-source.json" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    digest=$(shasum -a 256 "$source/cache/installer-source.json" | awk '{print $1}')
else
    fail 'SHA-256 utility missing: install sha256sum or shasum.'
fi
printf 'common\t%s\tinstaller-source.json\t.hosted-skills-bootstrap.json\n' "$digest" >> "$source/cache/files.tsv"
if [ "$json" = true ]; then
    sh "$source/bootstrap.sh" --destination "$destination" --agent "$agent" --json
else
    sh "$source/bootstrap.sh" --destination "$destination" --agent "$agent"
fi

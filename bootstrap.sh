#!/bin/sh
set -eu

destination=.
agent=
check=false
json=false
no_telemetry=false
telemetry_enabled=true
fail() {
    printf 'Bootstrap failed: %s\n' "$*" >&2
    exit 2
}
usage() {
    printf '%s\n' 'Usage: sh bootstrap.sh [--destination PATH] [--agent all|copilot|claude|codex] [--check] [--json] [--no-telemetry]'
}
while [ "$#" -gt 0 ]; do
    case "$1" in
        --destination|--agent)
            [ "$#" -ge 2 ] || fail "Missing value for $1"
            case "$1" in --destination) destination=$2 ;; --agent) agent=$2 ;; esac
            shift 2 ;;
        --check) check=true; shift ;;
        --json) json=true; shift ;;
        --no-telemetry) no_telemetry=true; telemetry_enabled=false; shift ;;
        --help) usage; exit 0 ;;
        *) usage >&2; fail "Unknown argument: $1" ;;
    esac
done
if [ -z "$agent" ]; then
    [ "$json" = false ] || fail 'Specify --agent copilot, claude, codex, or all with --json.'
    printf 'Coding agent (copilot / claude / codex / all): ' >&2
    IFS= read -r agent || fail 'Agent selection required; pass --agent explicitly for noninteractive use.'
    agent=${agent%"$(printf '\r')"}
fi
case "$agent" in all|copilot|claude|codex) ;; *) fail "Unknown agent: $agent" ;; esac
[ -n "$destination" ] || fail 'Destination must not be empty.'
for tool in awk cmp dirname mkdir mktemp cat rm rmdir; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required OS utility missing: $tool"
done
if command -v sha256sum >/dev/null 2>&1; then
    verify_hashes() { sha256sum -c "$1" > /dev/null; }
elif command -v shasum >/dev/null 2>&1; then
    verify_hashes() { shasum -a 256 -c "$1" > /dev/null; }
else
    fail 'SHA-256 utility missing: install sha256sum or shasum.'
fi
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cache=$root/cache
[ -f "$cache/files.tsv" ] || fail 'Missing cache/files.tsv. Use the complete starter archive or checkout.'
# Resolve a possibly non-existent target without creating it in check mode.
case "$destination" in /*) target=$destination ;; *) target=$(pwd -P)/$destination ;; esac
target=$(printf '%s\n' "$target" | awk -F / '{
    n=0
    for (i=1;i<=NF;i++) {
        if ($i=="" || $i==".") continue
        if ($i=="..") { if (n>0) n--; continue }
        a[++n]=$i
    }
    printf "/"
    for (i=1;i<=n;i++) printf "%s%s", a[i], (i<n ? "/" : "")
}')
newline='
'
tab=$(printf '\t')
carriage_return=$(printf '\r')
case "$target" in *"$newline"*|*"$tab"*|*"$carriage_return"*) fail 'Control character in destination.' ;; esac
printf '%s' "$target" | LC_ALL=C awk '/[[:cntrl:]]/ {exit 1}' ||
    fail 'Control character in destination.'
[ ! -f "$target" ] || fail "Destination is a file: $target"
# Canonicalize the existing parent without creating a missing destination.
# This handles /var -> /private/var and Windows short-name directory aliases.
parent=$target
suffix=
while [ ! -d "$parent" ]; do
    [ ! -e "$parent" ] && [ ! -L "$parent" ] ||
        fail "Destination parent is not a directory: $parent"
    suffix=/${parent##*/}$suffix
    parent=${parent%/*}
    [ -n "$parent" ] || parent=/
done
physical_target=$(CDPATH= cd -- "$parent" && pwd -P) || fail "Cannot resolve destination parent: $parent"
physical_target=${physical_target%/}$suffix
[ -n "$physical_target" ] || physical_target=/
case "$physical_target" in "$root"|"$cache"|"$cache"/*|/) fail 'Choose a destination outside the starter root, its ancestors, and cache.' ;; esac
case "$root/" in "$physical_target/"*) fail 'Destination must not contain the starter distribution.' ;; esac
safe_path() {
    case "$1" in ''|/*|*/|*[!A-Za-z0-9._/-]*|*//*|.|..|./*|../*|*/./*|*/../*|*/.|*/..) fail "Unsafe manifest path: $1" ;; esac
}
no_link() {
    current=$1
    rest=$2
    [ ! -L "$current" ] || fail "Symbolic link in apply path: $current"
    if [ -e "$current" ] && [ ! -d "$current" ]; then
        fail "Destination/cache root is not a directory: $current"
    fi
    while :; do
        part=${rest%%/*}
        current=$current/$part
        [ ! -L "$current" ] || fail "Symbolic link in apply path: $current"
        case "$rest" in
            */*)
                if [ -e "$current" ] && [ ! -d "$current" ]; then
                    fail "A parent path is not a directory: $current"
                fi
                rest=${rest#*/} ;;
            *) break ;;
        esac
    done
}
selected() {
    case "$1" in
        preference-on) [ "$no_telemetry" = false ]; return ;;
        preference-off) [ "$no_telemetry" = true ]; return ;;
    esac
    [ "$1" = common ] || [ "$agent" = all ] || [ "$1" = "$agent" ] ||
        { [ "$1" = agents ] && { [ "$agent" = copilot ] || [ "$agent" = codex ]; }; }
}
work=$(mktemp -d)
trap 'rm -f "$work/selected.tsv" "$work/missing.tsv" "$work/cache.sha256"; rmdir "$work"' EXIT
trap 'exit 2' HUP INT TERM
: > "$work/selected.tsv"
: > "$work/missing.tsv"
: > "$work/cache.sha256"
# Validate the whole manifest grammar before interpreting any paths.
awk -F '\t' 'NF!=4 || $1 !~ /^(common|agents|copilot|claude|codex|preference-on|preference-off)$/ ||
    length($2)!=64 || $2 ~ /[^0-9a-f]/ {exit 1}' "$cache/files.tsv" ||
    fail 'Invalid cache manifest row.'
while IFS="$tab" read -r scope digest source output; do
    safe_path "$source"
    safe_path "$output"
    selected "$scope" || continue
    no_link "$cache" "$source"
    no_link "$target" "$output"
    [ -f "$cache/$source" ] || fail "Missing cache file: $source"
    printf '%s  %s\n' "$digest" "$source" >> "$work/cache.sha256"
    printf '%s\t%s\t%s\t%s\n' "$scope" "$digest" "$source" "$output" >> "$work/selected.tsv"
    case "$scope" in
        preference-on|preference-off)
            [ "$output" = .hosted-skills-starter/telemetry.config.json ] ||
                fail 'Invalid telemetry preference destination.'
            if [ -e "$target/$output" ]; then
                [ -f "$target/$output" ] || fail 'Telemetry preference is not a regular file.'
                telemetry_enabled=$(LC_ALL=C awk '{
                    document=document $0 "\n"
                } END {
                    if (document !~ /^[ \t\r\n]*[{][ \t\r\n]*"enabled"[ \t\r\n]*:[ \t\r\n]*(true|false)[ \t\r\n]*[}][ \t\r\n]*$/) exit 1
                    if (document ~ /:[ \t\r\n]*true/) printf "true"; else printf "false"
                }' "$target/$output") ||
                    fail 'Invalid existing telemetry preference; preserve it and reconcile before retrying.'
                [ "$no_telemetry" = false ] || [ "$telemetry_enabled" = false ] ||
                    fail 'Existing telemetry preference is enabled; review changing it to enabled: false before retrying --no-telemetry.'
                continue
            fi ;;
    esac
    if [ -e "$target/$output" ]; then
        [ -f "$target/$output" ] && cmp -s "$cache/$source" "$target/$output" ||
            fail "Conflicting file; nothing was applied: $output. Choose a new destination or reconcile it yourself."
    else
        printf '%s\t%s\n' "$source" "$output" >> "$work/missing.tsv"
    fi
done < "$cache/files.tsv"
[ -s "$work/selected.tsv" ] || fail 'Cache manifest contains no selected files.'
awk -F '\t' 'seen[tolower($4)]++ {exit 1}' "$work/selected.tsv" ||
    fail 'Duplicate destination in manifest.'
(CDPATH= cd -- "$cache" && verify_hashes "$work/cache.sha256") ||
    fail 'Cache integrity check failed; nothing was applied.'
missing=$(awk 'END {print NR+0}' "$work/missing.tsv")
created=0
if [ "$check" = false ]; then
    while IFS="$tab" read -r source output; do
        mkdir -p "$(dirname "$target/$output")"
        # noclobber refuses a file created concurrently after preflight.
        (set -C; cat "$cache/$source" > "$target/$output") ||
            fail "Could not create $output; partial files may remain. No existing files were overwritten."
    done < "$work/missing.tsv"
    created=$missing
    missing=0
fi
ready=true
[ "$missing" -eq 0 ] || ready=false
detected() {
    if command -v "$1" >/dev/null 2>&1; then printf true; else printf false; fi
}
escape_json() {
    # Reject control characters rather than emitting malformed JSON.
    LC_ALL=C awk 'BEGIN {ORS=""} {
        if ($0 ~ /[[:cntrl:]]/) exit 1
        for (i=1;i<=length($0);i++) {
            c=substr($0,i,1)
            if (c=="\\" || c=="\"") printf "\\"
            printf "%s", c
        }
    }'
}
if [ "$json" = true ]; then
    escaped_target=$(printf '%s' "$target" | escape_json) || fail 'Control character in destination.'
    mode=apply
    [ "$check" = false ] || mode=check
    printf '{"schemaVersion":1,"mode":"%s","destination":"%s","agent":"%s",' "$mode" "$escaped_target" "$agent"
    printf '"skills":'
    awk -F '\t' 'BEGIN {printf "["}
        $4 ~ /^\.(agents|claude)\/skills\/[^\/]+\/SKILL[.]md$/ {
            split($4, parts, "/")
            if (!seen[parts[3]]++) {
                printf "%s\"%s\"", separator, parts[3]
                separator=","
            }
        }
        END {printf "],"}' "$work/selected.tsv"
    printf '"templateSource":"repository-cache","template":'
    cat "$cache/app/.hosted-skills-template.json"
    printf ',"starterSource":'
    if [ -f "$cache/installer-source.json" ]; then cat "$cache/installer-source.json"; else printf null; fi
    printf ',"authorReady":%s,"filesCreated":%s,"filesMissing":%s,"toolsDetected":{' "$ready" "$created" "$missing"
    separator=
    for tool in python3 python func azurite azd az node; do
        printf '%s"%s":%s' "$separator" "$tool" "$(detected "$tool")"
        separator=,
    done
    printf '},"telemetry":{"preferenceEnabled":%s,"runtime":"not-verified"},"localRun":"not-verified","deployment":"not-verified"}\n' "$telemetry_enabled"
else
    printf 'Author-ready: %s\nDestination: %s\n' "$ready" "$target"
    printf 'Agent: %s; source: repository-cache; created: %s; missing: %s\n' "$agent" "$created" "$missing"
    if [ -f "$cache/installer-source.json" ]; then
        printf 'Starter source: '
        cat "$cache/installer-source.json"
    fi
    printf 'Optional tools on PATH (presence only; versions, services and authentication not verified):\n'
    for tool in python3 python func azurite azd az node; do
        printf '  %s: %s\n' "$tool" "$(detected "$tool")"
    done
    printf 'Telemetry preference enabled: %s; hook execution and delivery: not verified.\n' "$telemetry_enabled"
    printf 'Local run and deployment: not verified. No tools installed, services started or Azure resources created.\n'
    if [ "$ready" = true ]; then
        printf 'Open the destination in your coding agent and describe the Hosted Skill you want to build.\n'
    fi
fi
[ "$ready" = true ] || exit 1

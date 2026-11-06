[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('claude', 'codex', 'copilot', 'vscode')]
    [string] $Agent,
    [string] $Workspace = (Get-Location).Path,
    [string] $Source,
    [switch] $NoTelemetry,
    [switch] $Preview
)

function Invoke-StarterSetup {
    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $false
    $prompt = 'Read https://aka.ms/hosted-skills-starter and set up Azure Functions Hosted Skills in this workspace. This is workspace setup, not app creation. Do not open a Canvas.'
    $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $compatible = $false
    if ($node) {
        $version = & $node.Source --version
        if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.(\d+)\.(\d+)') {
            $compatible = [version] "$($Matches[1]).$($Matches[2]).$($Matches[3])" -ge [version] '22.13.0'
        }
    }
    $git = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $npx = Get-Command npx -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $compatible -or -not $git -or -not $npx) {
        Write-Warning 'Terminal setup needs Node.js 22.13+, npx, and Git. No files were changed; no tools were installed.'
        Write-Host "Continue without them by giving your coding agent this prompt:`n`n$prompt"
        return 2
    }

    $staging = $null
    $failure = $null
    $cleanupFailure = $null
    $outcome = 'preview'
    try {
        $target = (Resolve-Path -LiteralPath $Workspace).ProviderPath
        $distribution = $Source
        if (-not $distribution -and $PSScriptRoot -and
            (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'starter.config.json'))) {
            $distribution = $PSScriptRoot
        }
        if (-not $distribution) {
            $staging = Join-Path ([IO.Path]::GetTempPath()) ('hosted-skills-starter.' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $staging | Out-Null
            $distribution = Join-Path $staging 'source'
            & $git.Source clone --quiet --depth 1 -- 'https://github.com/TsuyoshiUshio/azure-functions-hosted-skills-starter.git' $distribution | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'Could not stage the distribution.' }
            $revision = & $git.Source -C $distribution rev-parse --verify HEAD
            if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Could not resolve the source revision.' }
            & $git.Source -C $distribution checkout --quiet --detach $revision | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'Could not pin the staged source revision.' }
        }
        $distribution = (Resolve-Path -LiteralPath $distribution).ProviderPath
        $script = Join-Path $distribution 'scripts\setup.mjs'
        if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'The selected source is not a starter distribution.' }
        $arguments = @($script, '--agent', $Agent, '--workspace', $target)
        if ($NoTelemetry) { $arguments += '--no-telemetry' }
        $rawPlan = & $node.Source @arguments | Out-String
        $previewExit = $LASTEXITCODE
        Write-Host $rawPlan
        if ($previewExit -ne 0) { throw 'Preview could not finish. Ask your agent to review and merge the existing files.' }
        $plan = $rawPlan | ConvertFrom-Json
        if ($plan.planToken -notmatch '^[a-f0-9]{64}$') { throw 'Preview did not return a valid approval token.' }
        if (-not $Preview) {
            $answer = Read-Host 'Apply this exact setup plan? [y/N]'
            if ($answer -match '^(y|yes)$') {
                & $node.Source @arguments --apply --expect-plan $plan.planToken | Out-Host
                if ($LASTEXITCODE -ne 0) { throw 'Apply did not finish. Review the workspace before retrying.' }
                $outcome = 'installed'
            } else {
                $outcome = 'declined'
            }
        }
    } catch {
        $failure = $_.Exception.Message
    } finally {
        if ($staging) {
            try { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction Stop }
            catch { $cleanupFailure = "Setup staging was retained at $staging. Review and remove it manually." }
        }
    }
    if ($cleanupFailure) { Write-Warning $cleanupFailure }
    if ($failure) {
        Write-Warning "Setup did not finish: $failure"
        Write-Host "Agent-assisted recovery: $prompt"
    }
    if ($failure -or $cleanupFailure) { return 1 }
    if ($outcome -eq 'installed') {
        Write-Host "`n=== Hosted Skills setup complete! ==="
        Write-Host "Configured for $Agent. Reload your agent and review its trust prompts."
        Write-Host 'Create: Use azure-functions-hosted-skills to create a weekly Microsoft AI briefing. Every Monday at 08:00 JST, summarize Microsoft AI news from the past seven days using official Microsoft sources, include source links, and post it to an existing Teams thread. Show a plan first; do not deploy or send messages yet.'
        Write-Host 'Migrate: Use azure-functions-hosted-skills-migrate to migrate my GitHub Actions workflow at `.github/workflows/weekly-releases.yml`: every Friday at 09:00 JST, it reads new GitHub releases and posts a Teams digest. Preserve its repository list, schedule, and destination. Show a migration plan; do not deploy or send messages yet.'
    } elseif ($outcome -eq 'declined') {
        Write-Host 'Setup canceled. No workspace files were changed.'
    } else {
        Write-Host 'Preview only. No workspace files were changed.'
    }
    return 0
}

$code = Invoke-StarterSetup
if ($PSCommandPath) { exit $code }
$global:LASTEXITCODE = $code

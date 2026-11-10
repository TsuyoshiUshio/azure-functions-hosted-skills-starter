[CmdletBinding()]
param(
    [string]$Destination = (Join-Path (Get-Location) 'my-hosted-skill'),
    [ValidateSet('all', 'copilot', 'claude', 'codex')]
    [string]$Agent = 'all',
    [switch]$Check,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)

function Assert-SafePath([string]$Path) {
    if ($Path -notmatch '^[A-Za-z0-9._/-]+$' -or
        $Path.StartsWith('/') -or $Path.EndsWith('/') -or $Path -match '(^|/)\.\.?(/|$)' -or
        $Path.Contains('//')) {
        throw "Unsafe manifest path: $Path"
    }
}

function Assert-NoLink([string]$Root, [string]$Relative) {
    $current = $Root
    $segments = @('') + @($Relative.Split('/'))
    for ($index = 0; $index -lt $segments.Count; $index++) {
        $segment = $segments[$index]
        if ($segment) { $current = Join-Path $current $segment }
        $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Symbolic links and junctions are not supported in apply paths: $current"
        }
        if ($index -lt $segments.Count - 1 -and
            $null -ne $item -and -not $item.PSIsContainer) {
            throw "A parent path is not a directory: $current"
        }
    }
}

function Get-Digest([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

try {
    $cache = Join-Path $PSScriptRoot 'cache'
    $manifest = Join-Path $cache 'files.tsv'
    if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
        throw 'Missing cache/files.tsv. Use the complete starter archive or checkout.'
    }
    $target = [IO.Path]::GetFullPath($Destination)
    if ($target -match '[\x00-\x1f]') { throw 'Control character in destination.' }
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        throw "Destination is a file: $target"
    }
    # Do not let an apply modify its own distribution.
    $sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
    if ($target.TrimEnd('\', '/') -eq $sourceRoot -or
        $sourceRoot.StartsWith($target.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase) -or
        $target.StartsWith($cache + [IO.Path]::DirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase) -or $target -eq $cache) {
        throw 'Choose a destination outside the starter root, its ancestors, and cache.'
    }
    $entries = @()
    $destinations = @{}
    $conflicts = @()
    foreach ($line in [IO.File]::ReadAllLines($manifest)) {
        $fields = $line.Split("`t")
        if ($fields.Count -ne 4 -or $fields[0] -notin @('common', 'agents', 'copilot', 'claude', 'codex') -or
            $fields[1] -cnotmatch '^[0-9a-f]{64}$') {
            throw 'Invalid cache manifest row.'
        }
        $scope, $digest, $relativeSource, $relativeTarget = $fields
        Assert-SafePath $relativeSource
        Assert-SafePath $relativeTarget
        $selected = $scope -eq 'common' -or $Agent -eq 'all' -or $scope -eq $Agent -or
            ($scope -eq 'agents' -and $Agent -in @('copilot', 'codex'))
        if (-not $selected) { continue }
        if ($destinations.ContainsKey($relativeTarget)) {
            throw "Duplicate destination in manifest: $relativeTarget"
        }
        $destinations[$relativeTarget] = $true
        Assert-NoLink $cache $relativeSource
        Assert-NoLink $target $relativeTarget
        $source = Join-Path $cache $relativeSource
        $output = Join-Path $target $relativeTarget
        if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or
            (Get-Digest $source) -ne $digest) {
            throw "Cache integrity check failed: $relativeSource"
        }
        $exists = Test-Path -LiteralPath $output
        if ($exists -and (-not (Test-Path -LiteralPath $output -PathType Leaf) -or
            (Get-Digest $output) -ne $digest)) {
            $conflicts += $relativeTarget
        }
        $entries += [PSCustomObject]@{ Source = $source; Target = $output; Exists = $exists }
    }
    if ($entries.Count -eq 0) { throw 'Cache manifest contains no selected files.' }
    if ($conflicts.Count -gt 0) {
        throw "Conflicting files; nothing was applied: $($conflicts -join ', '). Choose a new destination or reconcile these files yourself."
    }
    $missing = @($entries | Where-Object { -not $_.Exists })
    if (-not $Check) {
        foreach ($entry in $missing) {
            $null = [IO.Directory]::CreateDirectory((Split-Path -Parent $entry.Target))
            # CreateNew protects a concurrent edit from being overwritten.
            $stream = [IO.File]::Open($entry.Target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
            try {
                $bytes = [IO.File]::ReadAllBytes($entry.Source)
                $stream.Write($bytes, 0, $bytes.Length)
            } finally { $stream.Dispose() }
        }
    }
    $detected = [ordered]@{}
    foreach ($tool in @('python3', 'python', 'func', 'azurite', 'azd', 'az')) {
        $detected[$tool] = $null -ne (Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue)
    }
    $ready = -not $Check -or $missing.Count -eq 0
    $report = [ordered]@{
        schemaVersion = 1
        mode = $(if ($Check) { 'check' } else { 'apply' })
        destination = $target
        agent = $Agent
        templateSource = 'repository-cache'
        template = (Get-Content -LiteralPath (Join-Path $cache 'app\.hosted-skills-template.json') -Raw | ConvertFrom-Json)
        authorReady = $ready
        filesCreated = $(if ($Check) { 0 } else { $missing.Count })
        filesMissing = $(if ($Check) { $missing.Count } else { 0 })
        toolsDetected = $detected
        localRun = 'not-verified'
        deployment = 'not-verified'
    }
    if ($Json) {
        $report | ConvertTo-Json -Depth 10
    } else {
        Write-Output "Author-ready: $ready"
        Write-Output "Destination: $target"
        Write-Output "Agent: $Agent; source: repository-cache; created: $($report.filesCreated); missing: $($report.filesMissing)"
        Write-Output 'Optional tools on PATH (presence only; versions, services and authentication not verified):'
        foreach ($tool in $detected.Keys) { Write-Output "  ${tool}: $($detected[$tool])" }
        Write-Output 'Local run and deployment: not verified. No tools installed, services started or Azure resources created.'
        if ($ready) { Write-Output 'Open the destination in your coding agent and describe the Hosted Skill you want to build.' }
    }
    if (-not $ready) { exit 1 }
} catch {
    if ($Json) {
        [ordered]@{ schemaVersion = 1; authorReady = $false; error = $_.Exception.Message } |
            ConvertTo-Json -Compress
    } else {
        [Console]::Error.WriteLine("Bootstrap failed: $($_.Exception.Message)")
    }
    exit 2
}

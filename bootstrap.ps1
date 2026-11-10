[CmdletBinding()]
param(
    [string]$Destination = (Join-Path (Get-Location) 'my-hosted-skill'),
    [string]$Agent,
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
        if ($segment) { $current = [IO.Path]::Combine($current, $segment) }
        $attributes = Get-PathAttributes $current
        if ($null -ne $attributes -and ($attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Symbolic links and junctions are not supported in apply paths: $current"
        }
        if ($index -lt $segments.Count - 1 -and
            $null -ne $attributes -and -not ($attributes -band [IO.FileAttributes]::Directory)) {
            throw "A parent path is not a directory: $current"
        }
    }
}

function Get-PathAttributes([string]$Path) {
    try { return [IO.File]::GetAttributes($Path) }
    catch [IO.FileNotFoundException] { return $null }
    catch [IO.DirectoryNotFoundException] { return $null }
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
    if (-not $Agent) {
        if ($Json) { throw 'Specify -Agent copilot, claude, codex, or all with -Json.' }
        $Agent = Read-Host 'Coding agent (copilot / claude / codex / all)'
    }
    if ($Agent -notin @('copilot', 'claude', 'codex', 'all')) { throw "Unknown agent: $Agent" }
    $cache = [IO.Path]::Combine($PSScriptRoot, 'cache')
    $manifest = [IO.Path]::Combine($cache, 'files.tsv')
    if (-not [IO.File]::Exists($manifest)) {
        throw 'Missing cache/files.tsv. Use the complete starter archive or checkout.'
    }
    $target = [IO.Path]::GetFullPath($Destination)
    if ($target -match '[\x00-\x1f]') { throw 'Control character in destination.' }
    if ([IO.File]::Exists($target)) {
        throw "Destination is a file: $target"
    }
    # Do not let an apply modify its own distribution.
    $separator = [IO.Path]::DirectorySeparatorChar
    $comparison = if ($separator -eq '\') { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    $sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd($separator)
    $targetRoot = $target.TrimEnd($separator)
    if ([string]::Equals($targetRoot, $sourceRoot, $comparison) -or
        $sourceRoot.StartsWith($targetRoot + $separator, $comparison) -or
        $target.StartsWith($cache + $separator, $comparison) -or
        [string]::Equals($targetRoot, $cache, $comparison)) {
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
        $source = [IO.Path]::Combine($cache, $relativeSource)
        $output = [IO.Path]::Combine($target, $relativeTarget)
        if (-not [IO.File]::Exists($source) -or
            (Get-Digest $source) -ne $digest) {
            throw "Cache integrity check failed: $relativeSource"
        }
        $exists = $null -ne (Get-PathAttributes $output)
        if ($exists -and (-not [IO.File]::Exists($output) -or
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
            $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($entry.Target))
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
        starterSource = $(if ([IO.File]::Exists([IO.Path]::Combine($cache, 'installer-source.json'))) {
            [IO.File]::ReadAllText([IO.Path]::Combine($cache, 'installer-source.json')) | ConvertFrom-Json
        } else { $null })
        template = ([IO.File]::ReadAllText([IO.Path]::Combine($cache, 'app', '.hosted-skills-template.json')) | ConvertFrom-Json)
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
        if ($null -ne $report.starterSource) { Write-Output "Starter commit: $($report.starterSource.commit)" }
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

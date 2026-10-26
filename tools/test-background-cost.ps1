# tools/test-background-cost.ps1 - checks for measure-background-cost.ps1: process scope, per-process CPU accounting, window restore, entry wiring.
# Runs on Windows PowerShell 5.1 and PowerShell 7, on any OS: it uses a simulated process world, a fake window and fake Windows cmdlets,
# never real ones, and deletes only temporary folders it created itself (see Remove-OwnedTempFolder).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-background-cost.ps1
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'background-cost-lib.ps1')
$entryPath = Join-Path $PSScriptRoot 'measure-background-cost.ps1'
$libPath = Join-Path $PSScriptRoot 'background-cost-lib.ps1'
$testPath = $MyInvocation.MyCommand.Path

$script:passed = 0
function Check {
    param([bool]$Condition, [string]$Label, [string]$Detail = '')
    if (-not $Condition) {
        if ($Detail) { Write-Host ('--- detail for the failed check ---' + [System.Environment]::NewLine + $Detail) }
        throw ('FAIL ' + $Label)
    }
    $script:passed++
    Write-Host ('PASS ' + $Label)
}
function Near { param([double]$A, [double]$B, [double]$Tolerance = 1e-6) return ([math]::Abs($A - $B) -le $Tolerance) }

# --- Temporary folders: created under the temp root with an owned name, and only such folders are ever removed recursively -------------
$script:separators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
function Get-TempRoot { return [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd($script:separators) }
function New-OwnedTempFolder {
    param([ValidatePattern('^[a-z]+(-[a-z]+)*-$')][string]$Prefix = 'folia-bgcost-')
    $path = Join-Path (Get-TempRoot) ($Prefix + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $path)
    return $path
}
# First link (symbolic link or junction) found anywhere under a folder, or $null. Links are reported, never followed, so a link that
# points outside cannot make the walk (or a later recursive delete) leave the folder.
function Find-LinkInside {
    param([Parameter(Mandatory = $true)][string]$Folder)
    foreach ($entry in (New-Object System.IO.DirectoryInfo($Folder)).GetFileSystemInfos()) {
        if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { return $entry.FullName }
        if ($entry -is [System.IO.DirectoryInfo]) {
            $found = Find-LinkInside -Folder $entry.FullName
            if ($null -ne $found) { return $found }
        }
    }
    return $null
}
# Refuses unless the fully resolved path is a direct child of the temp root, is named <prefix> plus a 32-digit lower-case GUID (the
# default prefix is the one New-OwnedTempFolder gives this test's own folders), and is a real folder with no link anywhere inside it
# (a link could lead the delete to something this test does not own). Only then does it delete recursively.
function Remove-OwnedTempFolder {
    param([Parameter(Mandatory = $true)][string]$Path, [ValidatePattern('^[a-z]+(-[a-z]+)*-$')][string]$Prefix = 'folia-bgcost-')
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd($script:separators)
    $parent = [System.IO.Path]::GetDirectoryName($full)
    if ($null -eq $parent -or -not [string]::Equals($parent.TrimEnd($script:separators), (Get-TempRoot), [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ('Refusing to delete {0}: it is not a direct child of the temp root {1}.' -f $full, (Get-TempRoot))
    }
    if ([System.IO.Path]::GetFileName($full) -cnotmatch ('^' + [regex]::Escape($Prefix) + '[0-9a-f]{32}$')) { throw ('Refusing to delete {0}: the name is not an owned test folder.' -f $full) }
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { return }
    if (((Get-Item -LiteralPath $full -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw ('Refusing to delete {0}: it is a link, not a folder this test created.' -f $full)
    }
    $inside = Find-LinkInside -Folder $full
    if ($null -ne $inside) { throw ('Refusing to delete {0}: it contains a link ({1}), which a recursive delete could follow out of the folder.' -f $full, $inside) }
    Remove-Item -LiteralPath $full -Recurse -Force
}
# Create a directory link at $Path pointing to $Target: a symbolic link where the account may create one, otherwise (Windows) a junction.
# Returns $false when neither can be created here. A link is removed with Remove-DirectoryLink, never by a recursive delete.
function New-DirectoryLink {
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Target)
    foreach ($kind in 'SymbolicLink', 'Junction') {
        try { [void](New-Item -ItemType $kind -Path $Path -Target $Target -ErrorAction Stop); return $true } catch { $null = $_ }
    }
    return $false
}
function Remove-DirectoryLink {
    param([Parameter(Mandatory = $true)][string]$Path)
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { throw ('Refusing to unlink {0}: it is not a link.' -f $Path) }
    $item.Delete()
}
function Expect-Refusal {
    param([string]$Path, [string]$Fragment, [string]$Label)
    $message = $null; try { Remove-OwnedTempFolder -Path $Path } catch { $message = $_.Exception.Message }
    Check (($null -ne $message) -and $message -like ('*' + $Fragment + '*')) $Label
}

$guardFolder = New-OwnedTempFolder
try {
    $sentinel = Join-Path $guardFolder 'sentinel.txt'; Set-Content -LiteralPath $sentinel -Value 'keep'
    # A decoy that sits where an owned folder would, with a different name, so every refusal can be checked against real content.
    $other = New-OwnedTempFolder -Prefix 'not-owned-'
    $otherSentinel = Join-Path $other 'sentinel.txt'; Set-Content -LiteralPath $otherSentinel -Value 'keep'
    try {
        Expect-Refusal (Get-TempRoot) 'direct child' 'cleanup refuses the temp root itself'
        Expect-Refusal $other 'not an owned test folder' 'cleanup refuses a temp folder with a different name, and leaves it untouched'
        Check (Test-Path -LiteralPath $otherSentinel) 'the refused folder still exists with its content'
        Expect-Refusal (Join-Path $guardFolder 'child') 'direct child' 'cleanup refuses a nested path inside an owned folder'
        Expect-Refusal (Join-Path $guardFolder (Join-Path '..' '..')) 'direct child' 'cleanup refuses a path that climbs out with ..'
        Expect-Refusal (Join-Path $guardFolder (Join-Path '..' ([System.IO.Path]::GetFileName($other)))) 'not an owned test folder' 'cleanup resolves .. before judging the name'
        Expect-Refusal (Join-Path (Split-Path -Parent $PSScriptRoot) ('folia-bgcost-' + [guid]::NewGuid().ToString('N'))) 'direct child' 'cleanup refuses an owned-looking name outside the temp root'
        Expect-Refusal (Join-Path (Get-TempRoot) 'folia-bgcost-ABCDEF0123456789ABCDEF0123456789') 'not an owned test folder' 'cleanup refuses an upper-case or otherwise malformed GUID name'
        Expect-Refusal (Join-Path (Get-TempRoot) 'folia-bgcost-123') 'not an owned test folder' 'cleanup refuses a short name'
        Expect-Refusal ((Join-Path (Get-TempRoot) ('folia-bgcost-' + [guid]::NewGuid().ToString('N'))) + [System.IO.Path]::DirectorySeparatorChar + 'x') 'direct child' 'cleanup refuses a path that continues past an owned-looking name'
        $threw = $false; try { [void](New-OwnedTempFolder -Prefix '..-') } catch { $threw = $true }
        Check $threw 'a prefix that is not plain lower-case words ending in a dash cannot be used to build or accept a cleanup target'
        Remove-OwnedTempFolder -Path (Join-Path (Get-TempRoot) ('folia-bgcost-' + [guid]::NewGuid().ToString('N')))
        Check $true 'cleanup of an owned name that no longer exists is a harmless no-op'

        # Links: an owned-looking name that is itself a link, and an owned folder that holds a link to the decoy.
        $link = Join-Path (Get-TempRoot) ('folia-bgcost-' + [guid]::NewGuid().ToString('N'))
        if (New-DirectoryLink -Path $link -Target $other) {
            try { Expect-Refusal $link 'is a link' 'cleanup refuses an owned-looking name that is a link to somewhere else'; Check (Test-Path -LiteralPath $otherSentinel) 'the link target is untouched' }
            finally { Remove-DirectoryLink -Path $link }
            Check ((Test-Path -LiteralPath $otherSentinel) -and -not (Test-Path -LiteralPath $link)) 'unlinking removed the link and nothing behind it'
            $holder = New-OwnedTempFolder
            try {
                Set-Content -LiteralPath (Join-Path $holder 'own.txt') -Value 'mine'
                $inner = Join-Path $holder 'inner'; [void](New-Item -ItemType Directory -Path $inner)
                $nestedLink = Join-Path $inner 'escape'
                Check (New-DirectoryLink -Path $nestedLink -Target $other) 'a link was placed two levels inside an owned folder'
                Check ((Find-LinkInside -Folder $holder) -eq $nestedLink) 'the walk finds a link nested below the top level without following it'
                Expect-Refusal $holder 'contains a link' 'cleanup refuses an owned folder that holds a link to somewhere else'
                Check ((Test-Path -LiteralPath $otherSentinel) -and (Test-Path -LiteralPath (Join-Path $holder 'own.txt'))) 'a refused folder with a link keeps its own files and the link target keeps its content'
                Remove-DirectoryLink -Path $nestedLink
            }
            finally { Remove-OwnedTempFolder -Path $holder }
            Check ((-not (Test-Path -LiteralPath $holder)) -and (Test-Path -LiteralPath $otherSentinel)) 'once the link is gone the owned folder is removed and the former link target survives'
        } else { Write-Host 'SKIP link refusal: this account can create neither symbolic links nor junctions' }
        Check ($null -eq (Find-LinkInside -Folder $guardFolder)) 'a folder without links reports none'
        Check (Test-Path -LiteralPath $sentinel) 'the owned folder survived every refused request'
    }
    finally { Remove-OwnedTempFolder -Path $other -Prefix 'not-owned-' }
}
finally { Remove-OwnedTempFolder -Path $guardFolder }
Check (-not (Test-Path -LiteralPath $guardFolder)) 'an owned folder is removed together with its content'

# --- Snapshot conversion --------------------------------------------------------------------------------------------------
$baseUtc = [datetime]::SpecifyKind([datetime]'2026-10-12T00:00:00', [System.DateTimeKind]::Utc)
function New-Row {
    param([int]$Id, [int]$ParentId, [datetime]$Created, [string]$Name = 'msedgewebview2.exe', [double]$Cpu = 0.0, [double]$Private = 100.0)
    return [pscustomobject]@{ ProcessId = $Id; ParentProcessId = $ParentId; CreationDate = $Created; Name = $Name
        KernelModeTime = [uint64]([math]::Floor($Cpu * 10000000.0 / 2)); UserModeTime = [uint64]([math]::Floor($Cpu * 10000000.0 / 2))
        WorkingSetSize = [uint64]($Private * 2); PrivatePageCount = [uint64]$Private }
}
$rows = @((New-Row 10 1 $baseUtc.AddSeconds(-50) 'FoliaLyrics.exe' 12.5 1000), [pscustomobject]@{ ProcessId = 11; ParentProcessId = 10; CreationDate = $null; Name = 'x'; KernelModeTime = 0; UserModeTime = 0; WorkingSetSize = 0; PrivatePageCount = 0 })
$converted = ConvertTo-ProcessSnapshot -Processes $rows
Check ($converted.Count -eq 1 -and $converted.ContainsKey(10)) 'snapshot conversion skips a process without a creation time'
Check ((Near $converted[10].CpuSeconds 12.5 1e-6) -and $converted[10].WorkingSetBytes -eq 2000 -and $converted[10].PrivateBytes -eq 1000) 'kernel+user time (100 ns units) become CPU seconds; memory is carried in bytes'
Check ($converted[10].Identity -eq (Get-ProcessIdentity -Id 10 -CreatedUtc $baseUtc.AddSeconds(-50))) 'identity is PID plus creation ticks'
Check ((ConvertTo-ProcessSnapshot -Processes @()).Count -eq 0) 'an empty process list converts to an empty snapshot'

# --- Host selection -------------------------------------------------------------------------------------------------------
$one = @([pscustomobject]@{ Id = 40; CreatedUtc = $baseUtc })
$two = @([pscustomobject]@{ Id = 40; CreatedUtc = $baseUtc }, [pscustomobject]@{ Id = 41; CreatedUtc = $baseUtc.AddMinutes(1) })
Check ((Select-HostProcess -Candidates $one).Id -eq 40) 'a single running instance is selected for read-only sampling'
$threw = $false; try { [void](Select-HostProcess -Candidates $two) } catch { $threw = $_.Exception.Message -like '*Several*-HostProcessId*' }
Check $threw 'several instances are never guessed between'
$threw = $false; try { [void](Select-HostProcess -Candidates @()) } catch { $threw = $_.Exception.Message -like 'No running*' }
Check $threw 'no running instance is reported'
Check ((Select-HostProcess -Candidates $two -RequestedId 41).Id -eq 41) 'an explicit PID picks that instance'
$threw = $false; try { [void](Select-HostProcess -Candidates $two -RequestedId 99) } catch { $threw = $_.Exception.Message -like '*was not found*' }
Check $threw 'an explicit PID that is not running is rejected'
$threw = $false; try { [void](Select-HostProcess -Candidates $one -RequireExplicitId $true) } catch { $threw = $_.Exception.Message -like '*explicit -HostProcessId*' }
Check $threw 'a window-changing mode refuses to choose a process by name'

# --- Process scope: descendants of the host only --------------------------------------------------------------------------
$hostRow = New-Row 100 1 $baseUtc.AddSeconds(-100) 'FoliaLyrics.exe'
$snap = ConvertTo-ProcessSnapshot -Processes @(
    $hostRow,
    (New-Row 200 100 $baseUtc.AddSeconds(-99)),                     # WebView2 browser process started by the host
    (New-Row 300 200 $baseUtc.AddSeconds(-98)),                     # renderer
    (New-Row 310 300 $baseUtc.AddSeconds(-97)),                     # grandchild
    (New-Row 900 800 $baseUtc.AddSeconds(-500)),                    # another program's WebView2 that shares the same profile folder
    (New-Row 901 900 $baseUtc.AddSeconds(-499)))
$rootIdentity = $snap[100].Identity
$members = @(Get-TreeMember -Snapshot $snap -Known @{} -RootIdentity $rootIdentity)
$ids = @($members | ForEach-Object { $_.Id } | Sort-Object)
Check (($ids -join ',') -eq '100,200,300,310') 'the tree is the host and its descendants; WebView2 processes of another parent are excluded'
Check (-not ($members | Where-Object { $_.Id -in 900, 901 })) 'a WebView2 process sharing the profile folder but not descended from the host is not counted'

$ledgerKnown = @{ $snap[300].Identity = $true }
$orphanSnap = ConvertTo-ProcessSnapshot -Processes @($hostRow, (New-Row 300 200 $baseUtc.AddSeconds(-98)), (New-Row 200 4242 $baseUtc.AddSeconds(5)))
$kept = @(Get-TreeMember -Snapshot $orphanSnap -Known $ledgerKnown -RootIdentity $rootIdentity | ForEach-Object { $_.Id } | Sort-Object)
Check (($kept -join ',') -eq '100,300') 'an adopted renderer stays a member after its parent died, while an unrelated process that recycled the parent PID does not join'

$reuseSnap = ConvertTo-ProcessSnapshot -Processes @($hostRow, (New-Row 200 100 $baseUtc.AddSeconds(-99)), (New-Row 300 200 $baseUtc.AddSeconds(-30)))
$knownOldRenderer = @{ (Get-ProcessIdentity -Id 300 -CreatedUtc $baseUtc.AddSeconds(-98)) = $true }
$reuse = @(Get-TreeMember -Snapshot $reuseSnap -Known $knownOldRenderer -RootIdentity $rootIdentity)
Check ((@($reuse | Where-Object { $_.Id -eq 300 }).Count -eq 1) -and (@($reuse | Where-Object { $_.Id -eq 300 })[0].Identity -ne (Get-ProcessIdentity -Id 300 -CreatedUtc $baseUtc.AddSeconds(-98))) `
        -and ((@($reuse | ForEach-Object { $_.Id }) | Sort-Object) -join ',') -eq '100,200,300') 'a recycled PID is a new identity, adopted only because its parent is a member'
$staleSnap = ConvertTo-ProcessSnapshot -Processes @($hostRow, (New-Row 700 100 $baseUtc.AddSeconds(-200)))
Check (@(Get-TreeMember -Snapshot $staleSnap -Known @{} -RootIdentity $rootIdentity).Count -eq 1) 'a process created before its supposed parent (stale parent id) is rejected'

# --- A simulated world: crash, restart, PID reuse, an unrelated profile sharer, irregular timing --------------------------------
# Each process has a constant CPU rate; Start is lifetime CPU already used when sampling begins (t = 0).
$script:t = 0.0
$script:calls = 0
$script:failAt = 0
$world = @(
    @{ Id = 100; Parent = 1;    Name = 'FoliaLyrics.exe';     Born = -100.0; Died = $null; Rate = 0.010; Start = 40.0 },
    @{ Id = 200; Parent = 100;  Name = 'msedgewebview2.exe';  Born = -99.0;  Died = $null; Rate = 0.020; Start = 30.0 },
    @{ Id = 300; Parent = 200;  Name = 'msedgewebview2.exe';  Born = -98.0;  Died = 7.0;  Rate = 0.050; Start = 500.0 },
    @{ Id = 301; Parent = 200;  Name = 'msedgewebview2.exe';  Born = 7.3;    Died = $null; Rate = 0.050; Start = 0.0 },
    @{ Id = 300; Parent = 4242; Name = 'unrelated.exe';       Born = 8.0;    Died = $null; Rate = 0.900; Start = 0.0 },
    @{ Id = 900; Parent = 800;  Name = 'msedgewebview2.exe';  Born = -500.0; Died = $null; Rate = 0.500; Start = 90.0 })
function Get-WorldSnapshot {
    param([double]$At)
    $rows = @()
    foreach ($p in $world) {
        if ($At -lt $p.Born -or ($null -ne $p.Died -and $At -ge $p.Died)) { continue }
        $cpu = $p.Start + $p.Rate * ($At - [math]::Max(0.0, $p.Born))
        if ($p.Born -gt 0.0) { $cpu = $p.Rate * ($At - $p.Born) }
        $rows += (New-Row $p.Id $p.Parent $baseUtc.AddSeconds($p.Born) $p.Name $cpu 1000000.0)
    }
    return (ConvertTo-ProcessSnapshot -Processes $rows)
}
$jitter = @(0.0, 0.35, 0.1, 0.6, 0.0)
$adapters = @{
    # The query takes 0.2 s of simulated time and reads the counters in the middle of it.
    GetSnapshot = { $script:calls++; if ($script:failAt -gt 0 -and $script:calls -eq $script:failAt) { throw 'simulated snapshot failure' }; $s = Get-WorldSnapshot -At ($script:t + 0.1); $script:t += 0.2; $s }
    Now = { $script:t }
    UtcNow = { $baseUtc.AddSeconds($script:t) }
    Sleep = { param([int]$Milliseconds) $script:t += $Milliseconds / 1000.0 + $jitter[$script:calls % $jitter.Count] }
    Window = $null
}
$report = Invoke-BackgroundCostMain -HostProcessId 100 -Mode Sample -Seconds 12 -IntervalMilliseconds 1000 -Label world -LogicalProcessors 8 -Adapters $adapters
$stage = $report.Stages[0]
Check ($report.Status -eq 'Completed' -and $report.Stages.Count -eq 1 -and $stage.Stage -eq 'Observed') 'Sample mode runs a single Observed stage to completion'
Check ($stage.MeasuredSeconds -ge 12.0 -and $stage.MeasuredSeconds -lt 14.0) 'measured time is the real elapsed time (a little over the requested 12 s because ticks are irregular)'
Check ($stage.LongestIntervalSeconds -gt 1.0) 'irregular intervals are real, not assumed to be the nominal 1 s'
$byId = @{}; foreach ($p in $report.Processes) { $byId[$p.Id.ToString() + $(if ($p.BornDuringRun) { 'n' } else { 'o' })] = $p }
Check ($byId.ContainsKey('100o') -and $byId.ContainsKey('200o') -and $byId.ContainsKey('300o') -and $byId.ContainsKey('301n')) 'host, browser, crashed renderer and its replacement are all tracked'
Check (-not ($report.Processes | Where-Object { $_.Name -eq 'unrelated.exe' -or $_.Id -eq 900 })) 'the recycled-PID outsider and the profile-sharing WebView2 are not tracked'
# CPU after the baseline is rate x time observed; CPU before sampling began (the lifetime Start values) is never counted.
foreach ($key in '100o', '200o') {
    $p = $byId[$key]; $rate = @($world | Where-Object { $_.Id -eq $p.Id -and $_.Name -ne 'unrelated.exe' })[0].Rate
    Check (Near $p.MeasuredCpuSeconds ($rate * ($p.LastSeenSeconds - $p.FirstSeenSeconds)) 1e-4) ('CPU of surviving process ' + $p.Id + ' equals rate x observed time and excludes pre-run CPU')
}
$old = $byId['300o']; $new = $byId['301n']
Check ($old.Exited -and (Near $old.MeasuredCpuSeconds (0.05 * ($old.LastSeenSeconds - $old.FirstSeenSeconds)) 1e-4)) 'the crashed renderer keeps the CPU observed before it exited (its 500 s lifetime is not subtracted)'
Check ((-not $new.Exited) -and (Near $new.MeasuredCpuSeconds (0.05 * ($new.LastSeenSeconds - 7.3)) 1e-4)) 'the restarted renderer is counted from its birth'
$sum = 0.0; foreach ($p in $report.Processes) { $sum += $p.MeasuredCpuSeconds }
Check ((Near $stage.CpuSeconds $sum 1e-6) -and $stage.CpuSeconds -gt 0.0) 'stage CPU is the sum of per-process increments'
Check ((Near $stage.CpuPercentOfOneCore (100.0 * $stage.CpuSeconds / $stage.MeasuredSeconds) 1e-9) -and (Near $stage.CpuPercentOfMachine ($stage.CpuPercentOfOneCore / 8.0) 1e-9)) 'percentages divide by measured time and by logical processors'
Check ($stage.ProcessesStartedDuringStage -eq 1 -and $stage.ProcessesExitedDuringStage -eq 1 -and $stage.CpuMayBeLowerBound) 'churn is reported: one renderer started, one exited, CPU flagged as a lower bound'
# What the earlier script did: difference one aggregate counter. With the crashed renderer's 500 s lifetime gone, it goes negative.
$aggregateStart = 0.0; foreach ($p in (Get-WorldSnapshot -At 0.0).Values) { if ($p.Id -in 100, 200, 300) { $aggregateStart += $p.CpuSeconds } }
$aggregateEnd = 0.0; foreach ($p in (Get-WorldSnapshot -At 13.0).Values) { if ($p.Id -in 100, 200, 301) { $aggregateEnd += $p.CpuSeconds } }
Check (($aggregateEnd - $aggregateStart) -lt 0.0 -and $stage.CpuSeconds -gt 0.0) 'regression: differencing aggregate lifetime CPU is negative in this scenario, per-process accounting is not'
Check (@($report.Processes | Where-Object { $_.MeasuredCpuSeconds -lt 0 }).Count -eq 0) 'no process ever contributes negative CPU'
$aTick = Initialize-CpuLedger -RootIdentity $rootIdentity -StartedUtc $baseUtc
$counterBack = ConvertTo-ProcessSnapshot -Processes @((New-Row 100 1 $baseUtc.AddSeconds(-100) 'FoliaLyrics.exe' 50.0))
[void](Add-CpuLedgerSample -Ledger $aTick -Snapshot $counterBack -ElapsedSeconds 0.0)
$counterLower = ConvertTo-ProcessSnapshot -Processes @((New-Row 100 1 $baseUtc.AddSeconds(-100) 'FoliaLyrics.exe' 40.0))
$tick = Add-CpuLedgerSample -Ledger $aTick -Snapshot $counterLower -ElapsedSeconds 1.0
Check ($tick.CpuSecondsDelta -eq 0.0) 'a counter that goes backwards contributes zero and resynchronises instead of subtracting'

# --- Window planning ------------------------------------------------------------------------------------------------------
Check ((Get-WindowStateName -Iconic $true -Zoomed $true) -eq 'Minimized' -and (Get-WindowStateName -Iconic $false -Zoomed $true) -eq 'Maximized' -and (Get-WindowStateName -Iconic $false -Zoomed $false) -eq 'Normal') 'window state names'
foreach ($initial in 'Normal', 'Maximized', 'Minimized') {
    Check (@(Get-WindowAction -Goal 'Initial' -Current $initial -Initial $initial).Count -eq 0) ('nothing to do when the window is already ' + $initial)
}
Check (@(Get-WindowAction -Goal 'Initial' -Current 'Minimized' -Initial 'Maximized')[0] -eq 'Restore' -and @(Get-WindowAction -Goal 'Initial' -Current 'Normal' -Initial 'Minimized')[0] -eq 'MinimizeNoActivate') 'restore plans use Restore and MinimizeNoActivate'
Check (@(Get-WindowAction -Goal 'Initial' -Current 'Normal' -Initial 'Maximized')[0] -eq 'ShowMaximized' -and @(Get-WindowAction -Goal 'Initial' -Current 'Maximized' -Initial 'Normal')[0] -eq 'ShowNormal') 'a window that drifted to another state is brought back with ShowMaximized or ShowNormal'
Check (@(Get-StagePlan -Mode 'Sample').Count -eq 1 -and $null -eq @(Get-StagePlan -Mode 'Sample')[0].Goal) 'the Sample plan has no window goal'
Check ((@(Get-StagePlan -Mode 'MinimizeCycle' | ForEach-Object { $_.Name }) -join ',') -eq 'Visible,Minimized,Restored') 'the MinimizeCycle plan is Visible, Minimized, Restored'

# --- The window adapter over a fake native API: exact ShowWindow codes and state mapping -----------------------------------------
function New-FakeNative {
    param([bool]$Iconic = $false, [bool]$Zoomed = $false, [bool]$Exists = $true)
    $n = [pscustomobject]@{ Iconic = $Iconic; Zoomed = $Zoomed; Exists = $Exists; Shown = (New-Object System.Collections.Generic.List[string]) }
    Add-Member -InputObject $n -MemberType ScriptMethod -Name IsWindow -Value { param($Window) $this.Exists }
    Add-Member -InputObject $n -MemberType ScriptMethod -Name IsIconic -Value { param($Window) $this.Iconic }
    Add-Member -InputObject $n -MemberType ScriptMethod -Name IsZoomed -Value { param($Window) $this.Zoomed }
    Add-Member -InputObject $n -MemberType ScriptMethod -Name ShowWindow -Value { param($Window, $Command) $this.Shown.Add(('{0}:{1}' -f $Window, $Command)); $true }
    return $n
}
foreach ($case in @(@($false, $false, 'Normal'), @($false, $true, 'Maximized'), @($true, $false, 'Minimized'), @($true, $true, 'Minimized'))) {
    $native = New-FakeNative -Iconic $case[0] -Zoomed $case[1]
    Check ((New-WindowAdapter -Handle 777 -Native $native).GetState() -eq $case[2]) ('the adapter reads iconic=' + $case[0] + ' zoomed=' + $case[1] + ' as ' + $case[2])
}
$native = New-FakeNative; $adapter = New-WindowAdapter -Handle 777 -Native $native
foreach ($pair in @(@('ShowNormal', 1), @('ShowMaximized', 3), @('MinimizeNoActivate', 7), @('Restore', 9))) { $adapter.Command($pair[0]) }
Check (($native.Shown -join ' ') -eq '777:1 777:3 777:7 777:9') 'each command sends its exact SW_ code (1, 3, 7, 9) for the adapter''s own window handle'
$threw = $false; try { $adapter.Command('Close') } catch { $threw = $_.Exception.Message -like '*Unknown window command*' }
Check ($threw -and $native.Shown.Count -eq 4) 'an unknown command is refused without calling ShowWindow'
$threw = $false; try { [void](New-WindowAdapter -Handle 777 -Native (New-FakeNative -Exists $false)).GetState() } catch { $threw = $_.Exception.Message -like '*no longer exists*' }
Check $threw 'a vanished window is reported instead of guessed at'

# --- Window safety through the real main routine, with a fake window ---------------------------------------------------------
function New-FakeWindow {
    param([string]$State, [bool]$WasMaximized = $false)
    $w = [pscustomobject]@{ State = $State; Maximized = ($WasMaximized -or $State -eq 'Maximized'); Commands = (New-Object System.Collections.Generic.List[string]); Reads = 0 }
    Add-Member -InputObject $w -MemberType ScriptMethod -Name GetState -Value { $this.Reads++; return $this.State }
    Add-Member -InputObject $w -MemberType ScriptMethod -Name Command -Value {
        param([string]$Name)
        $this.Commands.Add($Name)
        if ($Name -eq 'MinimizeNoActivate') { if ($this.State -eq 'Maximized') { $this.Maximized = $true }; $this.State = 'Minimized' }
        elseif ($Name -eq 'Restore') { if ($this.State -eq 'Minimized') { if ($this.Maximized) { $this.State = 'Maximized' } else { $this.State = 'Normal' } } }
        elseif ($Name -eq 'ShowMaximized') { $this.State = 'Maximized'; $this.Maximized = $true }
        elseif ($Name -eq 'ShowNormal') { $this.State = 'Normal'; $this.Maximized = $false }
    }
    return $w
}
function Invoke-WithWindow {
    param([string]$Mode, $Window, [int]$FailAt = 0, [int]$Seconds = 3)
    $script:t = 0.0; $script:calls = 0; $script:failAt = $FailAt
    $copy = @{}; foreach ($k in $adapters.Keys) { $copy[$k] = $adapters[$k] }; $copy.Window = $Window
    return (Invoke-BackgroundCostMain -HostProcessId 100 -Mode $Mode -Seconds $Seconds -SettleSeconds 1 -IntervalMilliseconds 1000 -Label window -LogicalProcessors 4 -Adapters $copy)
}
$sampleWindow = New-FakeWindow 'Maximized'
$sampleReport = Invoke-WithWindow -Mode 'Sample' -Window $sampleWindow
Check ($sampleReport.Status -eq 'Completed' -and $sampleWindow.Commands.Count -eq 0 -and $sampleWindow.Reads -eq 0 -and $null -eq $sampleReport.InitialWindowState -and $null -eq $sampleReport.WindowRestored) 'Sample mode never reads or touches a window, even when one is available'

foreach ($case in @(@('Normal', $false), @('Maximized', $false), @('Minimized', $false), @('Minimized', $true))) {
    $initial = $case[0]; $label = $initial + $(if ($case[1]) { ' (was maximized)' } else { '' })
    $w = New-FakeWindow $initial $case[1]
    $r = Invoke-WithWindow -Mode 'MinimizeCycle' -Window $w
    Check ($r.Status -eq 'Completed' -and $r.Stages.Count -eq 3 -and $w.State -eq $initial -and $r.WindowRestored -eq $true -and $r.FinalWindowState -eq $initial) ('MinimizeCycle ends with the window ' + $label + ' as it was found')
    Check ((@($r.Stages | ForEach-Object { $_.Stage }) -join ',') -eq 'Visible,Minimized,Restored') ('MinimizeCycle from ' + $label + ' measures Visible, Minimized, Restored')
    $totalCalls = $script:calls
    $failures = 0; $restoredAll = $true
    for ($n = 2; $n -le $totalCalls; $n++) {
        $w = New-FakeWindow $initial $case[1]
        $r = Invoke-WithWindow -Mode 'MinimizeCycle' -Window $w -FailAt $n
        if ($r.Status -eq 'Failed') { $failures++ }
        if ($w.State -ne $initial -or $r.WindowRestored -ne $true) { $restoredAll = $false }
    }
    Check ($failures -ge 3 -and $restoredAll) ('a failure injected at each of ' + ($totalCalls - 1) + ' snapshot calls always leaves the window ' + $label + ' as found')
}
$w = New-FakeWindow 'Maximized'
$exitWorld = $world
$world = @($world | Where-Object { $_.Id -ne 100 }) + @(@{ Id = 100; Parent = 1; Name = 'FoliaLyrics.exe'; Born = -100.0; Died = 5.0; Rate = 0.010; Start = 40.0 })
$r = Invoke-WithWindow -Mode 'MinimizeCycle' -Window $w -Seconds 8
$world = $exitWorld
Check ($r.Status -eq 'HostExited' -and $w.State -eq 'Maximized' -and $r.WindowRestored -eq $true) 'the host exiting mid-run is reported and the window is still returned to its initial state'
$missing = Invoke-BackgroundCostMain -HostProcessId 4321 -Mode 'Sample' -Seconds 1 -Adapters $adapters
Check ($missing.Status -eq 'Failed' -and $missing.Error -like '*not running*') 'a host PID that is not running fails cleanly'
$noWindow = $adapters.Clone(); $noWindow.Window = $null
$script:t = 0.0; $script:calls = 0; $script:failAt = 0
$r = Invoke-BackgroundCostMain -HostProcessId 100 -Mode 'MinimizeCycle' -Seconds 1 -Adapters $noWindow
Check ($r.Status -eq 'Failed' -and $r.Error -like '*window adapter*') 'MinimizeCycle without a window adapter fails before sampling'

# --- Report writing -------------------------------------------------------------------------------------------------------
$folder = New-OwnedTempFolder
try {
    $path = Join-Path (Join-Path $folder 'nested') 'report.json'
    $written = Write-BackgroundCostReport -Report $report -Path $path
    $bytes = [System.IO.File]::ReadAllBytes($written)
    Check ($bytes.Length -gt 100 -and -not ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB)) 'the report is written without a byte-order mark, creating missing folders'
    $raw = [System.IO.File]::ReadAllText($written)
    $parsed = $raw | ConvertFrom-Json
    Check ($parsed.Mode -eq 'Sample' -and $parsed.Stages.Count -eq 1 -and $parsed.Processes.Count -ge 4 -and $parsed.Limitations.Count -ge 5) 'the report round-trips through JSON with stages, processes and limitations'
    Check (($raw -match '"StartedUtc":\s*"\d{4}-\d{2}-\d{2}T') -and ($raw -match '"CreatedUtc":\s*"\d{4}-\d{2}-\d{2}T') -and $raw -notmatch '/Date\(') 'dates are ISO strings, never the /Date(...)/ form of Windows PowerShell 5.1'
    $threw = $false; try { [void](Write-BackgroundCostReport -Report $report -Path $path) } catch { $threw = $_.Exception.Message -like '*Refusing to overwrite*' }
    Check $threw 'an existing report is not overwritten without -Force'
    [void](Write-BackgroundCostReport -Report $report -Path $path -Force)
    Check $true 'an existing report can be replaced with -Force'
}
finally { Remove-OwnedTempFolder -Path $folder }

# --- The real entry script, end to end, in a fresh PowerShell process --------------------------------------------------------------
# The first Windows run failed because the entry script bound its snapshot adapter with GetNewClosure(), which hides the functions the script
# dot-sourced from its library. Mocked adapters cannot show that, and neither can a run inside this process: under -File this test's own top
# level (which dot-sources the library above) is the global scope, where any closure can see those functions. So every run below starts a new
# PowerShell on a generated harness that defines global replacements for Get-Process and Get-CimInstance only (a fake FoliaLyrics process
# tree whose CPU grows with real time) and then runs the real script by path, as a user does, with its library visible nowhere but to itself.
$script:harnessText = @'
# Generated by tools/test-background-cost.ps1. Replaces only Get-Process and Get-CimInstance (globally, as the real cmdlets are), then
# runs the real entry script. Nothing here reads a real process or window; the fake process has no main window handle at all.
param(
    [Parameter(Mandatory = $true)][string]$EntryPath,
    [Parameter(Mandatory = $true)][string]$ReportPath,
    [string]$RunLabel = 'seam',
    [int]$HostPid = 4242,
    [string]$Mode = 'Sample',
    [switch]$DryRun,
    [switch]$Overwrite
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$global:SeamClock = [System.Diagnostics.Stopwatch]::StartNew()
$global:SeamBase = [datetime]::SpecifyKind([datetime]::UtcNow.AddHours(-1), [System.DateTimeKind]::Utc)
$global:SeamRow = {
    param([int]$Id, [int]$ParentId, [datetime]$Created, [string]$Name, [double]$Cpu)
    [pscustomobject]@{ ProcessId = $Id; ParentProcessId = $ParentId; CreationDate = $Created; Name = $Name
        KernelModeTime = [uint64]([math]::Floor($Cpu * 10000000.0 / 2)); UserModeTime = [uint64]([math]::Floor($Cpu * 10000000.0 / 2))
        WorkingSetSize = [uint64]2000000; PrivatePageCount = [uint64]1000000 }
}
function global:Get-Process {
    [CmdletBinding()] param([string]$Name, [int]$Id)
    if ($Name -eq 'FoliaLyrics' -or $Id -eq 4242) { return [pscustomobject]@{ Id = 4242; StartTime = $global:SeamBase; MainWindowHandle = [System.IntPtr]::Zero } }
    return @()
}
function global:Get-CimInstance {
    [CmdletBinding()] param([string]$ClassName, [string[]]$Property)
    $seconds = $global:SeamClock.Elapsed.TotalSeconds
    $base = $global:SeamBase
    return @((& $global:SeamRow 4242 1 $base 'FoliaLyrics.exe' (100.0 + 0.2 * $seconds)),
        (& $global:SeamRow 4243 4242 $base.AddSeconds(1) 'msedgewebview2.exe' (50.0 + 0.3 * $seconds)),
        (& $global:SeamRow 4244 4243 $base.AddSeconds(2) 'msedgewebview2.exe' (20.0 + 0.1 * $seconds)),
        (& $global:SeamRow 9000 1 $base.AddMinutes(-30) 'msedgewebview2.exe' (700.0 + 0.9 * $seconds)))
}
$entryArguments = @{ Seconds = 1; IntervalMilliseconds = 250; Label = $RunLabel; OutputPath = $ReportPath; Mode = $Mode }
if ($HostPid -gt 0) { $entryArguments['HostProcessId'] = $HostPid }
if ($DryRun) { $entryArguments['WhatIf'] = $true }
if ($Overwrite) { $entryArguments['Force'] = $true }
$global:LASTEXITCODE = 0
$code = 0
try { & $EntryPath @entryArguments; $code = $global:LASTEXITCODE } catch { Write-Output ('ENTRY-ERROR: ' + $_.Exception.Message); $code = 1 }
Write-Output ('SEAM-WINDOW-TYPE-DEFINED: ' + [bool]('FoliaTools.NativeWindow' -as [type]))
exit $code
'@

$script:psExe = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
$script:onWindows = ([System.IO.Path]::DirectorySeparatorChar -eq [char]92)
$script:harness = $null
# Run an entry script (the real one, or a private altered copy) in a new PowerShell on the harness. The harness path, report path and
# every argument are separate array elements, so the call operator quotes them; stderr is folded into the captured text.
function Invoke-EntryScript {
    param([string]$Script, [string]$Folder, [string]$Label = 'seam', [string[]]$Extra = @())
    $report = Join-Path $Folder ($Label + '.json')
    $arguments = @('-NoProfile', '-NonInteractive')
    if ($script:onWindows) { $arguments += @('-ExecutionPolicy', 'Bypass') }
    $arguments += @('-File', $script:harness, '-EntryPath', $Script, '-ReportPath', $report, '-RunLabel', $Label)
    $arguments += $Extra
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'     # Windows PowerShell 5.1 turns native stderr into a terminating error under 'Stop' when it is redirected
    try {
        $global:LASTEXITCODE = 0
        $lines = @(& $script:psExe @arguments 2>&1 | ForEach-Object { [string]$_ })
        $exitCode = $global:LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previous }
    $parsed = $null
    if (Test-Path -LiteralPath $report) { $parsed = [System.IO.File]::ReadAllText($report) | ConvertFrom-Json }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = ($lines -join [System.Environment]::NewLine); Report = $parsed; ReportPath = $report
        WindowTypeDefined = ($lines -contains 'SEAM-WINDOW-TYPE-DEFINED: True') }
}
# A private copy of the entry script and library with the snapshot adapter changed the way the Windows failure had it.
function New-AlteredEntryCopy {
    param([string]$Folder, [string]$Name, [bool]$ByName, [bool]$Closure)
    $directory = Join-Path $Folder $Name
    [void](New-Item -ItemType Directory -Path $directory)
    Copy-Item -LiteralPath $entryPath, $libPath -Destination $directory
    $copy = Join-Path $directory 'measure-background-cost.ps1'
    $lines = [System.IO.File]::ReadAllText($copy) -split "`r?`n"
    $changed = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -notmatch '^\s*GetSnapshot = \{.*\}\s*$') { continue }
        if ($ByName) { $lines[$i] = $lines[$i].Replace('& $convert -Processes', 'ConvertTo-ProcessSnapshot -Processes') }
        if ($Closure) { $lines[$i] = $lines[$i].TrimEnd() + '.GetNewClosure()' }
        $changed++
    }
    [System.IO.File]::WriteAllText($copy, ($lines -join [System.Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
    return [pscustomobject]@{ Path = $copy; Changed = $changed; Text = [System.IO.File]::ReadAllText($copy) }
}
$seam = New-OwnedTempFolder
try {
    $script:harness = Join-Path $seam 'seam-harness.ps1'
    [System.IO.File]::WriteAllText($script:harness, $script:harnessText, (New-Object System.Text.UTF8Encoding($false)))
    Check ($script:psExe -match '(?i)(^|[\\/])(powershell|pwsh)(\.exe)?$') 'the test can find the PowerShell executable that is running it, to start fresh processes'

    $good = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'sample'
    $sampled = $good.Report
    Check (($good.ExitCode -eq 0) -and ($null -ne $sampled) -and ($sampled.Status -eq 'Completed') -and ($null -eq $sampled.Error)) 'the real entry script completes in a fresh PowerShell process: its snapshot adapter resolves the library and the CIM cmdlet' $good.Output
    Check ($sampled.Mode -eq 'Sample' -and $sampled.Stages.Count -eq 1 -and $sampled.Stages[0].Samples -ge 2) 'the entry script took several samples in its single Observed stage' $good.Output
    Check ((($sampled.Processes | ForEach-Object { $_.Id } | Sort-Object) -join ',') -eq '4242,4243,4244') 'it tracks the host and its two descendants and ignores the unrelated process' $good.Output
    Check ($sampled.Stages[0].CpuPercentOfOneCore -gt 40 -and $sampled.Stages[0].CpuPercentOfOneCore -lt 80) 'it measures the simulated 60% of one core (rates 0.2 + 0.3 + 0.1), not the pre-run CPU' $good.Output
    Check (($null -eq $sampled.InitialWindowState) -and ($null -eq $sampled.WindowRestored) -and -not $good.WindowTypeDefined) 'the real entry script in Sample mode never reads a window or even defines the user32 wrapper type' $good.Output

    $byPid = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'auto' -Extra @('-HostPid', '0')
    Check (($byPid.ExitCode -eq 0) -and ($null -ne $byPid.Report) -and ($byPid.Report.HostProcessId -eq 4242)) 'without -HostProcessId the single running instance is found by name through Get-Process' $byPid.Output

    $unknown = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'unknown' -Extra @('-HostPid', '99999')
    Check (($unknown.ExitCode -eq 1) -and ($null -eq $unknown.Report) -and ($unknown.Output -like '*99999*not found*')) 'an explicit PID that is not running stops the entry script with exit code 1 and writes no report' $unknown.Output

    $gate = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'gate' -Extra @('-Mode', 'MinimizeCycle', '-HostPid', '0')
    Check (($gate.ExitCode -eq 1) -and ($null -eq $gate.Report) -and ($gate.Output -like '*explicit -HostProcessId*') -and -not $gate.WindowTypeDefined) 'MinimizeCycle without an explicit PID is refused at the entry point before any window code exists' $gate.Output

    $dry = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'dry' -Extra @('-Mode', 'MinimizeCycle', '-DryRun')
    Check (($dry.ExitCode -eq 0) -and ($null -eq $dry.Report) -and -not $dry.WindowTypeDefined) 'MinimizeCycle with -WhatIf stops before touching a window: no report, no user32 wrapper, exit code 0' $dry.Output

    $before = [System.IO.File]::ReadAllText($good.ReportPath)
    $again = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'sample'
    Check (($again.ExitCode -eq 1) -and ($again.Output -like '*Refusing to overwrite*') -and ([System.IO.File]::ReadAllText($good.ReportPath) -ceq $before)) 'a report that already exists is refused and left untouched' $again.Output
    Check ($again.Output -notlike '*Host PID*') 'the refusal comes before any measurement starts, not after a long run' $again.Output
    $forced = Invoke-EntryScript -Script $entryPath -Folder $seam -Label 'sample' -Extra @('-Overwrite')
    Check (($forced.ExitCode -eq 0) -and ($forced.Report.StartedUtc -ne $sampled.StartedUtc)) '-Force replaces an existing report' $forced.Output

    # Rebuild the Windows failure in private copies: by-name lookup plus a closure is the original code; by-name alone must still work.
    $plain = New-AlteredEntryCopy -Folder $seam -Name 'by-name' -ByName $true -Closure $false
    Check (($plain.Changed -eq 1) -and $plain.Text.Contains('ConvertTo-ProcessSnapshot -Processes') -and -not $plain.Text.Contains('}.GetNewClosure()') -and -not $plain.Text.Contains('& $convert -Processes')) 'a private copy was built that looks the converter up by name, without a closure'
    $plainRun = Invoke-EntryScript -Script $plain.Path -Folder $seam -Label 'by-name'
    Check (($plainRun.ExitCode -eq 0) -and ($plainRun.Report.Status -eq 'Completed')) 'a by-name lookup without a closure still works in the entry script (dynamic scoping), so the next failure is caused by the closure alone' $plainRun.Output
    $broken = New-AlteredEntryCopy -Folder $seam -Name 'closure' -ByName $true -Closure $true
    Check (($broken.Changed -eq 1) -and $broken.Text.Contains('}.GetNewClosure()') -and $broken.Text.Contains('ConvertTo-ProcessSnapshot -Processes')) 'a private copy was built with the original by-name lookup and GetNewClosure() back'
    $regression = Invoke-EntryScript -Script $broken.Path -Folder $seam -Label 'closure'
    Check (($regression.ExitCode -eq 1) -and ($null -ne $regression.Report) -and ($regression.Report.Status -eq 'Failed') -and ($regression.Report.Error -match 'ConvertTo-ProcessSnapshot')) 'with the closure back, the same run fails with ConvertTo-ProcessSnapshot not recognized, exactly like the first Windows self-check' ($regression.Output + [System.Environment]::NewLine + $regression.Report.Error)
}
finally { Remove-OwnedTempFolder -Path $seam }

# The default and relative report paths, resolved the way the entry script resolves them.
$pathFolder = New-OwnedTempFolder
try {
    $repositoryRoot = Split-Path -Parent $PSScriptRoot
    $defaultPath = Resolve-ReportPath -Path '' -Label 'my label:1' -RepositoryRoot $repositoryRoot -NowUtc $baseUtc
    Check ($defaultPath -eq (Join-Path (Join-Path (Join-Path $repositoryRoot 'test-results') 'background-cost') 'my_label_1-20261012T000000Z.json')) 'the default report path is under test-results/background-cost with a sanitized label and the UTC time'
    Push-Location -LiteralPath $pathFolder
    try { $relative = Resolve-ReportPath -Path 'nested/r.json' -Label 'x' -RepositoryRoot $repositoryRoot -NowUtc $baseUtc }
    finally { Pop-Location }
    Check ($relative -eq (Join-Path (Join-Path $pathFolder 'nested') 'r.json')) 'a relative report path is resolved against the PowerShell location, not the process directory'
    $existing = Join-Path $pathFolder 'old.json'; Set-Content -LiteralPath $existing -Value '{}'
    $threw = $false; try { [void](Resolve-ReportPath -Path $existing -Label 'x' -RepositoryRoot $repositoryRoot -NowUtc $baseUtc) } catch { $threw = $_.Exception.Message -like '*Refusing to overwrite*' }
    Check ($threw -and ((Resolve-ReportPath -Path $existing -Label 'x' -RepositoryRoot $repositoryRoot -NowUtc $baseUtc -Force) -eq $existing)) 'an existing report path is refused up front unless -Force is given'
}
finally { Remove-OwnedTempFolder -Path $pathFolder }

# --- Structural guarantees ----------------------------------------------------------------------------------------------------------
function Get-OwnerFunction {
    param($Node)
    $p = $Node.Parent
    while ($null -ne $p -and -not ($p -is [System.Management.Automation.Language.FunctionDefinitionAst])) { $p = $p.Parent }
    if ($null -ne $p) { return $p.Name }
    return '(script)'
}
foreach ($file in $entryPath, $libPath, $testPath) {
    $tokens = $null; $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
    $name = Split-Path -Leaf $file
    Check ($errors.Count -eq 0) ($name + ' parses without errors')
    $modern = @($tokens | Where-Object { $_.Kind.ToString() -in 'QuestionQuestion', 'QuestionQuestionEquals', 'QuestionDot', 'QuestionLBracket', 'AndAnd', 'OrOr', 'QuestionMark' })
    $ternary = @($ast.FindAll({ param($n) $n.GetType().Name -in 'TernaryExpressionAst', 'PipelineChainAst' }, $true))
    Check ($modern.Count -eq 0 -and $ternary.Count -eq 0) ($name + ' uses no PowerShell 7-only operators')
    Check (-not ([System.IO.File]::ReadAllBytes($file) | Where-Object { $_ -gt 127 })) ($name + ' is plain ASCII')
    $closures = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Value -eq 'GetNewClosure' }, $true))
    Check ($closures.Count -eq 0) ($name + ' never calls GetNewClosure(), which would hide dot-sourced functions from the adapters')
    $removals = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -in 'Remove-Item', 'rm', 'del', 'ri', 'rd', 'rmdir' -and $n.Extent.Text -match '-Recurse' }, $true))
    $unguarded = @($removals | Where-Object { (Get-OwnerFunction $_) -notin 'Remove-OwnedTempFolder' })
    Check ($unguarded.Count -eq 0) ($name + ' removes folders recursively only through the guarded helper')
    if ($file -eq $entryPath) {
        $show = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Value -eq 'ShowWindow' }, $true))
        Check ($show.Count -eq 1 -and (Get-OwnerFunction $show[0]) -eq 'Get-WindowApi') 'ShowWindow is called from exactly one place in the entry script, the user32 wrapper'
        $native = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Expression -is [System.Management.Automation.Language.TypeExpressionAst] -and $n.Expression.TypeName.Name -eq 'FoliaTools.NativeWindow' }, $true))
        $outside = @($native | Where-Object { (Get-OwnerFunction $_) -ne 'Get-WindowApi' })
        Check ($native.Count -eq 4 -and $outside.Count -eq 0) 'every raw user32 call (four) lives inside the one wrapper function'
        $creators = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-WindowApi' }, $true))
        $guarded = @($creators | Where-Object { $p = $_.Parent; $hit = $false; while ($null -ne $p) { if ($p -is [System.Management.Automation.Language.IfStatementAst] -and $p.Clauses[0].Item1.Extent.Text -like "*MinimizeCycle*") { $hit = $true }; $p = $p.Parent }; $hit })
        Check ($creators.Count -eq 1 -and $guarded.Count -eq 1) 'the window adapter is only created inside the explicit MinimizeCycle branch'
        $cim = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -in 'Start-Process', 'Stop-Process', 'Invoke-Item', 'Set-ItemProperty' }, $true))
        Check ($cim.Count -eq 0) 'the entry script never launches, stops or reconfigures anything'
    }
    if ($file -eq $libPath) {
        $show = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Value -eq 'ShowWindow' }, $true))
        Check ($show.Count -eq 1 -and (Get-OwnerFunction $show[0]) -eq 'New-WindowAdapter') 'the library calls ShowWindow from exactly one place, the adapter command method'
    }
}
Write-Host ('{0} background-cost checks passed' -f $script:passed)
# Expected child-process failures set LASTEXITCODE; return the suite's own success to CI shell wrappers.
exit 0

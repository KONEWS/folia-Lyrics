# tools/background-cost-lib.ps1 - process-tree CPU accounting, stage summaries and window-restore planning for measure-background-cost.ps1.
# Dot-source only: loading this file defines functions and nothing else. Process snapshots, clocks, sleeping and window commands are
# injected as adapters, so tools/test-background-cost.ps1 can exercise every decision (including fault paths) on any machine.
# Written for Windows PowerShell 5.1 and PowerShell 7: no ternary, null-coalescing or pipeline-chain operators, ASCII only.
Set-StrictMode -Version 2.0

# One process identity is PID plus creation time, so a recycled PID can never be mistaken for the process that used to own it.
function Get-ProcessIdentity {
    param([Parameter(Mandatory = $true)][int]$Id, [Parameter(Mandatory = $true)][datetime]$CreatedUtc)
    return ('{0}:{1}' -f $Id, $CreatedUtc.Ticks)
}

# Convert Win32_Process rows (CIM, or any objects with the same property names) into a PID-keyed snapshot of plain records.
function ConvertTo-ProcessSnapshot {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Processes)
    $snapshot = @{}
    foreach ($process in $Processes) {
        # A process that is exiting can lose its creation time; it cannot be identified, so it is skipped.
        if ($null -eq $process.CreationDate) { continue }
        $created = ([datetime]$process.CreationDate).ToUniversalTime()
        $id = [int]$process.ProcessId
        $snapshot[$id] = [pscustomobject]@{
            Id = $id
            ParentId = [int]$process.ParentProcessId
            CreatedUtc = $created
            Name = [string]$process.Name
            Identity = (Get-ProcessIdentity -Id $id -CreatedUtc $created)
            CpuSeconds = ([double]$process.KernelModeTime + [double]$process.UserModeTime) / 10000000.0
            WorkingSetBytes = [double]$process.WorkingSetSize
            PrivateBytes = [double]$process.PrivatePageCount
        }
    }
    return $snapshot
}

# Pick the host to measure. Sampling may auto-select the only instance; a mode that changes window state never guesses.
function Select-HostProcess {
    param(
        [AllowEmptyCollection()][object[]]$Candidates = @(),
        [int]$RequestedId = 0,
        [string]$Name = 'FoliaLyrics',
        [bool]$RequireExplicitId = $false
    )
    if ($RequireExplicitId -and $RequestedId -le 0) {
        throw 'This mode changes window state, so it needs an explicit -HostProcessId; it never picks a process by name.'
    }
    if ($RequestedId -gt 0) {
        $match = @($Candidates | Where-Object { $_.Id -eq $RequestedId })
        if ($match.Count -eq 0) { throw ('Process {0} was not found among the running {1} processes.' -f $RequestedId, $Name) }
        return $match[0]
    }
    if ($Candidates.Count -eq 0) { throw ('No running {0} process was found.' -f $Name) }
    if ($Candidates.Count -gt 1) {
        $list = ($Candidates | ForEach-Object { 'PID {0} (started {1:u})' -f $_.Id, $_.CreatedUtc }) -join '; '
        throw ('Several {0} processes are running ({1}); pass -HostProcessId for the one to measure.' -f $Name, $list)
    }
    return $Candidates[0]
}

# Members of the measured tree: the host, every identity already adopted, and anything created by a member afterwards.
# A child counts only if it was created at or after its parent, which rejects stale parent ids that point at a recycled PID.
function Get-TreeMember {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Snapshot,
        [Parameter(Mandatory = $true)][hashtable]$Known,
        [Parameter(Mandatory = $true)][string]$RootIdentity
    )
    $members = @{}
    $children = @{}
    foreach ($record in $Snapshot.Values) {
        if ($record.Identity -eq $RootIdentity -or $Known.ContainsKey($record.Identity)) { $members[$record.Id] = $record }
        if (-not $children.ContainsKey($record.ParentId)) { $children[$record.ParentId] = New-Object System.Collections.Generic.List[object] }
        $children[$record.ParentId].Add($record)
    }
    $queue = New-Object System.Collections.Generic.Queue[object]
    foreach ($member in @($members.Values)) { $queue.Enqueue($member) }
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        if (-not $children.ContainsKey($parent.Id)) { continue }
        foreach ($child in $children[$parent.Id]) {
            if ($child.Id -eq $parent.Id -or $members.ContainsKey($child.Id)) { continue }
            if ($child.CreatedUtc -lt $parent.CreatedUtc) { continue }
            $members[$child.Id] = $child
            $queue.Enqueue($child)
        }
    }
    return @($members.Values)
}

# A ledger remembers, per process identity, the CPU already counted. Totals are sums of per-process increments, so a process that
# exits or restarts can never subtract from them (the failure of differencing one aggregate counter).
function Initialize-CpuLedger {
    param([Parameter(Mandatory = $true)][string]$RootIdentity, [Parameter(Mandatory = $true)][datetime]$StartedUtc)
    return [pscustomobject]@{ RootIdentity = $RootIdentity; StartedUtc = $StartedUtc; Known = @{} }
}

# Fold one snapshot into the ledger. CPU consumed before sampling began is never counted: a process that already existed is
# baselined at its current CPU, while one created during the run is counted from birth.
function Add-CpuLedgerSample {
    param(
        [Parameter(Mandatory = $true)]$Ledger,
        [Parameter(Mandatory = $true)][hashtable]$Snapshot,
        [Parameter(Mandatory = $true)][double]$ElapsedSeconds
    )
    $members = @(Get-TreeMember -Snapshot $Snapshot -Known $Ledger.Known -RootIdentity $Ledger.RootIdentity)
    $present = @{}
    $increment = 0.0; $privateBytes = 0.0; $workingSetBytes = 0.0
    $started = New-Object System.Collections.Generic.List[string]
    $exited = New-Object System.Collections.Generic.List[string]
    foreach ($member in $members) {
        $present[$member.Identity] = $true
        if (-not $Ledger.Known.ContainsKey($member.Identity)) {
            $born = ($member.CreatedUtc -ge $Ledger.StartedUtc)
            $baseline = 0.0
            if (-not $born) { $baseline = $member.CpuSeconds }
            $Ledger.Known[$member.Identity] = [pscustomobject]@{
                Identity = $member.Identity; Id = $member.Id; Name = $member.Name; CreatedUtc = $member.CreatedUtc
                BornDuringRun = $born; FirstSeenSeconds = $ElapsedSeconds; LastSeenSeconds = $ElapsedSeconds
                LastCpuSeconds = $baseline; MeasuredCpuSeconds = 0.0; Exited = $false; ExitSeenSeconds = $null
            }
            if ($born) { $started.Add($member.Identity) }
        }
        $record = $Ledger.Known[$member.Identity]
        $delta = $member.CpuSeconds - $record.LastCpuSeconds
        if ($delta -lt 0.0) { $delta = 0.0 }
        $record.LastCpuSeconds = $member.CpuSeconds
        $record.LastSeenSeconds = $ElapsedSeconds
        $record.MeasuredCpuSeconds += $delta
        $increment += $delta
        $privateBytes += $member.PrivateBytes
        $workingSetBytes += $member.WorkingSetBytes
    }
    foreach ($identity in @($Ledger.Known.Keys)) {
        $record = $Ledger.Known[$identity]
        if (-not $present.ContainsKey($identity) -and -not $record.Exited) {
            $record.Exited = $true; $record.ExitSeenSeconds = $ElapsedSeconds
            $exited.Add($identity)
        }
    }
    return [pscustomobject]@{
        ElapsedSeconds = $ElapsedSeconds; CpuSecondsDelta = $increment
        PrivateBytes = $privateBytes; WorkingSetBytes = $workingSetBytes; ProcessCount = $members.Count
        RootPresent = $present.ContainsKey($Ledger.RootIdentity)
        Started = @($started); Exited = @($exited); QueryMilliseconds = 0.0
    }
}

function Get-Median {
    param([AllowEmptyCollection()][double[]]$Values = @())
    $sorted = @($Values | Sort-Object)
    if ($sorted.Count -eq 0) { return $null }
    $middle = [int][math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 1) { return [double]$sorted[$middle] }
    return ([double]$sorted[$middle - 1] + [double]$sorted[$middle]) / 2.0
}

# Measure one stage. The baseline snapshot registers processes and discards CPU used since the previous stage (settling, window
# changes); only intervals after it count, each divided by the time that really passed between the two snapshots' midpoints.
function Measure-Stage {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][double]$Seconds,
        [Parameter(Mandatory = $true)][int]$IntervalMilliseconds,
        [Parameter(Mandatory = $true)]$Ledger,
        [Parameter(Mandatory = $true)][hashtable]$Adapters
    )
    $take = {
        $before = & $Adapters.Now
        $snapshot = & $Adapters.GetSnapshot
        $after = & $Adapters.Now
        [pscustomobject]@{ Snapshot = $snapshot; Midpoint = ($before + $after) / 2.0; QueryMilliseconds = ($after - $before) * 1000.0 }
    }
    $first = & $take
    $baseline = Add-CpuLedgerSample -Ledger $Ledger -Snapshot $first.Snapshot -ElapsedSeconds $first.Midpoint
    $ticks = New-Object System.Collections.Generic.List[object]
    $hostPresent = $baseline.RootPresent
    $lastQuery = $first.QueryMilliseconds
    $measuredSoFar = 0.0
    while ($hostPresent -and $measuredSoFar -lt $Seconds) {
        # Sleep what is left of the interval after the query itself, so the cadence stays near the requested one.
        $pause = [int][math]::Max(1, $IntervalMilliseconds - [int]$lastQuery)
        & $Adapters.Sleep $pause
        $sample = & $take
        $tick = Add-CpuLedgerSample -Ledger $Ledger -Snapshot $sample.Snapshot -ElapsedSeconds $sample.Midpoint
        $tick.QueryMilliseconds = $sample.QueryMilliseconds
        $ticks.Add($tick)
        $hostPresent = $tick.RootPresent
        $lastQuery = $sample.QueryMilliseconds
        $measuredSoFar = $sample.Midpoint - $first.Midpoint
    }
    return [pscustomobject]@{ Name = $Name; BaselineSeconds = $first.Midpoint; Ticks = $ticks.ToArray(); HostExited = (-not $hostPresent) }
}

# Reduce a measured stage to the numbers worth comparing between builds.
function Get-StageSummary {
    param([Parameter(Mandatory = $true)]$Stage, [Parameter(Mandatory = $true)][int]$LogicalProcessors)
    $ticks = @($Stage.Ticks)
    $measured = 0.0
    if ($ticks.Count -gt 0) { $measured = $ticks[$ticks.Count - 1].ElapsedSeconds - $Stage.BaselineSeconds }
    $cpu = 0.0
    foreach ($tick in $ticks) { $cpu += $tick.CpuSecondsDelta }
    $onePercent = $null; $machinePercent = $null
    if ($measured -gt 0.0) {
        $onePercent = 100.0 * $cpu / $measured
        $machinePercent = $onePercent / [math]::Max(1, $LogicalProcessors)
    }
    $startedCount = 0; $exitedCount = 0; $longest = 0.0; $previous = $Stage.BaselineSeconds
    foreach ($tick in $ticks) {
        $startedCount += @($tick.Started).Count; $exitedCount += @($tick.Exited).Count
        $longest = [math]::Max($longest, $tick.ElapsedSeconds - $previous); $previous = $tick.ElapsedSeconds
    }
    $queries = @($ticks | ForEach-Object { [double]$_.QueryMilliseconds })
    $queryMean = $null
    if ($queries.Count -gt 0) { $queryMean = ($queries | Measure-Object -Average).Average }
    $private = @($ticks | ForEach-Object { [double]$_.PrivateBytes })
    $working = @($ticks | ForEach-Object { [double]$_.WorkingSetBytes })
    $counts = @($ticks | ForEach-Object { [double]$_.ProcessCount })
    return [pscustomobject]@{
        Stage = $Stage.Name; Samples = $ticks.Count; MeasuredSeconds = $measured
        CpuSeconds = $cpu; CpuPercentOfOneCore = $onePercent; CpuPercentOfMachine = $machinePercent
        MedianPrivateBytes = (Get-Median -Values $private); PeakPrivateBytes = $(if ($private.Count) { ($private | Measure-Object -Maximum).Maximum } else { $null })
        MedianWorkingSetBytes = (Get-Median -Values $working); PeakWorkingSetBytes = $(if ($working.Count) { ($working | Measure-Object -Maximum).Maximum } else { $null })
        MedianProcessCount = (Get-Median -Values $counts)
        ProcessesStartedDuringStage = $startedCount; ProcessesExitedDuringStage = $exitedCount
        CpuMayBeLowerBound = ($exitedCount -gt 0 -or $Stage.HostExited)
        LongestIntervalSeconds = $longest; MeanSnapshotQueryMilliseconds = $queryMean; HostExited = [bool]$Stage.HostExited
    }
}

# --- Window state: planning is pure; only the injected Window adapter ever touches a real window. ---

function Get-WindowStateName {
    param([Parameter(Mandatory = $true)][bool]$Iconic, [Parameter(Mandatory = $true)][bool]$Zoomed)
    if ($Iconic) { return 'Minimized' }
    if ($Zoomed) { return 'Maximized' }
    return 'Normal'
}

# Commands needed to reach a goal ('Visible', 'Minimized' or 'Initial') from the current state; empty when already there.
# Restore returns a minimized window to whatever it was before it was minimized, so an initially maximized window needs no extra step.
function Get-WindowAction {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Visible', 'Minimized', 'Initial')][string]$Goal,
        [Parameter(Mandatory = $true)][ValidateSet('Normal', 'Maximized', 'Minimized')][string]$Current,
        [ValidateSet('Normal', 'Maximized', 'Minimized')][string]$Initial = 'Normal'
    )
    if ($Goal -eq 'Visible') {
        if ($Current -eq 'Minimized') { return @('Restore') }
        return @()
    }
    if ($Goal -eq 'Minimized') {
        if ($Current -ne 'Minimized') { return @('MinimizeNoActivate') }
        return @()
    }
    if ($Initial -eq 'Minimized') {
        if ($Current -ne 'Minimized') { return @('MinimizeNoActivate') }
        return @()
    }
    if ($Initial -eq 'Maximized') {
        if ($Current -eq 'Minimized') { return @('Restore') }
        if ($Current -eq 'Normal') { return @('ShowMaximized') }
        return @()
    }
    if ($Current -eq 'Minimized') { return @('Restore') }
    if ($Current -eq 'Maximized') { return @('ShowNormal') }
    return @()
}

# The window adapter used by -Mode MinimizeCycle, written over an injected native API (IsWindow, IsIconic, IsZoomed, ShowWindow) so
# the command codes and state mapping are testable without user32. Its methods use only $this and a scriptblock captured at creation,
# never functions of the surrounding script, so they cannot fail to resolve when PowerShell binds them to another scope.
function New-WindowAdapter {
    param([Parameter(Mandatory = $true)]$Handle, [Parameter(Mandatory = $true)]$Native)
    # SW_SHOWNORMAL 1, SW_SHOWMAXIMIZED 3, SW_SHOWMINNOACTIVE 7, SW_RESTORE 9.
    $adapter = [pscustomobject]@{ Handle = $Handle; Native = $Native; StateName = ${function:Get-WindowStateName}
        Codes = @{ ShowNormal = 1; ShowMaximized = 3; MinimizeNoActivate = 7; Restore = 9 } }
    Add-Member -InputObject $adapter -MemberType ScriptMethod -Name GetState -Value {
        if (-not $this.Native.IsWindow($this.Handle)) { throw 'The host window no longer exists.' }
        & $this.StateName -Iconic ([bool]$this.Native.IsIconic($this.Handle)) -Zoomed ([bool]$this.Native.IsZoomed($this.Handle))
    }
    Add-Member -InputObject $adapter -MemberType ScriptMethod -Name Command -Value {
        param([string]$Name)
        if (-not $this.Codes.ContainsKey($Name)) { throw ('Unknown window command {0}.' -f $Name) }
        [void]$this.Native.ShowWindow($this.Handle, $this.Codes[$Name])
    }
    return $adapter
}

function Get-StagePlan {
    param([Parameter(Mandatory = $true)][ValidateSet('Sample', 'MinimizeCycle')][string]$Mode)
    if ($Mode -eq 'Sample') { return @([pscustomobject]@{ Name = 'Observed'; Goal = $null }) }
    return @(
        [pscustomobject]@{ Name = 'Visible'; Goal = 'Visible' },
        [pscustomobject]@{ Name = 'Minimized'; Goal = 'Minimized' },
        [pscustomobject]@{ Name = 'Restored'; Goal = 'Visible' }
    )
}

# Drive the window toward its initial state, re-reading it after each command; bounded so a window that refuses cannot loop forever.
function Restore-InitialWindowState {
    param([Parameter(Mandatory = $true)]$Window, [Parameter(Mandatory = $true)][string]$Initial, [Parameter(Mandatory = $true)][hashtable]$Adapters)
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        $current = $Window.GetState()
        $actions = @(Get-WindowAction -Goal 'Initial' -Current $current -Initial $Initial)
        if ($actions.Count -eq 0) { return $true }
        foreach ($action in $actions) { $Window.Command($action) }
        & $Adapters.Sleep 300
    }
    return ($Window.GetState() -eq $Initial)
}

# Run a whole measurement. Mode 'Sample' only reads process counters and never touches a window. Mode 'MinimizeCycle' moves the
# window through Visible, Minimized and Restored stages and, whatever happens, puts it back in the state it was found in.
function Invoke-BackgroundCostMain {
    param(
        [Parameter(Mandatory = $true)][int]$HostProcessId,
        [ValidateSet('Sample', 'MinimizeCycle')][string]$Mode = 'Sample',
        [double]$Seconds = 30, [double]$SettleSeconds = 5, [int]$IntervalMilliseconds = 1000,
        [string]$Label = 'run', [int]$LogicalProcessors = 1,
        [Parameter(Mandatory = $true)][hashtable]$Adapters
    )
    $report = [ordered]@{
        Label = $Label; Mode = $Mode; HostProcessId = $HostProcessId; Status = 'Completed'; Error = $null
        StartedUtc = $null; LogicalProcessors = $LogicalProcessors; RequestedSecondsPerStage = $Seconds; SettleSeconds = $SettleSeconds
        IntervalMilliseconds = $IntervalMilliseconds; HostIdentity = $null; InitialWindowState = $null; FinalWindowState = $null
        WindowRestored = $null; WindowRestoreError = $null; Stages = @(); Processes = @(); Limitations = @(
            'CPU is the sum of per-process increments between snapshots (identity = PID + creation time), divided by the time that really passed between snapshot midpoints.',
            'Only descendants of the selected host are counted; other programs sharing the WebView2 profile folder are not.',
            'CPU that a process spends between its last snapshot and its exit is unobservable; stages that saw an exit are marked CpuMayBeLowerBound.',
            'A process that starts and exits between two snapshots is invisible.',
            'Summed working sets count shared pages more than once; private bytes are the better memory comparison.',
            'Snapshot queries take time (MeanSnapshotQueryMilliseconds); use identical intervals for paired runs.',
            'The tool measures what is running; it does not establish a media fixture or isolate application preferences.')
    }
    $window = $null; $ledger = $null; $stageSummaries = New-Object System.Collections.Generic.List[object]
    try {
        $startedUtc = [datetime](& $Adapters.UtcNow)
        $report.StartedUtc = $startedUtc.ToString('o')
        $first = & $Adapters.GetSnapshot
        $root = $first[$HostProcessId]
        if ($null -eq $root) { throw ('Process {0} is not running.' -f $HostProcessId) }
        $report.HostIdentity = $root.Identity
        $ledger = Initialize-CpuLedger -RootIdentity $root.Identity -StartedUtc $startedUtc
        if ($Mode -eq 'MinimizeCycle') {
            $window = $Adapters.Window
            if ($null -eq $window) { throw 'MinimizeCycle needs a window adapter.' }
            $report.InitialWindowState = $window.GetState()
        }
        foreach ($step in (Get-StagePlan -Mode $Mode)) {
            if ($null -ne $step.Goal) {
                foreach ($action in @(Get-WindowAction -Goal $step.Goal -Current $window.GetState())) { $window.Command($action) }
                & $Adapters.Sleep ([int]($SettleSeconds * 1000))
            }
            $stage = Measure-Stage -Name $step.Name -Seconds $Seconds -IntervalMilliseconds $IntervalMilliseconds -Ledger $ledger -Adapters $Adapters
            $stageSummaries.Add((Get-StageSummary -Stage $stage -LogicalProcessors $LogicalProcessors))
            if ($stage.HostExited) { $report.Status = 'HostExited'; break }
        }
    }
    catch {
        $report.Status = 'Failed'; $report.Error = $_.Exception.Message
    }
    finally {
        # Without a known initial state there is nothing to restore to; leave the window exactly as it is.
        if ($null -ne $window -and $null -ne $report.InitialWindowState) {
            try {
                $report.WindowRestored = [bool](Restore-InitialWindowState -Window $window -Initial $report.InitialWindowState -Adapters $Adapters)
                $report.FinalWindowState = $window.GetState()
            }
            catch { $report.WindowRestored = $false; $report.WindowRestoreError = $_.Exception.Message }
        }
        $report.Stages = $stageSummaries.ToArray()
        # Dates become ISO strings so the JSON reads the same on Windows PowerShell 5.1 (which writes /Date(...)/) and PowerShell 7.
        if ($null -ne $ledger) {
            $report.Processes = @($ledger.Known.Values | Sort-Object Id | ForEach-Object {
                    [pscustomobject]@{ Identity = $_.Identity; Id = $_.Id; Name = $_.Name; CreatedUtc = $_.CreatedUtc.ToString('o'); BornDuringRun = $_.BornDuringRun
                        FirstSeenSeconds = $_.FirstSeenSeconds; LastSeenSeconds = $_.LastSeenSeconds; MeasuredCpuSeconds = $_.MeasuredCpuSeconds
                        Exited = $_.Exited; ExitSeenSeconds = $_.ExitSeenSeconds }
                })
        }
    }
    return [pscustomobject]$report
}

# Decide where the report goes before anything is measured, so a long run is never wasted on a path that cannot be written. A relative
# path is resolved against the PowerShell location (not the process directory, which Set-Location leaves alone); the default is
# <repository>/test-results/background-cost/<label>-<utc>.json. An existing file is refused here unless -Force was given.
function Resolve-ReportPath {
    param(
        [string]$Path,
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][datetime]$NowUtc,
        [switch]$Force
    )
    if (-not $Path) {
        $safeLabel = ($Label -replace '[^A-Za-z0-9._-]', '_')
        $Path = Join-Path (Join-Path (Join-Path $RepositoryRoot 'test-results') 'background-cost') ('{0}-{1}.json' -f $safeLabel, $NowUtc.ToString('yyyyMMddTHHmmssZ'))
    }
    $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if ((Test-Path -LiteralPath $full) -and -not $Force) { throw ('Refusing to overwrite {0}; pass -Force to replace it.' -f $full) }
    return $full
}

# Write the report as UTF-8 without a byte-order mark, refusing to replace an existing file unless asked.
function Write-BackgroundCostReport {
    param([Parameter(Mandatory = $true)]$Report, [Parameter(Mandatory = $true)][string]$Path, [switch]$Force)
    $full = [System.IO.Path]::GetFullPath($Path)
    if ((Test-Path -LiteralPath $full) -and -not $Force) { throw ('Refusing to overwrite {0}; pass -Force to replace it.' -f $full) }
    $folder = [System.IO.Path]::GetDirectoryName($full)
    if (-not (Test-Path -LiteralPath $folder)) { [void](New-Item -ItemType Directory -Path $folder) }
    $json = $Report | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($full, $json, (New-Object System.Text.UTF8Encoding($false)))
    return $full
}

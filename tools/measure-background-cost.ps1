<#
.SYNOPSIS
Measure CPU and memory of a running FoliaLyrics host and its WebView2 descendants, with per-process accounting.

.DESCRIPTION
Default mode 'Sample' is read-only: it reads process counters and never launches, minimizes, restores or otherwise touches a window.
Start the program you want to measure (an isolated test host, not your everyday profile), put it in the state you want, then:

  powershell -ExecutionPolicy Bypass -File tools/measure-background-cost.ps1 -HostProcessId 1234 -Seconds 30 -Label baseline-idle

Mode 'MinimizeCycle' additionally minimizes and restores the host window (stages Visible, Minimized, Restored). It needs an explicit
-HostProcessId, honours -WhatIf, and always puts the window back in the state it was found in, even after an error or Ctrl+C.

Only descendants of the selected host process are counted, tracked by PID plus creation time, and every increment is divided by the
time that really passed between snapshots. Run it once with the 0.4.34 build and once with a new build, in the same state.
Output is a JSON report (default: test-results/background-cost/<label>-<utc>.json; a relative -OutputPath is resolved against the current
PowerShell location). An existing report is refused before anything is measured unless -Force is given. The exit code is 0 when the run
completed, 1 when it failed and 2 when the host exited during the run. -ProcessName selects which executable name the host PID must belong to
(default FoliaLyrics); a self-check can sample the current shell with -ProcessName pwsh -HostProcessId $PID.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateRange(0, 2147483647)][int]$HostProcessId = 0,
    [string]$ProcessName = 'FoliaLyrics',
    [ValidateSet('Sample', 'MinimizeCycle')][string]$Mode = 'Sample',
    [ValidateRange(1, 3600)][int]$Seconds = 30,
    [ValidateRange(0, 600)][int]$SettleSeconds = 5,
    [ValidateRange(250, 10000)][int]$IntervalMilliseconds = 1000,
    [string]$Label = 'run',
    [string]$OutputPath,
    [switch]$Force
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'background-cost-lib.ps1')

# The only place in this tool that talks to user32. It is created solely for -Mode MinimizeCycle.
function Get-WindowApi {
    param([Parameter(Mandatory = $true)][int]$ProcessId)
    if (-not ('FoliaTools.NativeWindow' -as [type])) {
        Add-Type -Namespace FoliaTools -Name NativeWindow -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindow(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr window, int command);
'@
    }
    $handle = (Get-Process -Id $ProcessId -ErrorAction Stop).MainWindowHandle
    if ($handle -eq [System.IntPtr]::Zero) { throw 'The host has no main window handle (hidden to the tray?), so it cannot be minimized and restored.' }
    # The static user32 calls wrapped as methods, so the shared adapter in the library can also be driven by a fake in tests.
    $native = [pscustomobject]@{}
    Add-Member -InputObject $native -MemberType ScriptMethod -Name IsWindow -Value { param($Window) [FoliaTools.NativeWindow]::IsWindow($Window) }
    Add-Member -InputObject $native -MemberType ScriptMethod -Name IsIconic -Value { param($Window) [FoliaTools.NativeWindow]::IsIconic($Window) }
    Add-Member -InputObject $native -MemberType ScriptMethod -Name IsZoomed -Value { param($Window) [FoliaTools.NativeWindow]::IsZoomed($Window) }
    Add-Member -InputObject $native -MemberType ScriptMethod -Name ShowWindow -Value { param($Window, $Command) [FoliaTools.NativeWindow]::ShowWindow($Window, $Command) }
    return (New-WindowAdapter -Handle $handle -Native $native)
}

# A process that cannot be inspected (protected, or exiting) is simply not a candidate.
$candidates = @()
foreach ($process in @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) {
    try { $candidates += [pscustomobject]@{ Id = $process.Id; CreatedUtc = $process.StartTime.ToUniversalTime() } } catch { $null = $_ }
}
$selected = Select-HostProcess -Candidates $candidates -RequestedId $HostProcessId -Name $ProcessName -RequireExplicitId ($Mode -eq 'MinimizeCycle')
# The report path is settled (and an existing file refused) before anything is measured or any window is touched.
$reportPath = Resolve-ReportPath -Path $OutputPath -Label $Label -RepositoryRoot (Split-Path -Parent $PSScriptRoot) -NowUtc ([System.DateTime]::UtcNow) -Force:$Force
$plan = @(Get-StagePlan -Mode $Mode | ForEach-Object { $_.Name }) -join ', '
Write-Host ('Host PID {0}; mode {1}; stages: {2}; {3} s per stage.' -f $selected.Id, $Mode, $plan, $Seconds)

$window = $null
if ($Mode -eq 'MinimizeCycle') {
    if (-not $PSCmdlet.ShouldProcess(('window of process {0}' -f $selected.Id), 'minimize it, restore it, then return it to its initial state')) { return }
    $window = Get-WindowApi -ProcessId $selected.Id
}

$clock = [System.Diagnostics.Stopwatch]::StartNew()
# The adapters are plain scriptblocks, deliberately without .GetNewClosure(): a closure runs in its own dynamic module, which cannot see
# the functions this script dot-sourced from the library, and the first Windows run failed with "ConvertTo-ProcessSnapshot is not
# recognized". Even without a closure they never look a script function up by name: the converter is captured as a function object
# ($convert) and called with &, so only cmdlets and .NET are resolved by name. tools/test-background-cost.ps1 runs this whole script
# in a fresh PowerShell process, with only Get-Process and Get-CimInstance replaced, to keep that true.
$convert = ${function:ConvertTo-ProcessSnapshot}
$adapters = @{
    GetSnapshot = { & $convert -Processes @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, CreationDate, Name, KernelModeTime, UserModeTime, WorkingSetSize, PrivatePageCount) }
    Now = { $clock.Elapsed.TotalSeconds }
    UtcNow = { [System.DateTime]::UtcNow }
    Sleep = { param([int]$Milliseconds) Start-Sleep -Milliseconds $Milliseconds }
    Window = $window
}
$report = Invoke-BackgroundCostMain -HostProcessId $selected.Id -Mode $Mode -Seconds $Seconds -SettleSeconds $SettleSeconds `
    -IntervalMilliseconds $IntervalMilliseconds -Label $Label -LogicalProcessors ([System.Environment]::ProcessorCount) -Adapters $adapters

$written = Write-BackgroundCostReport -Report $report -Path $reportPath -Force:$Force
$report.Stages | Format-Table Stage, Samples, MeasuredSeconds, CpuPercentOfOneCore, MedianPrivateBytes, ProcessesStartedDuringStage, ProcessesExitedDuringStage, CpuMayBeLowerBound -AutoSize | Out-String | Write-Host
Write-Host ('Status: {0}{1}. Report: {2}' -f $report.Status, $(if ($report.Error) { ' (' + $report.Error + ')' } else { '' }), $written)
if ($null -ne $report.WindowRestored) { Write-Host ('Window initially {0}, now {1}; restored: {2}' -f $report.InitialWindowState, $report.FinalWindowState, $report.WindowRestored) }
if ($report.Status -eq 'Failed') { exit 1 }
if ($report.Status -eq 'HostExited') { exit 2 }

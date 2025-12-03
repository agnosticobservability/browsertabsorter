$ErrorActionPreference = 'Stop'

function Write-Section {
    param (
        [string]$Message
    )
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Ensure-GitInstalled {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is not installed or not available in PATH. Please install Git for Windows first.'
    }
}

function Ensure-GitRepository {
    param (
        [string]$RepoRoot
    )

    if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
        throw "No .git folder found in '$RepoRoot'. Clone the repository (not a ZIP download) before running this script."
    }
}

function Ensure-CleanWorkingTree {
    # Ignore untracked files so that local build artifacts or custom files do not block updates.
    # Only warn when tracked files have pending changes.
    $status = git status --porcelain --untracked-files=no
    if ($status) {
        throw 'Working tree has uncommitted changes. Please commit, stash, or discard them before updating.'
    }
}

function Get-DefaultBranch {
    $originHead = git rev-parse --abbrev-ref origin/HEAD 2>$null
    if (-not $originHead) {
        throw 'Unable to determine origin/HEAD. Ensure the origin remote is configured.'
    }

    return ($originHead -replace '^origin/','')
}

function Update-Repository {
    $scriptRoot = Split-Path -Parent $PSCommandPath
    $repoRoot = Split-Path -Parent $scriptRoot

    Write-Section 'Validating repository root'
    Ensure-GitRepository -RepoRoot $repoRoot

    Push-Location $repoRoot
    try {
        Write-Section 'Verifying Git installation'
        Ensure-GitInstalled

        Write-Section 'Checking for uncommitted changes'
        Ensure-CleanWorkingTree

        Write-Section 'Fetching latest changes from origin'
        git fetch origin | Write-Host

        $defaultBranch = Get-DefaultBranch
        Write-Section "Switching to $defaultBranch"
        git switch $defaultBranch | Write-Host

        Write-Section 'Pulling latest commits'
        git pull --ff-only origin $defaultBranch | Write-Host

        Write-Host "`nRepository updated to the latest commits on origin/$defaultBranch" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

Update-Repository

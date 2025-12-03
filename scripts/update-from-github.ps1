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

function Ensure-CleanWorkingTree {
    $status = git status --porcelain
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

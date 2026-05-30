# Auto-commit and push to main (triggers auto-deploy via GitHub Actions).
# Invoked by an agent hook on file save. Commits only when there are changes;
# .env and other .gitignore entries never get committed.
$ErrorActionPreference = "Stop"

# Work from the repository root (parent of the scripts folder).
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Safety: only push from the main branch.
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
    Write-Host "[auto-push] current branch '$branch' is not main - skip"
    exit 0
}

git add -A

# If nothing is staged, exit without committing.
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "[auto-push] no changes to commit"
    exit 0
}

$msg = "auto: save " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
git commit -m $msg --no-verify
git push origin main
Write-Host "[auto-push] pushed to main: $msg"

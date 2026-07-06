# git_watcher.ps1
# Automatically watch for changes in the workspace and commit/push to git.

$Path = "C:\Users\Darshan\Desktop\dashboard"
$Filter = "*.*"

$Watcher = New-Object System.IO.FileSystemWatcher
$Watcher.Path = $Path
$Watcher.Filter = $Filter
$Watcher.IncludeSubdirectories = $true
$Watcher.EnableRaisingEvents = $true

Write-Host "Starting Git auto-sync watcher on $Path..."

$Action = {
    $Path = $Event.SourceEventArgs.FullPath
    $Name = $Event.SourceEventArgs.Name
    $ChangeType = $Event.SourceEventArgs.ChangeType
    
    # Ignore git internals, cache, node_modules, temp files, and log files
    if ($Path -like "*\.git\*" -or $Path -like "*\__pycache__\*" -or $Path -like "*\node_modules\*" -or $Path -like "*.log" -or $Path -like "*.tmp" -or $Path -like "*.swp" -or $Path -like "*git_watcher.ps1*") {
        return
    }
    
    Write-Host "File changed: $Name ($ChangeType) at $(Get-Date)"
    
    # Wait 2 seconds to debounce multiple quick saves
    Start-Sleep -Seconds 2
    
    try {
        Set-Location "C:\Users\Darshan\Desktop\dashboard"
        git add .
        
        # Check if there are changes to commit
        $status = git status --porcelain
        if ($status) {
            # Filter out pycache or other ignored changes
            git commit -m "Auto-commit: $Name changed"
            git push origin main
            Write-Host "Successfully auto-committed and pushed."
        }
    } catch {
        Write-Host "Error during auto-sync: $_"
    }
}

$Created = Register-ObjectEvent $Watcher "Created" -Action $Action
$Changed = Register-ObjectEvent $Watcher "Changed" -Action $Action
$Deleted = Register-ObjectEvent $Watcher "Deleted" -Action $Action

try {
    while ($true) {
        Start-Sleep -Seconds 2
    }
} finally {
    Unregister-Event -SourceIdentifier $Created.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $Changed.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $Deleted.Name -ErrorAction SilentlyContinue
}

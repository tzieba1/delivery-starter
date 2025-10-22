"""
Version detection from Git
Dynamically determines version information from Git tags and commit history
"""
import subprocess
from typing import Dict, Optional


def get_git_version() -> str:
    """
    Get current version from Git tags.
    
    Returns version in format:
    - "v1.2.3" if on exact tag
    - "v1.2.3-5-gabcdef" if 5 commits after v1.2.3
    - "abcdef" if no tags exist
    - "0.0.0-dev" if not in Git repository
    """
    try:
        # Try to get exact tag first
        version = subprocess.check_output(
            ['git', 'describe', '--exact-match', '--tags', 'HEAD'],
            stderr=subprocess.DEVNULL,
            text=True
        ).strip()
        return version
    except subprocess.CalledProcessError:
        # Get nearest tag with commit info
        try:
            version = subprocess.check_output(
                ['git', 'describe', '--tags', '--always', '--dirty'],
                stderr=subprocess.DEVNULL,
                text=True
            ).strip()
            return version
        except subprocess.CalledProcessError:
            return "0.0.0-dev"


def get_build_info() -> Dict[str, any]:
    """
    Get complete build information from Git.
    
    Returns dict with:
    - version: semantic version from tags
    - commit: short commit SHA
    - branch: current branch name
    - dirty: whether working directory has uncommitted changes
    - commit_date: date of current commit
    """
    try:
        commit = subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'],
            stderr=subprocess.DEVNULL,
            text=True
        ).strip()
        
        branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            stderr=subprocess.DEVNULL,
            text=True
        ).strip()
        
        commit_date = subprocess.check_output(
            ['git', 'show', '-s', '--format=%ci', 'HEAD'],
            stderr=subprocess.DEVNULL,
            text=True
        ).strip()
        
        # Check if working directory is dirty
        dirty = subprocess.call(
            ['git', 'diff', '--quiet'],
            stderr=subprocess.DEVNULL
        ) != 0
        
        return {
            'version': get_git_version(),
            'commit': commit[:7],
            'branch': branch,
            'dirty': dirty,
            'commit_date': commit_date,
        }
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {
            'version': '0.0.0-dev',
            'commit': 'unknown',
            'branch': 'unknown',
            'dirty': False,
            'commit_date': 'unknown',
        }


# Module-level exports
__version__ = get_git_version()
__build_info__ = get_build_info()

# Print version when module is run directly
if __name__ == "__main__":
    import json
    print(json.dumps(__build_info__, indent=2))

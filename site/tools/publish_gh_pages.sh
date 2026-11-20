#!/usr/bin/env bash
# Publish site/public to the gh-pages branch from this machine.
#
# Normally the "Publish website" workflow does this on every push to main that
# changes site/public. Use this script for the first publish, or if the workflow
# can't run. gh-pages always holds a single commit: the current site.
#
# Usage: site/tools/publish_gh_pages.sh [remote-url]
#   remote-url defaults to git@github.com:vinithbraj/smto.git
set -euo pipefail

site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd -- "$site_dir/.." && pwd)"
remote="${1:-git@github.com:vinithbraj/smto.git}"

python3 "$site_dir/tools/check_site.py" "$site_dir/public" --site-url https://vinithbraj.github.io/smto

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -a "$site_dir/public/." "$work/"
source_commit="$(git -C "$repo_dir" rev-parse --short HEAD)"
cd "$work"
git init -q -b gh-pages
git add -A
git commit -q -m "Publish SMTO website (site/public from main $source_commit)" -m "Co-Authored-By: agent"
git push -f "$remote" gh-pages
echo "Published. GitHub Pages updates https://vinithbraj.github.io/smto/ within a minute or two."

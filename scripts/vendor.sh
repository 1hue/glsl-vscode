#!/bin/sh
# Check out submodules with `sparse` paths in .gitmodules at pinned commit, only those paths
set -eu
cd "$(dirname "$0")/.."

git config -f .gitmodules --get-regexp '\.sparse$' | while read -r key paths; do
	name=${key#submodule.}
	name=${name%.sparse}
	path=$(git config -f .gitmodules "submodule.$name.path")
	url=$(git config -f .gitmodules "submodule.$name.url")
	# Pin from index - also takes uncommitted bumps
	commit=$(git rev-parse ":$path")

	if [ ! -e "$path/.git" ]; then
		mkdir -p "$path"
		git -C "$path" init
		git -C "$path" remote add origin "$url"
		fresh=1
	else
		fresh=
	fi

	# Sparse before checkout - avoids downloading every file
	git -C "$path" sparse-checkout set $paths
	git -C "$path" fetch --depth 1 --filter=blob:none origin "$commit"
	git -C "$path" checkout --detach "$commit"

	# Git dir into .git/modules and registered in .git/config like any submodule
	if [ -n "$fresh" ]; then
		git submodule absorbgitdirs "$path"
		git submodule init "$path"
	fi
done

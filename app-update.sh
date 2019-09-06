#!/bin/bash

git reset --hard;
git pull;
git submodule sync --recursive;
git submodule update --init --recursive;
yarn;
tsc;
# This App has a self-reloading mechanism
# systemctl reload gui-backend-accounting;
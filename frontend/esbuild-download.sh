#!/bin/sh
set -e

# Download platform-specific binary
ESBUILD_BINARY_PATH="/usr/local/bin/esbuild"
PLATFORM="linux"
ARCH="x64"
VERSION="v0.19.5"

mkdir -p /usr/local/bin
curl -fsSL "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-${VERSION}.tgz" -o /tmp/esbuild.tgz
tar -xf /tmp/esbuild.tgz -C /tmp
mv /tmp/package/bin/esbuild $ESBUILD_BINARY_PATH
chmod +x $ESBUILD_BINARY_PATH
rm -rf /tmp/package /tmp/esbuild.tgz
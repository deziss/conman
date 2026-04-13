// Package buildinfo holds version information injected at build time via ldflags.
// To set the version at build time:
//
//	go build -ldflags="-X conman-backend/internal/buildinfo.Version=1.2.3" ./cmd/server
package buildinfo

// Version is the application version. Defaults to "dev" when not built with ldflags.
var Version = "dev"

// AppName is the canonical application name.
const AppName = "conman-server"

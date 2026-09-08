package authz

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// setupTestEnforcer runs InitCasbin against a fresh in-memory sqlite DB,
// exercising the exact bootstrap policy the production server starts with.
func setupTestEnforcer(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite memory db: %v", err)
	}
	InitCasbin(db)
}

func TestInitCasbin_BootstrapPolicy(t *testing.T) {
	setupTestEnforcer(t)

	cases := []struct {
		name string
		sub  string
		obj  string
		act  string
		want bool
	}{
		// admin: wildcard on everything
		{"admin can read containers", "admin", "containers", "read", true},
		{"admin can write containers", "admin", "containers", "write", true},
		{"admin can write images", "admin", "images", "write", true},
		{"admin can manage agents", "admin", "agents", "write", true},
		{"admin can manage stacks", "admin", "stacks", "write", true},

		// viewer: containers:read only
		{"viewer can read containers", "viewer", "containers", "read", true},
		{"viewer cannot write containers", "viewer", "containers", "write", false},
		{"viewer cannot read images", "viewer", "images", "read", false},
		{"viewer cannot touch agents", "viewer", "agents", "read", false},

		// operator: containers:* only
		{"operator can read containers", "operator", "containers", "read", true},
		{"operator can write containers", "operator", "containers", "write", true},
		{"operator cannot write images", "operator", "images", "write", false},
		{"operator cannot manage stacks", "operator", "stacks", "write", false},

		// unknown role / anonymous: nothing
		{"anonymous denied everything", "anonymous", "containers", "read", false},
		{"unknown role denied everything", "some-made-up-role", "containers", "read", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := CheckPermission(tc.sub, tc.obj, tc.act)
			if err != nil {
				t.Fatalf("CheckPermission(%q, %q, %q) returned error: %v", tc.sub, tc.obj, tc.act, err)
			}
			if got != tc.want {
				t.Errorf("CheckPermission(%q, %q, %q) = %v, want %v", tc.sub, tc.obj, tc.act, got, tc.want)
			}
		})
	}
}

// TestInitCasbin_WorksRegardlessOfCwd pins the fix for the relative-path bug:
// InitCasbin used to load "internal/authz/model.conf" relative to the
// process's current working directory, which only happened to work when the
// server was launched from the repo root. go test always runs with cwd set
// to the package directory (here, backend/internal/authz/), so this test
// passing at all is proof the embed-based fix works outside the repo root.
func TestInitCasbin_WorksRegardlessOfCwd(t *testing.T) {
	setupTestEnforcer(t)
	ok, err := CheckPermission("admin", "anything", "anything")
	if err != nil {
		t.Fatalf("CheckPermission returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected admin wildcard policy to be active — model.conf failed to load")
	}
}

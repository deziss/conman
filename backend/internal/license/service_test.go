package license

import (
	"conman-backend/internal/models"
	"testing"
)

// These tests cover the pure, network-independent parts of the licensing
// model: tier -> feature/host-limit mapping and feature lookup. They
// encode the revenue model (which tier unlocks which feature) so a change
// here is a deliberate pricing decision, not an accident.

func TestDefaultFeatures(t *testing.T) {
	cases := []struct {
		tier     models.LicenseTier
		wantHas  []string
		wantMiss []string
	}{
		{
			tier:     models.TierCommunity,
			wantHas:  []string{"alerts"},
			wantMiss: []string{"stacks", "multi_host", "update_check", "api", "rbac", "sso", "audit_logs"},
		},
		{
			tier:     models.TierPro,
			wantHas:  []string{"stacks", "alerts", "multi_host", "update_check", "api"},
			wantMiss: []string{"rbac", "sso", "audit_logs"},
		},
		{
			tier:     models.TierEnterprise,
			wantHas:  []string{"stacks", "alerts", "multi_host", "update_check", "api", "rbac", "sso", "audit_logs"},
			wantMiss: nil,
		},
	}

	for _, tc := range cases {
		t.Run(string(tc.tier), func(t *testing.T) {
			state := &LicenseState{Tier: tc.tier, Features: models.DefaultFeatures(tc.tier)}
			for _, f := range tc.wantHas {
				if !state.HasFeature(f) {
					t.Errorf("tier %s: expected feature %q to be available, features=%v", tc.tier, f, state.Features)
				}
			}
			for _, f := range tc.wantMiss {
				if state.HasFeature(f) {
					t.Errorf("tier %s: expected feature %q to be UNAVAILABLE, features=%v", tc.tier, f, state.Features)
				}
			}
		})
	}
}

func TestDefaultMaxHosts(t *testing.T) {
	cases := []struct {
		tier models.LicenseTier
		want int
	}{
		{models.TierCommunity, 1},
		{models.TierPro, 10},
		{models.TierEnterprise, -1}, // unlimited
	}
	for _, tc := range cases {
		if got := models.DefaultMaxHosts(tc.tier); got != tc.want {
			t.Errorf("DefaultMaxHosts(%s) = %d, want %d", tc.tier, got, tc.want)
		}
	}
}

func TestHasFeature_EmptyState(t *testing.T) {
	state := &LicenseState{}
	if state.HasFeature("stacks") {
		t.Error("empty LicenseState should not report any feature as available")
	}
}

func TestHasFeature_NilSafety(t *testing.T) {
	// A *LicenseState that is nil must never be dereferenced by callers —
	// this documents the contract that middleware.RequireFeature and
	// RequirePermission both rely on (they check `state == nil` before
	// calling HasFeature). This test just pins HasFeature's own behavior
	// on a zero-value (non-nil) state so a future refactor notices if the
	// feature list handling changes.
	var state LicenseState
	if state.HasFeature("anything") {
		t.Error("zero-value LicenseState.HasFeature should always return false")
	}
}

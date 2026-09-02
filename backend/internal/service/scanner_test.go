package service

import (
	"conman-backend/internal/models"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite memory db: %v", err)
	}
	if err := db.AutoMigrate(&models.VulnerabilityReport{}); err != nil {
		t.Fatalf("failed to migrate db: %v", err)
	}
	return db
}

func TestTrivyOutputParsing(t *testing.T) {
	mockJSON := `{
		"SchemaVersion": 2,
		"Results": [
			{
				"Target": "alpine:latest (alpine 3.20.0)",
				"Class": "os-pkgs",
				"Type": "alpine",
				"Vulnerabilities": [
					{
						"VulnerabilityID": "CVE-2024-1234",
						"PkgName": "libssl3",
						"InstalledVersion": "3.3.0-r0",
						"FixedVersion": "3.3.1-r0",
						"Severity": "CRITICAL",
						"Title": "Memory corruption in handshake",
						"Description": "Buffer overflow leading to RCE",
						"PrimaryURL": "https://nvd.nist.gov/vuln/detail/CVE-2024-1234",
						"CVSS": {
							"nvd": { "V3Score": 9.8 }
						}
					},
					{
						"VulnerabilityID": "CVE-2024-5678",
						"PkgName": "busybox",
						"InstalledVersion": "1.36.1-r28",
						"FixedVersion": "1.36.1-r29",
						"Severity": "HIGH",
						"Title": "Denial of service in wget",
						"Description": "Infinite loop on malformed headers",
						"PrimaryURL": "https://nvd.nist.gov/vuln/detail/CVE-2024-5678",
						"CVSS": {
							"nvd": { "V3Score": 7.5 }
						}
					}
				]
			}
		]
	}`

	var trivyOut TrivyScanOutput
	if err := json.Unmarshal([]byte(mockJSON), &trivyOut); err != nil {
		t.Fatalf("failed to unmarshal mock trivy json: %v", err)
	}

	var items []models.VulnerabilityItem
	var crit, high, med, low, unk int

	for _, res := range trivyOut.Results {
		for _, v := range res.Vulnerabilities {
			sev := strings.ToUpper(v.Severity)
			switch sev {
			case "CRITICAL":
				crit++
			case "HIGH":
				high++
			case "MEDIUM":
				med++
			case "LOW":
				low++
			default:
				unk++
			}

			var score float64
			for _, cvss := range v.CVSS {
				if cvss.V3Score > 0 {
					score = cvss.V3Score
					break
				}
			}

			items = append(items, models.VulnerabilityItem{
				ID:               v.VulnerabilityID,
				VulnerabilityID:  v.VulnerabilityID,
				PkgName:          v.PkgName,
				PackageName:      v.PkgName,
				InstalledVersion: v.InstalledVersion,
				FixedVersion:     v.FixedVersion,
				Severity:         sev,
				Title:            v.Title,
				Description:      v.Description,
				PrimaryURL:       v.PrimaryURL,
				Score:            score,
			})
		}
	}

	if crit != 1 || high != 1 || med != 0 || low != 0 {
		t.Errorf("expected 1 critical, 1 high, got %d crit, %d high", crit, high)
	}
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
	if items[0].Score != 9.8 {
		t.Errorf("expected CVSS score 9.8, got %f", items[0].Score)
	}
}

func TestScannerReportCaching(t *testing.T) {
	db := setupTestDB(t)
	scanner := &ImageScannerService{
		db:       db,
		inFlight: make(map[string]chan struct{}),
	}

	report := &models.VulnerabilityReport{
		ImageID:       "sha256:testimage123",
		ImageTag:      "testimage:v1",
		Status:        "completed",
		Scanner:       "trivy",
		CriticalCount: 0,
		HighCount:     1,
		TotalCount:    1,
		ResultsJSON:   `[{"id":"CVE-2024-0001","severity":"HIGH","package":"zlib"}]`,
		ScannedAt:     time.Now(),
	}
	db.Create(report)

	cached, err := scanner.GetReport("sha256:testimage123", "testimage:v1")
	if err != nil {
		t.Fatalf("failed to retrieve cached report: %v", err)
	}
	if cached == nil || cached.TotalCount != 1 {
		t.Errorf("expected 1 vulnerability in cached report, got %+v", cached)
	}
	if cached.HighCount != 1 {
		t.Errorf("expected 1 high severity, got %d", cached.HighCount)
	}
}

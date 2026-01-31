package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)
// checkDockerHubNewerTag fetches tags for the image and returns a newer tag if available
func checkDockerHubNewerTag(info RegistryInfo) (string, error) {
	repo := info.Namespace + "/" + info.Repository
	
	token, err := getDockerHubToken(repo)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("https://registry-1.docker.io/v2/%s/tags/list", repo)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to list tags")
	}

	var tagsResp struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tagsResp); err != nil {
		return "", err
	}
	
	return findNewerSemVer(info.Tag, tagsResp.Tags)
}

// findNewerSemVer compares current tag with a list of tags and returns the highest newer version
func findNewerSemVer(current string, tags []string) (string, error) {
	// Normalize current tag (ensure 'v' prefix for semver)
	currVer := current
	if !strings.HasPrefix(currVer, "v") {
		currVer = "v" + currVer
	}
	
	if !semver.IsValid(currVer) {
		return "", nil // Current is not semver, skip check
	}

	var newerVersions []string
	
	for _, t := range tags {
		// Skip same tag
		if t == current {
			continue
		}
		
		// Normalize
		v := t
		if !strings.HasPrefix(v, "v") {
			v = "v" + v
		}
		
		if !semver.IsValid(v) {
			continue
		}
		
		// Check prerelease (basic check)
		if strings.Contains(t, "-") || strings.Contains(t, "rc") || strings.Contains(t, "beta") {
			// Skip prerelease unless current is also, but for simplicity skip
			continue 
		}

		if semver.Compare(v, currVer) > 0 {
			// It is newer
			newerVersions = append(newerVersions, t)
		}
	}
	
	if len(newerVersions) == 0 {
		return "", nil
	}
	
	// Sort to find the highest
	sort.Slice(newerVersions, func(i, j int) bool {
		vi := newerVersions[i]
		if !strings.HasPrefix(vi, "v") { vi = "v" + vi }
		vj := newerVersions[j]
		if !strings.HasPrefix(vj, "v") { vj = "v" + vj }
		return semver.Compare(vi, vj) < 0
	})
	
	return newerVersions[len(newerVersions)-1], nil
}

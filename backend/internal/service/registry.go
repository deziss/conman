package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// RegistryInfo holds parsed registry information
type RegistryInfo struct {
	Registry   string // e.g., "docker.io", "ghcr.io", "quay.io"
	Namespace  string // e.g., "library", "username", "org"
	Repository string // e.g., "nginx", "myapp"
	Tag        string // e.g., "latest", "v1.0"
}

// CheckForUpdate checks if a newer version of the image is available
// Supports Docker Hub, GHCR, Quay.io, and generic registries
func CheckForUpdate(imageName string, currentID string) (bool, error) {
	info := parseFullImageName(imageName)
	
	// Skip local/untagged images
	if info.Repository == "" || info.Tag == "" {
		return false, fmt.Errorf("cannot check update for untagged image")
	}
	
	// Skip images with digest tags (sha256:...)
	if strings.HasPrefix(info.Tag, "sha256:") {
		return false, fmt.Errorf("image uses digest tag, not a mutable tag")
	}

	var remoteDigest string
	var err error

	switch info.Registry {
	case "docker.io", "":
		remoteDigest, err = checkDockerHub(info)
	case "ghcr.io":
		remoteDigest, err = checkGHCR(info)
	case "quay.io":
		remoteDigest, err = checkQuay(info)
	default:
		// Try generic registry v2 API
		remoteDigest, err = checkGenericRegistry(info)
	}

	if err != nil {
		return false, err
	}

	// Compare digests
	if remoteDigest != "" && currentID != "" {
		// Normalize currentID (remove "sha256:" prefix if comparing)
		localDigest := currentID
		if !strings.HasPrefix(localDigest, "sha256:") {
			localDigest = "sha256:" + localDigest
		}
		
		if remoteDigest != localDigest {
			return true, nil // Different digest = update available
		}
		return false, nil // Same digest
	}

	return false, nil
}

// parseFullImageName parses a full image reference into components
// Examples:
//   nginx:latest -> docker.io/library/nginx:latest
//   user/repo:tag -> docker.io/user/repo:tag
//   ghcr.io/user/repo:tag -> ghcr.io/user/repo:tag
func parseFullImageName(full string) RegistryInfo {
	info := RegistryInfo{
		Registry: "docker.io",
		Tag:      "latest",
	}

	// Handle tag
	atIdx := strings.LastIndex(full, "@")
	colonIdx := strings.LastIndex(full, ":")
	
	if atIdx != -1 {
		// Digest reference (image@sha256:...)
		info.Tag = full[atIdx+1:]
		full = full[:atIdx]
	} else if colonIdx != -1 && !strings.Contains(full[colonIdx:], "/") {
		// Tag reference (image:tag) - make sure colon is not part of registry port
		info.Tag = full[colonIdx+1:]
		full = full[:colonIdx]
	}

	// Parse registry/namespace/repo
	parts := strings.Split(full, "/")
	
	switch len(parts) {
	case 1:
		// nginx -> library/nginx
		info.Namespace = "library"
		info.Repository = parts[0]
	case 2:
		// Could be registry/repo or namespace/repo
		if strings.Contains(parts[0], ".") || strings.Contains(parts[0], ":") {
			// It's a registry
			info.Registry = parts[0]
			info.Namespace = "library"
			info.Repository = parts[1]
		} else {
			// namespace/repo
			info.Namespace = parts[0]
			info.Repository = parts[1]
		}
	default:
		// registry/namespace/repo or registry/org/repo/subpath
		if strings.Contains(parts[0], ".") || strings.Contains(parts[0], ":") {
			info.Registry = parts[0]
			info.Namespace = parts[1]
			info.Repository = strings.Join(parts[2:], "/")
		} else {
			info.Namespace = parts[0]
			info.Repository = strings.Join(parts[1:], "/")
		}
	}

	return info
}

// checkDockerHub checks Docker Hub for updates
func checkDockerHub(info RegistryInfo) (string, error) {
	repo := info.Namespace + "/" + info.Repository
	
	token, err := getDockerHubToken(repo)
	if err != nil {
		return "", fmt.Errorf("failed to get Docker Hub token: %v", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("https://registry-1.docker.io/v2/%s/manifests/%s", repo, info.Tag)
	
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Docker Hub request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("authentication required (private image?)")
	}
	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("image or tag not found on Docker Hub")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Docker Hub returned status: %d", resp.StatusCode)
	}

	return resp.Header.Get("Docker-Content-Digest"), nil
}

// checkGHCR checks GitHub Container Registry for updates
func checkGHCR(info RegistryInfo) (string, error) {
	repo := info.Namespace + "/" + info.Repository
	
	// GHCR uses a different token endpoint
	token, err := getGHCRToken(repo)
	if err != nil {
		return "", fmt.Errorf("failed to get GHCR token: %v", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("https://ghcr.io/v2/%s/manifests/%s", repo, info.Tag)
	
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("GHCR request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("authentication required (private image?)")
	}
	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("image or tag not found on GHCR")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GHCR returned status: %d", resp.StatusCode)
	}

	return resp.Header.Get("Docker-Content-Digest"), nil
}

// checkQuay checks Quay.io for updates
func checkQuay(info RegistryInfo) (string, error) {
	repo := info.Namespace + "/" + info.Repository
	
	client := &http.Client{Timeout: 15 * time.Second}
	// Quay.io public images don't need auth for manifest check
	url := fmt.Sprintf("https://quay.io/v2/%s/manifests/%s", repo, info.Tag)
	
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Quay.io request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("authentication required (private image?)")
	}
	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("image or tag not found on Quay.io")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Quay.io returned status: %d", resp.StatusCode)
	}

	return resp.Header.Get("Docker-Content-Digest"), nil
}

// checkGenericRegistry attempts to check a generic OCI registry
func checkGenericRegistry(info RegistryInfo) (string, error) {
	repo := info.Namespace + "/" + info.Repository
	
	client := &http.Client{Timeout: 15 * time.Second}
	url := fmt.Sprintf("https://%s/v2/%s/manifests/%s", info.Registry, repo, info.Tag)
	
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("registry request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", fmt.Errorf("authentication required for %s", info.Registry)
	}
	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("image or tag not found on %s", info.Registry)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s returned status: %d", info.Registry, resp.StatusCode)
	}

	return resp.Header.Get("Docker-Content-Digest"), nil
}

func getDockerHubToken(repo string) (string, error) {
	url := fmt.Sprintf("https://auth.docker.io/token?service=registry.docker.io&scope=repository:%s:pull", repo)
	
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tokenResp struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}
	return tokenResp.Token, nil
}

func getGHCRToken(repo string) (string, error) {
	url := fmt.Sprintf("https://ghcr.io/token?scope=repository:%s:pull", repo)
	
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tokenResp struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}
	return tokenResp.Token, nil
}

package api

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Generic Proxy function
func (h *AgentHandler) proxyRequest(w http.ResponseWriter, r *http.Request, method string, targetPath string) {
	agentID := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[agentID]
	h.mu.RUnlock()

	if !exists {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	if agent.ScrapeURL == "" {
		http.Error(w, "Agent scrape URL not configured", http.StatusBadGateway)
		return
	}

    // Support both http and https, defaulting to http if schema missing (though ScrapeURL usually has it)
    baseUrl := agent.ScrapeURL
    if !strings.HasPrefix(baseUrl, "http") {
        baseUrl = "http://" + baseUrl
    }
    
	targetURL := fmt.Sprintf("%s%s", baseUrl, targetPath)
	
	// If query params exist in original request, append them
	if r.URL.RawQuery != "" {
	    if strings.Contains(targetPath, "?") {
	        targetURL += "&" + r.URL.RawQuery
        } else {
            targetURL += "?" + r.URL.RawQuery
        }
    }

	req, err := http.NewRequest(method, targetURL, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Copy headers
	for k, v := range r.Header {
		req.Header.Set(k, v[0])
	}
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Proxy error to %s: %v", targetURL, err)
		http.Error(w, "Failed to contact agent", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for k, v := range resp.Header {
		w.Header()[k] = v
	}
	w.WriteHeader(resp.StatusCode)

	// Copy response body
	io.Copy(w, resp.Body)
}

// -- Container Proxies --

func (h *AgentHandler) ProxyStartContainer(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    // Agent expects ID in query usually? Or we can map path param to query.
    // My agent implementation used r.URL.Query().Get("id").
    // So I should append id=...
    
    // Actually, simple way: Frontend calls /agents/{id}/containers/{cid}/start
    // Agent expects /api/containers/start?id={cid}
    
    path := fmt.Sprintf("/api/containers/start?id=%s", containerID)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyStopContainer(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    path := fmt.Sprintf("/api/containers/stop?id=%s", containerID)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyRestartContainer(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    path := fmt.Sprintf("/api/containers/restart?id=%s", containerID)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyRemoveContainer(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    path := fmt.Sprintf("/api/containers/remove?id=%s", containerID)
    h.proxyRequest(w, r, "DELETE", path)
}

// -- Image Proxies --

func (h *AgentHandler) ProxyPullImage(w http.ResponseWriter, r *http.Request) {
    // Body contains { image: "name" }
    h.proxyRequest(w, r, "POST", "/api/images/pull")
}

func (h *AgentHandler) ProxyRemoveImage(w http.ResponseWriter, r *http.Request) {
    imageID := chi.URLParam(r, "imageId") // Route will be /agents/{id}/images/{imageId}
    path := fmt.Sprintf("/api/images/remove?id=%s", imageID)
    h.proxyRequest(w, r, "DELETE", path)
}

func (h *AgentHandler) ProxyCheckImageUpdate(w http.ResponseWriter, r *http.Request) {
    imageID := chi.URLParam(r, "imageId")
    path := fmt.Sprintf("/api/images/check-update?id=%s", imageID)
    h.proxyRequest(w, r, "GET", path)
}

// -- Volume Proxies --

func (h *AgentHandler) ProxyListStacks(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "GET", "/api/stacks")
}

func (h *AgentHandler) ProxyCreateStack(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/stacks")
}

func (h *AgentHandler) ProxyUpStack(w http.ResponseWriter, r *http.Request) {
    stackName := chi.URLParam(r, "stackName")
    path := fmt.Sprintf("/api/stacks/up?name=%s", stackName)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyRestartStack(w http.ResponseWriter, r *http.Request) {
    stackName := chi.URLParam(r, "stackName")
    path := fmt.Sprintf("/api/stacks/restart?name=%s", stackName)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyRemoveStack(w http.ResponseWriter, r *http.Request) {
    stackName := chi.URLParam(r, "stackName")
    path := fmt.Sprintf("/api/stacks/remove?name=%s", stackName)
    h.proxyRequest(w, r, "DELETE", path)
}

func (h *AgentHandler) ProxyCreateVolume(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/volumes/create")
}

func (h *AgentHandler) ProxyRemoveVolume(w http.ResponseWriter, r *http.Request) {
    name := chi.URLParam(r, "name")
    path := fmt.Sprintf("/api/volumes/remove?name=%s", name)
    h.proxyRequest(w, r, "DELETE", path)
}

func (h *AgentHandler) ProxyBrowseVolume(w http.ResponseWriter, r *http.Request) {
    name := chi.URLParam(r, "name")
    path := fmt.Sprintf("/api/volumes/browse?name=%s", name)
    h.proxyRequest(w, r, "POST", path)
}

// -- Network Proxies --

func (h *AgentHandler) ProxyCreateNetwork(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/networks/create")
}

func (h *AgentHandler) ProxyRemoveNetwork(w http.ResponseWriter, r *http.Request) {
    networkID := chi.URLParam(r, "networkId")
    path := fmt.Sprintf("/api/networks/remove?id=%s", networkID)
    h.proxyRequest(w, r, "DELETE", path)
}

func (h *AgentHandler) ProxyConnectNetwork(w http.ResponseWriter, r *http.Request) {
    networkID := chi.URLParam(r, "networkId")
    path := fmt.Sprintf("/api/networks/connect?id=%s", networkID)
    h.proxyRequest(w, r, "POST", path)
}

func (h *AgentHandler) ProxyDuplicateNetwork(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "networkId")
    path := fmt.Sprintf("/api/networks/duplicate?id=%s", id)
    h.proxyRequest(w, r, "POST", path)
}

// -- File Download Proxy --
func (h *AgentHandler) ProxyDownloadFile(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    // Query param 'path' is already in r.URL.RawQuery and handled by proxyRequest
    
    // We need to construct the base path carefully.
    // Agent expects /api/files/download?id={cid}&path={path}
    // proxyRequest appends existing query params.
    // So if I pass "/api/files/download?id={cid}", and request has ?path=..., it becomes ...?id={cid}&path=...
    
    path := fmt.Sprintf("/api/files/download?id=%s", containerID)
    h.proxyRequest(w, r, "GET", path)
}

// -- Inspect Proxies (Moved from agents.go) --

func (h *AgentHandler) ProxyInspectContainer(w http.ResponseWriter, r *http.Request) {
    containerID := chi.URLParam(r, "containerId")
    path := fmt.Sprintf("/api/containers/inspect?id=%s", containerID)
    h.proxyRequest(w, r, "GET", path)
}

func (h *AgentHandler) ProxyInspectImage(w http.ResponseWriter, r *http.Request) {
    imageID := chi.URLParam(r, "imageId")
    path := fmt.Sprintf("/api/images/inspect?id=%s", imageID)
    h.proxyRequest(w, r, "GET", path)
}

func (h *AgentHandler) ProxyInspectNetwork(w http.ResponseWriter, r *http.Request) {
    networkID := chi.URLParam(r, "networkId")
    path := fmt.Sprintf("/api/networks/inspect?id=%s", networkID)
    h.proxyRequest(w, r, "GET", path)
}

func (h *AgentHandler) ProxyInspectVolume(w http.ResponseWriter, r *http.Request) {
    name := chi.URLParam(r, "name")
    path := fmt.Sprintf("/api/volumes/inspect?name=%s", name)
    h.proxyRequest(w, r, "GET", path)
}

func (h *AgentHandler) ProxySystemDF(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "GET", "/api/system/df")
}

// Prune Proxies
func (h *AgentHandler) ProxyPruneContainers(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/containers/prune")
}

func (h *AgentHandler) ProxyPruneImages(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/images/prune")
}

func (h *AgentHandler) ProxyPruneVolumes(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/volumes/prune")
}

func (h *AgentHandler) ProxyPruneNetworks(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/networks/prune")
}

func (h *AgentHandler) ProxySystemPrune(w http.ResponseWriter, r *http.Request) {
    h.proxyRequest(w, r, "POST", "/api/system/prune")
}

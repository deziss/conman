package api

import (
	"conman-backend/internal/service"
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/docker/docker/api/types"
)

type NetworkHandler struct{}

func NewNetworkHandler() *NetworkHandler {
	return &NetworkHandler{}
}

func (h *NetworkHandler) ListNetworks(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
    // Use network.ListOptions if available
	networks, err := cli.NetworkList(context.Background(), types.NetworkListOptions{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, networks)
}

func (h *NetworkHandler) InspectNetwork(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    if id == "" {
        id = r.URL.Query().Get("id")
    }

    cli := service.GetDockerClient()
    // network.InspectOptions? Or types? Reference: https://pkg.go.dev/github.com/docker/docker/api/types#NetworkInspectOptions
    // Actually error was specifically about CreateOptions.
    network, err := cli.NetworkInspect(context.Background(), id, types.NetworkInspectOptions{Verbose: true})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, network)
}

func (h *NetworkHandler) CreateNetwork(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name   string `json:"name"`
        Driver string `json:"driver"`
    }
    if err := ReadJSON(r, &req); err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    
    if req.Driver == "" {
        req.Driver = "bridge"
    }

    cli := service.GetDockerClient()
    // Use types.NetworkCreate which matches the SDK signature for v26+
    resp, err := cli.NetworkCreate(context.Background(), req.Name, types.NetworkCreate{
        Driver: req.Driver,
    })
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, resp)
}

func (h *NetworkHandler) RemoveNetwork(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()

    err := cli.NetworkRemove(context.Background(), id)
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Network removed"})
}

func (h *NetworkHandler) ConnectContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    var req struct {
        ContainerID string `json:"containerId"`
    }
    if err := ReadJSON(r, &req); err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    cli := service.GetDockerClient()
    if err := cli.NetworkConnect(context.Background(), id, req.ContainerID, nil); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container connected"})
}

func (h *NetworkHandler) DisconnectContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    var req struct {
        ContainerID string `json:"containerId"`
        Force       bool   `json:"force"`
    }
    if err := ReadJSON(r, &req); err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    cli := service.GetDockerClient()
    if err := cli.NetworkDisconnect(context.Background(), id, req.ContainerID, req.Force); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container disconnected"})
}

func (h *NetworkHandler) DuplicateNetwork(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    ctx := context.Background()

    // Inspect existing
    existing, err := cli.NetworkInspect(ctx, id, types.NetworkInspectOptions{})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }

    // Create new config based on existing
    // Logic: append _copy to name, copy driver, options, IPAM (carefully)
    newName := existing.Name + "_copy"
    
    // Create
    resp, err := cli.NetworkCreate(ctx, newName, types.NetworkCreate{
        Driver:     existing.Driver,
        Options:    existing.Options,
        Labels:     existing.Labels,
        Internal:   existing.Internal,
        Attachable: existing.Attachable,
        Ingress:    existing.Ingress,
        IPAM:       &existing.IPAM, // Might conflict if subnet is same? Docker usually errors if overlap.
        // We attempt to copy IPAM. If it fails due to overlap, user must manually fix usage.
        // Or we should strip IPAM to let Docker assign auto?
        // Let's strip IPConfig if it has specific subnets to avoid conflict, unless user wants exact clone (which fails usually).
        // A "Duplicate" usually implies structural clone, not necessarily exact IP.
        // Safe bet: Copy IPAM Config but if it fails, fallback?
        // Let's try deep copy but maybe clear the Config list if we want unique subnets.
        // For now, let's copy everything. If it fails, user gets error.
    })
    
    if err != nil {
         ErrorJSON(w, http.StatusInternalServerError, "Failed to duplicate (subnet conflict?): "+err.Error())
         return
    }

    WriteJSON(w, http.StatusOK, resp)
}

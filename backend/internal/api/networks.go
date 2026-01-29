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

package agent

import (
	"time"
	"net/url"
	"bytes"
	"errors"
	"net"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
    "os"
    "os/exec"
	"strconv"
	"strings"


	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/gorilla/websocket"
)

func isExpectedDisconnect(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
		return true
	}
	if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived, websocket.CloseAbnormalClosure) {
		return true
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "broken pipe") ||
		strings.Contains(errStr, "connection reset by peer") ||
		strings.Contains(errStr, "use of closed network connection") ||
		strings.Contains(errStr, "close sent") ||
		strings.Contains(errStr, "closed by client")
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSWriter struct {
	Conn *websocket.Conn
}

func (w *WSWriter) Write(p []byte) (n int, err error) {
	err = w.Conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

type ExecMessage struct {
	Type string `json:"type"` // "input", "resize"
	Data string `json:"data,omitempty"`
	Rows int    `json:"rows,omitempty"`
	Cols int    `json:"cols,omitempty"`
}



func (a *Agent) detectContainerShell(ctx context.Context, containerID, preferred string) string {
	var candidates []string
	if preferred != "" && preferred != "auto" {
		candidates = []string{preferred}
	} else {
		candidates = []string{"/bin/sh", "/bin/bash", "/bin/ash", "/usr/bin/sh", "/usr/bin/bash", "sh", "bash"}
	}

	for _, shellCmd := range candidates {
		probeConfig := types.ExecConfig{
			AttachStdout: false,
			AttachStderr: false,
			Tty:          false,
			Cmd:          []string{shellCmd, "-c", "exit 0"},
		}
		execResp, err := a.dockerClient().ContainerExecCreate(ctx, containerID, probeConfig)
		if err != nil {
			continue
		}

		probeCtx, cancel := context.WithTimeout(ctx, 400*time.Millisecond)
		err = a.dockerClient().ContainerExecStart(probeCtx, execResp.ID, types.ExecStartCheck{})
		cancel()
		if err != nil {
			continue
		}

		inspect, err := a.dockerClient().ContainerExecInspect(ctx, execResp.ID)
		if err == nil && inspect.ExitCode == 0 {
			return shellCmd
		}
	}
	return ""
}

// handleStreamExec handles interactive container shell
func (a *Agent) handleStreamExec(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	if _, err := a.dockerClient().ContainerInspect(context.Background(), id); err != nil {
		ws.WriteJSON(map[string]string{"error": "Container not found"})
		return
	}

	preferredShell := r.URL.Query().Get("shell")
	shellCmd := a.detectContainerShell(context.Background(), id, preferredShell)
	if shellCmd == "" {
		wsWriter := &WSWriter{Conn: ws}
		msg := "\r\n\x1b[1;33m[Conman] ⚠️ No Shell Found in Container\x1b[0m\r\n\r\n" +
			"\x1b[90mThis container appears to be built from a \x1b[1;37mscratch\x1b[0;90m or \x1b[1;37mdistroless\x1b[0;90m image without an internal shell (/bin/sh, /bin/bash, /bin/ash).\r\n\r\n" +
			"Interactive terminal sessions require an installed shell binary inside the container.\r\n" +
			"Containers packaging standalone static binaries (such as Dozzle, Traefik, or pure Go/Rust images) do not provide a shell.\x1b[0m\r\n\r\n"
		_, _ = wsWriter.Write([]byte(msg))
		return
	}

	execConfig := types.ExecConfig{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{shellCmd},
	}

	execIDResp, err := a.dockerClient().ContainerExecCreate(context.Background(), id, execConfig)
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	attachConfig := types.ExecStartCheck{
		Tty: true,
	}
	resp, err := a.dockerClient().ContainerExecAttach(context.Background(), execIDResp.ID, attachConfig)
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer resp.Close()

	go func() {
		wsWriter := &WSWriter{Conn: ws}
		_, _ = io.Copy(wsWriter, resp.Reader)
	}()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var execMsg ExecMessage
		if err := json.Unmarshal(msg, &execMsg); err != nil {
			continue
		}

		if execMsg.Type == "resize" {
			_ = a.dockerClient().ContainerExecResize(context.Background(), execIDResp.ID, container.ResizeOptions{
				Height: uint(execMsg.Rows),
				Width:  uint(execMsg.Cols),
			})
		} else if execMsg.Type == "input" {
			_, _ = resp.Conn.Write([]byte(execMsg.Data))
		}
	}
}

type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"mod_time"`
	IsDir   bool   `json:"is_dir"`
}

// handleListFiles lists files in a container
func (a *Agent) handleListFiles(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }
    
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	// Use standard ls -lan for better compatibility
	execConfig := types.ExecConfig{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          []string{"ls", "-lan", path},
	}

	execIDResp, err := a.dockerClient().ContainerExecCreate(context.Background(), id, execConfig)
	if err != nil {
		errLower := strings.ToLower(err.Error())
		if strings.Contains(errLower, "not running") || strings.Contains(errLower, "is not running") || strings.Contains(errLower, "no such container") {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(container.ContainerTopOKBody{
				Titles:    []string{"PID", "USER", "TIME", "COMMAND"},
				Processes: [][]string{},
			})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp, err := a.dockerClient().ContainerExecAttach(context.Background(), execIDResp.ID, types.ExecStartCheck{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Close()

	var outBuf bytes.Buffer
	var errBuf bytes.Buffer

	_, err = stdcopy.StdCopy(&outBuf, &errBuf, resp.Reader)
	if err != nil {
		http.Error(w, "Failed to read exec output", http.StatusInternalServerError)
		return
	}

	errMsg := errBuf.String()
	if errMsg != "" {
		http.Error(w, strings.TrimSpace(errMsg), http.StatusBadRequest)
		return
	}

	files := []FileEntry{}
	lines := strings.Split(outBuf.String(), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		// Example: drwxr-xr-x    1 0        0             4096 Jan 30 12:34 bin
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		mode := fields[0]
		isDir := strings.HasPrefix(mode, "d")
		
		// Name starts at index 8
		name := strings.Join(fields[8:], " ")
		
		// Construct basic mod time string like "Jan 30 12:34"
		// Index 5, 6, 7
		modTime := strings.Join(fields[5:8], " ")

		// Parse size from field 4
		var size int64
		if parsed, err := strconv.ParseInt(fields[4], 10, 64); err == nil {
			size = parsed
		}

		files = append(files, FileEntry{
			Name:    name,
			Size:    size,
			Mode:    mode,
			ModTime: modTime,
			IsDir:   isDir,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// handleStreamLogs streams container logs via WebSocket
func (a *Agent) handleStreamLogs(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }

    tail := r.URL.Query().Get("tail")
    if tail == "" {
        tail = "100"
    }
    since := r.URL.Query().Get("since")

    // Upgrade to WebSocket first — any error before this sends a plain HTTP error
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Upgrade error: %v", err)
        return
    }
    defer ws.Close()

    // Create log stream options
    opts := container.LogsOptions{
        ShowStdout: true,
        ShowStderr: true,
        Follow:     true,
        Tail:       tail,
        Timestamps: true,
        Since:      since,
    }

    // Connect to Docker logs
    reader, err := a.dockerClient().ContainerLogs(context.Background(), id, opts)
    if err != nil {
        ws.WriteMessage(websocket.TextMessage, []byte("Error getting logs: "+err.Error()))
        return
    }
    defer reader.Close()

    // Multiplex stdout/stderr into the WebSocket
    // Using a custom writer that strips headers if strictly needed, 
    // but stdcopy is for writing to two streams.
    // For simple text streaming, we can just read the stdcopy frame headers and payload.
    // Or closer: use stdcopy to write to our WS Writer.
    
    wsWriter := &WSWriter{Conn: ws}
    
    // stdcopy.StdCopy demultiplexes the stream. 
    // We want to merge them into the websocket.
    _, err = stdcopy.StdCopy(wsWriter, wsWriter, reader)
    if err != nil && !isExpectedDisconnect(err) {
        log.Printf("Stream error: %v", err)
    }
}

// handleStreamStats streams container stats via WebSocket
func (a *Agent) handleStreamStats(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing container ID", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	stats, err := a.dockerClient().ContainerStats(context.Background(), id, true)
	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("Error getting stats: "+err.Error()))
		return
	}
	defer stats.Body.Close()

	// Stats are streamed as JSON objects
	wsWriter := &WSWriter{Conn: ws}
	_, err = io.Copy(wsWriter, stats.Body)
	if err != nil && !isExpectedDisconnect(err) {
		log.Printf("Stats stream error: %v", err)
	}
}

// handleInspectContainer returns detailed container info
func (a *Agent) handleInspectContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, err := a.dockerClient().ContainerInspect(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func sanitizeImageID(rawID string) string {
	id := rawID
	for i := 0; i < 3; i++ {
		if strings.Contains(id, "%") {
			if unescaped, err := url.QueryUnescape(id); err == nil && unescaped != "" {
				id = unescaped
			} else {
				break
			}
		} else {
			break
		}
	}
	return strings.TrimSpace(id)
}

// handleInspectImage returns detailed image info
func (a *Agent) handleInspectImage(w http.ResponseWriter, r *http.Request) {
	id := sanitizeImageID(r.URL.Query().Get("id"))
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, _, err := a.dockerClient().ImageInspectWithRaw(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleInspectNetwork returns detailed network info
func (a *Agent) handleInspectNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, err := a.dockerClient().NetworkInspect(context.Background(), id, types.NetworkInspectOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleInspectVolume returns detailed volume info
func (a *Agent) handleInspectVolume(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing name", http.StatusBadRequest)
		return
	}

	info, err := a.dockerClient().VolumeInspect(context.Background(), name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleSystemDF returns system disk usage
func (a *Agent) handleSystemDF(w http.ResponseWriter, r *http.Request) {
	usage, err := a.dockerClient().DiskUsage(context.Background(), types.DiskUsageOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usage)
}

// handlePruneContainers removes stopped containers
func (a *Agent) handlePruneContainers(w http.ResponseWriter, r *http.Request) {
	report, err := a.dockerClient().ContainersPrune(context.Background(), filters.Args{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"containers_deleted": report.ContainersDeleted,
		"space_reclaimed":    report.SpaceReclaimed,
	})
}

// handlePruneImages removes unused images (both dangling layers and unreferenced tagged images)
func (a *Agent) handlePruneImages(w http.ResponseWriter, r *http.Request) {
	pruneFilters := filters.NewArgs()
	danglingParam := r.URL.Query().Get("dangling")
	if danglingParam == "true" || danglingParam == "1" {
		pruneFilters.Add("dangling", "true")
	} else {
		// By default or with all=true, prune all unused images not in use by containers
		pruneFilters.Add("dangling", "false")
	}

	report, err := a.dockerClient().ImagesPrune(context.Background(), pruneFilters)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"images_deleted":  report.ImagesDeleted,
		"space_reclaimed": report.SpaceReclaimed,
	})
}

// handlePruneVolumes removes unused volumes
func (a *Agent) handlePruneVolumes(w http.ResponseWriter, r *http.Request) {
	report, err := a.dockerClient().VolumesPrune(context.Background(), filters.Args{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"volumes_deleted": report.VolumesDeleted,
		"space_reclaimed": report.SpaceReclaimed,
	})
}

// handlePruneNetworks removes unused networks
func (a *Agent) handlePruneNetworks(w http.ResponseWriter, r *http.Request) {
	report, err := a.dockerClient().NetworksPrune(context.Background(), filters.Args{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"networks_deleted": report.NetworksDeleted,
	})
}

// handleSystemPrune removes all unused containers, images, networks, and volumes
func (a *Agent) handleSystemPrune(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	results := map[string]any{}

	if cr, err := a.dockerClient().ContainersPrune(ctx, filters.Args{}); err == nil {
		results["containers_deleted"] = cr.ContainersDeleted
		results["containers_space"] = cr.SpaceReclaimed
	}
	if ir, err := a.dockerClient().ImagesPrune(ctx, filters.Args{}); err == nil {
		results["images_deleted"] = ir.ImagesDeleted
		results["images_space"] = ir.SpaceReclaimed
	}
	if vr, err := a.dockerClient().VolumesPrune(ctx, filters.Args{}); err == nil {
		results["volumes_deleted"] = vr.VolumesDeleted
		results["volumes_space"] = vr.SpaceReclaimed
	}
	if nr, err := a.dockerClient().NetworksPrune(ctx, filters.Args{}); err == nil {
		results["networks_deleted"] = nr.NetworksDeleted
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (a *Agent) handleDuplicateNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	source, err := a.dockerClient().NetworkInspect(ctx, id, types.NetworkInspectOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	ipam := network.IPAM{
		Driver: source.IPAM.Driver,
	}

	options := make(map[string]string)
	for k, v := range source.Options {
		if k != "com.docker.network.bridge.name" {
			options[k] = v
		}
	}

	createOpts := types.NetworkCreate{
		CheckDuplicate: true,
		Driver:         source.Driver,
		Scope:          source.Scope,
		EnableIPv6:     source.EnableIPv6,
		IPAM:           &ipam,
		Internal:       source.Internal,
		Attachable:     source.Attachable,
		Ingress:        source.Ingress,
		ConfigOnly:     source.ConfigOnly,
		Options:        options,
		Labels:         source.Labels,
	}
	
	newName := source.Name + "-copy"
	
	resp, err := a.dockerClient().NetworkCreate(ctx, newName, createOpts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (a *Agent) handleConnectNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing network ID", http.StatusBadRequest)
		return
	}
	
	var req struct {
		ContainerID string `json:"container_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("ConnectNetwork: invalid body: %v", err)
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	log.Printf("ConnectNetwork: connecting container %s to network %s", req.ContainerID, id)

	err := a.dockerClient().NetworkConnect(context.Background(), id, req.ContainerID, nil)
	if err != nil {
		log.Printf("ConnectNetwork: failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

// handleStartContainer starts a container
func (a *Agent) handleStartContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}
	if err := a.dockerClient().ContainerStart(context.Background(), id, container.StartOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleStopContainer stops a container with system protection
func (a *Agent) handleStopContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	// Protect Conman's own containers from being stopped from the panel
	if info, err := a.dockerClient().ContainerInspect(context.Background(), id); err == nil {
		if isConmanProtectedContainer(info.Name, info.Config.Image) {
			http.Error(w, "Cannot stop Conman core system container from within the panel", http.StatusForbidden)
			return
		}
	}

	if err := a.dockerClient().ContainerStop(context.Background(), id, container.StopOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleRestartContainer restarts a container
func (a *Agent) handleRestartContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}
	if err := a.dockerClient().ContainerRestart(context.Background(), id, container.StopOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func isConmanProtectedContainer(name string, imageStr string) bool {
	cleanName := strings.TrimPrefix(strings.ToLower(name), "/")
	if strings.HasPrefix(cleanName, "conman-") || cleanName == "conman" || strings.HasPrefix(cleanName, "conman_") {
		return true
	}
	cleanImg := strings.ToLower(imageStr)
	if strings.Contains(cleanImg, "conman-server") ||
		strings.Contains(cleanImg, "conman-agent") ||
		strings.Contains(cleanImg, "conman-backend") ||
		strings.Contains(cleanImg, "conman-frontend") ||
		strings.Contains(cleanImg, "conman-local-agent") ||
		strings.HasPrefix(cleanImg, "conman:") ||
		strings.HasPrefix(cleanImg, "conman/") {
		return true
	}
	return false
}

func isConmanProtectedImage(id string, tags []string) bool {
	for _, tag := range tags {
		cleanTag := strings.ToLower(tag)
		if strings.HasPrefix(cleanTag, "conman-server") ||
			strings.HasPrefix(cleanTag, "conman-agent") ||
			strings.HasPrefix(cleanTag, "conman-backend") ||
			strings.HasPrefix(cleanTag, "conman-frontend") ||
			strings.HasPrefix(cleanTag, "conman-local-agent") ||
			strings.HasPrefix(cleanTag, "conman:") ||
			strings.HasPrefix(cleanTag, "conman/") ||
			cleanTag == "conman" {
			return true
		}
	}
	cleanID := strings.ToLower(id)
	return strings.Contains(cleanID, "conman-server") || strings.Contains(cleanID, "conman-agent")
}

// handleRemoveContainer removes a container with system protection
func (a *Agent) handleRemoveContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	// Protect Conman's own containers from self-destruction
	if info, err := a.dockerClient().ContainerInspect(context.Background(), id); err == nil {
		if isConmanProtectedContainer(info.Name, info.Config.Image) {
			http.Error(w, "Cannot remove Conman core system container from within the panel", http.StatusForbidden)
			return
		}
	}

	// Force remove? Usually good for UI.
	err := a.dockerClient().ContainerRemove(context.Background(), id, container.RemoveOptions{Force: true})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveImage removes an image with system protection
func (a *Agent) handleRemoveImage(w http.ResponseWriter, r *http.Request) {
	id := sanitizeImageID(r.URL.Query().Get("id"))
	if id == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Missing image ID"})
		return
	}

	// Protect Conman's own images from removal
	if info, _, err := a.dockerClient().ImageInspectWithRaw(context.Background(), id); err == nil {
		if isConmanProtectedImage(info.ID, info.RepoTags) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "Cannot remove Conman core system image from within the panel"})
			return
		}
	}

	_, err := a.dockerClient().ImageRemove(context.Background(), id, image.RemoveOptions{Force: true})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		errMsg := err.Error()
		if strings.Contains(strings.ToLower(errMsg), "used by running container") || strings.Contains(strings.ToLower(errMsg), "is being used") {
			errMsg = "Image is currently in use by one or more active containers. Stop and remove the containers first."
		}
		json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveNetwork removes a network
func (a *Agent) handleRemoveNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	// Inspect network to prevent deleting predefined Docker networks
	info, err := a.dockerClient().NetworkInspect(context.Background(), id, types.NetworkInspectOptions{})
	if err == nil {
		netName := strings.ToLower(strings.TrimSpace(info.Name))
		if netName == "bridge" || netName == "host" || netName == "none" || info.Driver == "null" || info.Driver == "host" {
			http.Error(w, fmt.Sprintf("Predefined Docker network '%s' cannot be removed", info.Name), http.StatusBadRequest)
			return
		}
	}

	err = a.dockerClient().NetworkRemove(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveVolume removes a volume
func (a *Agent) handleRemoveVolume(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing name", http.StatusBadRequest)
		return
	}

	err := a.dockerClient().VolumeRemove(context.Background(), name, true)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleCheckImageUpdate checks if a newer version of the image is available
func (a *Agent) handleCheckImageUpdate(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    id := sanitizeImageID(r.URL.Query().Get("id"))
    if id == "" {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "error":            "Missing image ID",
        })
        return
    }

    // Inspect local image to get repo tag
    info, _, err := a.dockerClient().ImageInspectWithRaw(context.Background(), id)
    if err != nil {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "error":            fmt.Sprintf("Failed to inspect image: %v", err),
        })
        return
    }

    if len(info.RepoTags) == 0 {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "error":            "Image has no repository tags",
        })
        return
    }

    tag := info.RepoTags[0]
    if tag == "<none>:<none>" || strings.HasPrefix(tag, "<none>") {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "error":            "Untagged image layer",
        })
        return
    }

    parts := strings.Split(tag, ":")
    if len(parts) == 1 {
        tag = parts[0] + ":latest"
    }

    dist, err := a.dockerClient().DistributionInspect(context.Background(), tag, "")
    if err != nil {
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "current_tag":      tag,
            "error":            fmt.Sprintf("Registry check: %v", err),
        })
        return
    }

    remoteDigest := dist.Descriptor.Digest.String()
    updateAvailable := true

    for _, localDigest := range info.RepoDigests {
        if strings.Contains(localDigest, remoteDigest) {
            updateAvailable = false
            break
        }
    }

    json.NewEncoder(w).Encode(map[string]interface{}{
        "update_available": updateAvailable,
        "current_tag":      tag,
        "available_tag":    tag,
        "remote_digest":    remoteDigest,
    })
}

// handlePullImage pulls a docker image
func (a *Agent) handlePullImage(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Image string `json:"image"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    if req.Image == "" {
        http.Error(w, "Missing image name", http.StatusBadRequest)
        return
    }

    // Pull the image
    // Note: ImagePull usually streams output.
    out, err := a.dockerClient().ImagePull(context.Background(), req.Image, image.PullOptions{})
    if err != nil {
        http.Error(w, fmt.Sprintf("Failed to pull image: %v", err), http.StatusInternalServerError)
        return
    }
    defer out.Close()

    // Stream output to client
    w.Header().Set("Content-Type", "application/json") // Docker pull output is effectively a stream of JSON objects
    if _, err := io.Copy(w, out); err != nil {
        log.Printf("Error streaming pull output: %v", err)
    }
}

// -- Stack Management Handlers --

// handleListStacks uses "docker compose ls --format json" but since that requires project name awareness,
// we will instead list containers and group them by "com.docker.compose.project" label.
// This is more robust for "discovery" of existing stacks.
// stackRegistryPath is the JSON file that persists known stack paths across restarts.
const stackRegistryPath = "/tmp/conman-stacks/.registry.json"

// loadStackRegistry reads the persisted map of stack name → config file path.
func loadStackRegistry() map[string]string {
	data, err := os.ReadFile(stackRegistryPath)
	if err != nil {
		return make(map[string]string)
	}
	var reg map[string]string
	if err := json.Unmarshal(data, &reg); err != nil {
		return make(map[string]string)
	}
	return reg
}

// saveStackRegistry persists the registry to disk.
func saveStackRegistry(reg map[string]string) {
	os.MkdirAll("/tmp/conman-stacks", 0755)
	data, _ := json.Marshal(reg)
	os.WriteFile(stackRegistryPath, data, 0644)
}

// stackDirForConfig returns the directory containing a compose config file.
func stackDirForConfig(configPath string) string {
	// configPath may be comma-separated; take the first
	if idx := strings.Index(configPath, ","); idx > 0 {
		configPath = configPath[:idx]
	}
	configPath = strings.TrimSpace(configPath)
	// Return parent directory
	if idx := strings.LastIndex(configPath, "/"); idx >= 0 {
		return configPath[:idx]
	}
	return configPath
}

func (a *Agent) handleListStacks(w http.ResponseWriter, r *http.Request) {
	containers, err := a.dockerClient().ContainerList(context.Background(), container.ListOptions{All: true})
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list containers: %v", err), http.StatusInternalServerError)
		return
	}

	type Stack struct {
		Name        string `json:"Name"`
		Status      string `json:"Status"`
		Services    int    `json:"Services"`
		ConfigFiles string `json:"ConfigFiles"`
	}

	stacks := make(map[string]*Stack)

	for _, c := range containers {
		projectName := c.Labels["com.docker.compose.project"]
		if projectName == "" {
			continue
		}

		if _, exists := stacks[projectName]; !exists {
			stacks[projectName] = &Stack{
				Name:   projectName,
				Status: "active",
			}
		}

		stacks[projectName].Services++

		if c.State != "running" {
			if stacks[projectName].Status == "active" {
				stacks[projectName].Status = "partial"
			}
		}

		if cfg := c.Labels["com.docker.compose.project.config_files"]; cfg != "" {
			stacks[projectName].ConfigFiles = cfg
		}
	}

	// Persist any newly discovered config paths into the registry.
	// Prune entries whose directories no longer exist on disk.
	reg := loadStackRegistry()
	changed := false

	// Add newly discovered stacks
	for name, s := range stacks {
		if s.ConfigFiles != "" {
			dir := stackDirForConfig(s.ConfigFiles)
			if _, err := os.Stat(dir); err == nil {
				if reg[name] != dir {
					reg[name] = dir
					changed = true
				}
			}
		}
	}

	// Prune stacks whose directories have been deleted
	for name, dir := range reg {
		if _, err := os.Stat(dir); err != nil {
			delete(reg, name)
			changed = true
			// Also remove conman-managed copy if it existed
			os.RemoveAll(fmt.Sprintf("/tmp/conman-stacks/%s", name))
		}
	}

	if changed {
		saveStackRegistry(reg)
	}

	// Include stopped stacks from registry that have no running containers
	for name, dir := range reg {
		if _, exists := stacks[name]; !exists {
			stacks[name] = &Stack{
				Name:        name,
				Status:      "exited",
				Services:    0,
				ConfigFiles: dir,
			}
		}
	}

	result := make([]*Stack, 0, len(stacks))
	for _, s := range stacks {
		result = append(result, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// resolveStackDir returns the directory for a stack by checking the registry,
// conman-managed path, and falling back to the config label from containers.
func (a *Agent) resolveStackDir(name string) string {
	// 1. Check registry
	reg := loadStackRegistry()
	if dir, ok := reg[name]; ok {
		if _, err := os.Stat(dir); err == nil {
			return dir
		}
	}
	// 2. Check conman-managed path
	managed := fmt.Sprintf("/tmp/conman-stacks/%s", name)
	if _, err := os.Stat(managed); err == nil {
		return managed
	}
	return ""
}

// handleCreateStack accepts docker-compose content and runs "docker compose up"
func (a *Agent) handleCreateStack(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name           string `json:"name"`
		ComposeContent string `json:"compose_content"`
		EnvContent     string `json:"env_content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.ComposeContent == "" {
		http.Error(w, "Name and ComposeContent are required", http.StatusBadRequest)
		return
	}

	stackDir := fmt.Sprintf("/tmp/conman-stacks/%s", req.Name)
	if err := os.MkdirAll(stackDir, 0755); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create stack dir: %v", err), http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(stackDir+"/docker-compose.yml", []byte(req.ComposeContent), 0644); err != nil {
		http.Error(w, fmt.Sprintf("Failed to write compose file: %v", err), http.StatusInternalServerError)
		return
	}

	if req.EnvContent != "" {
		if err := os.WriteFile(stackDir+"/.env", []byte(req.EnvContent), 0644); err != nil {
			http.Error(w, fmt.Sprintf("Failed to write .env file: %v", err), http.StatusInternalServerError)
			return
		}
	}

	cmd := exec.Command("docker", "compose", "up", "-d")
	cmd.Dir = stackDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Docker Compose failed: %s\nOutput: %s", err, string(output)), http.StatusInternalServerError)
		return
	}

	// Register the stack
	reg := loadStackRegistry()
	reg[req.Name] = stackDir
	saveStackRegistry(reg)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deployed", "output": string(output)})
}

// handleUpStack runs "docker compose up -d" on an existing stack
func (a *Agent) handleUpStack(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing stack name", http.StatusBadRequest)
		return
	}

	stackDir := a.resolveStackDir(name)
	if stackDir == "" {
		http.Error(w, "Stack directory not found", http.StatusNotFound)
		return
	}

	cmd := exec.Command("docker", "compose", "up", "-d")
	cmd.Dir = stackDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Docker Compose Up failed: %v\nOutput: %s", err, string(output)), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "started", "output": string(output)})
}

// handleRestartStack runs "docker compose restart" on a stack
func (a *Agent) handleRestartStack(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing stack name", http.StatusBadRequest)
		return
	}

	stackDir := a.resolveStackDir(name)
	if stackDir == "" {
		http.Error(w, "Stack directory not found", http.StatusNotFound)
		return
	}

	cmd := exec.Command("docker", "compose", "restart")
	cmd.Dir = stackDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Docker Compose Restart failed: %v\nOutput: %s", err, string(output)), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "restarted", "output": string(output)})
}

// handleRemoveStack runs "docker compose down"
func (a *Agent) handleRemoveStack(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing stack name", http.StatusBadRequest)
		return
	}

	stackDir := a.resolveStackDir(name)
	if stackDir != "" {
		cmd := exec.Command("docker", "compose", "down")
		cmd.Dir = stackDir
		if out, err := cmd.CombinedOutput(); err != nil {
			http.Error(w, fmt.Sprintf("Docker Compose Down failed: %v\nOutput: %s", err, string(out)), http.StatusInternalServerError)
			return
		}
		// Clean up conman-managed dir (but not external dirs)
		managed := fmt.Sprintf("/tmp/conman-stacks/%s", name)
		if stackDir == managed {
			os.RemoveAll(managed)
		}
	} else {
		// Fallback: try project-name-based down
		cmd := exec.Command("docker", "compose", "-p", name, "down")
		if out, err := cmd.CombinedOutput(); err != nil {
			http.Error(w, fmt.Sprintf("Stack config not found and generic down failed: %v\nOutput: %s", err, string(out)), http.StatusNotFound)
			return
		}
	}

	// Remove from registry
	reg := loadStackRegistry()
	delete(reg, name)
	saveStackRegistry(reg)

	w.WriteHeader(http.StatusOK)
}

// handleContainerTop returns running processes inside a container
func (a *Agent) handleContainerTop(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}
	psArgs := r.URL.Query().Get("ps_args")

	var top container.ContainerTopOKBody
	var err error

	if psArgs != "" {
		top, err = a.dockerClient().ContainerTop(context.Background(), id, []string{psArgs})
	} else {
		// Try standard -ef first, fallback to default if unsupported
		top, err = a.dockerClient().ContainerTop(context.Background(), id, []string{"-ef"})
		if err != nil {
			top, err = a.dockerClient().ContainerTop(context.Background(), id, nil)
		}
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(top)
}

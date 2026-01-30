package api

import (
    "conman-backend/internal/models"
    "conman-backend/internal/service"
    "context"
    "encoding/json"
    "io"
    "net/http"
    "strings"



    "github.com/docker/docker/api/types"
    "github.com/docker/docker/api/types/container"
    "github.com/docker/docker/pkg/stdcopy"
    "github.com/go-chi/chi/v5"
    "github.com/gorilla/websocket"
)

type ContainerHandler struct{}

func NewContainerHandler() *ContainerHandler {
    return &ContainerHandler{}
}

func (h *ContainerHandler) ListContainers(w http.ResponseWriter, r *http.Request) {
    cli := service.GetDockerClient()
    containers, err := cli.ContainerList(context.Background(), container.ListOptions{All: true})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }

    var result []models.Container
    
    // Using global stats collector source
    statsCollector := service.GetStatsCollector()

    for _, c := range containers {
        name := ""
        if len(c.Names) > 0 {
            name = c.Names[0]
        }

        // Get cached stats
        cpuUsage := "0.00%"
        memUsage := "0 B"
        diskIO := "0 B / 0 B"

        if stats := statsCollector.GetStats(c.ID); stats != nil {
            cpuUsage = stats.CPUUsage
            memUsage = stats.MemoryUsage
            diskIO = stats.DiskIO
        }
        
        // Format Ports
        var ports []string
        for _, p := range c.Ports {
            ports = append(ports, service.FormatPort(p))
        }

        // Get IP Address
        ip := ""
        if c.NetworkSettings != nil {
             for _, net := range c.NetworkSettings.Networks {
                ip = net.IPAddress
                break
            }
        }

        result = append(result, models.Container{
            ID:          c.ID,
            Name:        name,
            Status:      c.Status,
            State:       c.State,
            Image:       c.Image,
            Created:     c.Created,
            Ports:       ports,
            IPAddress:   ip,
            CPUUsage:    cpuUsage,
            MemoryUsage: memUsage,
            DiskIO:      diskIO,
        })
    }

    WriteJSON(w, http.StatusOK, result)
}

// Helper functions now moved to stats_collector or not needed here locally anymore since logic is centered there.
// Removing local helpers to avoid conflict or just leaving them if reused elsewhere?
// StreamStats uses io.Copy from docker stream, so it doesn't use calculate* functions.
// StreamExec uses ...
// So I can safely remove the calculate* functions from this file.

func (h *ContainerHandler) StartContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerStart(context.Background(), id, container.StartOptions{}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container started successfully"})
}

func (h *ContainerHandler) StopContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    timeout := 10 // seconds
    if err := cli.ContainerStop(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container stopped successfully"})
}

func (h *ContainerHandler) RemoveContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerRemove(context.Background(), id, container.RemoveOptions{Force: true}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container removed successfully"})
}

func (h *ContainerHandler) InspectContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    info, err := cli.ContainerInspect(context.Background(), id)
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    
    WriteJSON(w, http.StatusOK, info)
}

func (h *ContainerHandler) PauseContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerPause(context.Background(), id); err != nil {
         if strings.Contains(err.Error(), "is not running") {
              ErrorJSON(w, http.StatusBadRequest, "Container is not running")
              return
         }
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container paused successfully"})
}

func (h *ContainerHandler) UnpauseContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerUnpause(context.Background(), id); err != nil {
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container unpaused successfully"})
}

func (h *ContainerHandler) RestartContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    timeout := 10
    if err := cli.ContainerRestart(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container restarted successfully"})
}

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true
    },
}

func (h *ContainerHandler) StreamLogs(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return // Upgrade handles error response
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    // Check connection first
    if _, err := cli.ContainerInspect(context.Background(), id); err != nil {
        ws.WriteJSON(map[string]string{"error": "Container not found"})
        return
    }

    // Parse query parameters
    query := r.URL.Query()
    
    // Tail: default to 1000 lines, support "all" for unlimited
    tail := query.Get("tail")
    if tail == "" {
        tail = "1000"
    } else if tail == "all" {
        tail = "" // Empty string means all logs for Docker API
    }

    // Since: e.g., "1h" or RFC3339 timestamp
    since := query.Get("since")

    // Follow: default true for streaming
    follow := query.Get("follow") != "false"

    options := container.LogsOptions{
        ShowStdout: true,
        ShowStderr: true,
        Follow:     follow,
        Tail:       tail,
        Timestamps: true,
        Since:      since,
    }

    reader, err := cli.ContainerLogs(context.Background(), id, options)
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    defer reader.Close()

    wsWriter := &WSWriter{Conn: ws}
    _, _ = stdcopy.StdCopy(wsWriter, wsWriter, reader)
}

type WSWriter struct {
    Conn *websocket.Conn
}

func (w *WSWriter) Write(p []byte) (n int, err error) {
    // WriteMessage is blocking.
    err = w.Conn.WriteMessage(websocket.TextMessage, p)
    if err != nil {
        return 0, err
    }
    return len(p), nil
}

func (h *ContainerHandler) StreamStats(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    if _, err := cli.ContainerInspect(context.Background(), id); err != nil {
        ws.WriteJSON(map[string]string{"error": "Container not found"})
        return
    }

    stats, err := cli.ContainerStats(context.Background(), id, true) // stream=true
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    defer stats.Body.Close()

    wsWriter := &WSWriter{Conn: ws}
    _, _ = io.Copy(wsWriter, stats.Body)
}

type ExecMessage struct {
    Type string `json:"type"` // "input", "resize"
    Data string `json:"data,omitempty"`
    Rows int    `json:"rows,omitempty"`
    Cols int    `json:"cols,omitempty"`
}

func (h *ContainerHandler) StreamExec(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    execConfig := types.ExecConfig{
        AttachStdin:  true,
        AttachStdout: true,
        AttachStderr: true,
        Tty:          true,
        Cmd:          []string{"/bin/sh"},
    }
    
    execIDResp, err := cli.ContainerExecCreate(context.Background(), id, execConfig)
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    
    attachConfig := types.ExecStartCheck{
        Tty: true,
    }
    resp, err := cli.ContainerExecAttach(context.Background(), execIDResp.ID, attachConfig)
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
            _ = cli.ContainerExecResize(context.Background(), execIDResp.ID, container.ResizeOptions{
                Height: uint(execMsg.Rows),
                Width:  uint(execMsg.Cols),
            })
        } else if execMsg.Type == "input" {
            _, _ = resp.Conn.Write([]byte(execMsg.Data))
        }
    }
}

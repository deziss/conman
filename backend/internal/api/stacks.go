package api

import (
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
    "strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type StackHandler struct {
	DB             *gorm.DB
	ComposeService *service.ComposeService
}

func NewStackHandler(db *gorm.DB) *StackHandler {
	return &StackHandler{
		DB:             db,
		ComposeService: service.NewComposeService(),
	}
}

type CreateStackRequest struct {
	Name           string `json:"name"`
	ComposeContent string `json:"compose_content"`
	EnvContent     string `json:"env_content"`
}

func (h *StackHandler) ListStacks(w http.ResponseWriter, r *http.Request) {
    var stacks []models.Stack
    if err := h.DB.Find(&stacks).Error; err != nil {
        http.Error(w, "Failed to list stacks", http.StatusInternalServerError)
        return
    }
    
    // Update status for each? Or just rely on DB?
    // Start async status check maybe? simple for now.
    json.NewEncoder(w).Encode(stacks)
}

func (h *StackHandler) CreateStack(w http.ResponseWriter, r *http.Request) {
    var req CreateStackRequest
    if err := ReadJSON(w, r, &req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    if err := service.ValidateStackName(req.Name); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    webhookSecret, err := generateWebhookSecret()
    if err != nil {
        http.Error(w, "Failed to generate webhook secret", http.StatusInternalServerError)
        return
    }

    stack := models.Stack{
        Name: req.Name,
        ComposeContent: req.ComposeContent,
        EnvContent: req.EnvContent,
        Status: "deploying",
        WebhookSecret: webhookSecret,
    }

    if err := h.DB.Create(&stack).Error; err != nil {
        http.Error(w, "Failed to create stack record", http.StatusInternalServerError)
        return
    }

    // Async deploy
    go func() {
        err := h.ComposeService.Deploy(&stack)
        if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Deployed successfully"
        }
        h.DB.Save(&stack)
    }()

    // WebhookSecret is json:"-" on models.Stack, so it never leaks on any
    // other read (ListStacks/GetStack). Show it exactly once, here at creation.
    WriteJSON(w, http.StatusOK, struct {
        models.Stack
        WebhookSecret string `json:"webhook_secret"`
    }{Stack: stack, WebhookSecret: webhookSecret})
}

// generateWebhookSecret returns a random 32-byte hex string for HMAC-signing
// webhook deploy calls.
func generateWebhookSecret() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return hex.EncodeToString(b), nil
}

func (h *StackHandler) StopStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    go func() {
        err := h.ComposeService.Down(&stack)
         if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "stopped"
            stack.Message = "Stopped successfully"
        }
        h.DB.Save(&stack)
    }()

    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"stopping"}`))
}

func (h *StackHandler) DeleteStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    // Stop and Remove
    // Currently Down removes active resources.
    // What about files?
    
    // First Down
    h.ComposeService.Down(&stack)

    if err := h.DB.Delete(&stack).Error; err != nil {
        http.Error(w, "Failed to delete stack", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}

func (h *StackHandler) GetStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }
    
    // Get containers
    containers, _ := h.ComposeService.GetContainers(&stack)
    
    // Return composite response
    resp := struct {
        models.Stack
        Containers []service.ContainerInfo `json:"containers"`
    }{
        Stack: stack,
        Containers: containers,
    }
    
    json.NewEncoder(w).Encode(resp)
}

func (h *StackHandler) UpdateStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    var req CreateStackRequest // Reusing create request structure for update
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
         http.Error(w, "Invalid request", http.StatusBadRequest)
         return
    }
    
    // Update DB fields
    stack.ComposeContent = req.ComposeContent
    if req.EnvContent != "" {
        stack.EnvContent = req.EnvContent
    }
    // Name change not supported for now as it implies dir change
    stack.Status = "updating"
    h.DB.Save(&stack)

    // Redeploy
    go func() {
        err := h.ComposeService.Deploy(&stack)
         if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Updated successfully"
        }
        h.DB.Save(&stack)
    }()
    
    json.NewEncoder(w).Encode(stack)
}


// DeployStack triggers a redeploy from the authenticated dashboard (the
// "Deploy" button in StackDetails). No signature required — this route is
// already behind JWT auth + RBAC + the "stacks" license feature.
func (h *StackHandler) DeployStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "Invalid stack ID", http.StatusBadRequest)
        return
    }

    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    stack.Status = "deploying"
    stack.Message = "Deployment triggered"
    h.DB.Save(&stack)

    go func() {
        err := h.ComposeService.Deploy(&stack)
        if err != nil {
            stack.Status = "error"
            stack.Message = "Deployment failed: " + err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Deployed successfully"
        }
        h.DB.Save(&stack)
    }()

    WriteJSON(w, http.StatusOK, map[string]interface{}{
        "status":  "triggered",
        "stack":   stack.Name,
        "message": "Stack redeployment triggered",
    })
}

// RegenerateWebhookSecret issues a new webhook secret for a stack, invalidating
// the old one. The new secret is shown exactly once, in this response.
func (h *StackHandler) RegenerateWebhookSecret(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "Invalid stack ID", http.StatusBadRequest)
        return
    }

    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    secret, err := generateWebhookSecret()
    if err != nil {
        http.Error(w, "Failed to generate webhook secret", http.StatusInternalServerError)
        return
    }
    stack.WebhookSecret = secret
    if err := h.DB.Save(&stack).Error; err != nil {
        http.Error(w, "Failed to save webhook secret", http.StatusInternalServerError)
        return
    }

    WriteJSON(w, http.StatusOK, map[string]string{"webhook_secret": secret})
}

// WebhookDeploy triggers an automatic stack redeploy for CI/CD pipelines.
// This route is unauthenticated (no JWT/API key) by design — CI/CD systems
// call it directly — so it MUST verify the request itself: the caller signs
// the raw request body with the stack's WebhookSecret and sends the result as
//   X-Webhook-Signature: sha256=<hex HMAC-SHA256 of body>
// A stack with no WebhookSecret (shouldn't happen for anything created after
// this change, but covers pre-existing rows) rejects all webhook calls.
func (h *StackHandler) WebhookDeploy(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        http.Error(w, "Invalid stack ID", http.StatusBadRequest)
        return
    }

    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    if stack.WebhookSecret == "" {
        http.Error(w, "Webhook not configured for this stack — recreate it to get a webhook secret", http.StatusForbidden)
        return
    }

    body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
    if err != nil {
        http.Error(w, "Failed to read request body", http.StatusBadRequest)
        return
    }
    defer r.Body.Close()

    sigHeader := r.Header.Get("X-Webhook-Signature")
    const sigPrefix = "sha256="
    if !strings.HasPrefix(sigHeader, sigPrefix) {
        http.Error(w, "Missing or malformed X-Webhook-Signature header", http.StatusUnauthorized)
        return
    }
    providedSig, err := hex.DecodeString(strings.TrimPrefix(sigHeader, sigPrefix))
    if err != nil {
        http.Error(w, "Malformed X-Webhook-Signature header", http.StatusUnauthorized)
        return
    }

    mac := hmac.New(sha256.New, []byte(stack.WebhookSecret))
    mac.Write(body)
    expectedSig := mac.Sum(nil)

    if subtle.ConstantTimeCompare(providedSig, expectedSig) != 1 {
        http.Error(w, "Invalid webhook signature", http.StatusUnauthorized)
        return
    }

    stack.Status = "deploying"
    stack.Message = "Webhook deployment triggered"
    h.DB.Save(&stack)

    go func() {
        err := h.ComposeService.Deploy(&stack)
        if err != nil {
            stack.Status = "error"
            stack.Message = "Webhook deployment failed: " + err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Deployed via webhook successfully"
        }
        h.DB.Save(&stack)
    }()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "status":  "triggered",
        "stack":   stack.Name,
        "message": "Stack redeployment triggered via webhook",
    })
}

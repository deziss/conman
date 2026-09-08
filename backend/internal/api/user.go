package api

import (
	"conman-backend/internal/models"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserHandler struct {
	DB *gorm.DB
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{DB: db}
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

type UpdateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"` // Optional, if empty don't update
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

type CreateAPIKeyRequest struct {
	Name          string `json:"name"`
	ExpiresInDays int    `json:"expires_in_days"` // 0 = never expires
}

// apiKeyResponse masks the stored key: models.APIKey.Key is json:"-", and this
// wrapper exposes the full Key only once, right after generation, plus a
// short KeyPrefix for display everywhere else (list views, etc.).
type apiKeyResponse struct {
	models.APIKey
	Key       string `json:"key,omitempty"`
	KeyPrefix string `json:"key_prefix"`
}

func keyPrefix(key string) string {
	if len(key) > 11 {
		return key[:11]
	}
	return key
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := ReadJSON(w, r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request")
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error hashing password")
		return
	}

	user := models.User{
		Email:    req.Email,
		Password: string(hashedPassword),
		FullName: req.FullName,
		Role:     req.Role,
	}

	if err := h.DB.Create(&user).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error creating user")
		return
	}

	WriteJSON(w, http.StatusCreated, user)
}

func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req UpdateUserRequest
	if err := ReadJSON(w, r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request")
		return
	}

	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "User not found")
		return
	}

	// Update fields
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.FullName != "" {
		user.FullName = req.FullName
	}
	if req.Role != "" {
		user.Role = req.Role
	}
	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			ErrorJSON(w, http.StatusInternalServerError, "Error hashing password")
			return
		}
		user.Password = string(hashedPassword)
	}

	if err := h.DB.Save(&user).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error updating user")
		return
	}

	WriteJSON(w, http.StatusOK, user)
}

func (h *UserHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	var users []models.User
	if err := h.DB.Find(&users).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error fetching users")
		return
	}
	WriteJSON(w, http.StatusOK, users)
}

func (h *UserHandler) GenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(models.UserContextKey).(*models.User)
	if !ok {
		ErrorJSON(w, http.StatusUnauthorized, "User context not found")
		return
	}

	var req CreateAPIKeyRequest
	if err := ReadJSON(w, r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		ErrorJSON(w, http.StatusBadRequest, "Name is required")
		return
	}
	if req.ExpiresInDays < 0 {
		ErrorJSON(w, http.StatusBadRequest, "expires_in_days must be 0 (never) or positive")
		return
	}

	// Generate random key
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error generating key")
		return
	}
	keyString := "cm_" + hex.EncodeToString(bytes) // prefix for identification

	var expiresAt int64
	if req.ExpiresInDays > 0 {
		expiresAt = time.Now().AddDate(0, 0, req.ExpiresInDays).Unix()
	}

	apiKey := models.APIKey{
		Key:       keyString,
		Name:      req.Name,
		UserID:    user.ID,
		Role:      user.Role, // Inherit current role
		ExpiresAt: expiresAt,
	}

	if err := h.DB.Create(&apiKey).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error saving API key")
		return
	}

	WriteJSON(w, http.StatusCreated, apiKeyResponse{
		APIKey:    apiKey,
		Key:       keyString, // shown once, right now
		KeyPrefix: keyPrefix(keyString),
	})
}

func (h *UserHandler) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(models.UserContextKey).(*models.User)
	if !ok {
		ErrorJSON(w, http.StatusUnauthorized, "User context not found")
		return
	}

	var keys []models.APIKey
	if err := h.DB.Where("user_id = ?", user.ID).Find(&keys).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error fetching keys")
		return
	}

	resp := make([]apiKeyResponse, 0, len(keys))
	for _, k := range keys {
		resp = append(resp, apiKeyResponse{APIKey: k, KeyPrefix: keyPrefix(k.Key)}) // Key omitted (omitempty)
	}
	WriteJSON(w, http.StatusOK, resp)
}

// RevokeAPIKey permanently deletes an API key. Scoped to the current user —
// a user can only revoke their own keys, never another user's.
func (h *UserHandler) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	user, ok := r.Context().Value(models.UserContextKey).(*models.User)
	if !ok {
		ErrorJSON(w, http.StatusUnauthorized, "User context not found")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid key ID")
		return
	}

	result := h.DB.Where("id = ? AND user_id = ?", id, user.ID).Delete(&models.APIKey{})
	if result.Error != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error revoking key")
		return
	}
	if result.RowsAffected == 0 {
		ErrorJSON(w, http.StatusNotFound, "API key not found")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "API key revoked"})
}

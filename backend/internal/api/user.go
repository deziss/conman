package api

import (
	"conman-backend/internal/models"
	"crypto/rand"
	"encoding/hex"
	"net/http"

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

type CreateAPIKeyRequest struct {
	Name string `json:"name"`
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := ReadJSON(r, &req); err != nil {
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
	if err := ReadJSON(r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request")
		return
	}

	// Generate random key
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error generating key")
		return
	}
	keyString := hex.EncodeToString(bytes)

	apiKey := models.APIKey{
		Key:    "cm_" + keyString, // Prefix for identification
		Name:   req.Name,
		UserID: user.ID,
		Role:   user.Role, // Inherit current role
        ExpiresAt: 0, // No expiry for now
	}

	if err := h.DB.Create(&apiKey).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Error saving API key")
		return
	}

	WriteJSON(w, http.StatusCreated, apiKey)
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
	WriteJSON(w, http.StatusOK, keys)
}

func (h *UserHandler) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	// Implementation for deleting/revoking key
    // TODO: Parse ID from URL and delete
}

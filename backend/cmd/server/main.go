package main

import (
	"conman-backend/internal/api"
	"conman-backend/internal/authz"
	"conman-backend/internal/config"
	"conman-backend/internal/middleware"
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	// 1. Load Config
	config.LoadConfig()

	// 2. Init Docker Client
	service.InitDockerClient()
    service.InitStatsCollector()

	// 3. Init Database
	db, err := gorm.Open(sqlite.Open(config.AppConfig.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto Migrate
	err = db.AutoMigrate(&models.User{}, &models.APIKey{}, &models.Environment{})
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Seed Admin User (Upsert based on email)
    // This allows resetting password via ENV variables on restart
    hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(config.AppConfig.AdminPassword), bcrypt.DefaultCost)
    adminEmail := config.AppConfig.AdminEmail
    
    var existingUser models.User
    if err := db.Where("email = ?", adminEmail).First(&existingUser).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            // Create new admin
            admin := models.User{
                Email:    adminEmail,
                Password: string(hashedPassword),
                FullName: "Admin User",
                Role:     "admin",
            }
            db.Create(&admin)
            log.Printf("Seeded initial admin user: %s", adminEmail)
        }
    } else {
        // Update existing admin password to match ENV (Reset mechanism)
        existingUser.Password = string(hashedPassword)
        // Ensure role is admin
        existingUser.Role = "admin" 
        db.Save(&existingUser)
        log.Printf("Updated admin user credentials for: %s", adminEmail)
    }

    // 4. Init Casbin (Database Adapter)
    authz.InitCasbin(db)

	// 5. Setup Router (Chi)
	r := chi.NewRouter()

    // Middleware
    r.Use(chiMiddleware.Logger)
    r.Use(chiMiddleware.Recoverer)

	// CORS
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   config.AppConfig.CorsOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
        AllowedHeaders:   []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Master-Key", "X-API-Key"},
        ExposedHeaders:   []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

	// API v1 Group
	r.Route("/api/v1", func(r chi.Router) {
        // Handlers
        authHandler := api.NewAuthHandler(db)
        userHandler := api.NewUserHandler(db)
        containerHandler := api.NewContainerHandler()
        dockerHandler := api.NewDockerHandler()
        networkHandler := api.NewNetworkHandler()
        volumeHandler := api.NewVolumeHandler()
        environmentHandler := api.NewEnvironmentHandler(db)
        agentHandler := api.NewAgentHandler()
        
        // Middleware Instance
        mw := middleware.NewMiddleware(db)

        // Public Routes
		r.Post("/auth/login", authHandler.Login)

        // Protected Routes
        r.Group(func(r chi.Router) {
            r.Use(mw.AuthMiddleware)

            // User Management
            r.Route("/users", func(r chi.Router) {
                // Only Admin can list/create users
                r.Use(mw.RequirePermission("users", "write"))
                r.Get("/", userHandler.ListUsers)
                r.Post("/", userHandler.CreateUser)
                r.Post("/", userHandler.CreateUser)
            })

            // Environments
            r.Route("/environments", func(r chi.Router) {
                // TODO: Add permissions later, for now admin/write?
                r.Get("/", environmentHandler.ListEnvironments)
                r.Post("/", environmentHandler.CreateEnvironment)
                r.Delete("/{id}", environmentHandler.DeleteEnvironment)
            })

            // Profile / API Keys (Self Service)
            r.Route("/profile", func(r chi.Router) {
                // Any authenticated user should be able to manage their own keys?
                // Or maybe permissions? Let's say basic auth is enough for self-profile
                 r.Get("/keys", userHandler.ListAPIKeys)
                 r.Post("/keys", userHandler.GenerateAPIKey)
                 r.Delete("/keys/{id}", userHandler.RevokeAPIKey)
            })



            // Docker System
            // Docker System
            // Docker System


            // Docker System
            r.Route("/docker", func(r chi.Router) {
                // Images Subgroup
                r.Group(func(r chi.Router) {
                    r.Use(mw.RequirePermission("images", "read"))
                    r.Get("/images", dockerHandler.ListImages) 
                    r.Get("/images/{id}", dockerHandler.InspectImage)
                    r.Get("/system/info", dockerHandler.GetSystemInfo)
                    r.Get("/system/df", dockerHandler.GetSystemDF)
                    r.Get("/system/stats", dockerHandler.GetSystemStats)
                    r.Get("/images/{id}/check-update", dockerHandler.CheckUpdate)

                    r.Group(func(r chi.Router) {
                        r.Use(mw.RequirePermission("images", "write"))
                        r.Delete("/images/{id}", dockerHandler.RemoveImage)
                        r.Post("/images/pull", dockerHandler.PullImage)
                        r.Post("/prune/containers", dockerHandler.PruneContainers)
                        r.Post("/prune/images", dockerHandler.PruneImages)
                    })
                })

                // Containers Subgroup (Re-integrated correctly)
                r.Get("/containers", mw.RequirePermission("containers", "read")(http.HandlerFunc(containerHandler.ListContainers)).ServeHTTP)
                
                r.Route("/containers/{id}", func(r chi.Router) {
                     r.Use(mw.RequirePermission("containers", "read"))
                     r.Get("/", containerHandler.InspectContainer)
                     r.Get("/logs", containerHandler.StreamLogs)
                     r.Get("/stats", containerHandler.StreamStats)

                     r.Group(func(r chi.Router) {
                         r.Use(mw.RequirePermission("containers", "write"))
                         r.Get("/exec", containerHandler.StreamExec) 
                         r.Post("/start", containerHandler.StartContainer)
                         r.Post("/stop", containerHandler.StopContainer)
                         r.Post("/pause", containerHandler.PauseContainer)
                         r.Post("/unpause", containerHandler.UnpauseContainer)
                         r.Post("/restart", containerHandler.RestartContainer)
                         r.Delete("/", containerHandler.RemoveContainer)
                     })
                })


            })

            // Docker Networks
            r.Route("/docker/networks", func(r chi.Router) {
                r.Use(mw.RequirePermission("networks", "read"))
                r.Get("/", networkHandler.ListNetworks)
                
                r.Group(func(r chi.Router) {
                     r.Use(mw.RequirePermission("networks", "write"))
                     r.Post("/", networkHandler.CreateNetwork)
                     r.Delete("/{id}", networkHandler.RemoveNetwork)
                })
            })

            // Docker Volumes
            r.Route("/docker/volumes", func(r chi.Router) {
                 r.Use(mw.RequirePermission("volumes", "read"))
                 r.Get("/", volumeHandler.ListVolumes)
                 
                 r.Group(func(r chi.Router) {
                     r.Use(mw.RequirePermission("volumes", "write"))
                     r.Post("/", volumeHandler.CreateVolume)
                     r.Delete("/{name}", volumeHandler.RemoveVolume)
                     r.Post("/prune", volumeHandler.PruneVolumes)
                 })
            })

            // Agent Management (Multi-Host)
            agentHandler.RegisterRoutes(r)
        })
	})

	// Health Check endpoint (public)
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Serve static frontend files if STATIC_DIR is set
	if config.AppConfig.StaticDir != "" {
		staticDir := config.AppConfig.StaticDir
		log.Printf("Serving static files from: %s", staticDir)

		// Serve static assets
		fileServer := http.FileServer(http.Dir(staticDir))
		
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			
			// Check if file exists
			fullPath := filepath.Join(staticDir, path)
			if _, err := os.Stat(fullPath); err == nil {
				// File exists, serve it
				fileServer.ServeHTTP(w, r)
				return
			}
			
			// For SPA routing: if path doesn't start with /api, serve index.html
			if !strings.HasPrefix(path, "/api") {
				http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
				return
			}
			
			// API route not found
			http.NotFound(w, r)
		})
	}

	// Start Server
	log.Printf("Server running on port %s", config.AppConfig.Port)
	if err := http.ListenAndServe(":"+config.AppConfig.Port, r); err != nil {
		log.Fatal("Failed to run server:", err)
	}
}

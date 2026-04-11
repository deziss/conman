package main

import (
	"conman-backend/internal/alerts"
	"conman-backend/internal/api"
	"conman-backend/internal/authz"
	"conman-backend/internal/config"
	"conman-backend/internal/metrics"
	"conman-backend/internal/middleware"
	"conman-backend/internal/observability"
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	// 1. Load Config
	config.LoadConfig()

	// 2. Init Docker Client
	service.InitDockerClient()
    service.InitStatsCollector()

	// 3. Init Database (supports SQLite and PostgreSQL)
	var (
		db  *gorm.DB
		err error
	)
	switch config.AppConfig.DatabaseDriver {
	case "postgres":
		db, err = gorm.Open(postgres.Open(config.AppConfig.DatabaseDSN), &gorm.Config{})
		if err != nil {
			log.Fatal("Failed to connect to PostgreSQL:", err)
		}
		log.Println("Connected to PostgreSQL database")
	default:
		db, err = gorm.Open(sqlite.Open(config.AppConfig.DatabaseURL), &gorm.Config{})
		if err != nil {
			log.Fatal("Failed to connect to SQLite database:", err)
		}
		log.Println("Connected to SQLite database:", config.AppConfig.DatabaseURL)
	}

	// Configure connection pool
	if sqlDB, poolErr := db.DB(); poolErr == nil {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
	}

	// Auto Migrate
	err = db.AutoMigrate(&models.User{}, &models.APIKey{}, &models.Environment{}, &models.Agent{}, &models.Stack{}, &models.AgentSnapshot{}, &models.AlertRule{}, &models.AlertChannel{}, &models.AlertEvent{})
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
        } else {
             // Force update for recovery
             existingUser.Password = string(hashedPassword)
             db.Save(&existingUser)
        }
    } else {
        // Update existing admin password to match ENV (Reset mechanism)
        existingUser.Password = string(hashedPassword)
        // Ensure role is admin
        existingUser.Role = "admin" 
        db.Save(&existingUser)
        log.Printf("Updated admin user credentials for: %s", adminEmail)
    }

    // 4. Init Metrics Store
    metricsStore := metrics.NewMetricsStore(db, config.AppConfig.DatabaseDriver)
    if err := metricsStore.InitSchema(); err != nil {
        log.Printf("Warning: metrics schema init failed: %v", err)
    }

    // Metrics cleanup job (every 6 hours, retain 30 days)
    go func() {
        ticker := time.NewTicker(6 * time.Hour)
        defer ticker.Stop()
        for range ticker.C {
            rows, err := metricsStore.Cleanup(30 * 24 * time.Hour)
            if err != nil {
                log.Printf("Metrics cleanup error: %v", err)
            } else if rows > 0 {
                log.Printf("Cleaned up %d old metric points", rows)
            }
        }
    }()

    // 5. Init Casbin (Database Adapter)
    authz.InitCasbin(db)

	// 5. Setup Router (Chi)
	r := chi.NewRouter()

    // Middleware
    r.Use(chiMiddleware.Logger)
    r.Use(chiMiddleware.Recoverer)
    r.Use(observability.ChiMiddleware)

	// CORS
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   config.AppConfig.CorsOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
        AllowedHeaders:   []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Master-Key", "X-API-Key", "X-Agent-Token"},
        ExposedHeaders:   []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

	// Handlers (hoisted for use by alert evaluator)
	agentHandler := api.NewAgentHandler(db, metricsStore)

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
        
        // Middleware Instance
        mw := middleware.NewMiddleware(db)

        // Public Routes
		r.Post("/auth/login", authHandler.Login)
        
        // Agent Routes (registration, heartbeat, report - secured with agent PSK)
        r.Group(func(r chi.Router) {
            r.Use(middleware.AgentAuthMiddleware)
            agentHandler.RegisterPublicRoutes(r)
        })

        // Protected Routes
        r.Group(func(r chi.Router) {
            r.Use(mw.AuthMiddleware)

            // User Management
            r.Route("/users", func(r chi.Router) {
                // Only Admin can list/create users
                r.Use(mw.RequirePermission("users", "write"))
                r.Get("/", userHandler.ListUsers)
                r.Post("/", userHandler.CreateUser)
                r.Put("/{id}", userHandler.UpdateUser)
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
                         r.Get("/files", containerHandler.ListContainerFiles)
                         r.Get("/files/download", containerHandler.DownloadContainerFile)
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
                     r.Post("/{id}/duplicate", networkHandler.DuplicateNetwork)
                     r.Post("/{id}/connect", networkHandler.ConnectContainer)
                     r.Post("/{id}/disconnect", networkHandler.DisconnectContainer)
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
                     r.Post("/{name}/browse", volumeHandler.BrowseVolume)
                 })
            })

            // Stacks
            stackHandler := api.NewStackHandler(db)
            r.Route("/stacks", func(r chi.Router) {
                // Permissions?
                r.Get("/", stackHandler.ListStacks)
                r.Post("/", stackHandler.CreateStack)
                r.Get("/{id}", stackHandler.GetStack)
                r.Put("/{id}", stackHandler.UpdateStack)
                r.Post("/{id}/stop", stackHandler.StopStack)
                r.Delete("/{id}", stackHandler.DeleteStack)
            })

            // Agent Management (Multi-Host)
            agentHandler.RegisterRoutes(r)

            // Alert Management
            alertHandler := api.NewAlertHandler(db)
            alertHandler.RegisterRoutes(r)
        })
	})

	// Health Check endpoint (public)
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		status := "healthy"
		checks := map[string]string{}

		// Check database connectivity
		sqlDB, err := db.DB()
		if err != nil {
			status = "unhealthy"
			checks["database"] = "error: " + err.Error()
		} else if err := sqlDB.Ping(); err != nil {
			status = "unhealthy"
			checks["database"] = "error: " + err.Error()
		} else {
			checks["database"] = "ok"
		}

		// Check Docker daemon connectivity
		dockerClient := service.GetDockerClient()
		if dockerClient == nil {
			if status == "healthy" {
				status = "degraded"
			}
			checks["docker"] = "error: client not initialized"
		} else if _, err := dockerClient.Ping(r.Context()); err != nil {
			if status == "healthy" {
				status = "degraded"
			}
			checks["docker"] = "error: " + err.Error()
		} else {
			checks["docker"] = "ok"
		}

		httpStatus := http.StatusOK
		if status == "unhealthy" {
			httpStatus = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(httpStatus)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": status,
			"checks": checks,
		})
	})

	// Prometheus metrics endpoint (public)
	r.Handle("/metrics", observability.MetricsHandler())

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
			
			// Static assets (JS/CSS/images) that don't exist should 404, not serve index.html
			if strings.HasPrefix(path, "/assets/") {
				http.NotFound(w, r)
				return
			}

			// For SPA routing: all other non-API paths serve index.html
			if !strings.HasPrefix(path, "/api") {
				http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
				return
			}

			// API route not found
			http.NotFound(w, r)
		})
	}

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Start Alert Evaluator (background, respects shutdown)
	alertEvaluator := alerts.NewEvaluator(db, agentHandler)
	go alertEvaluator.Run(ctx)

	// Auto-detect local host
	go service.DetectAndRegisterLocalAgent(db, agentHandler)

	// Start Server with timeouts
	srv := &http.Server{
		Addr:         ":" + config.AppConfig.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Server running on port %s", config.AppConfig.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server error:", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down gracefully...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Shutdown error: %v", err)
	}
	log.Println("Server stopped")
}

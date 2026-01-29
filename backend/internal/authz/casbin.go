package authz

import (
	"log"

	"github.com/casbin/casbin/v3"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"gorm.io/gorm"
)

var Enforcer *casbin.Enforcer

func InitCasbin(db *gorm.DB) {
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		log.Fatal("Failed to create casbin adapter:", err)
	}

	enforcer, err := casbin.NewEnforcer("internal/authz/model.conf", adapter)
	if err != nil {
		log.Fatal("Failed to create casbin enforcer:", err)
	}

	if err := enforcer.LoadPolicy(); err != nil {
		log.Fatal("Failed to load casbin policy:", err)
	}

	Enforcer = enforcer
    
    // Define default policies if empty (Optional, but good for bootstrapping)
    // admin has all permissions
    Enforcer.AddPolicy("admin", "*", "*")
    // viewer has read access to containers
    Enforcer.AddPolicy("viewer", "containers", "read")
    // operator has read/write access to containers
    Enforcer.AddPolicy("operator", "containers", "*")
    Enforcer.SavePolicy()
}

func CheckPermission(sub, obj, act string) (bool, error) {
	return Enforcer.Enforce(sub, obj, act)
}

package service

import (
	"fmt"
	"github.com/docker/docker/api/types"
)

// FormatPort formats a docker port mapping into a readable string
func FormatPort(p types.Port) string {
	if p.PublicPort != 0 {
		return fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, p.Type)
	}
	return fmt.Sprintf("%d/%s", p.PrivatePort, p.Type)
}

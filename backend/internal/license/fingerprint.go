package license

import (
	"crypto/sha256"
	"fmt"
	"net"
	"os"
	"sort"
)

// GenerateFingerprint creates a stable, unique machine fingerprint
// by hashing the hostname and the first non-loopback MAC address.
func GenerateFingerprint() string {
	hostname, _ := os.Hostname()

	mac := firstMACAddress()

	raw := fmt.Sprintf("conman:%s:%s", hostname, mac)
	hash := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", hash)
}

func firstMACAddress() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "unknown"
	}

	// Sort for determinism
	sort.Slice(interfaces, func(i, j int) bool {
		return interfaces[i].Name < interfaces[j].Name
	})

	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if len(iface.HardwareAddr) == 0 {
			continue
		}
		return iface.HardwareAddr.String()
	}
	return "no-mac"
}

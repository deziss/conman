package agent

import (
	"bufio"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"

	"conman-agent/pkg/protocol"
)

const (
	bufferDir      = "/var/lib/conman-agent"
	bufferFileName = "report-buffer.jsonl"
	maxBufferSize  = 100 // Max reports to buffer
)

// ReportBuffer provides on-disk buffering of failed report pushes.
// Reports are stored as JSON-lines in a single file. On successful push,
// the buffer is drained by re-sending buffered reports.
type ReportBuffer struct {
	mu   sync.Mutex
	path string
}

// NewReportBuffer creates a buffer, creating the directory if needed.
func NewReportBuffer() *ReportBuffer {
	os.MkdirAll(bufferDir, 0755)
	return &ReportBuffer{
		path: filepath.Join(bufferDir, bufferFileName),
	}
}

// Enqueue appends a failed report to the buffer file.
func (b *ReportBuffer) Enqueue(report protocol.AgentReport) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Check current buffer size
	count := b.countLocked()
	if count >= maxBufferSize {
		log.Printf("Report buffer full (%d/%d), dropping oldest", count, maxBufferSize)
		b.trimLocked()
	}

	f, err := os.OpenFile(b.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Failed to open report buffer file: %v", err)
		return
	}
	defer f.Close()

	data, err := json.Marshal(report)
	if err != nil {
		log.Printf("Failed to marshal report for buffer: %v", err)
		return
	}

	f.Write(data)
	f.Write([]byte("\n"))
}

// Drain reads all buffered reports and clears the buffer.
// Returns nil if the buffer is empty or on read error.
func (b *ReportBuffer) Drain() []protocol.AgentReport {
	b.mu.Lock()
	defer b.mu.Unlock()

	f, err := os.Open(b.path)
	if err != nil {
		return nil // No buffer file or can't read — nothing to drain
	}
	defer f.Close()

	var reports []protocol.AgentReport
	scanner := bufio.NewScanner(f)
	// Increase buffer size for large reports
	scanner.Buffer(make([]byte, 0, 512*1024), 512*1024)
	for scanner.Scan() {
		var report protocol.AgentReport
		if err := json.Unmarshal(scanner.Bytes(), &report); err != nil {
			continue // Skip malformed lines
		}
		reports = append(reports, report)
	}

	// Clear the buffer file
	f.Close()
	os.Remove(b.path)

	if len(reports) > 0 {
		log.Printf("Drained %d buffered reports", len(reports))
	}

	return reports
}

// Size returns the number of buffered reports.
func (b *ReportBuffer) Size() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.countLocked()
}

func (b *ReportBuffer) countLocked() int {
	f, err := os.Open(b.path)
	if err != nil {
		return 0
	}
	defer f.Close()

	count := 0
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		count++
	}
	return count
}

// trimLocked removes the oldest entries to make room, keeping the newest half.
func (b *ReportBuffer) trimLocked() {
	f, err := os.Open(b.path)
	if err != nil {
		return
	}

	var lines []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 512*1024), 512*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	f.Close()

	// Keep the newest half
	keep := len(lines) / 2
	if keep < 1 {
		keep = 1
	}
	lines = lines[len(lines)-keep:]

	out, err := os.Create(b.path)
	if err != nil {
		return
	}
	defer out.Close()

	for _, line := range lines {
		out.WriteString(line + "\n")
	}
}

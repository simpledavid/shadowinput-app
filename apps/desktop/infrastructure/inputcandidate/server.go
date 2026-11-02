// Package inputcandidate serves bounded, opt-in AI requests from native input methods.
// No keystrokes, document context, candidates or credentials are logged or persisted.
package inputcandidate

import (
	"arion.local/core/domain"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Generate func(context.Context, string) (string, error)

type Server struct {
	enabled     bool
	address     string
	mu          sync.Mutex
	cancel      context.CancelFunc
	epoch       uint64
	token, file string
	http        *http.Server
	generate    Generate
	policy      requestPolicy
}

// Start binds only an OS-assigned loopback port. The per-launch capability is
// stored with user-only permissions; browsers are refused even with a token.
func Start(directory string, generate Generate) (*Server, error) {
	return start(directory, generate, requestPolicy{path: "/candidate", file: "candidate.endpoint", limit: 1024, budget: 2 * time.Second,
		validInput:  domain.ValidPhraseContext,
		validResult: ValidResult})
}

type requestPolicy struct {
	path, file  string
	limit       int64
	budget      time.Duration
	validInput  func(string) bool
	validResult func(string, string) bool
}

func start(directory string, generate Generate, policy requestPolicy) (*Server, error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	s := &Server{enabled: true, address: listener.Addr().String(), token: rand.Text(), file: filepath.Join(directory, policy.file), generate: generate, policy: policy}
	s.http = &http.Server{Handler: http.HandlerFunc(s.serve), ReadHeaderTimeout: time.Second, ReadTimeout: 2 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: time.Second, MaxHeaderBytes: 4096}
	if err = os.MkdirAll(directory, 0700); err == nil {
		err = os.WriteFile(s.file, []byte(listener.Addr().String()+"\n"+s.token+"\n"), 0600)
	}
	if err != nil {
		listener.Close()
		return nil, err
	}
	if err = os.Chmod(s.file, 0600); err != nil {
		listener.Close()
		os.Remove(s.file)
		return nil, err
	}
	go s.http.Serve(listener)
	return s, nil
}

// SetEnabled removes discovery when disabled and cancels in-flight inference.
func (s *Server) SetEnabled(enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.enabled == enabled {
		return nil
	}
	s.epoch++
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	if !enabled {
		s.enabled = false
		return os.Remove(s.file)
	}
	if err := os.WriteFile(s.file, []byte(s.address+"\n"+s.token+"\n"), 0600); err != nil {
		return err
	}
	s.enabled = true
	return nil
}

func (s *Server) Revoke() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.epoch++
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
}
func (s *Server) Close() { s.Revoke(); s.http.Close(); os.Remove(s.file) }
func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if r.Method != "POST" || r.URL.Path != s.policy.path || r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") != "" ||
		subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+s.token)) != 1 {
		http.Error(w, "unavailable", http.StatusForbidden)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, s.policy.limit+1))
	text := strings.TrimSpace(string(body))
	if err != nil || int64(len(body)) > s.policy.limit || !s.policy.validInput(text) {
		http.Error(w, "invalid candidate request", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.policy.budget)
	defer cancel()
	s.mu.Lock()
	if !s.enabled {
		s.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if s.cancel != nil {
		s.cancel()
	}
	s.epoch++
	epoch := s.epoch
	s.cancel = cancel
	s.mu.Unlock()
	result, err := s.generate(ctx, text)
	s.mu.Lock()
	current := s.epoch == epoch
	if current {
		s.cancel = nil
	}
	s.mu.Unlock()
	if err != nil || ctx.Err() != nil || !current || !s.policy.validResult(text, result) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	io.WriteString(w, result)
}

// ValidResult is the phrase wire contract shared with the domain selector.
func ValidResult(source, result string) bool { return domain.ValidPhraseSuffix(source, result) }

var ErrUnavailable = errors.New("AI candidates unavailable")

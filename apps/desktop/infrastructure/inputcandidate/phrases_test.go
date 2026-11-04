package inputcandidate

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func phraseResponse(server *Server, source string) (int, string) {
	req, _ := http.NewRequest("POST", "http://"+server.address+server.policy.path, strings.NewReader(source))
	req.Header.Set("Authorization", "Bearer "+server.token)
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, ""
	}
	defer r.Body.Close()
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return 0, ""
	}
	return r.StatusCode, string(body)
}

func TestPhraseLookupDoesNotWaitForOrCancelModel(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	p, err := StartPhrases(t.TempDir(), func(context.Context, string) (string, error) { return "负责人", nil }, func(ctx context.Context, _ string) (string, error) {
		close(started)
		select {
		case <-release:
			return "会议", nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	})
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	done := make(chan string, 1)
	go func() { _, body := phraseResponse(p.model, "部门"); done <- body }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("model not started")
	}
	status, body := phraseResponse(p.lookup, "部门")
	if status != 200 || body != "负责人" {
		t.Fatalf("lookup blocked by model: %d %q", status, body)
	}
	close(release)
	select {
	case got := <-done:
		if got != "会议" {
			t.Fatalf("lookup canceled model: %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("model did not complete")
	}
}

func TestPhraseOptOutRevokesBothRequestsAndDiscovery(t *testing.T) {
	started := make(chan struct{}, 2)
	generate := func(ctx context.Context, _ string) (string, error) {
		started <- struct{}{}
		<-ctx.Done()
		return "迟到", nil
	}
	p, err := StartPhrases(t.TempDir(), generate, generate)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	done := make(chan int, 2)
	for _, server := range []*Server{p.lookup, p.model} {
		go func() { status, _ := phraseResponse(server, "部门"); done <- status }()
	}
	for i := 0; i < 2; i++ {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("lane not started")
		}
	}
	if err := p.SetEnabled(false); err != nil {
		t.Fatal(err)
	}
	for _, server := range []*Server{p.lookup, p.model} {
		if _, err := os.Stat(server.file); !os.IsNotExist(err) {
			t.Fatal("opt-out left discovery")
		}
	}
	for i := 0; i < 2; i++ {
		select {
		case status := <-done:
			if status != 204 {
				t.Fatalf("late result delivered: %d", status)
			}
		case <-time.After(time.Second):
			t.Fatal("lane not canceled")
		}
	}
}

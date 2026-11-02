package shadowinput

import (
	"arion.local/core/contracts"
	"arion.local/desktop/infrastructure/inputcandidate"
	"arion.local/desktop/infrastructure/rewriting"
	"arion.local/desktop/ui/shared/copy"
	state "arion.local/desktop/ui/shared/writing"
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type rankRuntime struct {
	mu      sync.Mutex
	ready   bool
	block   chan struct{}
	started chan struct{}
}

func (r *rankRuntime) Status() rewriting.Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ready {
		return rewriting.Status{State: rewriting.Ready}
	}
	return rewriting.Status{State: rewriting.Off}
}
func (r *rankRuntime) Enable(ctx context.Context) error {
	if r.started != nil {
		close(r.started)
	}
	if r.block != nil {
		select {
		case <-r.block:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	r.mu.Lock()
	r.ready = true
	r.mu.Unlock()
	return nil
}
func (r *rankRuntime) Disable() { r.mu.Lock(); r.ready = false; r.mu.Unlock() }
func (r *rankRuntime) RankKeyboard(context.Context, contracts.KeyboardRankRequest) (contracts.KeyboardRankResult, error) {
	return contracts.KeyboardRankResult{}, inputcandidate.ErrUnavailable
}
func rankApp(t *testing.T, r *rankRuntime) (*app, chan func()) {
	t.Helper()
	queue := make(chan func(), 8)
	a := &app{s: state.NewState(), directory: t.TempDir(), fastRanker: r, dispatch: func(fn func()) { queue <- fn }}
	var err error
	a.rankingServer, err = inputcandidate.StartRanking(a.directory, r)
	if err != nil {
		t.Fatal(err)
	}
	_ = a.rankingServer.SetEnabled(false)
	t.Cleanup(a.closeRanking)
	return a, queue
}
func TestRankingOptInDoesNotNeedQwenOrAccount(t *testing.T) {
	r := &rankRuntime{}
	a, queue := rankApp(t, r)
	a.s.AICandidates = true
	a.configureRanking()
	<-a.rankDone
	(<-queue)()
	if _, err := os.Stat(filepath.Join(a.directory, "ranking.endpoint")); err != nil {
		t.Fatal("no fast lane without Qwen", err)
	}
	if a.s.RankingStatus != copy.ShadowRankReady || a.s.CanSuggest() {
		t.Fatal("ranking readiness incorrectly tied to continuation")
	}
	a.s.AICandidates = false
	a.configureRanking()
	if _, err := os.Stat(filepath.Join(a.directory, "ranking.endpoint")); !os.IsNotExist(err) {
		t.Fatal("opt-out kept discovery")
	}
	<-a.rankDone
	(<-queue)()
	if r.Status().State == rewriting.Ready {
		t.Fatal("worker survived opt-out")
	}
}
func TestRankingDisableDuringStartupCannotRepublishEndpoint(t *testing.T) {
	r := &rankRuntime{block: make(chan struct{}), started: make(chan struct{})}
	a, queue := rankApp(t, r)
	a.s.AICandidates = true
	a.configureRanking()
	<-r.started
	a.s.AICandidates = false
	a.configureRanking()
	<-a.rankDone
	for len(queue) > 0 {
		(<-queue)()
	}
	if _, err := os.Stat(filepath.Join(a.directory, "ranking.endpoint")); !os.IsNotExist(err) {
		t.Fatal("late startup resurrected disabled ranking")
	}
	if a.s.RankingStatus != copy.ShadowRankOff {
		t.Fatal("late startup overwrote off status")
	}
}

func TestRankingLifecycleFinishesBeforeSynchronousUIDelivery(t *testing.T) {
	r := &rankRuntime{}
	a, _ := rankApp(t, r)
	entered, release := make(chan struct{}), make(chan struct{})
	a.dispatch = func(fn func()) { close(entered); <-release }
	defer close(release)
	a.s.AICandidates = true
	a.configureRanking()
	<-entered
	select {
	case <-a.rankDone:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("quit would deadlock waiting for a worker blocked on the UI thread")
	}
}

package inputcandidate

import (
	"arion.local/desktop/infrastructure/keyboardmodel"
	"context"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestNativeRankingLoopback(t *testing.T) {
	fixture := os.Getenv("SHADOWINPUT_RANKING_NATIVE_FIXTURE")
	if fixture == "" {
		t.Skip("explicit native fixture and bundled model required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	worker, err := keyboardmodel.Open(ctx, os.Getenv("ARION_TEST_KEYBOARD_BINARY"), os.Getenv("ARION_TEST_KEYBOARD_MODEL"))
	if err != nil {
		t.Fatal(err)
	}
	defer worker.Close()
	dir := t.TempDir()
	server, err := StartRanking(dir, worker)
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	command := exec.CommandContext(ctx, fixture, os.Getenv("SHADOWINPUT_RANKING_RIME_DATA"), t.TempDir(), dir)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("native ranking: %v\n%s", err, output)
	} else {
		t.Log("real native ranking/commit/cancellation passed")
	}
}

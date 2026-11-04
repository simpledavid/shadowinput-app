package shadowinput

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"arion.local/core/domain"
	"arion.local/desktop/infrastructure/provision"
	"arion.local/desktop/infrastructure/rewriting"
	state "arion.local/desktop/ui/shared/writing"
	"arion.local/models"
)

// Opt-in synthetic requests, isolated profile and worker, no installed app IPC.
// This is a small inference smoke check, not a language-quality benchmark.
func TestNativeInputPhrases(t *testing.T) {
	dir, model := os.Getenv("SHADOWINPUT_LLM_RUNTIME"), os.Getenv("SHADOWINPUT_LLM_MODEL")
	if dir == "" || model == "" {
		t.Skip("pinned local runtime and verified model required")
	}
	catalog, err := models.Load()
	if err != nil {
		t.Fatal(err)
	}
	local := rewriting.New(catalog, provision.NewStore(filepath.Dir(filepath.Dir(model))), dir, 4, runtime.GOOS+"-"+runtime.GOARCH)
	defer local.Disable()
	local.Refresh()
	if !local.Status().Installed {
		t.Fatal("verified model required at models/<catalog-id>/<file>")
	}
	a := &app{s: state.NewState(), local: local, directory: t.TempDir(), dispatch: func(fn func()) { fn() }}
	a.s.Profile, a.s.ProfileReady, a.s.AICandidates = domain.DefaultWritingProfile(), true, true
	if got, err := a.lookupPhrase(context.Background(), "部门"); err != nil || got != "负责人" || local.Ready() {
		t.Fatalf("dictionary requires model: %q %v", got, err)
	}
	start, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := local.Enable(start); err != nil {
		t.Fatal(err)
	}
	if !local.Ready() {
		t.Fatal("explicit model start did not become ready")
	}
	a.applyLocalStatus()
	for _, source := range []string{"部门", "公司", "会议", "项目", "办公室", "我们部门", "明天我们", "麻烦帮我"} {
		ctx, stop := context.WithTimeout(context.Background(), 2*time.Second)
		began := time.Now()
		got, err := a.candidate(ctx, source)
		stop()
		t.Logf("synthetic %q => %q elapsed=%s err=%v", source, got, time.Since(began).Round(time.Millisecond), err)
		if err != nil || !domain.ValidGeneratedPhrase(source, got) {
			t.Errorf("no complete bounded model continuation for synthetic context")
		}
	}
}

package shadowinput

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"arion.local/core/domain"
	"arion.local/desktop/infrastructure/chatgptplan"
	"arion.local/desktop/infrastructure/inputcandidate"
	"arion.local/desktop/infrastructure/llm/engine"
	"arion.local/desktop/infrastructure/llm/prompt"
	"arion.local/desktop/infrastructure/rewriting"
	state "arion.local/desktop/ui/shared/writing"
)

type candidateAccountStore struct{ session chatgptplan.Session }

func (s *candidateAccountStore) Load() (chatgptplan.Session, error) { return s.session, nil }
func (s *candidateAccountStore) Save(v chatgptplan.Session) error   { s.session = v; return nil }

type candidateTransport func(*http.Request) (*http.Response, error)

func (f candidateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestAutomaticCandidateNeverFallsBackToChatGPT(t *testing.T) {
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	calls := 0
	http.DefaultTransport = candidateTransport(func(*http.Request) (*http.Response, error) {
		calls++
		return nil, errors.New("unexpected cloud request")
	})
	client, err := chatgptplan.New(&candidateAccountStore{session: chatgptplan.Session{
		ClientID: "test-client", Subject: "test-subject", ExpiresAt: time.Now().Add(time.Hour),
		Tokens: chatgptplan.Tokens{Access: "test-only", Refresh: "test-only", Scope: "chatgpt.tokens.use.direct"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	a := &app{s: state.NewState(), client: client, dispatch: func(fn func()) { fn() }}
	a.s.Provider, a.s.Model = state.ProviderChatGPT, "test-model"
	a.s.Connected, a.s.ProfileReady, a.s.AICandidates = true, true, true
	_, err = a.candidate(context.Background(), "明天我们")
	if calls != 0 || !errors.Is(err, inputcandidate.ErrUnavailable) {
		t.Fatalf("automatic input reached cloud: calls=%d err=%v", calls, err)
	}
	if !a.s.Connected {
		t.Fatal("local candidate changed the writing account")
	}
}

type candidateLocal struct {
	ready            bool
	calls, downloads int
	request          prompt.ChatRequest
	result           string
}

func (l *candidateLocal) Complete(_ context.Context, r prompt.ChatRequest) (engine.Result, error) {
	l.calls++
	l.request = r
	if l.result != "" {
		return engine.Result{Text: l.result}, nil
	}
	return engine.Result{Text: "一起讨论"}, nil
}
func (l *candidateLocal) Ready() bool { return l.ready }
func (l *candidateLocal) Status() rewriting.Status {
	if l.ready {
		return rewriting.Status{State: rewriting.Ready, Installed: true}
	}
	return rewriting.Status{State: rewriting.Off}
}
func (l *candidateLocal) OnStatus(func(rewriting.Status)) {}
func (l *candidateLocal) Refresh()                        {}
func (l *candidateLocal) Enable(context.Context) error    { l.ready = true; return nil }
func (l *candidateLocal) Download(context.Context) error  { l.downloads++; return nil }
func (l *candidateLocal) Disable()                        { l.ready = false }

func TestLocalCandidateIndependentOfWritingAccount(t *testing.T) {
	local := &candidateLocal{ready: true}
	a := &app{s: state.NewState(), local: local, dispatch: func(fn func()) { fn() }}
	a.s.Provider = state.ProviderChatGPT // Logged out; the writing account must not gate local input.
	a.s.ProfileReady, a.s.AICandidates = true, true
	a.applyLocalStatus()
	got, err := a.candidate(context.Background(), "明天我们")
	if err != nil || got != "一起讨论" || local.calls != 1 || local.downloads != 0 {
		t.Fatalf("%q %v calls=%d", got, err, local.calls)
	}
	if local.request.MaxTokens > 64 || local.request.Messages[1].Content != "明天我们" {
		t.Fatal("wrong local continuation request")
	}
	a.s.Busy = true
	if _, err = a.candidate(context.Background(), "明天我们"); !errors.Is(err, inputcandidate.ErrUnavailable) {
		t.Fatal("candidate interrupted explicit writing")
	}
	a.s.Busy = false
	a.s.AICandidates = false
	if _, err = a.candidate(context.Background(), "明天我们"); !errors.Is(err, inputcandidate.ErrUnavailable) || local.calls != 1 {
		t.Fatal("opt-out reached model")
	}
}

func TestEnableCandidatesNeverDownloadsMissingModel(t *testing.T) {
	local := &candidateLocal{}
	a := &app{s: state.NewState(), local: local, directory: t.TempDir(), dispatch: func(fn func()) { fn() }}
	a.toggleCandidates()
	if local.downloads != 0 || local.Ready() {
		t.Fatal("opt-in downloaded or started a missing model")
	}
}

func phraseApp(t *testing.T, local *candidateLocal) *app {
	t.Helper()
	a := &app{s: state.NewState(), local: local, directory: t.TempDir(), dispatch: func(fn func()) { fn() }}
	a.s.Profile, a.s.ProfileReady, a.s.AICandidates = domain.DefaultWritingProfile(), true, true
	a.applyLocalStatus()
	return a
}

func TestShortPhrasesWorkWithoutModel(t *testing.T) {
	local := &candidateLocal{}
	a := phraseApp(t, local)
	if !a.s.CanSuggest() {
		t.Error("missing Qwen disabled the phrase endpoint")
	}
	for source, want := range map[string]string{"部门": "负责人", "公司": "同事", "我们部门": "负责人"} {
		got, err := a.lookupPhrase(context.Background(), source)
		if err != nil || got != want {
			t.Errorf("%s: got %q (%v), want %q", source, got, err, want)
		}
	}
	if local.calls != 0 || local.downloads != 0 {
		t.Fatal("dictionary lookup reached the model")
	}
	a.s.AICandidates = false
	if _, err := a.lookupPhrase(context.Background(), "部门"); !errors.Is(err, inputcandidate.ErrUnavailable) {
		t.Fatal("opt-out still offers dictionary phrases")
	}
}

func TestPersonalPhrasePriorityEditingAndReload(t *testing.T) {
	local := &candidateLocal{ready: true}
	a := phraseApp(t, local)
	check := func(source, want string) {
		t.Helper()
		got, err := a.lookupPhrase(context.Background(), source)
		if err != nil || got != want {
			t.Fatalf("%s: got %q (%v), want %q", source, got, err, want)
		}
	}
	a.s.TermsDraft = "部门协作平台\n部门联系人\n项目 Alpha"
	a.saveTerms()
	check("部门", "协作平台")
	check("项目", " Alpha")
	a.loadProfile()
	check("部门", "协作平台")
	a.s.TermsDraft = "部门联系人"
	a.saveTerms()
	check("部门", "联系人")
	a.s.TermsDraft = ""
	a.saveTerms()
	a.loadProfile()
	check("部门", "负责人")
	if local.calls != 0 {
		t.Fatal("Qwen replaced an explicit dictionary completion")
	}
}

func TestModelOnlyRunsForEnoughUnfinishedContext(t *testing.T) {
	local := &candidateLocal{ready: true}
	a := phraseApp(t, local)
	for _, text := range []string{"部", "明天我们。", "明天我们，嗯", "123456", "abcdef", ""} {
		if _, err := a.candidate(context.Background(), text); !errors.Is(err, inputcandidate.ErrUnavailable) {
			t.Errorf("model accepted context %q: %v", text, err)
		}
	}
	if local.calls != 0 {
		t.Fatal("short/finished contexts invoked Qwen")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	if _, err := a.candidate(ctx, "明天我们"); !errors.Is(err, context.DeadlineExceeded) || local.calls != 0 {
		t.Fatalf("continued typing must cancel before inference: calls=%d err=%v", local.calls, err)
	}
}

func TestQwenAssociatesTwoCharactersEvenWithDictionaryMatch(t *testing.T) {
	local := &candidateLocal{ready: true, result: "会议"}
	a := phraseApp(t, local)
	got, err := a.candidate(context.Background(), "部门")
	if err != nil || got != "会议" || local.calls != 1 {
		t.Fatalf("Qwen did not supplement the short dictionary word: %q %v calls=%d", got, err, local.calls)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Millisecond)
	defer cancel()
	if _, err := a.candidate(ctx, "公司"); !errors.Is(err, context.DeadlineExceeded) || local.calls != 1 {
		t.Fatalf("short-word inference ignored typing cancellation: calls=%d err=%v", local.calls, err)
	}
}

func TestModelDoesNotInventFactsInShortSuggestions(t *testing.T) {
	local := &candidateLocal{ready: true}
	a := phraseApp(t, local)
	for _, result := range []string{"支付500元", "周五交付", "保证完成", "我们一起讨论", "请提供更多信息"} {
		local.result = result
		if got, err := a.candidate(context.Background(), "明天我们"); !errors.Is(err, inputcandidate.ErrUnavailable) {
			t.Errorf("accepted unsupported suffix %q: %q (%v)", result, got, err)
		}
	}
}

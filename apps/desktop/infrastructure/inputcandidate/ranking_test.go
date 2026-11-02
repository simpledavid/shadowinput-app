package inputcandidate

import (
	"arion.local/core/contracts"
	"arion.local/core/domain"
	"arion.local/desktop/infrastructure/llm/ranking"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type rankFunc func(context.Context, contracts.KeyboardRankRequest) (contracts.KeyboardRankResult, error)

func (f rankFunc) RankKeyboard(c context.Context, r contracts.KeyboardRankRequest) (contracts.KeyboardRankResult, error) {
	return f(c, r)
}
func rankRequest() contracts.KeyboardRankRequest {
	return contracts.KeyboardRankRequest{Identity: contracts.Identity{SessionID: "editor", Generation: 1}, Revision: 2, Input: "shijie", Candidates: []domain.KeyboardCandidate{
		{Candidate: domain.Candidate{ID: "a", Text: "时节", Source: "sentence"}, End: 6},
		{Candidate: domain.Candidate{ID: "b", Text: "世界", Source: "sentence"}, End: 6},
	}}
}
func rankPost(t *testing.T, s *Server, body, origin string) (int, []byte) {
	t.Helper()
	r, _ := http.NewRequest("POST", "http://"+s.address+"/rank", strings.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+s.token)
	r.Header.Set("Origin", origin)
	v, e := http.DefaultClient.Do(r)
	if e != nil {
		t.Fatal(e)
	}
	defer v.Body.Close()
	b, e := io.ReadAll(v.Body)
	if e != nil {
		t.Fatal(e)
	}
	return v.StatusCode, b
}
func TestRankingUsesIndependentBoundedLane(t *testing.T) {
	dir := t.TempDir()
	started, release := make(chan struct{}), make(chan struct{})
	phrase, e := Start(dir, func(ctx context.Context, s string) (string, error) {
		close(started)
		select {
		case <-release:
			return "一起讨论", nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	})
	if e != nil {
		t.Fatal(e)
	}
	defer phrase.Close()
	complete := make(chan int, 1)
	go func() {
		r, _ := http.NewRequest("POST", "http://"+phrase.address+"/candidate", strings.NewReader("明天我们"))
		r.Header.Set("Authorization", "Bearer "+phrase.token)
		v, e := http.DefaultClient.Do(r)
		if e != nil {
			complete <- 0
			return
		}
		defer v.Body.Close()
		complete <- v.StatusCode
	}()
	<-started
	defer func() {
		close(release)
		if got := <-complete; got != 200 {
			t.Errorf("ranking canceled the phrase lane: %d", got)
		}
	}()
	calls := 0
	s, e := StartRanking(dir, rankFunc(func(ctx context.Context, r contracts.KeyboardRankRequest) (contracts.KeyboardRankResult, error) {
		calls++
		return ranking.Apply(r, `{"pick":"b"}`)
	}))
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	req := rankRequest()
	raw, _ := json.Marshal(req)
	status, data := rankPost(t, s, string(raw), "")
	if status != 200 {
		t.Fatalf("ranking without Qwen/context status %d, want 200", status)
	}
	var out contracts.KeyboardRankResult
	if e = json.Unmarshal(data, &out); e != nil || out.SessionID != req.SessionID || out.Revision != 2 || out.Candidates[0].ID != "b" {
		t.Fatalf("wrong bound permutation: %s %v", data, e)
	}
	for _, tc := range []struct {
		body, origin string
		status       int
	}{{string(raw), "https://example.com", 403}, {string(raw) + `{}`, "", 400}, {strings.Repeat("x", 32769), "", 400}, {`{"session_id":"editor"}`, "", 400}} {
		if status, _ := rankPost(t, s, tc.body, tc.origin); status != tc.status {
			t.Errorf("status %d want %d", status, tc.status)
		}
	}
	if calls != 1 {
		t.Fatalf("invalid request reached model %d times", calls)
	}
	if e = s.SetEnabled(false); e != nil {
		t.Fatal(e)
	}
	if status, _ := rankPost(t, s, string(raw), ""); status != 204 {
		t.Fatal("opt-out accepted saved token")
	}
}
func TestRankingDropsCanceledAndExpiredReplies(t *testing.T) {
	for _, revoke := range []bool{false, true} {
		t.Run(map[bool]string{false: "deadline", true: "opt-out"}[revoke], func(t *testing.T) {
			started := make(chan struct{})
			s, e := StartRanking(t.TempDir(), rankFunc(func(ctx context.Context, r contracts.KeyboardRankRequest) (contracts.KeyboardRankResult, error) {
				close(started)
				<-ctx.Done()
				return ranking.Apply(r, `{"pick":"b"}`)
			}))
			if e != nil {
				t.Fatal(e)
			}
			defer s.Close()
			if revoke {
				go func() { <-started; _ = s.SetEnabled(false) }()
			}
			raw, _ := json.Marshal(rankRequest())
			start := time.Now()
			status, _ := rankPost(t, s, string(raw), "")
			if status != 204 || time.Since(start) > time.Second {
				t.Fatal("late ranking accepted or blocked")
			}
		})
	}
}

package inputcandidate

import (
	"arion.local/core/contracts"
	"arion.local/core/domain"
	"arion.local/core/domain/ports"
	"arion.local/desktop/infrastructure/llm/ranking"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"time"
)

// StartRanking isolates the fast lane from Qwen continuation cancellation and load.
// The exact candidate IDs and activation remain owned by the native input method.
func StartRanking(directory string, ranker ports.KeyboardRanker) (*Server, error) {
	generate := func(ctx context.Context, text string) (string, error) {
		req, err := parseRanking(text)
		if err != nil {
			return "", err
		}
		result, err := ranker.RankKeyboard(ctx, req)
		if err != nil {
			return "", err
		}
		if result.Identity != req.Identity || result.Revision != req.Revision || len(result.Candidates) != len(req.Candidates) {
			return "", ErrUnavailable
		}
		expected, err := domain.PromoteKeyboardCandidate(req.Candidates, result.Candidates[0].ID)
		if err != nil {
			return "", err
		}
		for i, c := range expected {
			if result.Candidates[i].ID != c.ID {
				return "", ErrUnavailable
			}
		}
		data, err := json.Marshal(result)
		return string(data), err
	}
	return start(directory, generate, requestPolicy{path: "/rank", file: "ranking.endpoint", limit: 32768, budget: 100 * time.Millisecond,
		validInput:  func(text string) bool { _, err := parseRanking(text); return err == nil },
		validResult: func(_, result string) bool { return result != "" && len(result) <= 4096 },
	})
}
func parseRanking(text string) (contracts.KeyboardRankRequest, error) {
	var req contracts.KeyboardRankRequest
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		return req, err
	}
	if decoder.Decode(new(any)) != io.EOF || len(req.SessionID) > 128 {
		return req, errors.New("invalid ranking envelope")
	}
	_, err := ranking.Prepare(req)
	return req, err
}

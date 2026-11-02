package shadowinput

import (
	"arion.local/core/domain"
	"arion.local/core/domain/ports"
	"arion.local/desktop/infrastructure/inputcandidate"
	"arion.local/desktop/infrastructure/localwriting"
	"arion.local/desktop/infrastructure/rewriting"
	"arion.local/desktop/infrastructure/shadowime"
	state "arion.local/desktop/ui/shared/writing"
	"context"
	"github.com/egoist/mygo"
	"time"
)

func (a *app) initInputMethod() {
	a.initRanking()
	server, err := inputcandidate.Start(a.directory, a.candidate)
	if err != nil {
		a.s.IMEStatus = "AI 候选服务未启动；普通输入不受影响。"
		return
	}
	a.candidates = server
	_ = server.SetEnabled(a.s.CanSuggest())
	a.s.IMEStatus = shadowime.Status()
}

type phrasePlan struct {
	phrase    string
	request   domain.WritingRequest
	generator ports.WritingGenerator
}

// Called on the UI owner; the returned request owns a copy of user preferences.
func (a *app) planPhrase(text string) phrasePlan {
	if a.quitting || !a.s.CanSuggest() {
		return phrasePlan{}
	}
	if phrase := domain.SuggestInputPhrase(text, a.s.Profile.Terms); phrase != "" {
		return phrasePlan{phrase: phrase}
	}
	if !domain.ModelPhraseEligible(text) || a.local == nil || !a.local.Ready() || a.s.Local.Busy {
		return phrasePlan{}
	}
	request := domain.WritingRequest{Task: domain.TaskCompletePhrase, Text: text, Model: rewriting.DefaultModel, Terms: append([]string(nil), a.s.Profile.Terms...)}
	if style, ok := a.s.Profile.Style(a.s.StyleID); ok {
		request.Style = &style
	}
	return phrasePlan{request: request, generator: localwriting.Generator{Chat: a.local}}
}

func (a *app) candidate(ctx context.Context, text string) (string, error) {
	ready := make(chan phrasePlan, 1)
	a.onMain(func() {
		if ctx.Err() != nil {
			ready <- phrasePlan{}
			return
		}
		ready <- a.planPhrase(text)
	})
	var s phrasePlan
	select {
	case s = <-ready:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if s.phrase != "" {
		return s.phrase, nil
	}
	if s.generator == nil {
		return "", inputcandidate.ErrUnavailable
	}
	// Only inference waits for quiet typing. Dictionary suggestions return at once.
	timer := time.NewTimer(180 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
		return "", ctx.Err()
	}
	result, err := s.generator.Generate(ctx, s.request, nil)
	if err != nil {
		return "", err
	}
	if !domain.ValidGeneratedPhrase(text, result) {
		return "", inputcandidate.ErrUnavailable
	}
	return result, nil
}
func (a *app) toggleCandidates() {
	a.s.AICandidates = !a.s.AICandidates
	if a.candidates != nil {
		a.candidates.Revoke()
	}
	a.savePreferences()
	a.invalidate()
	if a.s.AICandidates && a.s.Local.Installed && !a.s.Local.Busy && a.local != nil && !a.local.Ready() {
		a.startLocal(false, true)
	} else if !a.s.AICandidates && a.s.Provider != state.ProviderLocal {
		a.startLocal(false, false)
	}
}
func (a *app) installInputMethod() {
	if a.s.IMEInstalling {
		return
	}
	a.s.IMEInstalling = true
	a.s.IMEStatus = "正在安装输入法…"
	a.invalidate()
	resources, err := mygo.App.Path(mygo.PathResources)
	if err != nil {
		a.s.IMEInstalling = false
		a.s.IMEStatus = "无法定位输入法安装包。"
		a.invalidate()
		return
	}
	go func() {
		err := shadowime.Install(resources)
		a.onMain(func() {
			a.s.IMEInstalling = false
			if err != nil {
				a.s.IMEStatus = err.Error()
			} else {
				a.s.IMEStatus = shadowime.Status()
			}
			a.invalidate()
		})
	}()
}

package shadowinput

import (
	"arion.local/core/domain/ports"
	"arion.local/desktop/infrastructure/inputcandidate"
	"arion.local/desktop/infrastructure/keyboardmodel"
	"arion.local/desktop/infrastructure/rewriting"
	"arion.local/desktop/ui/shared/copy"
	"arion.local/models"
	"context"
	"github.com/egoist/mygo"
)

type fastRuntime interface {
	ports.KeyboardRanker
	Enable(context.Context) error
	Disable()
	Status() rewriting.Status
}

func (a *app) initRanking() {
	catalog, err := models.Load()
	resources, pathErr := mygo.App.Path(mygo.PathResources)
	if err != nil || pathErr != nil {
		a.s.RankingStatus = copy.ShadowRankFailed
		return
	}
	service := keyboardmodel.New(catalog, keyboardmodel.Locate(resources))
	a.fastRanker = service
	service.OnStatus(func(rewriting.Status) {
		go a.onMain(func() {
			if !a.quitting {
				a.applyRankingStatus()
				a.invalidate()
			}
		})
	})
	a.rankingServer, err = inputcandidate.StartRanking(a.directory, a.fastRanker)
	if err != nil {
		a.s.RankingStatus = copy.ShadowRankFailed
		return
	}
	_ = a.rankingServer.SetEnabled(false)
	a.configureRanking()
}

// The UI owns desired state. One serial lifecycle lane owns process changes;
// request serving never waits for a model to load or for a previous toggle.
func (a *app) configureRanking() {
	if a.fastRanker == nil || a.rankingServer == nil {
		return
	}
	desired := a.s.AICandidates && !a.quitting
	_ = a.rankingServer.SetEnabled(desired && a.fastRanker.Status().State == rewriting.Ready)
	if desired == a.rankEnabled {
		return
	}
	a.rankEnabled = desired
	a.rankJob++
	job := a.rankJob
	if a.rankCancel != nil {
		a.rankCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.rankCancel = cancel
	previous := a.rankDone
	done := make(chan struct{})
	a.rankDone = done
	a.s.RankingStatus = copy.ShadowRankOff
	if desired {
		a.s.RankingStatus = copy.ShadowRankLoading
	}
	go func() {
		if previous != nil {
			<-previous
		}
		if ctx.Err() != nil {
			close(done)
			return
		}
		var err error
		if desired {
			err = a.fastRanker.Enable(ctx)
		} else {
			a.fastRanker.Disable()
		}
		close(done)
		a.onMain(func() {
			if a.quitting || a.rankJob != job {
				return
			}
			a.rankCancel = nil
			if err != nil {
				a.s.RankingStatus = copy.ShadowRankFailed
			} else {
				a.applyRankingStatus()
			}
			a.invalidate()
		})
	}()
}
func (a *app) applyRankingStatus() {
	a.s.RankingStatus = copy.ShadowRankOff
	if !a.s.AICandidates || a.fastRanker == nil {
		return
	}
	switch a.fastRanker.Status().State {
	case rewriting.Ready:
		a.s.RankingStatus = copy.ShadowRankReady
	case rewriting.Loading, rewriting.Off:
		a.s.RankingStatus = copy.ShadowRankLoading
	default:
		a.s.RankingStatus = copy.ShadowRankFailed
	}
}
func (a *app) closeRanking() {
	if a.rankingServer != nil {
		a.rankingServer.Close()
	}
	if a.rankCancel != nil {
		a.rankCancel()
	}
	if a.rankDone != nil {
		<-a.rankDone
	}
	if a.fastRanker != nil {
		a.fastRanker.Disable()
	}
}

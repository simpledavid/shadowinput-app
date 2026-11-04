package inputcandidate

import "errors"

// Phrases owns independent lookup/inference cancellation. A quick dictionary
// response must neither wait for nor cancel the model's supplemental response.
type Phrases struct{ lookup, model *Server }

func StartPhrases(directory string, lookup, model Generate) (*Phrases, error) {
	first, err := Start(directory, lookup)
	if err != nil {
		return nil, err
	}
	second, err := start(directory, model, phrasePolicy("phrase-model"))
	if err != nil {
		first.Close()
		return nil, err
	}
	return &Phrases{lookup: first, model: second}, nil
}

func (p *Phrases) SetEnabled(enabled bool) error {
	return errors.Join(p.lookup.SetEnabled(enabled), p.model.SetEnabled(enabled))
}
func (p *Phrases) Revoke() { p.lookup.Revoke(); p.model.Revoke() }
func (p *Phrases) Close()  { p.lookup.Close(); p.model.Close() }

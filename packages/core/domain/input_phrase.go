package domain

import (
	_ "embed"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// These authored collocations supplement ordinary Pinyin; they are not a corpus
// of user activity. File order breaks ties after the longest matching prefix.
//
//go:embed input_phrases.txt
var inputPhrases string

var commonInputPhrases = strings.Fields(inputPhrases)

func ValidPhraseContext(text string) bool {
	count := utf8.RuneCountInString(text)
	return utf8.ValidString(text) && count >= 2 && count <= 128 && strings.IndexFunc(text, unicode.IsControl) < 0
}

// SuggestInputPhrase gives explicit personal terms priority over common phrases.
// It returns only the missing suffix, preserving spaces inside personal terms.
func SuggestInputPhrase(source string, personal []string) string {
	if !ValidPhraseContext(source) {
		return ""
	}
	if suffix := matchInputPhrase(source, personal); suffix != "" {
		return suffix
	}
	return matchInputPhrase(source, commonInputPhrases)
}

func matchInputPhrase(source string, phrases []string) string {
	best, matched := "", 0
	for _, phrase := range phrases {
		if !utf8.ValidString(phrase) || utf8.RuneCountInString(phrase) > 64 {
			continue
		}
		count := 0
		for offset := range phrase {
			if count >= 2 && count > matched && strings.HasSuffix(source, phrase[:offset]) && ValidPhraseSuffix(source, phrase[offset:]) {
				best, matched = phrase[offset:], count
			}
			count++
		}
	}
	return best
}

// ModelPhraseEligible requires four Han characters in the unfinished clause.
// Short dictionary lookups do not need this gate or a running model.
func ModelPhraseEligible(source string) bool {
	if !ValidPhraseContext(source) {
		return false
	}
	clause := source
	if at := strings.LastIndexAny(source, "，。！？；：,.!?;:\n"); at >= 0 {
		_, size := utf8.DecodeRuneInString(source[at:])
		clause = source[at+size:]
	}
	last, _ := utf8.DecodeLastRuneInString(clause)
	if !unicode.Is(unicode.Han, last) {
		return false
	}
	han := 0
	for _, r := range clause {
		if unicode.Is(unicode.Han, r) {
			han++
		}
	}
	return han >= 4
}

// ValidGeneratedPhrase adds conservative fact checks to the shared wire bounds.
// It does not establish semantic relevance or factual correctness.
func ValidGeneratedPhrase(source, suffix string) bool {
	if !ValidPhraseSuffix(source, suffix) {
		return false
	}
	for _, pattern := range []*regexp.Regexp{writingNumbers, writingDates, writingPromises} {
		for _, fact := range pattern.FindAllString(suffix, -1) {
			if !strings.Contains(strings.ToLower(source), strings.ToLower(fact)) {
				return false
			}
		}
	}
	return true
}

func ValidPhraseSuffix(source, result string) bool {
	return strings.TrimSpace(result) != "" && !strings.HasPrefix(result, source) && !strings.HasSuffix(source, result) && !repeatedPhraseBoundary(source, result) && !phraseAssistantReply(result) && utf8.ValidString(result) && utf8.RuneCountInString(result) <= 24 &&
		strings.IndexFunc(result, unicode.IsControl) < 0 && !strings.Contains(result, "<|") && !strings.Contains(result, "<think")
}

func repeatedPhraseBoundary(source, result string) bool {
	prefix, suffix := []rune(source), []rune(result)
	for count := 2; count <= min(len(prefix), len(suffix)); count++ {
		if string(prefix[len(prefix)-count:]) == string(suffix[:count]) {
			return true
		}
	}
	return false
}

func phraseAssistantReply(text string) bool {
	for _, phrase := range []string{"请提供", "有什么可以帮", "需要我帮", "作为AI", "作为 AI"} {
		if strings.Contains(text, phrase) {
			return true
		}
	}
	return false
}

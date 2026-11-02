package domain

import (
	"fmt"
	"strings"
	"testing"
)

func TestInputPhraseMatchesLongestPrefixThenPersonalOrder(t *testing.T) {
	terms := []string{"部门联系人", "部门协作", "我们部门同事", "项目 Alpha", "会议2026"}
	for _, tc := range [][2]string{{"部门", "联系人"}, {"我们部门", "同事"}, {"项目", " Alpha"}, {"会议", "2026"}, {"部门联系人", ""}, {"部", ""}, {"陌生词", ""}, {"部门\n", ""}} {
		if got := SuggestInputPhrase(tc[0], terms); got != tc[1] {
			t.Errorf("%q => %q, want %q", tc[0], got, tc[1])
		}
	}
	if got := SuggestInputPhrase("部门", []string{"部门" + strings.Repeat("字", 25)}); got != "负责人" {
		t.Fatalf("oversized personal completion suppressed bounded dictionary result: %q", got)
	}
}

func TestGeneratedPhraseFactChecks(t *testing.T) {
	for _, tc := range []struct {
		source, suffix string
		valid          bool
	}{
		{"明天我们", "一起讨论", true},
		{"明天我们", "周五讨论", false},
		{"明天我们", "支付500元", false},
		{"明天我们", "保证交付", false},
		{"预算500元", "按500元准备", true},
		{"这是内容", "内容还有", false},
		{"这是内容", "\n更多", false},
	} {
		if ValidGeneratedPhrase(tc.source, tc.suffix) != tc.valid {
			t.Errorf("unexpected validity: %q + %q", tc.source, tc.suffix)
		}
	}
}

func BenchmarkInputPhraseWithFullPersonalGlossary(b *testing.B) {
	terms := make([]string, 100)
	for i := range terms {
		terms[i] = fmt.Sprintf("项目%03d协作平台", i)
	}
	b.ReportAllocs()
	for b.Loop() {
		if SuggestInputPhrase("我们部门", terms) != "负责人" {
			b.Fatal("missing dictionary result")
		}
	}
}

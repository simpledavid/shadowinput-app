#pragma once
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include "continuation.h"

enum class ShadowRequestKind { Phrase, Ranking };
inline const wchar_t *shadowEndpoint(ShadowRequestKind kind) { return kind==ShadowRequestKind::Ranking?L"ranking.endpoint":L"candidate.endpoint"; }
inline const wchar_t *shadowRoute(ShadowRequestKind kind) { return kind==ShadowRequestKind::Ranking?L"/rank":L"/candidate"; }
inline size_t shadowResultLimit(ShadowRequestKind kind) { return kind==ShadowRequestKind::Ranking?4096:ShadowSuffixRunes; }
struct ShadowCandidateRequest {
    const ShadowRequestKind kind;
    const uint64_t revision;
    const std::string source;
    std::atomic<bool> canceled{false};
    ShadowCandidateRequest(uint64_t revision,const std::string &source,ShadowRequestKind kind=ShadowRequestKind::Phrase):kind(kind),revision(revision),source(source) {}
};

// Composition state is shared with workers, never with TSF/COM objects.
class ShadowCandidateState {
    const ShadowRequestKind kind;
    std::mutex mutex;
    bool alive=true;
    uint64_t revision=0,started=0,changed=0;
    std::string source;
    std::wstring result;
    std::shared_ptr<ShadowCandidateRequest> current;
    void revoke() {
        if(current)current->canceled=true;
        current.reset();
    }
public:
    explicit ShadowCandidateState(ShadowRequestKind kind=ShadowRequestKind::Phrase):kind(kind) {}
    void update(const std::string &text,uint64_t version,uint64_t now) {
        std::lock_guard<std::mutex> lock(mutex);
        revoke();
        source=text;revision=version;changed=now;result.clear();
    }
    std::shared_ptr<ShadowCandidateRequest> begin(uint64_t version,uint64_t now) {
        std::lock_guard<std::mutex> lock(mutex);
        if(!alive || version!=revision || current || started==revision || source.empty())return {};
        if(kind==ShadowRequestKind::Ranking) { if(source.size()>32768)return {}; }
        else if(shadow_runes(source.c_str())<2 || shadow_runes(source.c_str())>ShadowContextRunes || now-changed<ShadowDebounceMS)return {};
        started=revision;
        current=std::make_shared<ShadowCandidateRequest>(revision,source,kind);
        return current;
    }
    void complete(const std::shared_ptr<ShadowCandidateRequest> &request,const std::wstring &text) {
        std::lock_guard<std::mutex> lock(mutex);
        if(current!=request || request->canceled)return;
        current.reset();
        if(alive && revision==request->revision && text.size()<=shadowResultLimit(kind))result=text;
    }
    std::wstring read(uint64_t version) {
        std::lock_guard<std::mutex> lock(mutex);
        return version==revision?result:std::wstring{};
    }
    void close() {
        std::lock_guard<std::mutex> lock(mutex);
        revoke();
        alive=false;result.clear();
    }
};

#include "candidate_state.h"
#include <iostream>
#include <stdexcept>

static void require(bool ok,const char *reason) { if(!ok)throw std::runtime_error(reason); }
int main() {
    try {
        ShadowCandidateState state;
        state.update("明天",1);
        auto first=state.begin(1);
        require(bool(first),"local phrase lookup must start immediately; only model inference is debounced");
        state.update("second phrase",2);
        require(first->canceled,"editing did not cancel the old request");
        auto second=state.begin(2);
        require(bool(second),"new phrase is blocked by the old request");
        state.complete(first,L"stale");
        require(state.read(2).empty(),"old result was delivered");
        require(!state.begin(2),"old completion released the new request");
        state.complete(second,L"fresh");
        require(state.read(2)==L"fresh","new result missing");
        state.update("third phrase",3);
        auto third=state.begin(3);
        state.update({},3);
        require(third->canceled,"clearing composition did not cancel transport");
        state.complete(third,L"late");
        require(state.read(3).empty(),"same-revision clear allowed stale delivery");
        state.update("fourth phrase",4);
        auto fourth=state.begin(4);
        state.close();
        require(fourth->canceled,"teardown did not cancel transport");
        state.complete(fourth,L"late");
        require(state.read(4).empty(),"teardown accepted a result");
        ShadowCandidateState rank(ShadowRequestKind::Ranking);
        std::string snapshot(2000,'x');rank.update(snapshot,1);
        auto proposal=rank.begin(1);
        require(bool(proposal),"fast ranking must start immediately with bounded JSON");
        rank.update(snapshot,2);
        require(proposal->canceled,"a new key must revoke the rank request");
        auto next=rank.begin(2);rank.complete(proposal,L"old");
        std::wstring permutation(300,L'x');rank.complete(next,permutation);
        require(rank.read(2)==permutation,"bounded permutation must survive phrase-length limits");
        rank.update(std::string(32769,'x'),3);
        require(!rank.begin(3),"oversized ranking snapshot accepted");
        rank.close();
        std::cout<<"PASS: immediate lookup, replacement, cancellation, stale completion and teardown\n";
    } catch(const std::exception &error) {
        std::cerr<<error.what()<<'\n';return 1;
    }
}

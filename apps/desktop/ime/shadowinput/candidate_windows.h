#pragma once
#include "candidate_http_windows.h"
#include <memory>
#include <mutex>
#include "candidate_state.h"
// Worker state never holds a TSF/COM pointer. A DLL reference protects each
// outstanding request through WinHTTP callback teardown; the editor never waits.
static bool shadowEndpointEnabled(ShadowRequestKind kind) {
 PWSTR base=nullptr;
 if(FAILED(SHGetKnownFolderPath(FOLDERID_RoamingAppData,0,nullptr,&base)))return false;
 std::wstring file=std::wstring(base)+L"\\shadowinput\\"+std::wstring(shadowEndpoint(kind));CoTaskMemFree(base);
 return GetFileAttributesW(file.c_str())!=INVALID_FILE_ATTRIBUTES;
}
static bool shadowAIEnabled() { return shadowEndpointEnabled(ShadowRequestKind::Phrase); }
static bool shadowRankingEnabled() { return shadowEndpointEnabled(ShadowRequestKind::Ranking); }
class ShadowCandidateClient {
 std::shared_ptr<ShadowCandidateState> state;
 HWND readyWindow=nullptr;UINT readyMessage=0;
 struct Work { std::shared_ptr<ShadowCandidateState> state; std::shared_ptr<ShadowCandidateRequest> request; HMODULE module;HWND window;UINT message; };
 static DWORD WINAPI work(void *raw) {
  std::unique_ptr<Work> job(static_cast<Work*>(raw));
  std::wstring result;
  PWSTR base=nullptr;
  if(SUCCEEDED(SHGetKnownFolderPath(FOLDERID_RoamingAppData,0,nullptr,&base))) {
   std::wstring file=std::wstring(base)+L"\\shadowinput\\"+std::wstring(shadowEndpoint(job->request->kind));CoTaskMemFree(base);
   HANDLE input=CreateFileW(file.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
   char bytes[256]{};DWORD count=0;
   if(input!=INVALID_HANDLE_VALUE){if(!ReadFile(input,bytes,sizeof(bytes)-1,&count,nullptr))count=0;CloseHandle(input);}
   std::string config(bytes,count);auto end=config.find('\n'),next=config.find('\n',end==std::string::npos?0:end+1);
   if(end!=std::string::npos&&next!=std::string::npos&&config.rfind("127.0.0.1:",0)==0) {
    auto digits=config.substr(10,end-10),token=config.substr(end+1,next-end-1);
    unsigned long port=0;if(!digits.empty()&&digits.size()<=5&&digits.find_first_not_of("0123456789")==std::string::npos)port=std::strtoul(digits.c_str(),nullptr,10);
    if(port>0&&port<=65535&&token.size()>=20&&token.size()<100&&token.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ234567") == std::string::npos) {
     ShadowCandidateHTTP http(job->request);
     result=http.run(static_cast<INTERNET_PORT>(port),wide(token));
    }
   }
  }
  job->state->complete(job->request,result);
  if(job->window && job->message && !job->request->canceled)PostMessageW(job->window,job->message,0,0);
  HMODULE module=job->module;job.reset();FreeLibraryAndExitThread(module,0);return 0;
 }
public:
 explicit ShadowCandidateClient(ShadowRequestKind kind=ShadowRequestKind::Phrase):state(std::make_shared<ShadowCandidateState>(kind)) {}
 void notify(HWND window,UINT message){readyWindow=window;readyMessage=message;}
 ~ShadowCandidateClient(){state->close();}
 void update(const std::string &source,uint64_t revision){state->update(source,revision);}
 std::wstring poll(uint64_t revision){
  if(auto request=state->begin(revision)) {
   HMODULE module=nullptr;
   if(GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,reinterpret_cast<LPCWSTR>(&work),&module)) {
    auto job=new Work{state,request,module,readyWindow,readyMessage};
    HANDLE thread=CreateThread(nullptr,0,work,job,0,nullptr);
    if(thread)CloseHandle(thread);else{delete job;state->complete(request,{});FreeLibrary(module);}
   }else state->complete(request,{});
  }
  return state->read(revision);
 }
};

#import <Cocoa/Cocoa.h>
#import "typing_fixture.h"
#import "../learning.h"
#import "../candidate_panel.h"
#import "../../shadowinput/candidate_macos.h"
#include <atomic>

static std::atomic<bool> holdUnmatchedModel{false};

// A deterministic transport response exercises the native scheduling/cancel path.
@interface PhraseProtocol : NSURLProtocol
@property BOOL stopped;
@end
@implementation PhraseProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request { return [request.URL.path isEqual:@"/candidate"] || [request.URL.path isEqual:@"/phrase-model"]; }
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)deliver {
 @synchronized(self) {
  if(self.stopped)return;
  NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:nil];
  [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
  NSString *text=[self.request.URL.path isEqual:@"/candidate"]?@"负责人":@"会议";
  [self.client URLProtocol:self didLoadData:[text dataUsingEncoding:NSUTF8StringEncoding]];
  [self.client URLProtocolDidFinishLoading:self];
 }
}
- (void)startLoading {
 if(holdUnmatchedModel){
  if([self.request.URL.path isEqual:@"/candidate"]){
   NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:204 HTTPVersion:@"HTTP/1.1" headerFields:nil];
   [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
   [self.client URLProtocolDidFinishLoading:self];
  }
  return;
 }
 if([self.request.URL.path isEqual:@"/phrase-model"])
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self deliver];});
 else [self deliver];
}
- (void)stopLoading {@synchronized(self){self.stopped=YES;}}

@end

static void capturePhrasePanel(ShadowCandidate *candidate) {
 NSString *directory=NSProcessInfo.processInfo.environment[@"SHADOWINPUT_NATIVE_SCREENSHOTS"];
 if(!directory.isAbsolutePath)return;
 [NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
 for(NSNumber *dark in @[@NO,@YES]) {
  candidate.panel.appearance=dark.boolValue?ArionCandidateAppearanceDark:ArionCandidateAppearanceLight;
  for(NSUInteger selected=0;selected<2;selected++) {
   NSMutableArray *items=[candidate.texts mutableCopy];
   items[selected]=[items[selected] stringByAppendingString:@"  ⇥"];
   [candidate.panel showCandidates:items highlighted:selected lastPage:YES revision:candidate.revision caretRect:NSMakeRect(200,300,1,20)];
   [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.35]];
   NSView *view=[candidate.panel valueForKey:@"view"];
   NSBitmapImageRep *bitmap=[view bitmapImageRepForCachingDisplayInRect:view.bounds];
   [view cacheDisplayInRect:view.bounds toBitmapImageRep:bitmap];
   NSString *name=[NSString stringWithFormat:@"native-phrases-%@-%lu.png",dark.boolValue?@"dark":@"light",(unsigned long)selected];
   require([[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:[directory stringByAppendingPathComponent:name] atomically:YES],@"save synthetic native phrase render");
  }
 }
 [candidate.panel hide];
}

static void checkPhraseDelivery(NSString *directory) {
 setenv("SHADOWINPUT_TEST_DIRECTORY",directory.UTF8String,1);
 NSString *endpoint=[directory stringByAppendingPathComponent:@"candidate.endpoint"];
 require([@"127.0.0.1:1\nABCDEFGHIJKLMNOPQRSTUVWX\n" writeToFile:endpoint atomically:YES encoding:NSUTF8StringEncoding error:nil],@"isolated phrase discovery");
 NSString *modelEndpoint=[directory stringByAppendingPathComponent:@"phrase-model.endpoint"];
 require([@"127.0.0.1:1\nABCDEFGHIJKLMNOPQRSTUVWX\n" writeToFile:modelEndpoint atomically:YES encoding:NSUTF8StringEncoding error:nil],@"isolated model discovery");
 ShadowCandidate *candidate=[ShadowCandidate new];
 [candidate.session invalidateAndCancel];
 NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;
 config.protocolClasses=@[PhraseProtocol.class];
 candidate.session=[NSURLSession sessionWithConfiguration:config];
 __block NSUInteger deliveries=0;
 candidate.ready=^{deliveries++;};
 [candidate update:@"部门" revision:1];
 require(candidate.task!=nil,@"dictionary transport must begin immediately, without a native debounce");
 NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:2];
 while(deliveries==0 && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
 require(deliveries==1 && [candidate.text isEqual:@"负责人"],@"bounded phrase reaches native candidate before model");
 while(deliveries<2 && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
 require(candidate.texts.count==2 && [candidate.text isEqual:@"负责人"] && [[candidate textAtIndex:1] isEqual:@"会议"],@"model appends without replacing first choice");
 require([candidate moveSelection:1] && [candidate.text isEqual:@"会议"],@"keyboard selects second model suffix");
 capturePhrasePanel(candidate);
 NSUInteger before=deliveries;
 [candidate update:@"公司" revision:2];[candidate clear];
 [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.3]];
 require(deliveries==before && !candidate.text.length,@"cleared request never delivers a stale phrase");
 [candidate update:@"部门" revision:3];
 deadline=[NSDate dateWithTimeIntervalSinceNow:2];
 while(!candidate.text && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
 require([candidate moveSelection:1],@"selection freezes pending model");
 [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.2]];
 require(candidate.texts.count==1 && [candidate.text isEqual:@"负责人"],@"late model cannot change a navigating list");
 __block BOOL valid=YES;
 candidate.valid=^BOOL(void){return valid;};
 holdUnmatchedModel=true;
 [candidate update:@"未知" revision:4];
 deadline=[NSDate dateWithTimeIntervalSinceNow:2];
 while(candidate.task && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
 require(!candidate.task && !candidate.text.length && candidate.modelTask,@"unmatched dictionary leaves model pending without a visible choice");
 NSURLSessionDataTask *pending=candidate.modelTask;
 valid=NO;[candidate.timer fire];
 require(!candidate.modelTask && !candidate.text.length,@"caret invalidation cancels a pending model before any choice is visible");
 require(pending.state==NSURLSessionTaskStateCanceling || pending.state==NSURLSessionTaskStateCompleted,@"invalidation cancels the transport, not only its UI reference");
 holdUnmatchedModel=false;
 valid=YES;
 [candidate update:@"部门" revision:5];
 deadline=[NSDate dateWithTimeIntervalSinceNow:2];
 while(candidate.texts.count<2 && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
 require(candidate.texts.count==2 && [candidate.text isEqual:@"负责人"],@"a fresh commit still receives dictionary and model choices after cancellation");
 [candidate clear];[candidate.timer invalidate];[candidate.session invalidateAndCancel];
 [NSFileManager.defaultManager removeItemAtPath:endpoint error:nil];
 [NSFileManager.defaultManager removeItemAtPath:modelEndpoint error:nil];
}
int main(int argc,const char *argv[]){
 @autoreleasepool {
  if(argc!=3)return 2;
  [NSApplication sharedApplication];
  checkPhraseDelivery(@(argv[2]));
  NSMutableData *keyBytes=[NSMutableData dataWithLength:32];memset(keyBytes.mutableBytes,0x61,32);
  NSError *error=nil;
  require(ArionRegisterTestEncryptedLearning([@(argv[2]) stringByAppendingPathComponent:@"learning"],keyBytes,&error),@"isolated encrypted learning");
  ArionKeyboardEngine *engine=[ArionKeyboardEngine new];
  require([engine startWithData:@(argv[1]) userDirectory:@(argv[2]) error:&error],@"real engine starts");
  ArionTyping *typing=[[ArionTyping alloc] initWithEngine:engine];TypingEditor *editor=[TypingEditor new];
  require(typing.typoCorrection,@"shadowinput defaults to the engine's typo-correction mode");
  require([typing activate:editor error:&error],@"activate real editor");if(typing.ascii)[typing toggleASCII];
  __block NSDictionary *rankSnapshot=nil;
  typing.neuralRanking=YES;
  typing.rankingChanged=^(NSDictionary *snapshot,NSUInteger revision){(void)revision;rankSnapshot=snapshot;};
  type(typing,@"shijie");
  require(rankSnapshot!=nil && [rankSnapshot[@"before"] isEqual:@""],@"fast ranking accepts the first composition without preceding text");
  [typing cancel];typing.neuralRanking=NO;
  type(typing,@"mingtian");
  require(!typing.aiSource.length,@"unfinished Pinyin never starts a model request");
  press(typing,@" ",49);
  require([typing.aiSource isEqual:@"明天"],@"ordinary Space commit becomes continuation context");
  NSUInteger old=typing.revision;
  type(typing,@"women");
  require(![typing commitAI:@"迟到结果" revision:old] && editor.insertions==1,@"typing revokes old AI result");
  press(typing,@" ",49);
  require([typing.aiSource isEqual:@"明天我们"],@"consecutive word commits preserve short context");
  require([typing commitAI:@"一起讨论" revision:typing.revision],@"explicit AI candidate appends");
  require([editor.view.string isEqual:@"明天我们一起讨论"] && editor.insertions==3 && !typing.composing,@"continuation preserves committed text");
  require(![typing commitAI:@"重复" revision:typing.revision],@"no duplicate commit");
  type(typing,@"nihao");press(typing,@" ",49);
  require([editor.view.string hasSuffix:@"你好"] && editor.insertions==4,@"ordinary Pinyin survives AI commit");
  old=typing.revision;[editor.view setSelectedRange:NSMakeRange(0,0)];
  require(![typing commitAI:@"错误位置" revision:old],@"moving caret without a key cancels insertion");
  require(!typing.aiSource.length,@"moved caret cannot reuse old context");
  type(typing,@"mingtian");press(typing,@" ",49);old=typing.revision;[typing deactivate];
  require(![typing commitAI:@"过期" revision:old],@"focus/source deactivation revokes candidate");
  require([typing activate:editor error:&error],@"reactivate editor");if(typing.ascii)[typing toggleASCII];
  type(typing,@"zhogn");
  require([typing.snapshot.candidates containsObject:@"中"],@"default typo correction recovers transposed Pinyin");
  [typing cancel];type(typing,@"zhong");
  require([typing.snapshot.candidates containsObject:@"中"],@"exact Pinyin remains available");
  [typing deactivate];
  [engine stop];puts("PASS: word commits, bounded continuation, append once, stale revision, caret and focus cancellation");
 }
 return 0;
}

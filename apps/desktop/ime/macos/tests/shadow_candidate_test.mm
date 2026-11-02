#import <Cocoa/Cocoa.h>
#import "typing_fixture.h"
#import "../learning.h"
#import "../candidate_panel.h"
#import "../../shadowinput/candidate_macos.h"

// A deterministic transport response exercises the native scheduling/cancel path.
@interface PhraseProtocol : NSURLProtocol
@end
@implementation PhraseProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request { return [request.URL.path isEqual:@"/candidate"]; }
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
 NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.request.URL statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:nil];
 [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
 [self.client URLProtocol:self didLoadData:[@"负责人" dataUsingEncoding:NSUTF8StringEncoding]];
 [self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {}
@end

static void checkPhraseDelivery(NSString *directory) {
 setenv("SHADOWINPUT_TEST_DIRECTORY",directory.UTF8String,1);
 NSString *endpoint=[directory stringByAppendingPathComponent:@"candidate.endpoint"];
 require([@"127.0.0.1:1\nABCDEFGHIJKLMNOPQRSTUVWX\n" writeToFile:endpoint atomically:YES encoding:NSUTF8StringEncoding error:nil],@"isolated phrase discovery");
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
 require(deliveries==1 && [candidate.text isEqual:@"负责人"],@"bounded phrase reaches native candidate");
 [candidate update:@"公司" revision:2];[candidate clear];
 [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.3]];
 require(deliveries==1 && !candidate.text.length,@"cleared request never delivers a stale phrase");
 [candidate.timer invalidate];[candidate.session invalidateAndCancel];
 [NSFileManager.defaultManager removeItemAtPath:endpoint error:nil];
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

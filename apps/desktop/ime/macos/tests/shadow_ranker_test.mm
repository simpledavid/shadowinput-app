#import <Cocoa/Cocoa.h>
#import "typing_fixture.h"
#import "../learning.h"
#import "../../shadowinput/local_request_macos.h"
#import "../../shadowinput/ranking_macos.h"
int main(int argc,const char *argv[]) {
 @autoreleasepool {
  if(argc!=4)return 2;
  setenv("SHADOWINPUT_TEST_DIRECTORY",argv[3],1);
  [NSApplication sharedApplication];
  NSMutableData *key=[NSMutableData dataWithLength:32];memset(key.mutableBytes,0x61,32);
  NSError *error=nil;
  require(ArionRegisterTestEncryptedLearning([@(argv[2]) stringByAppendingPathComponent:@"learning"],key,&error),@"isolated learning");
  ArionKeyboardEngine *engine=[ArionKeyboardEngine new];
  require([engine startWithData:@(argv[1]) userDirectory:@(argv[2]) error:&error],@"real engine");
  ArionTyping *typing=[[ArionTyping alloc] initWithEngine:engine];TypingEditor *editor=[TypingEditor new];
  ShadowRanking *ranker=[ShadowRanking new];__block NSDictionary *reply=nil;
  typing.neuralRanking=YES;
  typing.rankingChanged=^(NSDictionary *snapshot,NSUInteger revision){[ranker update:snapshot revision:revision activation:@"native-fixture"];};
  ranker.ready=^(NSDictionary *message,NSString *activation){reply=message;[typing applyRankingMessage:message activation:activation];};
  require([typing activate:editor error:&error],@"activate editor");if(typing.ascii)[typing toggleASCII];
  type(typing,@"shijie");
  NSString *first=typing.snapshot.candidates.firstObject;
  require(first.length && typing.composing && editor.insertions==0,@"Rime menu is immediately available without awaiting inference");
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:3];
  while(!reply && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.005]];
  require(reply!=nil,@"real local HTTP/model reply reached native adapter");
  require([first isEqual:typing.snapshot.candidates.firstObject],@"trusted dictionary leader preserved by real model");
  press(typing,@" ",49);require([editor.view.string isEqual:first] && editor.insertions==1,@"normal Space commits exact original candidate");
  type(typing,@"nihao");NSString *newFirst=typing.snapshot.candidates.firstObject;
  [typing applyRankingMessage:reply activation:@"native-fixture"];
  require([newFirst isEqual:typing.snapshot.candidates.firstObject] && editor.insertions==1,@"old ranking cannot mutate a new composition");
  [typing deactivate];[engine stop];
  puts("PASS: real Rime -> loopback -> 4M -> native menu -> Space commit; stale revision rejected");
 }
 return 0;
}

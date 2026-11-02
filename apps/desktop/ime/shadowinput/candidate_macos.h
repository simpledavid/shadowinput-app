// Included only by the shadowinput IMK build. All UI state belongs to the main thread.
#include "continuation.h"
#include "local_request_macos.h"
static BOOL shadowAIEnabled(void) { return shadowEndpointEnabled(@"candidate"); }
@interface ShadowCandidate : NSObject
@property(strong) ArionCandidatePanel *panel;
@property(strong) NSURLSession *session;
@property(strong) NSTimer *timer;
@property(strong) NSURLSessionDataTask *task;
@property NSUInteger generation;
@property NSUInteger revision;
@property(copy) NSString *text;
@property(copy) void (^ready)(void);
@property(copy) BOOL (^valid)(void);
- (void)update:(NSString *)source revision:(NSUInteger)revision;
- (void)clear;
@end
@implementation ShadowCandidate
- (instancetype)init {
 if ((self=[super init])) {
  self.panel=[ArionCandidatePanel new];
  __weak ShadowCandidate *weak=self;
  self.timer=[NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer){(void)timer;ShadowCandidate *owner=weak;if(owner && (!shadowAIEnabled() || (owner.text.length && owner.valid && !owner.valid())))[owner clear];}];
  self.session=shadowLocalSession();
 }
 return self;
}
- (void)clear { self.generation++; [self.task cancel]; self.task=nil; self.text=nil; [self.panel hide]; }
- (void)dealloc { [self.timer invalidate]; [self.task cancel]; [self.session invalidateAndCancel]; }
- (void)update:(NSString *)source revision:(NSUInteger)revision {
 [self clear]; self.revision=revision;
 if (!source || shadow_runes(source.UTF8String)<2 || shadow_runes(source.UTF8String)>ShadowContextRunes) return;
 NSUInteger generation=self.generation;
 __weak ShadowCandidate *weak=self;
  NSMutableURLRequest *request=shadowLocalRequest(@"candidate",@"candidate",[source dataUsingEncoding:NSUTF8StringEncoding]);
  if(!request)return;
  self.task=[self.session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error) {
   if (error || ![response isKindOfClass:NSHTTPURLResponse.class] || ((NSHTTPURLResponse *)response).statusCode!=200 || data.length>1024) return;
   NSString *text=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
   if (!text.length || shadow_runes(text.UTF8String)>ShadowSuffixRunes || [text rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location!=NSNotFound) return;
   dispatch_async(dispatch_get_main_queue(),^{
    ShadowCandidate *live=weak; if (!live || live.generation!=generation) return;
    live.text=text; live.task=nil; if (live.ready) live.ready();
   });
  }];
  [self.task resume];
}
@end

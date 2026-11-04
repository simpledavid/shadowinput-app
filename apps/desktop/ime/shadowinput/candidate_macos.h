// Included only by the shadowinput IMK build. All UI state belongs to the main thread.
#include "phrase_choices.h"
#include "local_request_macos.h"
static BOOL shadowAIEnabled(void) { return shadowEndpointEnabled(@"candidate"); }
@interface ShadowCandidate : NSObject
@property(strong) ArionCandidatePanel *panel;
@property(strong) NSURLSession *session;
@property(strong) NSTimer *timer;
@property(strong) NSURLSessionDataTask *task;
@property(strong) NSURLSessionDataTask *modelTask;
@property NSUInteger generation;
@property NSUInteger revision;
@property ShadowPhraseChoices choices;
@property(readonly) NSString *text;
@property(readonly) NSArray<NSString *> *texts;
@property(readonly) NSUInteger selected;
@property(copy) void (^ready)(void);
@property(copy) BOOL (^valid)(void);
- (NSString *)textAtIndex:(NSUInteger)index;
- (BOOL)moveSelection:(NSInteger)direction;
- (void)update:(NSString *)source revision:(NSUInteger)revision;
- (void)clear;
@end
@implementation ShadowCandidate
- (instancetype)init {
 if ((self=[super init])) {
  self.panel=[ArionCandidatePanel new];self.panel.showsNumbers=NO;
  __weak ShadowCandidate *weak=self;
  self.timer=[NSTimer scheduledTimerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *timer){(void)timer;ShadowCandidate *owner=weak;if(owner && (!shadowAIEnabled() || (owner.text.length && owner.valid && !owner.valid())))[owner clear];}];
  self.session=shadowLocalSession();
 }
 return self;
}
- (NSString *)textAtIndex:(NSUInteger)index {
 const char *text=shadow_choices_at(&_choices,index);
 return *text?[NSString stringWithUTF8String:text]:nil;
}
- (NSString *)text {return [self textAtIndex:_choices.selected];}
- (NSUInteger)selected {return _choices.selected;}
- (NSArray<NSString *> *)texts {
 NSMutableArray *result=[NSMutableArray array];
 for(size_t i=0;i<_choices.count;++i)[result addObject:[self textAtIndex:i]];
 return result;
}
- (BOOL)moveSelection:(NSInteger)direction {
 if(self.valid && !self.valid()){[self clear];return NO;}
 if(!shadow_choices_move(&_choices,(int)direction))return NO;
 [self.modelTask cancel];self.modelTask=nil;
 if(self.ready)self.ready();return YES;
}
- (void)clear { self.generation++; [self.task cancel];[self.modelTask cancel];self.task=nil;self.modelTask=nil;shadow_choices_reset(&_choices);[self.panel hide]; }
- (void)dealloc { [self.timer invalidate];[self.task cancel];[self.modelTask cancel];[self.session invalidateAndCancel]; }
- (void)complete:(NSString *)text model:(BOOL)model generation:(NSUInteger)generation {
 if(self.generation!=generation)return;
 if(self.valid && !self.valid()){[self clear];return;}
 if(model)self.modelTask=nil;else self.task=nil;
 if(shadow_choices_complete(&_choices,model,text.UTF8String) && self.ready)self.ready();
}
- (NSURLSessionDataTask *)request:(NSString *)source model:(BOOL)model {
 NSString *name=model?@"phrase-model":@"candidate";
 NSMutableURLRequest *request=shadowLocalRequest(name,name,[source dataUsingEncoding:NSUTF8StringEncoding]);
 NSUInteger generation=self.generation;
 if(!request){[self complete:nil model:model generation:generation];return nil;}
 __weak ShadowCandidate *weak=self;
 NSURLSessionDataTask *task=[self.session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error) {
  NSString *text=nil;
  if(!error && [response isKindOfClass:NSHTTPURLResponse.class] && ((NSHTTPURLResponse *)response).statusCode==200 && data.length<=1024)
   text=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if(shadow_runes(text.UTF8String?:"")>ShadowSuffixRunes || [text rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].length)text=nil;
  dispatch_async(dispatch_get_main_queue(),^{[weak complete:text model:model generation:generation];});
 }];
 [task resume];return task;
}
- (void)update:(NSString *)source revision:(NSUInteger)revision {
 [self clear];self.revision=revision;
 if(!source || shadow_runes(source.UTF8String)<2 || shadow_runes(source.UTF8String)>ShadowContextRunes)return;
 self.task=[self request:source model:NO];
 self.modelTask=[self request:source model:YES];
}
@end

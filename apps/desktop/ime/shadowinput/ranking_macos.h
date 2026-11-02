// The controller owns cancellation and applies only to its unchanged activation.
@interface ShadowRanking : NSObject
@property(strong) NSURLSession *session;
@property(strong) NSURLSessionDataTask *task;
@property NSUInteger epoch;
@property(copy) void (^ready)(NSDictionary *,NSString *);
- (void)update:(NSDictionary *)snapshot revision:(NSUInteger)revision activation:(NSString *)activation;
@end
@implementation ShadowRanking
- (instancetype)init { if((self=[super init]))self.session=shadowLocalSession();return self; }
- (void)dealloc { [self.task cancel];[self.session invalidateAndCancel]; }
- (void)update:(NSDictionary *)snapshot revision:(NSUInteger)revision activation:(NSString *)activation {
 self.epoch++;[self.task cancel];self.task=nil;
 if(!snapshot || !activation.length || !shadowEndpointEnabled(@"ranking"))return;
 NSMutableDictionary *body=[snapshot mutableCopy];body[@"session_id"]=activation;body[@"generation"]=@1;body[@"revision"]=@(revision);
 NSData *bytes=[NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
 if(!bytes || bytes.length>32768)return;
 NSMutableURLRequest *request=shadowLocalRequest(@"ranking",@"rank",bytes);if(!request)return;
 request.timeoutInterval=1;
 NSUInteger epoch=self.epoch;__weak ShadowRanking *weak=self;
 self.task=[self.session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
  if(error || ![response isKindOfClass:NSHTTPURLResponse.class] || ((NSHTTPURLResponse *)response).statusCode!=200 || data.length>4096)return;
  id result=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if(![result isKindOfClass:NSDictionary.class])return;
  dispatch_async(dispatch_get_main_queue(),^{
   ShadowRanking *owner=weak;if(!owner || owner.epoch!=epoch || !shadowEndpointEnabled(@"ranking"))return;
   owner.task=nil;
   if(owner.ready)owner.ready(@{@"op":@"keyboard_ranked",@"status":@"ok",@"activation":activation,@"revision":@(revision),@"rankResult":result},activation);
  });
 }];
 [self.task resume];
}
@end

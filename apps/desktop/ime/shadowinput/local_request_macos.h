// Shared capability transport for bounded local ranking and continuation.
static NSURLSession *shadowLocalSession(void) {
 NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;
 config.URLCache=nil;config.HTTPCookieStorage=nil;config.connectionProxyDictionary=@{};
 return [NSURLSession sessionWithConfiguration:config];
}
static NSString *shadowEndpointPath(NSString *name) {
#ifdef ARION_LEARNING_TESTING
 NSString *isolated=NSProcessInfo.processInfo.environment[@"SHADOWINPUT_TEST_DIRECTORY"];
 if(isolated.isAbsolutePath)return [isolated stringByAppendingPathComponent:[name stringByAppendingString:@".endpoint"]];
#endif
 NSString *base=NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory,NSUserDomainMask,YES).firstObject;
 return [[base stringByAppendingPathComponent:@"shadowinput"] stringByAppendingPathComponent:[name stringByAppendingString:@".endpoint"]];
}
static BOOL shadowEndpointEnabled(NSString *name) { return [NSFileManager.defaultManager fileExistsAtPath:shadowEndpointPath(name)]; }
static NSMutableURLRequest *shadowLocalRequest(NSString *name,NSString *route,NSData *body) {
 NSString *config=[NSString stringWithContentsOfFile:shadowEndpointPath(name) encoding:NSUTF8StringEncoding error:nil];
 NSArray *lines=[config componentsSeparatedByString:@"\n"];
 if(lines.count!=3 || ![lines[0] hasPrefix:@"127.0.0.1:"] || [lines[1] length]<20)return nil;
 NSString *port=[lines[0] substringFromIndex:10];
 if(!port.length || [port rangeOfCharacterFromSet:NSCharacterSet.decimalDigitCharacterSet.invertedSet].location!=NSNotFound || port.intValue<1 || port.intValue>65535)return nil;
 NSCharacterSet *tokenCharacters=[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ234567"];
 if([lines[1] length]>100 || [lines[1] rangeOfCharacterFromSet:tokenCharacters.invertedSet].location!=NSNotFound)return nil;
 NSURL *url=[NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%d/%@",port.intValue,route]];
 NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:2];
 request.HTTPMethod=@"POST";request.HTTPBody=body;
 [request setValue:[@"Bearer " stringByAppendingString:lines[1]] forHTTPHeaderField:@"Authorization"];
 [request setValue:@"text/plain; charset=utf-8" forHTTPHeaderField:@"Content-Type"];
 return request;
}

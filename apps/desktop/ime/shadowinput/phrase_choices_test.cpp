#include "phrase_choices.h"
#include <iostream>
#include <stdexcept>

static void require(bool ok,const char *why){if(!ok)throw std::runtime_error(why);}
int main(){
 try {
  ShadowPhraseChoices choices{};
  require(shadow_choices_complete(&choices,false,"负责人"),"dictionary should appear immediately");
  require(choices.count==1 && !strcmp(shadow_choices_selected(&choices),"负责人"),"dictionary first");
  require(shadow_choices_complete(&choices,true,"会议"),"model should append a distinct choice");
  require(choices.count==2 && !strcmp(shadow_choices_selected(&choices),"负责人"),"model replaced the first choice");
  require(shadow_choices_move(&choices,1) && !strcmp(shadow_choices_selected(&choices),"会议"),"keyboard cannot select model choice");
  require(!shadow_choices_complete(&choices,true,"改变"),"selection allowed late changes");
  shadow_choices_reset(&choices);
  shadow_choices_complete(&choices,false,"负责人");shadow_choices_move(&choices,1);
  require(!shadow_choices_complete(&choices,true,"迟到") && choices.count==1,"late model appended after selection began");
  shadow_choices_reset(&choices);
  require(!shadow_choices_complete(&choices,true,"会议") && choices.count==0,"model jumped ahead of pending dictionary");
  shadow_choices_complete(&choices,false,"负责人");
  require(choices.count==2 && !strcmp(shadow_choices_selected(&choices),"负责人"),"out-of-order results changed priority");
  shadow_choices_reset(&choices);shadow_choices_complete(&choices,true,"会议");shadow_choices_complete(&choices,false,"");
  require(choices.count==1 && !strcmp(shadow_choices_selected(&choices),"会议"),"model unavailable without dictionary match");
  shadow_choices_reset(&choices);shadow_choices_complete(&choices,false,"负责人");shadow_choices_complete(&choices,true,"负责人");
  require(choices.count==1,"duplicate model suffix shown twice");
  shadow_choices_reset(&choices);
  require(!choices.count && !*shadow_choices_selected(&choices),"clear retained a deliverable choice");
  std::cout<<"PASS: lexical-first append, deduplication, out-of-order arrival, selection freeze and reset\n";
 }catch(const std::exception &error){std::cerr<<error.what()<<'\n';return 1;}
}

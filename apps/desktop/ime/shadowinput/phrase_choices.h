#pragma once
#include "continuation.h"
#include <stdbool.h>

typedef struct {
    char text[2][ShadowSuffixRunes*4+1];
    bool done[2],locked;
    size_t visible[2],count,selected;
} ShadowPhraseChoices;

static inline void shadow_choices_reset(ShadowPhraseChoices *choices){memset(choices,0,sizeof(*choices));}
static inline const char *shadow_choices_at(const ShadowPhraseChoices *choices,size_t index){return index<choices->count?choices->text[choices->visible[index]]:"";}
static inline const char *shadow_choices_selected(const ShadowPhraseChoices *choices){return shadow_choices_at(choices,choices->selected);}
static inline bool shadow_choices_move(ShadowPhraseChoices *choices,int direction){
    if(!choices->count)return false;
    choices->locked=true;
    choices->selected=(choices->selected+choices->count+(direction>0?1:choices->count-1))%choices->count;
    return true;
}
// One completed response per lane. A model that finishes first waits for the
// dictionary result, so the first visible choice never jumps to another slot.
static inline bool shadow_choices_complete(ShadowPhraseChoices *choices,bool model,const char *text){
    size_t slot=model?1:0;
    if(choices->locked || choices->done[slot])return false;
    choices->done[slot]=true;
    size_t length=text?strlen(text):0;
    bool valid=length>0 && length<sizeof(choices->text[slot]) && shadow_runes(text)<=ShadowSuffixRunes;
    for(size_t i=0;valid && i<length;++i)if((unsigned char)text[i]<32 || text[i]==127)valid=false;
    if(valid)memcpy(choices->text[slot],text,length+1);
    if(!choices->done[0])return false;
    size_t before=choices->count;
    choices->count=0;
    if(*choices->text[0])choices->visible[choices->count++]=0;
    if(*choices->text[1] && strcmp(choices->text[0],choices->text[1]))choices->visible[choices->count++]=1;
    return choices->count!=before;
}

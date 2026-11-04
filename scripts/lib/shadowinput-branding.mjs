// Product identity transformations for the isolated derivative source tree.
export function brandInputSource(text) {
  text=text.replaceAll('si.astrafoundry.inputmethod.arion','org.shadowinput.inputmethod.shadowinput')
   .replaceAll('si.astrafoundry.arion','org.shadowinput')
   .replaceAll('ArionInput_Connection','ShadowInput_Connection')
   .replaceAll('ARION_DATA_DIR','SHADOWINPUT_DATA_DIR')
   .replaceAll('Arion.Voice.TSF','ShadowInput.TSF').replaceAll('Arion.Native','ShadowInput.Native').replaceAll('arion://','shadowinput://')
   .replaceAll('"Arion"','"shadowinput"').replaceAll('\\\\Arion\\\\','\\\\shadowinput\\\\');
  text=text.replace('0x0cf9199c,0xbc90,0x44f0,{0x93,0x31,0x47,0x4f,0xa6,0x74,0x22,0x71}', '0xe150a8e4,0x9e39,0x4d80,{0xbf,0xa6,0x40,0xe4,0x7e,0xc9,0x75,0x39}')
    .replace('0x78fbf1a9,0x3b48,0x4b37,{0xa5,0x2c,0xb7,0x3d,0x9d,0x31,0x22,0x63}', '0x09def652,0x8bdd,0x4ea7,{0xae,0x89,0xe4,0x4a,0x63,0x83,0x47,0x25}');
  for(const [before,after] of [['Open Arion','Open shadowinput'],['Could not open Arion','Could not open shadowinput'],['打开 Arion','打开 shadowinput']])text=text.replaceAll(before,after);
  return text;
}

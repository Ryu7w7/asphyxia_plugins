import { ALL_ITEMS } from '../data/items';

export const drawChaseGacha = async (info: any, data: any, send: any) => {
  const nren = $(data).number('nren') || 1;
  const gachaid = $(data).str('gachaid') || "Gacha_DressUp";
  console.log(`[gacha.drawChaseGacha] Serving ${nren} pulls (with omakes) for ${gachaid}`);
  
  const BI = Function('return BigInt')();
  let receipts = [];
  
  // Use the modularized item list
  const blacklist = ["BODY00006001", "WEAP00001201"];
  const validItems = ALL_ITEMS.filter(id => !blacklist.includes(id));
  
  const gachaTypeStr = (gachaid === "rain") ? "1" : "2";

  for(let i=0; i<nren; i++) {
    const randomItem = validItems[Math.floor(Math.random() * validItems.length)];
    const timestamp = Date.now();
    
    // Receipt 1: The Main Dress-up Item
    receipts.push({
      baseid: K.ITEM('str', randomItem), 
      ghid: K.ITEM('s64', BI(timestamp + (i * 2)) as any),
      gachatype: K.ITEM('str', gachaTypeStr), 
      gachaid: K.ITEM('str', gachaid),
      outtime: K.ITEM('s64', BI(timestamp) as any),
      note: K.ITEM('str', "asphyxia_main"),
      quantity: K.ITEM('s32', 1)
    });

    // Receipt 2: The Mandatory OMAKE (Bonus) - Without this, the UI fails to load sprites!
    receipts.push({
      baseid: K.ITEM('str', "ABIL00000108"), 
      ghid: K.ITEM('s64', BI(timestamp + (i * 2) + 1) as any),
      gachatype: K.ITEM('str', "OMAKE"), 
      gachaid: K.ITEM('str', gachaid),
      outtime: K.ITEM('s64', BI(timestamp) as any),
      note: K.ITEM('str', "asphyxia_omake"),
      quantity: K.ITEM('s32', 1)
    });
  }

  return send.object({
    gacha: receipts
  });
};
import { getShopData } from '../data/items';

export const dataLoad = async (info: any, data: any, send: any) => {
  console.log(`[system.dataLoad] Serving system data with dynamic shop items`);
  
  // Load the XML template
  let xml = await IO.ReadFile('xml/dataLoad.xml');
  if (xml) {
    // Inject the shop data from the modular items repository
    const shopJson = JSON.stringify(getShopData());
    let xmlStr = xml.toString().replace('{{SHOP_DATA_JSON}}', shopJson);
    return send.xml(xmlStr);
  }
  
  // Fallback if file read fails
  return send.xmlFile('xml/dataLoad.xml');
};

export const pcbBoot = async (info: any, data: any, send: any) => {
  console.log(`[system.pcbBoot] Hardware handshake from XML`);
  send.xmlFile('xml/pcbBoot.xml');
};

export const getGachaSchedule = async (info: any, data: any, send: any) => {
  send.xmlFile('xml/getGachaSchedule.xml');
};

export const genericSuccess = (info: any, data: any, send: any) => {
  const method = info.method;
  console.log(`[XRPC] ${method} - Returning generic success`);
  
  try {
    const root = $(data).element('gdata');
    if (root) {
      const jsonNode = root.element('json');
      if (jsonNode) {
        const resulttype = jsonNode.str('resulttype');
        const jsondata = jsonNode.str('jsondata');
        console.log(`[XRPC Debug] Payload sent by client. Type: ${resulttype}`);
        // Log brief mention instead of dumping large files every time to save IO
      }
    }
  } catch (e) {
    console.log(`[XRPC Debug] XRPC Parsing Failed`);
  }

  return send.object({});
};

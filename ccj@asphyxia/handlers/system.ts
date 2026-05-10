import { getShopData } from '../data/items';

export const dataLoad = async (info: any, data: any, send: any) => {
  console.log(`[system.dataLoad] Serving system data with dynamic shop items`);
  
  let xml = await IO.ReadFile('xml/dataLoad.xml');
  if (xml) {
    const shopJson = JSON.stringify(getShopData());
    let xmlStr = xml.toString().replace('{{SHOP_DATA_JSON}}', shopJson);
    return send.xml(xmlStr);
  }
  
  return send.xmlFile('xml/dataLoad.xml');
};

export const pcbBoot = async (info: any, data: any, send: any) => {
  const clientIp = (info as any).client_ip || (info as any).ip || '127.0.0.1';
  
  console.log(`[system.pcbBoot] Booting client: ${clientIp}`);
  
  let xml = await IO.ReadFile('xml/pcbBoot.xml');
  if (xml) {
    let xmlStr = xml.toString()
      .replace('{{GLOBAL_IP}}', clientIp)
      .replace('{{GLOBAL_PORT}}', '5700')
      .replace('{{PRIVATE_PORT}}', '5700');
    return send.xml(xmlStr);
  }
  
  send.xmlFile('xml/pcbBoot.xml');
};

export const getGachaSchedule = async (info: any, data: any, send: any) => {
  send.xmlFile('xml/getGachaSchedule.xml');
};

export const genericSuccess = (info: any, data: any, send: any) => {
  return send.object({});
};

export interface Profile {
  collection: 'profile';

  id: number;
  name: string;
  level: number;
  exp: number;
  
  // Custom fields
  items: string[];
  charaID: number;
  
  // Metadata
  pluginVer: number;
}

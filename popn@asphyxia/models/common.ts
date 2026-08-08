export interface Phase {
  id: number,
  p: number,
}

export interface ExtraData {
  [field: string]: {
    path: string,
    pathSrc?: string,
    type: string,
    default: any,
    isArray?: true,
  };
};

export interface Profile {
  collection: 'profile',
  name: string,
  friendId: string,
  dataVersion: number
}

export interface Params {
  collection: 'params',
  version: string,

  params: {
    [key: string]: any;
  };
}

export interface Rivals {
  collection: 'rivals',
  rivals: string[]
}

export interface Scores {
  collection: 'scores',
  version: string,

  scores: {
    [key: string]: {
      clear_type?: number,
      score: number,
      cnt: number,
      clear_rank?: number,
      cool?: number,
      great?: number,
      good?: number,
      bad?: number,
      combo?: number,
      highlight?: number,
      gauge?: number,
      gauge_type?: number,
      slow?: number,
      fast?: number,
      ex_gauge_lv?: number,
      options?: { [key: string]: number },
    };
  };
}

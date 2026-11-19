export interface Score{
    collection: "score";
    musicId: number;
    seq: number;
    score: number;
    clear: number;
    musicRate: number;
    bar: number[];
    playCount: number;
    clearCount: number;
    fullcomboCount: number;
    excellentCount: number;
    isHardMode: number;
}

export interface ScoreHistory{
    collection: "score.history";
    musicId: number;
    seq: number;
    score: number;
    musicRate: number;
    bar: number[];
    fullcombo: number;
    perfect: number;
    great: number;
    good: number;
    poor: number;
    miss: number;
    isHardMode: number;
}

export const ImageSlots = {
  MAIN : 0,
  LUT  : 1,
  ORIG : 2,
  ALPHA: 3, //brush stroke "alpha" (actually xy of normal map in rg + height in b)
  ACCUM: 4, //accumulation buffer for when not in accumulation mode
};

export const CanvasCommands = {
  SETBRUSH   : 0,
  DOT        : 1,
  BEGINSTROKE: 2
};
export const CommandFormat = {
  [CanvasCommands.SETBRUSH]   : {args: 9},
  [CanvasCommands.DOT]        : {args: 6},
  [CanvasCommands.BEGINSTROKE]: {args: 0},
}


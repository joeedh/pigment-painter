import {CSSFont} from '../path.ux/pathux.js';

export const theme = {
  base: {
    AreaHeaderBG        : 'rgba(173,173,173,0.95)',
    BasePackFlag        : 0,
    BoxDepressed        : 'rgba(130,130,130, 1)',
    BoxHighlight        : 'rgba(151,208,239, 1)',
    "flex-grow"         : "unset",
    DefaultText         : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    LabelText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    TitleText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    'background-color'  : 'rgba(207,207,207, 0.5)',
    'border-color'      : 'rgba(34,34,34, 1)',
    'border-radius'     : 12.010619764585666,
    'focus-border-width': 2,
    oneAxisPadding      : 2,
    padding             : 1,
  },

  button: {
    DefaultText        : new CSSFont({
      font   : 'poppins',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(35,35,35, 1)'
    }),
    'background-color' : 'rgba(238,238,238, 0.8672412740773168)',
    'border-color'     : 'rgba(255,255,255, 1)',
    'border-radius'    : 4,
    'border-style'     : 'solid',
    'border-width'     : 2,
    disabled           : {
      DefaultText       : new CSSFont({
        font   : 'poppins',
        weight : 'bold',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgb(109,109,109)'
      }),
      'background-color': 'rgb(19,19,19)',
      'border-color'    : '#f58f8f',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    height             : 25,
    highlight          : {
      DefaultText       : new CSSFont({
        font   : 'poppins',
        weight : 'bold',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(255,255,255, 1)'
      }),
      'background-color': 'rgba(138,222,255, 1)',
      'border-color'    : 'rgba(255,255,255, 1)',
      'border-radius'   : 4,
      'border-style'    : 'solid',
      'border-width'    : 2,
    },
    'highlight-pressed': {
      DefaultText       : new CSSFont({
        font   : 'poppins',
        weight : 'bold',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(35,35,35, 1)'
      }),
      'background-color': 'rgba(113,113,113, 1)',
      'border-color'    : '#DADCE0',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    margin             : 4,
    'margin-left'      : 4,
    'margin-right'     : 4,
    padding            : 1,
    pressed            : {
      DefaultText       : new CSSFont({
        font   : 'poppins',
        weight : 'bold',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(35,35,35, 1)'
      }),
      'background-color': 'rgba(113,113,113, 1)',
      'border-color'    : '#DADCE0',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    width              : 25,
  },

  checkbox: {
    CheckSide: 'left',
    height   : 32,
    width    : 32,
  },

  colorfield: {
    circleSize    : 11,
    colorBoxHeight: 24,
    fieldSize     : 400,
    height        : 256,
    hueHeight     : 32,
    width         : 256,
  },

  colorpickerbutton: {
    height: 32,
    width : 95,
  },

  curvewidget: {
    CanvasBG    : 'rgb(44,44,44)',
    CanvasHeight: 256,
    CanvasWidth : 256,
  },

  dropbox: {
    dropTextBG: 'rgba(233,233,233, 1)',
    height    : 25,
    width     : 32,
  },

  iconbutton: {
    highlight: {
      'background-color': 'rgba(133,182,255,0.8)',
      'border-color'    : 'black',
      'border-radius'   : 5,
      'border-width'    : 1,
      height            : 32,
      'margin-bottom'   : 1,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    depressed: {
      'background-color': 'rgba(42,61,77,0.8)',
      'border-color'    : 'black',
      'border-radius'   : 5,
      'border-width'    : 1,
      height            : 32,
      'margin-bottom'   : 1,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },

    'background-color': 'rgba(15,15,15, 0)',
    'border-color'    : 'black',
    'border-radius'   : 5,
    'border-width'    : 1,
    height            : 32,
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  iconcheck: {
    highlight         : {
      'background-color': 'rgba(133,182,255,0.8)',
      'border-color'    : 'black',
      'border-radius'   : 5,
      'border-width'    : 1,
      height            : 32,
      'margin-bottom'   : 1,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    depressed         : {
      'background-color': 'rgba(42,61,77,0.8)',
      'border-color'    : 'black',
      'border-radius'   : 5,
      'border-width'    : 1,
      height            : 32,
      'margin-bottom'   : 1,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    'background-color': 'rgba(15,15,15, 0)',
    'border-color'    : 'rgba(237,209,209, 1)',
    'border-radius'   : 5,
    'border-width'    : 0,
    drawCheck         : true,
    height            : 32,
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  label: {
    LabelText: new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
  },

  listbox: {
    ListActive   : 'rgba(200, 205, 215, 1.0)',
    ListHighlight: 'rgba(155, 220, 255, 0.5)',
    height       : 200,
    width        : 110,
  },

  menu: {
    MenuBG         : 'rgba(250, 250, 250, 1.0)',
    MenuBorder     : '1px solid grey',
    MenuHighlight  : 'rgba(155, 220, 255, 1.0)',
    MenuSeparator  : {
      width             : "100%",
      height            : 0.5,
      padding           : 0,
      margin            : 0,
      border            : "none",
      "border-radius"   : 2,
      "background-color": "grey",
    },
    MenuSpacing    : 5,
    MenuText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(25, 25, 25, 1.0)'
    }),
    'border-color' : 'grey',
    'border-radius': 5,
    'border-style' : 'solid',
    'border-width' : 1,
  },

  numslider: {
    'background-color': 'rgba(219,219,219, 1)',
    'border-color'    : 'black',
    'border-radius'   : 1,
    height            : 18,
    width             : 90,
    BoxHighlight      : 'rgb(165,214,245)',
  },

  numslider_simple: {
    SlideHeight       : 10,
    TextBoxWidth      : 45,
    'background-color': 'rgba(219,219,219, 1)',
    height            : 18,
    labelOnTop        : true,
    width             : 135,
    BoxHighlight      : 'rgb(165,214,245)',
  },

  numslider_textbox: {
    TextBoxHeight     : 25,
    TextBoxWidth      : 50,
    'background-color': 'rgba(219,219,219, 1)',
    height            : 25,
    labelOnTop        : true,
    width             : 120,
    BoxHighlight      : 'rgb(165,214,245)',
  },

  panel: {
    HeaderBorderRadius    : 5.329650280441558,
    HeaderRadius          : 4,
    TitleBackground       : 'rgba(177,219,255, 1)',
    TitleBorder           : 'rgba(104,104,104, 1)',
    TitleText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(0,0,0, 1)'
    }),
    'background-color'    : 'rgba(184,184,184, 0.7594818376068376)',
    'border-color'        : 'rgba(0,0,0, 0.5598061397157866)',
    'border-radius'       : 4,
    'border-style'        : 'groove',
    'border-width'        : 1.141,
    'margin-bottom'       : 0,
    'margin-bottom-closed': 0,
    'margin-left'         : 5.6584810220495445,
    'margin-right'        : 0,
    'margin-top'          : 0,
    'margin-top-closed'   : 0,
    'padding-bottom'      : 0,
    'padding-left'        : 0,
    'padding-right'       : 0,
    'padding-top'         : 0,
  },

  richtext: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 16,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    'background-color': 'rgb(245, 245, 245)',
  },

  screenborder: {
    'border-inner'   : 'grey',
    'border-outer'   : 'rgba(228,228,228, 1)',
    'border-width'   : 2,
    'mouse-threshold': 5,
  },

  scrollbars: {
    border  : undefined,
    color   : undefined,
    color2  : undefined,
    contrast: undefined,
    width   : undefined,
  },

  sidebar: {
    'background-color': 'rgba(55, 55, 55, 0.5)',
  },

  strip: {
    'background-color': 'rgba(75,75,75, 0.33213141025641024)',
    'border-color'    : 'rgba(0,0,0, 0.31325409987877156)',
    'border-radius'   : 8.76503417507447,
    'border-style'    : 'solid',
    'border-width'    : 1,
    margin            : 2,
    oneAxisPadding    : 2,
    padding           : 1,
    "flex-grow"       : "unset",
  },

  tabs: {
    "movable-tabs"    : "true",
    TabActive         : 'rgba(212,212,212, 1)',
    TabBarRadius      : 6,
    TabHighlight      : 'rgba(50, 50, 50, 0.2)',
    TabInactive       : 'rgba(183,183,183, 1)',
    TabStrokeStyle1   : 'rgba(0,0,0, 1)',
    TabStrokeStyle2   : 'rgba(0,0,0, 1)',
    TabText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'bold',
      style  : 'normal',
      size   : 15,
      color  : 'rgba(0,0,0, 1)'
    }),
    'background-color': 'rgba(222,222,222, 1)',
  },

  textbox: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(3,3,3, 1)'
    }),
    'background-color': 'rgba(245,245,245, 1)',
  },

  tooltip: {
    ToolTipText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    'background-color': 'rgba(255,255,255, 1)',
    'border-color'    : 'rgba(139,139,139, 1)',
    'border-radius'   : 3,
    'border-style'    : 'solid',
    'border-width'    : 1,
    padding           : 5,
  },

  treeview: {
    itemIndent: 10,
    rowHeight : 18,
  },

  popup: {
    "background-color": "rgba(200,200,200,1.0)",
    "border-radius"   : 15,
  },

  vecPopupButton: {
    height : 18,
    padding: 3,
    width  : 100,
  },

};

/* WARNING: auto-generated file! *
 * Copy to scripts/core/theme.js */

import {CSSFont} from '../path.ux/pathux.js';

export const theme = {
  base        : {
    AreaHeaderBG    : 'rgba(65,65,65, 0.9501041634877523)',
    BasePackFlag    : 0,
    BoxDepressed    : 'rgba(32,32,32, 1)',
    BoxHighlight    : 'rgba(151,208,239, 1)',
    DefaultText     : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(241,241,241, 1)'
    }),
    LabelText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(237,237,237, 1)'
    }),
    TitleText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(241,241,241, 1)'
    }),
    disabled        : {
      'background-color': 'rgb(73,73,73)',
    },
    internalDisabled: {
      'background-color': 'rgb(56,56,56)',
    },

    'background-color'  : 'rgba(207,207,207, 0.5)',
    'border-color'      : 'rgba(34,34,34, 1)',
    'border-radius'     : 12.010619764585666,
    'flex-grow'         : 'unset',
    'focus-border-width': 2,
    oneAxisPadding      : 2,
    padding             : 1,
  },
  notification: {
    DefaultText       : new CSSFont({
      font   : 'poppins',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgb(225,225,225)'
    }),
    "background-color": "rgba(72,72,72,0)",
    "border-radius"   : 5,
    "border-color"    : "grey",
    "border-width"    : 1,
    "border-style"    : "solid",
    ProgressBarBG     : "rgb(74,148,183)",
    ProgressBar       : "rgb(250,132,58)",
  },
  button      : {
    DefaultText        : new CSSFont({
      font   : 'poppins',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(234,234,234, 1)'
    }),
    'background-color' : 'rgba(102,102,102, 0.8672412740773168)',
    'border-color'     : 'rgba(181,181,181, 1)',
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
      'border-radius'   : 4,
      'border-style'    : 'solid',
      'border-width'    : 2,
      margin            : 4,
      'margin-left'     : 4,
      'margin-right'    : 4,
      padding           : 1,
      'padding-left'    : 2,
      'padding-right'   : 2,
    },
    height             : 15,
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
      margin            : 4,
      'margin-left'     : 4,
      'margin-right'    : 4,
      padding           : 1,
      'padding-left'    : 2,
      'padding-right'   : 2,
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
      'border-radius'   : 4,
      'border-style'    : 'solid',
      'border-width'    : 2,
      margin            : 4,
      'margin-left'     : 4,
      'margin-right'    : 4,
      padding           : 1,
    },
    margin             : 4,
    'margin-left'      : 4,
    'margin-right'     : 4,
    padding            : 0,
    'padding-left'     : 4.808670709628941,
    'padding-right'    : 3.0536720046271224,
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
    'background-color': 'rgba(83,83,83, 1)',
    circleSize        : 11,
    colorBoxHeight    : 24,
    fieldSize         : 400,
    height            : 256,
    hueHeight         : 32,
    width             : 256,
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
    dropTextBG: 'rgba(38,38,38, 1)',
    height    : 25,
    width     : 32,
  },

  iconbutton: {
    'background-color': 'rgba(15,15,15, 0)',
    'border-color'    : 'black',
    'border-radius'   : 5,
    'border-width'    : 1,
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
    height            : 32,
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
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  iconcheck: {
    'background-color': 'rgba(15,15,15, 0)',
    'border-color'    : 'rgba(237,209,209, 1)',
    'border-radius'   : 5,
    'border-width'    : 0,
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
    drawCheck         : true,
    height            : 32,
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
    MenuBG          : 'rgba(49,49,49, 1)',
    MenuBorder      : '1px solid grey',
    MenuHighlight   : 'rgba(100,100,100, 1)',
    MenuSeparator   : {
      'background-color': 'rgba(95,95,95, 1)',
      border            : 'none',
      'border-radius'   : 2,
      height            : 1,
      margin            : 0,
      padding           : 0,
      width             : '100%',
    },
    MenuSpacing     : 3.1600335806468203,
    MenuText        : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(233,233,233, 1)'
    }),
    'border-color'  : 'rgba(97,97,97, 0.9949997965494791)',
    'border-radius' : 7,
    'border-style'  : 'solid',
    'border-width'  : 0,
    'box-shadow'    : '5px 5px 25px rgba(0,0,0,0.75)',
    'item-radius'   : 0,
    padding         : 15,
    'padding-bottom': 8,
    'padding-left'  : 0,
    'padding-right' : 0,
    'padding-top'   : 15,
  },

  numslider: {
    disabled          : {
      'background-color': 'rgb(26,26,26)',
    },
    BoxHighlight      : 'rgba(74,137,179, 1)',
    'background-color': 'rgba(98,98,98, 1)',
    'border-color'    : 'rgba(196,196,196, 1)',
    'border-radius'   : 15,
    height            : 18,
    width             : 90,
  },

  numslider_simple: {
    BoxHighlight      : 'rgba(74,137,179, 1)',
    SlideHeight       : 10,
    TextBoxWidth      : 45,
    'background-color': 'rgba(219,219,219, 1)',
    height            : 18,
    labelOnTop        : true,
    width             : 135,
  },

  numslider_textbox: {
    BoxHighlight      : 'rgba(74,137,179, 1)',
    TextBoxHeight     : 25.5,
    TextBoxWidth      : 50,
    'background-color': 'rgba(48,48,48, 1)',
    height            : 25,
    labelOnTop        : true,
    width             : 120,
  },

  panel: {
    HeaderBorderRadius    : 5.329650280441558,
    HeaderRadius          : 4,
    TitleBackground       : 'rgba(88,117,143, 1)',
    TitleBorder           : 'rgba(104,104,104, 1)',
    TitleText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(255,255,255, 1)'
    }),
    'background-color'    : 'rgba(27,27,27, 0.05843744913736979)',
    'border-color'        : 'rgba(80,107,130, 1)',
    'border-radius'       : 4,
    'border-style'        : 'solid',
    'border-width'        : 0.0,
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

  popup: {
    'background-color': 'rgba(81,81,81, 0.6695832316080729)',
    'border-color'    : 'rgba(138,138,138, 1)',
    'border-radius'   : 27,
    'border-style'    : 'solid',
    'border-width'    : 2,
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
    'border-inner'   : 'rgba(73,73,73, 1)',
    'border-outer'   : 'rgba(135,135,135, 1)',
    'border-width'   : 0.75,
    'mouse-threshold': 35,
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
    'flex-grow'       : 'unset',
    margin            : 2,
    oneAxisPadding    : 2,
    padding           : 1,
  },

  tabs: {
    TabActive         : 'rgba(84,84,84, 1)',
    TabBarRadius      : 6,
    TabHighlight      : 'rgba(192,214,241, 0.5834374968210856)',
    TabInactive       : 'rgba(39,39,39, 1)',
    TabStrokeStyle1   : 'rgba(0,0,0, 1)',
    TabStrokeStyle2   : 'rgba(0,0,0, 1)',
    TabText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'bold',
      style  : 'normal',
      size   : 15,
      color  : 'rgba(240,240,240, 1)'
    }),
    'background-color': 'rgba(82,82,82, 1)',
    'movable-tabs'    : 'true',
  },

  textbox: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(213,213,213, 1)'
    }),
    'background-color': 'rgba(44,44,44, 1)',
  },

  tooltip: {
    ToolTipText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(242,242,242, 1)'
    }),
    'background-color': 'rgba(52,52,52, 1)',
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

  vecPopupButton: {
    height : 18,
    padding: 3,
    width  : 100,
  },

};
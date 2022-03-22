[Demo](https://joeedh.github.io/pigment-painter/)

Implementation of "Mixbox: Practical Pigment Mixing for Digital Painting"
See https://github.com/scrtwpns/pigment-mixing

Warning: research code!

In addition to the pigment implementation, there is also an
approach based on building a color space from arbitrary 
user-controller color lines.  It doesn't work nearly as
well as the mixbox approach.  This lookup table is edited
in the "Triplet LUT" tab.

# The Code

There are seperate paint implementations in in JS, C++/WASM 
and GLSL.  The JS and WASM code is used to generate 
and optimize the lookup tables.  The actual painting
is done by WebGL (there are paint backends in both
JS and WASM but those are obsolute).

Note that in an attempt to be compatible with MixBox's 
lookup tables the lookup tables have their green and
blue components swapped.  This may change.

# Differences from MixBox

* I had a lot of trouble tracking down the CIE 10 degree observer function; what I finally came up with may not be 100% correct.
* After generating the lookup tables it is necassary to fill in a lot of empty space.  The paper is not clear on how they did this, but I ended up going with a combination of a breadth-first fill, laplacian blur, and a bit of gradient descent.  
* I was not able to 100% reproduce the mixbox lookup tables.  To do so I would need to know which components map to which pigments; logically speaking it should be CMYK, but they may have chosen a different order.  
* Not all of the LUT optimization parameters have been moved to the UI.  Specifically the "stretch" optimizer has two different modes, one of which can only be enabled from the code.
* The triplet LUT idea was a total failure, I'll probably remove it from the UI in the near future.
* Ignore the Hermite mode, it works but doesn't seem to give much benefit.
* I played around with brushes a bit; the smudge brush is somewhat advanced and there are normal mapped brush alphas. 

# Changing Pigments

Changing pigments is a bit tricky, since you have to regenerate the lookup tables
(remember that this is research code).

The steps to change a pigment are:

* Go to the Pigments tab.  There are four panels, CMYK, for
  blue, magenta, yellow and white (not black).
* If you expand a tab you'll see a dropbox to select a pigment.
* Select the pigments you want.
* Go to the Pigments LUT tab.
* Click "reset data."
* Click "optimize." Wait for the error field to reach zero, or close enough.
* Scroll way down and click the Create LUT button.
* After a bunch of processing a LUT will be created (actaully two, embedded in
  a single png file).
* This png file will be automatically downloaded, and also the browser will try to
  open it in a tab for viewing.
* The lookup table will be active until you reload the page.  To make it permanent you
  have to replace the right table in the assets folder.  As of this writing it is
  `assets/lut_wide_256.png`.

# License
The code is licensed under GPLv3.  The mixbox people did not have to publish a paper at all, nor did they have to publish a readable one.  Not only is their paper not obfuscated, but the video they published is so easy to understand that one could probably implement their method with that video alone.  Out of respect for their hard work I have decided to go with the GPL.  That includes the lookup tables in the assets/ folder.  You may not use them for commercial purposes unless you publish your code.

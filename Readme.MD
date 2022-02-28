Implementation of "Mixbox: Practical Pigment Mixing for Digital Painting"
See https://github.com/scrtwpns/pigment-mixing

Warning: research code!

In addition to the mixbox implementation, there is also an
approach based on building a color space from arbitrary 
user-controller color lines.  It doesn't work nearly as
well as the mixbox approach.  This lookup table is edited
in the "Triplet LUT" tab.

== The Code ==

The code is written in Javascript, GLSL and C++ 
(which is compiled to WebAssembly).


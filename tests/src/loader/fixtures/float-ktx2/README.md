# Native float KTX2 fixtures

Generated with the editor tools package's NodeKtx2Encoder rawFloatFormat option.
Each file contains a 5 × 3, single-level, linear R or RG float image.
Values repeat -2.75, 1 + 2^-22, 3.125, 2^-20. The half-float variant uses 1 for the second value.
Browser Worker output was compared byte-for-byte with Node output, and all files passed KTX Software 4.4.2 validation.

These fixtures exercise the public ResourceManager loader and WebGL2 RGBA float readback.

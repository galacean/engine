"""Pure recovered instance ABI arithmetic; never loads the game or an emulator.

BrickTransform::encode (0x1017cbf64) converts selected f32 lanes to IEEE binary16,
round-to-nearest/ties-to-even, and copies translation/integer lanes verbatim.
Defaults are field constructors, not captured scene records. Provenance refers to
Tiny Glade binary 4b3c8437…589a; differential verification lives in tests/.
"""
import math
import struct

SOURCE_BINARY_SHA256 = '4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a'
IDENTITY_AFFINE = (1., 0., 0., 0., 1., 0., 0., 0., 1., 0., 0., 0.)


def brick_default96():
    """Original 0x1017ce890: identity, zero sine deformation, disabled arch."""
    return struct.pack('<19fII2fI', *IDENTITY_AFFINE, 0., 0., 0., 0.,
                       -100., -100., -100., 0, 0, 0., 0., 0)


def wood_default80():
    """Original 0x10165ac08: identity with the native flags bit 0 enabled."""
    return struct.pack('<12fiiIIQII', *IDENTITY_AFFINE, 0, 0, 0, 1, 0, 0, 0)


def _round_shift_even(value, shift):
    quotient = value >> shift
    remainder = value & ((1 << shift) - 1)
    halfway = 1 << (shift - 1)
    return quotient + (remainder > halfway or (remainder == halfway and quotient & 1))


def f32_bits_to_f16(bits):
    """AArch64 FCVTN under default FPCR: preserve sign, quiet NaN payloads.

    Operate on source bits to retain negative zero and avoid double rounding.
    Subnormal outputs are retained; finite overflow rounds to signed infinity.
    """
    sign = (bits >> 16) & 0x8000
    exponent = (bits >> 23) & 0xff
    fraction = bits & 0x7fffff
    if exponent == 0xff:
        return sign | 0x7c00 | (((fraction >> 13) | 0x200) if fraction else 0)
    if exponent >= 143:
        return sign | 0x7c00
    if exponent < 102:
        return sign
    if exponent <= 112:
        return sign | _round_shift_even(0x800000 | fraction, 126 - exponent)
    return sign | (((exponent - 112) << 10) + _round_shift_even(fraction, 13))


def brick_encode64(raw):
    """Pack one source-domain96 input without interpreting shader integer bits."""
    if not isinstance(raw, (bytes, bytearray)) or len(raw) != 96:
        raise ValueError('Brick encoder requires exactly 96 bytes')
    words = struct.unpack('<24I', raw)
    affine = [f32_bits_to_f16(words[i]) for i in range(9)]
    shader = [f32_bits_to_f16(words[i]) for i in (12, 13, 14, 15, 16, 17, 18, 21, 22)]
    return (struct.pack('<10H', *affine, 0) + raw[36:48] +
            struct.pack('<10H', *shader, 0) + raw[76:84] + raw[92:96])


def quaternion(columns):
    """Existing generic cell frame-to-quaternion arithmetic, unchanged ordering."""
    a = [[columns[j][i] for j in range(3)] for i in range(3)]
    trace = sum(a[i][i] for i in range(3))
    if trace > 0:
        scale = math.sqrt(trace + 1) * 2
        return [(a[2][1] - a[1][2]) / scale,
                (a[0][2] - a[2][0]) / scale,
                (a[1][0] - a[0][1]) / scale, scale / 4]
    i = max(range(3), key=lambda k: a[k][k])
    j, k = (i + 1) % 3, (i + 2) % 3
    scale = math.sqrt(1 + a[i][i] - a[j][j] - a[k][k]) * 2
    result = [0., 0., 0., 0.]
    result[i] = scale / 4
    result[j] = (a[j][i] + a[i][j]) / scale
    result[k] = (a[k][i] + a[i][k]) / scale
    result[3] = (a[k][j] - a[j][k]) / scale
    return result

export const FDI = {
  upperRightPerm: ['18', '17', '16', '15', '14', '13', '12', '11'],
  upperLeftPerm: ['21', '22', '23', '24', '25', '26', '27', '28'],
  upperRightPrim: ['55', '54', '53', '52', '51'],
  upperLeftPrim: ['61', '62', '63', '64', '65'],
  lowerRightPerm: ['48', '47', '46', '45', '44', '43', '42', '41'],
  lowerLeftPerm: ['31', '32', '33', '34', '35', '36', '37', '38'],
  lowerRightPrim: ['85', '84', '83', '82', '81'],
  lowerLeftPrim: ['71', '72', '73', '74', '75'],
};

export function toothType(num) {
  const digit = Number(String(num).slice(-1));
  if (digit <= 2) return 'incisor';
  if (digit === 3) return 'canine';
  if (digit <= 5) return 'premolar';
  return 'molar';
}

export function isPrimaryTooth(num) {
  const quadrant = Math.floor(Number(num) / 10);
  return quadrant >= 5 && quadrant <= 8;
}

/** Subtle arch tilt in degrees (patient perspective, LTR layout). */
export function toothTilt(num, index, count, side, arch) {
  const t = count <= 1 ? 0 : index / (count - 1);
  const spread = isPrimaryTooth(num) ? 10 : 14;
  if (arch === 'upper') {
    if (side === 'right') return -spread + t * spread;
    return -spread / 2 + t * spread;
  }
  if (side === 'right') return spread - t * spread;
  return spread / 2 - t * spread;
}

/**
 * Numbering of characteristics in the properties panel.
 *
 * A new characteristic is named after the highest number in use, not after the
 * number of entries. Counting would hand out an existing number again once a
 * characteristic in between has been removed, and two entries would then share
 * their shortName and their uniqueIdent.
 */
const SHORT_NAME = /^C_(\d+)$/;

export function nextCharacteristicNumber(characteristics) {
  const highest = (characteristics || []).reduce(function (found, characteristic) {
    const shortName = (characteristic && characteristic.category && characteristic.category.shortName) || '';
    const match = SHORT_NAME.exec(shortName);

    return match ? Math.max(found, Number(match[1])) : found;
  }, 0);

  return highest + 1;
}

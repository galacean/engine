export default class LexerUtils {
  static isNum(charCode: number) {
    return charCode >= 48 && charCode <= 57;
  }

  static isLetter(charCode: number) {
    return (
      charCode === 95 || // _
      (charCode >= 48 && charCode <= 57) || // 0 - 9
      (charCode >= 65 && charCode <= 90) || // A - Z
      (charCode >= 97 && charCode <= 122) // a - z
    );
  }

  static isAlpha(charCode: number) {
    return (
      charCode === 95 || // _
      (charCode >= 65 && charCode <= 90) || // A - Z
      (charCode >= 97 && charCode <= 122) // a - z
    );
  }

  static isPpCharacters(charCode: number) {
    return (
      charCode === 35 || // #
      charCode === 46 || // .
      charCode === 95 || // _
      (charCode >= 48 && charCode <= 57) || // 0 - 9
      (charCode >= 65 && charCode <= 90) || // A - Z
      (charCode >= 97 && charCode <= 122) // a - z
    );
  }

  static isSpace(charCode: number) {
    return (
      charCode === 9 || // Tab
      charCode === 10 || // Line break - /n
      charCode === 13 || // Carriage return -/r
      charCode === 32 // Space
    );
  }
}

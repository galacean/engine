/**
 * The keys of the keyboard.
 * Keep up with W3C standards.(https://www.w3.org/TR/2017/CR-uievents-code-20170601/)
 */
export enum Keys {
  /** `~ on a US keyboard. This is the 半角/全角/漢字 (hankaku/zenkaku/kanji) key on Japanese keyboards. */
  Backquote,
  /** Used for both the US \| (on the 101-key layout) and also for the key located between the " and Enter keys on row C of the 102-, 104- and 106-key layouts. Labelled #~ on a UK (102) keyboard. */
  Backslash,
  /**	Backspace or ⌫. Labelled Delete on Apple keyboards. */
  Backspace,
  /** [{ on a US keyboard. */
  BracketLeft,
  /** ]} on a US keyboard. */
  BracketRight,
  /** ,< on a US keyboard. */
  Comma,
  /** 0) on a US keyboard. */
  Digit0,
  /** 1! on a US keyboard. */
  Digit1,
  /** 2@ on a US keyboard. */
  Digit2,
  /** 3# on a US keyboard. */
  Digit3,
  /** 4$ on a US keyboard. */
  Digit4,
  /** 5% on a US keyboard. */
  Digit5,
  /** 6^ on a US keyboard. */
  Digit6,
  /** 7& on a US keyboard. */
  Digit7,
  /** 8* on a US keyboard. */
  Digit8,
  /** 9( on a US keyboard. */
  Digit9,
  /** =+ on a US keyboard. */
  Equal,
  /** Located between the left Shift and Z keys. Labelled \| on a UK keyboard. */
  IntlBackslash,
  /** Located between the / and right Shift keys. Labelled \ろ (ro) on a Japanese keyboard. */
  IntlRo,
  /** Located between the = and Backspace keys. Labelled ¥ (yen) on a Japanese keyboard. \/ on a Russian keyboard. */
  IntlYen,
  /** a on a US keyboard. Labelled q on an AZERTY (e.g., French) keyboard. */
  KeyA,
  /** b on a US keyboard. */
  KeyB,
  /** c on a US keyboard. */
  KeyC,
  /** d on a US keyboard. */
  KeyD,
  /** e on a US keyboard. */
  KeyE,
  /** f on a US keyboard. */
  KeyF,
  /** g on a US keyboard. */
  KeyG,
  /** h on a US keyboard. */
  KeyH,
  /** i on a US keyboard. */
  KeyI,
  /** j on a US keyboard. */
  KeyJ,
  /** k on a US keyboard. */
  KeyK,
  /** l on a US keyboard. */
  KeyL,
  /** m on a US keyboard. */
  KeyM,
  /** n on a US keyboard. */
  KeyN,
  /** o on a US keyboard. */
  KeyO,
  /** p on a US keyboard. */
  KeyP,
  /** q on a US keyboard. Labelled a on an AZERTY (e.g., French) keyboard. */
  KeyQ,
  /** r on a US keyboard. */
  KeyR,
  /** s on a US keyboard. */
  KeyS,
  /** t on a US keyboard. */
  KeyT,
  /** u on a US keyboard. */
  KeyU,
  /** v on a US keyboard. */
  KeyV,
  /** w on a US keyboard. Labelled z on an AZERTY (e.g., French) keyboard. */
  KeyW,
  /** x on a US keyboard. */
  KeyX,
  /** y on a US keyboard. Labelled z on a QWERTZ (e.g., German) keyboard. */
  KeyY,
  /** z on a US keyboard. Labelled w on an AZERTY (e.g., French) keyboard, and y on a QWERTZ (e.g., German) keyboard. */
  KeyZ,
  /** -_ on a US keyboard. */
  Minus,
  /** .> on a US keyboard. */
  Period,
  /** '" on a US keyboard. */
  Quote,
  /** ;: on a US keyboard. */
  Semicolon,
  /** /? on a US keyboard. */
  Slash,

  /** Alt, Option or ⌥. */
  AltLeft,
  /** Alt, Option or ⌥. This is labelled AltGr key on many keyboard layouts. */
  AltRight,
  /** CapsLock or ⇪. */
  CapsLock,
  /** The application context menu key, which is typically found between the right Meta key and the right Control key. */
  ContextMenu,
  /** Control or ⌃. */
  ControlLeft,
  /** Control or ⌃. */
  ControlRight,
  /** Enter or ↵. Labelled Return on Apple keyboards. */
  Enter,
  /** The Windows, ⌘, Command or other OS symbol key. */
  MetaLeft,
  /** The Windows, ⌘, Command or other OS symbol key. */
  MetaRight,
  /** Shift or ⇧. */
  ShiftLeft,
  /** Shift or ⇧. */
  ShiftRight,
  /** Space. */
  Space,
  /** Tab or ⇥. */
  Tab,

  /** Japanese: 変換 (henkan). */
  Convert,
  /** Japanese: カタカナ/ひらがな/ローマ字 (katakana/hiragana/romaji). */
  KanaMode,
  /**
   * Korean: HangulMode 한/영 (han/yeong).
   * Japanese (Mac keyboard): かな (kana).
   * */
  Lang1,
  /**
   * 	Korean: Hanja 한자 (hanja).
   *  Japanese (Mac keyboard): 英数 (eisu).
   */
  Lang2,
  /** Japanese (word-processing keyboard): Katakana. */
  Lang3,
  /** Japanese (word-processing keyboard): Hiragana. */
  Lang4,
  /** Japanese (word-processing keyboard): Zenkaku/Hankaku. */
  Lang5,
  /** Japanese: 無変換 (muhenkan). */
  NonConvert,

  /** ⌦. The forward delete key. Note that on Apple keyboards, the key labelled Delete on the main part of the keyboard should be encoded as "Backspace". */
  Delete,
  /** Page Down, End or ↘. */
  End,
  /** Help. Not present on standard PC keyboards. */
  Help,
  /** Home or ↖. */
  Home,
  /** Insert or Ins. Not present on Apple keyboards. */
  Insert,
  /** Page Down, PgDn or ⇟. */
  PageDown,
  /** Page Up, PgUp or ⇞. */
  PageUp,

  /** ↓ */
  ArrowDown,
  /** ← */
  ArrowLeft,
  /** → */
  ArrowRight,
  /** ↑ */
  ArrowUp,

  /** On the Mac, the "NumLock" code should be used for the numpad Clear key. */
  NumLock,
  /**
   * 0 Ins on a keyboard.
   * 0 on a phone or remote control.
   * */
  Numpad0,
  /**
   * 1 End on a keyboard.
   * 1 or 1 QZ on a phone or remote control.
   */
  Numpad1,
  /**
   * 2 ↓ on a keyboard.
   * 2 ABC on a phone or remote control.
   */
  Numpad2,
  /**
   * 3 PgDn on a keyboard.
   * 3 DEF on a phone or remote control.
   */
  Numpad3,
  /**
   * 4 ← on a keyboard.
   * 4 GHI on a phone or remote control.
   */
  Numpad4,
  /**
   * 5 on a keyboard.
   * 5 JKL on a phone or remote control.
   */
  Numpad5,
  /**
   * 6 → on a keyboard.
   * 6 MNO on a phone or remote control.
   */
  Numpad6,
  /**
   * 7 Home on a keyboard.
   * 7 PQRS or 7 PRS on a phone or remote control.
   */
  Numpad7,
  /**
   * 8 ↑ on a keyboard.
   * 8 TUV on a phone or remote control.
   */
  Numpad8,
  /**
   * 9 PgUp on a keyboard.
   * 9 WXYZ or 9 WXY on a phone or remote control.
   */
  Numpad9,
  /** + */
  NumpadAdd,
  /** Found on the Microsoft Natural Keyboard. */
  NumpadBackspace,
  /** C or AC (All Clear). Also for use with numpads that have a Clear key that is separate from the NumLock key. On the Mac, the numpad Clear key should always be encoded as "NumLock". */
  NumpadClear,
  /** CE (Clear Entry) */
  NumpadClearEntry,
  /** , (thousands separator). For locales where the thousands separator is a "." (e.g., Brazil), this key may generate a .. */
  NumpadComma,
  /** . Del. For locales where the decimal separator is "," (e.g., Brazil), this key may generate a ,. */
  NumpadDecimal,
  /** / */
  NumpadDivide,
  /** Numpad Enter */
  NumpadEnter,
  /** = */
  NumpadEqual,
  /** # on a phone or remote control device. This key is typically found below the 9 key and to the right of the 0 key. */
  NumpadHash,
  /** M+ Add current entry to the value stored in memory. */
  NumpadMemoryAdd,
  /** MC Clear the value stored in memory. */
  NumpadMemoryClear,
  /** MR Replace the current entry with the value stored in memory. */
  NumpadMemoryRecall,
  /** MS Replace the value stored in memory with the current entry. */
  NumpadMemoryStore,
  /** M- Subtract current entry from the value stored in memory. */
  NumpadMemorySubtract,
  /**
   * * on a keyboard. For use with numpads that provide mathematical operations (+, -, * and /).
   * Use "NumpadStar" for the * key on phones and remote controls.
   */
  NumpadMultiply,
  /** ( Found on the Microsoft Natural Keyboard. */
  NumpadParenLeft,
  /** ) Found on the Microsoft Natural Keyboard. */
  NumpadParenRight,
  /**
   * * on a phone or remote control device. This key is typically found below the 7 key and to the left of the 0 key.
   * Use "NumpadMultiply" for the * key on numeric keypads.
   */
  NumpadStar,
  /** - */
  NumpadSubtract,

  /** Esc or ⎋. */
  Escape,
  /** F1 */
  F1,
  /** F2 */
  F2,
  /** F3 */
  F3,
  /** F4 */
  F4,
  /** F5 */
  F5,
  /** F6 */
  F6,
  /** F7 */
  F7,
  /** F8 */
  F8,
  /** F9 */
  F9,
  /** F10 */
  F10,
  /** F11 */
  F11,
  /** F12 */
  F12,
  /** F13 */
  F13,
  /** F14 */
  F14,
  /** F15 */
  F15,
  /** Fn This is typically a hardware key that does not generate a separate code. Most keyboards do not place this key in the function section, but it is included here to keep it with related keys. */
  Fn,
  /** FLock or FnLock. Function Lock key. Found on the Microsoft Natural Keyboard. */
  FnLock,
  /** PrtScr SysRq or Print Screen. */
  PrintScreen,
  /** Scroll Lock */
  ScrollLock,
  /** Pause Break */
  Pause,

  /** Some laptops place this key to the left of the ↑ key. */
  BrowserBack,
  /** Browser Favorites */
  BrowserFavorites,
  /** Some laptops place this key to the right of the ↑ key. */
  BrowserForward,
  /** Browser Home */
  BrowserHome,
  /** Browser Refresh */
  BrowserRefresh,
  /** Browser Search */
  BrowserSearch,
  /** Browser Stop */
  BrowserStop,
  /** Eject or ⏏. This key is placed in the function section on some Apple keyboards. */
  Eject,
  /** Sometimes labelled My Computer on the keyboard. */
  LaunchApp1,
  /** Sometimes labelled Calculator on the keyboard. */
  LaunchApp2,
  /** Launch Mail */
  LaunchMail,
  /** Media Play/Pause */
  MediaPlayPause,
  /** Media Select */
  MediaSelect,
  /** Media Stop */
  MediaStop,
  /** Media Track Next */
  MediaTrackNext,
  /** Media Track Previous */
  MediaTrackPrevious,
  /** This key is placed in the function section on some Apple keyboards, replacing the Eject key. */
  Power,
  /** Sleep */
  Sleep,
  /** Audio Volume Down */
  AudioVolumeDown,
  /** Audio Volume Mute */
  AudioVolumeMute,
  /** Audio Volume Up */
  AudioVolumeUp,
  /** Wake Up */
  WakeUp,

  /** Hyper */
  Hyper,
  /** Super */
  Super,
  /** Turbo */
  Turbo,

  /** Abort */
  Abort,
  /** Resume */
  Resume,
  /** Suspend */
  Suspend,

  /** Found on Sun’s USB keyboard. */
  Again,
  /** Found on Sun’s USB keyboard. */
  Copy,
  /** Found on Sun’s USB keyboard. */
  Cut,
  /** Found on Sun’s USB keyboard. */
  Find,
  /** Found on Sun’s USB keyboard. */
  Open,
  /** Found on Sun’s USB keyboard. */
  Paste,
  /** Found on Sun’s USB keyboard. */
  Props,
  /** Found on Sun’s USB keyboard. */
  Select,
  /** Found on Sun’s USB keyboard. */
  Undo,

  /** Use for dedicated ひらがな key found on some Japanese word processing keyboards. */
  Hiragana,
  /** Use for dedicated カタカナ key found on some Japanese word processing keyboards. */
  Katakana,

  /** This value code should be used when no other value given in this specification is appropriate. */
  Unidentified
}

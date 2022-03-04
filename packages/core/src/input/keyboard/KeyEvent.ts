import { KeyCode } from "./KeyCode";
/**
 * KeyEvent.
 */
export class KeyEvent {

    public key: string;
    public code: string;
    public codeNumber: KeyCode;

    /**
     * Constructor of KeyEvent.
     * @param key - KeyboadrEvent key
     * @param code - KeyboadrEvent code
     * @param codeNumber - Code number
     */
    constructor() { }

    setValue(key: string, code: string, codeNumber: KeyCode) {
        this.key = key;
        this.code = code;
        this.codeNumber = codeNumber;
    }
}
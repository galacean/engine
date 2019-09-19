import { Logger } from "../src";
describe("Oasis Base Logger Test", () => {
  it("Logger enable", function() {
    Logger.enable();
    expect(Logger.debug).toEqual(console.log.bind(console));
    expect(Logger.info).toEqual(console.info.bind(console));
    expect(Logger.warn).toEqual(console.warn.bind(console));
    expect(Logger.error).toEqual(console.error.bind(console));
  });

  it("Logger disable", function () {
    Logger.disable();
    expect(Logger.debug).not.toEqual(console.log);
    expect(Logger.info).not.toEqual(console.info);
    expect(Logger.warn).not.toEqual(console.warn);
    expect(Logger.error).not.toEqual(console.error);
  })
});

import { describe, it, expect } from "vitest";
import { toPascalCase } from "./constants";

describe("toPascalCase", () => {
  it("converts SCREAMING_SNAKE_CASE to PascalCase", () => {
    expect(toPascalCase("VIEW_CHANNEL")).toBe("ViewChannel");
    expect(toPascalCase("SEND_MESSAGES")).toBe("SendMessages");
    expect(toPascalCase("MANAGE_CHANNELS")).toBe("ManageChannels");
    expect(toPascalCase("ADMINISTRATOR")).toBe("Administrator");
    expect(toPascalCase("SEND_TTS_MESSAGES")).toBe("SendTtsMessages");
    expect(toPascalCase("USE_EXTERNAL_EMOJIS")).toBe("UseExternalEmojis");
  });

  it("handles single-word permissions", () => {
    expect(toPascalCase("CONNECT")).toBe("Connect");
    expect(toPascalCase("SPEAK")).toBe("Speak");
  });

  it("handles permissions with numbers", () => {
    expect(toPascalCase("USE_VAD")).toBe("UseVad");
  });
});

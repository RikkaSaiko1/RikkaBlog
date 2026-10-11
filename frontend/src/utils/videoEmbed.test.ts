import { describe, expect, it } from "vitest";
import { videoUrlToEmbed } from "./videoEmbed";

describe("videoUrlToEmbed", () => {
  it("解析 YouTube 短链并保留查询参数", () => {
    expect(videoUrlToEmbed("https://youtu.be/YIow9ta6GiM?si=3zeWX80_mzdgIUUg")).toMatchObject({
      provider: "youtube",
      id: "YIow9ta6GiM",
      src: "https://www.youtube.com/embed/YIow9ta6GiM",
    });
  });

  it("解析 YouTube watch / 移动端 / embed 链接", () => {
    expect(videoUrlToEmbed("https://www.youtube.com/watch?v=YIow9ta6GiM&t=30")?.id).toBe("YIow9ta6GiM");
    expect(videoUrlToEmbed("https://m.youtube.com/watch?v=YIow9ta6GiM")?.id).toBe("YIow9ta6GiM");
    expect(videoUrlToEmbed("https://www.youtube.com/embed/YIow9ta6GiM")?.id).toBe("YIow9ta6GiM");
    expect(videoUrlToEmbed("https://www.youtube.com/shorts/YIow9ta6GiM")?.id).toBe("YIow9ta6GiM");
  });

  it("解析 Bilibili 分享链接（带分享参数）", () => {
    const embed = videoUrlToEmbed(
      "https://www.bilibili.com/video/BV1E2eb6PE5Q/?share_source=copy_web&vd_source=6af03c2428251db3aadf07d47d534ab0",
    );
    expect(embed).toMatchObject({ provider: "bilibili", id: "BV1E2eb6PE5Q" });
    expect(embed?.src).toContain("bvid=BV1E2eb6PE5Q");
  });

  it("解析 Bilibili av 号链接", () => {
    expect(videoUrlToEmbed("https://www.bilibili.com/video/av170001")?.src).toContain("aid=170001");
  });

  it("非视频链接返回 null", () => {
    expect(videoUrlToEmbed("https://example.com/post/1")).toBeNull();
    expect(videoUrlToEmbed("https://www.bilibili.com/read/cv123")).toBeNull();
    expect(videoUrlToEmbed("不是链接")).toBeNull();
    expect(videoUrlToEmbed("javascript:alert(1)")).toBeNull();
  });
});
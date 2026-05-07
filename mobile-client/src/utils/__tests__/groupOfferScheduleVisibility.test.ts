import { readFileSync } from "fs";
import { resolve } from "path";

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../..", relativePath), "utf-8");
}

describe("group offer schedule visibility", () => {
  it("ServiceCard shows fixed group offer dates on browse cards", () => {
    const src = readSource("presentation/components/ServiceCard.tsx");

    expect(src).toContain("isFixedGroupOffer");
    expect(src).toContain("isFixedGroupOffer && service.scheduled_time");
    expect(src).toContain("formatGroupOfferDateTime(service.scheduled_time)");
  });

  it("ServiceDetailScreen shows fixed group offer dates inside schedule metadata", () => {
    const src = readSource("presentation/screens/ServiceDetailScreen.tsx");
    const dateLabelCount = (src.match(/formatGroupOfferDateTime\(service\.scheduled_time\)/g) ?? []).length;

    expect(src).toContain("isFixedGroupOffer");
    expect(src).toContain('key: "schedule"');
    expect(dateLabelCount).toBeGreaterThanOrEqual(1);
  });
});

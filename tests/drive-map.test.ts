import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

describe("Driving GPS map isolation and build contract", () => {
  it("is present on Driving without changing the work/rest timer or engine", async () => {
    const driving = await readFile("src/screens/Driving.tsx", "utf8");
    const wrapper = await readFile("src/screens/TruckMap.tsx", "utf8");
    expect(driving).toContain('import { TruckMap } from "./TruckMap";');
    expect(driving).toContain("<TruckMap />");
    expect(wrapper).toContain('srcDoc={html}');
    expect(wrapper).toContain('allow="geolocation"');
    expect(wrapper).not.toContain('from "../context"');
    expect(wrapper).not.toContain('from "../domain/diary"');
    expect(wrapper).not.toContain("editRange(");
  });

  it("has both searches, GPS and distinct rest and fuel layers", async () => {
    const html = await readFile("public/aps-drive-map.html", "utf8");
    for (const id of [
      "origin", "destination", "searchOrigin", "searchDest", "gpsOrigin",
      "liveGPS", "map", "restToggle", "fuelToggle", "findStops",
      "restList", "fuelList", "routeFile", "clearLine",
    ]) expect(html).toContain('id="' + id + '"');
    expect(html).toContain("nominatim.openstreetmap.org/search");
    expect(html).toContain("spatial.infrastructure.gov.au/server/rest/services/Hosted/RADAR_Curated_Prod_restareas");
    expect(html).toContain("overpass.private.coffee/api/interpreter");
    expect(html).toContain("maps.nhvr.gov.au");
    expect(html).toContain("Yellow/orange roads");
    expect(html).not.toContain("route/v1/driving"); // Car router must never imply B-double access.
  });

  it("contains syntactically valid browser JavaScript", async () => {
    const html = await readFile("public/aps-drive-map.html", "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(script?.[1]).toBeTruthy();
    expect(() => new Script(script![1])).not.toThrow();
  });
});

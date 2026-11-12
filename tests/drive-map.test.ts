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
    expect(wrapper).toContain("aps-drive-map-v2.html");
    expect(wrapper).toContain('allow="geolocation"');
    expect(wrapper).not.toContain('from "../context"');
    expect(wrapper).not.toContain('from "../domain/diary"');
    expect(wrapper).not.toContain("editRange(");
  });

  it("has both searches, GPS and distinct rest and fuel layers", async () => {
    const html = await readFile("public/aps-drive-map-v2.html", "utf8");
    for (const id of [
      "origin", "destination", "originFind", "destinationFind", "gpsStart",
      "follow", "map", "restFilter", "fuelFilter", "iorFilter", "findStops",
      "stopCards", "routeFile", "showTrip", "mapStyle",
    ]) expect(html).toContain('id="' + id + '"');
    expect(html).toContain("nominatim.openstreetmap.org/search");
    expect(html).toContain('["highway"="rest_area"]');
    expect(html).toContain("overpass.private.coffee/api/interpreter");
    expect(html).toContain("maps.nhvr.gov.au");
    expect(html).toContain("Yellow major roads");
    expect(html).toContain("maplibre-gl@6.16.0");
    expect(html).toContain("tiles.openfreemap.org");
    expect(html).toContain("watchPosition");
    expect(html).not.toContain("route/v1/driving"); // Car router must never imply B-double access.
  });

  it("contains syntactically valid browser JavaScript", async () => {
    const html = await readFile("public/aps-drive-map-v2.html", "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(script?.[1]).toBeTruthy();
    expect(() => new Script(script![1])).not.toThrow();
  });
});

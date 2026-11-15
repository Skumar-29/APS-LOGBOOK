import {describe,it,expect} from "vitest";
import {readFile,access} from "node:fs/promises";

describe("GPS map and truck-stop feature removed from Driving",()=>{
 it("does not render map, truck-stop finder or location permission controls",async()=>{
  const driving=await readFile("src/screens/Driving.tsx","utf8");
  expect(driving).not.toContain("TruckMap");
  expect(driving).not.toContain("GPS map");
  expect(driving).not.toContain("truck stops");
  expect(driving).toContain("Start work");
  expect(driving).toContain("Start rest");
  expect(driving).toContain("Hours review");
 });
 it("removes abandoned map code and public map assets from release",async()=>{
  for(const path of ["src/screens/TruckMap.tsx","public/aps-drive-map-v2.html","public/aps-drive-map.html"]){
   await expect(access(path)).rejects.toThrow();
  }
 });
});

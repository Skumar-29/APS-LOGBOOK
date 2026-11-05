import { describe,it,expect } from "vitest";
import {classifyDiaryGesture,isDeliberateDiaryTap} from "../src/domain/diary-gesture";
describe("Diary touch gesture safety",()=>{
  it("does not commit vertical scroll gestures even when starting on a Work block",()=>{
    expect(classifyDiaryGesture(1,-60)).toBe("vertical");
    expect(classifyDiaryGesture(-3,130)).toBe("vertical");
    expect(isDeliberateDiaryTap(1,70)).toBe(false);
  });
  it("waits for sufficient horizontal intent before committing swipe",()=>{
    expect(classifyDiaryGesture(2,1)).toBe("pending");
    expect(classifyDiaryGesture(15,2)).toBe("horizontal");
    expect(classifyDiaryGesture(-45,10)).toBe("horizontal");
    expect(classifyDiaryGesture(8,1)).toBe("pending");
  });
  it("ignores diagonal and ambiguous movements rather than selecting accidentally",()=>{
    expect(classifyDiaryGesture(34,28)).toBe("vertical");
    expect(classifyDiaryGesture(10,10)).toBe("vertical");
    expect(classifyDiaryGesture(12,8)).toBe("horizontal");
    expect(isDeliberateDiaryTap(5,5)).toBe(false);
  });
  it("allows intentional single-block taps without being oversensitive",()=>{
    expect(isDeliberateDiaryTap(0,0)).toBe(true);
    expect(isDeliberateDiaryTap(2,2)).toBe(true);
    expect(isDeliberateDiaryTap(5,0)).toBe(true);
    expect(isDeliberateDiaryTap(9,0)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { emptyState, type Workspace } from "../src/domain/model";
import { allocatePage, cancelPage, findPage, suggestedPaperPage } from "../src/domain/diary";

function diary(firstPage="23",firstDate="2026-10-01") {
  const s=emptyState();
  s.books.push({id:"book",number:"TEST",firstPage,firstDate,closed:false});
  return s;
}
describe("chronological physical diary page numbering",()=>{
  it("assigns 25 to 18 October after page 26 was recorded for 19 October",()=>{
    const s=diary();
    const p19=allocatePage(s,"2026-10-19","book","26");
    expect(suggestedPaperPage(s,"2026-10-18","book")).toBe("25");
    expect(allocatePage(s,"2026-10-18","book").number).toBe("25");
    expect(allocatePage(s,"2026-10-17","book").number).toBe("24");
    expect(allocatePage(s,"2026-10-20","book").number).toBe("27");
    expect(findPage(s,"book","26").id).toBe(p19.id);
    expect(s.pages.filter(p=>p.status==="Active").map(p=>p.number)).toEqual(["26","25","24","27"]);
  });
  it("fills a dated gap between correctly numbered pages",()=>{
    const s=diary();
    allocatePage(s,"2026-10-17","book","24");
    allocatePage(s,"2026-10-19","book","26");
    expect(allocatePage(s,"2026-10-18","book").number).toBe("25");
  });
  it("refuses impossible gaps or duplicate page numbers without changing saved pages",()=>{
    const s=diary();
    allocatePage(s,"2026-10-17","book","24");
    allocatePage(s,"2026-10-19","book","25");
    const original=JSON.stringify(s.pages);
    expect(()=>allocatePage(s,"2026-10-18","book")).toThrow(/No unused paper page/);
    expect(()=>allocatePage(s,"2026-10-18","book","26")).toThrow(/out of date order/);
    expect(()=>allocatePage(s,"2026-10-18","book","25")).toThrow(/already exists/);
    expect(JSON.stringify(s.pages)).toBe(original);
  });
  it("keeps cancelled misnumbered pages in history but permits a corrected earlier page",()=>{
    const s=diary();
    allocatePage(s,"2026-10-19","book","26");
    // Old app could have incorrectly allocated page 27 to 18 October.
    s.pages.push({id:"old-wrong-page",bookId:"book",number:"27",
      date:"2026-10-18",status:"Cancelled",reason:"Incorrect earlier auto number"});
    expect(suggestedPaperPage(s,"2026-10-18","book")).toBe("25");
    expect(allocatePage(s,"2026-10-18","book").number).toBe("25");
    expect(findPage(s,"book","27").status).toBe("Cancelled");
    expect(()=>allocatePage(s,"2026-10-17","book","27")).toThrow(/already exists/);
  });
  it("keeps normal cancelled-page replacement numbering",()=>{
    const s=diary("56");
    const p=allocatePage(s,"2026-10-01","book");
    expect(p.number).toBe("56");
    cancelPage(s,p.id,"Replacement requested");
    expect(allocatePage(s,"2026-10-01","book").number).toBe("57");
    expect(findPage(s,"book","56").status).toBe("Cancelled");
  });
  it("respects the book's first date, first number and each book independently",()=>{
    const s=diary("26","2026-10-19");
    allocatePage(s,"2026-10-19","book","26");
    expect(()=>allocatePage(s,"2026-10-18","book")).toThrow(/before the diary book starts/);
    s.books.push({id:"second",number:"SECOND",firstPage:"1",firstDate:"2026-10-01",closed:false});
    expect(allocatePage(s,"2026-10-18","second").number).toBe("1");
    expect(findPage(s,"book","26").date).toBe("2026-10-19");
  });
});

import metrics from './font-metrics.json';
import {escape} from './common';
export const pageWidth=595.28,pageHeight=841.89,margin=24,contentWidth=pageWidth-margin*2;
export function textWidth(text,size=10,bold=false){const widths=metrics[bold?'bold':'regular'];return [...String(text??'')].reduce((n,c)=>n+(widths[c.codePointAt(0)]??.7)*size,0);}
export function linesFor(text,width,size=10,bold=false){
  const lines=[];
  for(const paragraph of String(text??'').split('\n')){
    let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(textWidth((line?line+' ':'')+word,size,bold)<=width){line+=(line?' ':'')+word;continue;}
      if(line){lines.push(line);line='';}
      for(const character of word){if(line && textWidth(line+character,size,bold)>width){lines.push(line);line='';}line+=character;}
    }lines.push(line);
  }return lines;
}
export function formCanvas(){
  const parts=[];
  function text(x,y,value,size=10,bold=false,anchor='start') {parts.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold?'bold':'normal'}" text-anchor="${anchor}">${escape(value)}</text>`);}
  function rect(x,y,w,h,fill='none'){parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#333" stroke-width="0.6"/>`);}
  function line(x1,y1,x2,y2){parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="0.6"/>`);}
  function image(uri,x,y,w,h,signature=false){if(uri)parts.push(`<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" ${signature?'data-trim="signature"':''}/>`);}
  function paragraph(x,y,value,width,size=9.5,bold=false,lineHeight=size*1.2){const lines=linesFor(value,width,size,bold);lines.forEach((l,i)=>text(x,y+i*lineHeight,l,size,bold));return lines.length*lineHeight;}
  function field(x,y,w,h,label,value){rect(x,y,w,h);text(x+5,y+10,label,7.7,true);const lines=linesFor(value,w-10,10);lines.forEach((l,i)=>text(x+5,y+23+i*11,l,10));if(23+(lines.length-1)*11>h-2)throw Error('Field exceeds layout: '+label);}
  function finish(label){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" role="img" aria-label="${escape(label)}"><rect width="100%" height="100%" fill="white"/><g fill="#111" font-family="Workspace Sans, DejaVu Sans, sans-serif">${parts.join('')}</g></svg>`;}
  return {text,rect,line,image,paragraph,field,finish,parts};
}

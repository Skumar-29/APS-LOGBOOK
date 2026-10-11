import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setCharacterSqueeze, type PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/** Crop only empty space around existing ink. Never synthesize or redraw a signature. */
async function imageData(uri: string, trim = false): Promise<string> {
  if (!trim && !uri.startsWith('data:image/webp;')) return uri;
  const image = new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('An image could not be read.'));image.src=uri;});
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image preparation is unavailable.');
  ctx.drawImage(image,0,0);
  if(trim){
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      if(data[i+3]>24 && Math.min(data[i],data[i+1],data[i+2])<220){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    }
    if(right>=left){const pad=3;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(canvas.width-1,right+pad);bottom=Math.min(canvas.height-1,bottom+pad);
      const cropped=ctx.getImageData(left,top,right-left+1,bottom-top+1);canvas.width=cropped.width;canvas.height=cropped.height;ctx.putImageData(cropped,0,0);
    }
  }
  return canvas.toDataURL('image/png');
}

export async function preparePdfPages(svgs:string[]) {
  const cache=new Map<string,Promise<string>>();
  return Promise.all(svgs.map(async svg=>{
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    if(doc.querySelector('parsererror'))throw Error('Invalid document page.');
    for(const image of doc.querySelectorAll('image[data-trim="signature"]')){
      const uri=image.getAttribute('href') || '';let ready=cache.get(uri);
      if(!ready){ready=imageData(uri,true);cache.set(uri,ready);}
      image.setAttribute('href',await ready);image.removeAttribute('data-trim');
    }
    return new XMLSerializer().serializeToString(doc.documentElement);
  }));
}

function colour(value:string) {
  const names:Record<string,string>={black:'#000000',white:'#ffffff',blue:'#0000ff',red:'#ff0000',grey:'#808080',gray:'#808080'};
  value=names[value] || value;
  if(value==='none')return undefined;
  const hex=/^#([a-f\d]{3}|[a-f\d]{6})$/i.exec(value);
  if(hex){const h=hex[1].length===3?[...hex[1]].map(x=>x+x).join(''):hex[1];return {color:rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4),16)/255),opacity:1};}
  const parts=/^rgba?\(([^)]+)\)$/.exec(value)?.[1].split(',').map(Number);
  if(parts && parts.length>=3)return {color:rgb(parts[0]/255,parts[1]/255,parts[2]/255),opacity:parts[3]??1};
  throw Error('Unsupported document colour: '+value);
}

/** Draw the app's restricted SVG vocabulary as native PDF text and vector shapes. */
export async function createPdf(svgs:string[],title:string) {
  if(!svgs.length)throw Error('No pages to export.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);pdf.setTitle(title);pdf.setCreator('Truck Workspace');pdf.setLanguage('en-AU');
  const fonts=await Promise.all(['Regular','Bold'].map(async weight=>{
    const response=await fetch(`${import.meta.env.BASE_URL}fonts/WorkspaceSans-${weight}.ttf`);
    if(!response.ok)throw Error('PDF fonts are unavailable. Open the app online once to complete its offline download.');
    return pdf.embedFont(await response.arrayBuffer(),{subset:false});
  }));
  // Embed these already reduced font files whole: fontkit subsetting can lose composite glyphs.
  const characterSets=fonts.map(font=>new Set(font.getCharacterSet()));
  const images=new Map<string,PDFImage>();
  let templatePages: Awaited<ReturnType<PDFDocument['copyPages']>> | undefined;
  async function originalPage(index: number) {
    if (index !== 0 && index !== 1) throw Error('Invalid original form page.');
    if (!templatePages) {
      const response=await fetch(`${import.meta.env.BASE_URL}templates/safe-driving-original-v1.pdf`);
      if (!response.ok) throw Error('The original form template is unavailable. Open the app online once to complete its offline download.');
      const source=await PDFDocument.load(await response.arrayBuffer());
      templatePages=await pdf.copyPages(source,[0,1]);
    }
    return pdf.addPage(templatePages[index]);
  }
  for(const svg of await preparePdfPages(svgs)){
    const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
    const box=(root.getAttribute('viewBox')||'').split(/\s+/).map(Number);
    if(box.length!==4 || box[0]!==0 || box[1]!==0 || !box[2] || !box[3])throw Error('Invalid document dimensions.');
    const [, ,w,h]=box,originalIndex=root.getAttribute('data-original-form-page');
    const page=originalIndex===null?pdf.addPage(w>h?[841.89,595.28]:[595.28,841.89]):await originalPage(Number(originalIndex));
    const fit=Math.min(page.getWidth()/w,page.getHeight()/h);
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(fit,0,0,-fit,(page.getWidth()-w*fit)/2,(page.getHeight()+h*fit)/2));
    async function draw(el:Element,inherited:Record<string,string>){
      // The preview uses the SVG rendition. The download already contains the native PDF page.
      if (el.hasAttribute('data-original-form-background')) return;
      const a={...inherited};for(const p of ['fill','stroke','stroke-width','font-size','font-weight','text-anchor','opacity'])if(el.hasAttribute(p))a[p]=el.getAttribute(p)!;
      const num=(key:string,fallback=0,reference=1)=>{const v=el.getAttribute(key);return v===null?fallback:v.endsWith('%')?parseFloat(v)*reference/100:Number(v);};
      page.pushOperators(pushGraphicsState());
      for(const match of (el.getAttribute('transform')||'').matchAll(/(matrix|translate|rotate|scale)\(([^)]+)\)/g)){
        const n=match[2].trim().split(/[ ,]+/).map(Number);
        const matrix=(v:number[])=>page.pushOperators(concatTransformationMatrix(v[0],v[1],v[2],v[3],v[4],v[5]));
        if(match[1]==='matrix')matrix(n);
        if(match[1]==='translate')matrix([1,0,0,1,n[0],n[1]||0]);
        if(match[1]==='scale')matrix([n[0],0,0,n[1]??n[0],0,0]);
        if(match[1]==='rotate'){const angle=n[0]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=n[1]||0,y=n[2]||0;matrix([1,0,0,1,x,y]);matrix([c,s,-s,c,0,0]);matrix([1,0,0,1,-x,-y]);}
      }
      const fill=colour(a.fill||'#000'),stroke=colour(a.stroke||'none'),opacity=Number(a.opacity??1),sw=Number(a['stroke-width']??1);
      const options={color:fill?.color,borderColor:stroke?.color,borderWidth:stroke?sw:0,opacity:(fill?.opacity??1)*opacity,borderOpacity:(stroke?.opacity??1)*opacity};
      const tag=el.localName;
      if(tag==='svg'||tag==='g'){for(const child of el.children)await draw(child,a);}
      else if(tag==='rect'){page.drawRectangle({x:num('x'),y:num('y'),width:num('width',0,w),height:num('height',0,h),...options});}
      else if(tag==='line'){if(stroke)page.drawLine({start:{x:num('x1'),y:num('y1')},end:{x:num('x2'),y:num('y2')},color:stroke.color,thickness:sw,opacity:stroke.opacity*opacity});}
      else if(tag==='path'){page.pushOperators(concatTransformationMatrix(1,0,0,-1,0,0));page.drawSvgPath(el.getAttribute('d')||'',{x:0,y:0,...options});}
      else if(tag==='text'){
        const text=el.textContent||'',bold=a['font-weight']==='bold'||Number(a['font-weight'])>=600,font=fonts[bold?1:0],size=Number(a['font-size']||12);
        for(const char of text){if(!characterSets[bold?1:0].has(char.codePointAt(0)!))throw Error(`The PDF font cannot display “${char}”. Please use supported characters before exporting.`);}
        if(text && fill){const width=font.widthOfTextAtSize(text,size),desired=num('textLength',width),anchor=a['text-anchor'],x=num('x')-(anchor==='middle'?desired/2:anchor==='end'?desired:0);
          page.pushOperators(concatTransformationMatrix(1,0,0,-1,x,num('y')),setCharacterSqueeze(width?desired/width*100:100));
          page.drawText(text,{x:0,y:0,font,size,color:fill.color,opacity:fill.opacity*opacity});
        }
      }else if(tag==='image'){
        const uri=el.getAttribute('href')||'';if(!/^data:image\/(png|jpeg|webp);base64,/.test(uri))throw Error('Only saved document images can be exported.');
        let image=images.get(uri);if(!image){const data=await imageData(uri);image=data.startsWith('data:image/jpeg;')?await pdf.embedJpg(data):await pdf.embedPng(data);images.set(uri,image);}
        const width=num('width',image.width,w),height=num('height',image.height,h),ratio=Math.min(width/image.width,height/image.height),iw=image.width*ratio,ih=image.height*ratio,x=num('x')+(width-iw)/2,y=num('y')+(height-ih)/2;
        page.pushOperators(concatTransformationMatrix(1,0,0,-1,x,y+ih));page.drawImage(image,{x:0,y:0,width:iw,height:ih});
      }else if(!['title','desc'].includes(tag))throw Error('Unsupported document element: '+tag);
      page.pushOperators(popGraphicsState());
    }
    await draw(root,{});page.pushOperators(popGraphicsState());
  }
  return new Blob([new Uint8Array(await pdf.save())],{type:'application/pdf'});
}

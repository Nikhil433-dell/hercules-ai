// Render the existing H brand as native app icon formats; no image-generation service.
// Run on macOS: ./node_modules/.bin/electron scripts/generate-icons.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 app.dock?.hide();
 const assets=path.resolve(__dirname,'../assets');
 const window=new BrowserWindow({width:1024,height:1024,show:false,frame:false,transparent:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
 let temporary;
 try{
  const svg=fs.readFileSync(path.join(assets,'icon.svg'),'utf8');
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><body style="margin:0;background:transparent">'+svg+'</body></html>'));
  await window.webContents.executeJavaScript('document.fonts.ready');
  await new Promise(resolve=>setTimeout(resolve,200));
  const icon=(await window.webContents.capturePage()).resize({width:1024,height:1024});
  fs.writeFileSync(path.join(assets,'icon.png'),icon.toPNG());
  const small=icon.resize({width:256,height:256}).toPNG();
  // Windows accepts a PNG-compressed ICO entry, supported since Vista.
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
  header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(small.length,14);header.writeUInt32LE(22,18);
  fs.writeFileSync(path.join(assets,'icon.ico'),Buffer.concat([header,small]));
  fs.writeFileSync('/tmp/hercules-app-icon-preview.png',small);
  if(process.platform==='darwin'){
   temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hercules-icon-'));
   const iconset=path.join(temporary,'Hercules.iconset');fs.mkdirSync(iconset);
   for(const size of [16,32,128,256,512]){
    fs.writeFileSync(path.join(iconset,`icon_${size}x${size}.png`),icon.resize({width:size,height:size}).toPNG());
    fs.writeFileSync(path.join(iconset,`icon_${size}x${size}@2x.png`),icon.resize({width:size*2,height:size*2}).toPNG());
   }
   execFileSync('iconutil',['-c','icns',iconset,'-o',path.join(assets,'icon.icns')]);
  }
  window.destroy();console.log('Generated H brand icons for macOS, Windows, and Linux.');app.quit();
 }catch(error){console.error(error.name+': '+error.message);app.exit(1);}
 finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}
});

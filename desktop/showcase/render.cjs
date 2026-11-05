const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.on('window-all-closed',()=>{});
const output=path.resolve(__dirname,'../../website/assets');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function windowFor(width,height,url){
 const window=new BrowserWindow({width,height,show:false,frame:false,backgroundColor:'#292a2c',webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await window.loadURL(url);await pause(400);return window;
}
app.whenReady().then(async()=>{
 app.dock?.hide();fs.mkdirSync(output,{recursive:true});
 try{
  for(const [kind,width,height] of [['feed',320,680],['popup',250,160],['article',350,530]]){
   const url=pathToFileURL(path.join(__dirname,'.build/index.html'));url.searchParams.set('kind',kind);
   const window=await windowFor(width,height,url.toString());
   fs.writeFileSync(path.join(output,`${kind}-preview.png`),(await window.webContents.capturePage()).toPNG());window.destroy();
  }
  const images=Object.fromEntries(['feed','popup','article'].map(kind=>[kind,'data:image/png;base64,'+fs.readFileSync(path.join(output,`${kind}-preview.png`)).toString('base64')]));
  const html=`<!doctype html><html><body style="margin:0;background:#161718"><canvas id="film" width="1280" height="720"></canvas><script>const sources=${JSON.stringify(images)};</script><script src="${pathToFileURL(path.join(__dirname,'video.js'))}"></script></body></html>`;
  const filename=path.join(__dirname,'.build/video.html');fs.writeFileSync(filename,html);
  const window=await windowFor(1280,720,pathToFileURL(filename).toString());
  const format=await window.webContents.executeJavaScript("MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'");
  console.log('Rendering 18-second sample-content walkthrough ('+format+').');
  const encoded=await window.webContents.executeJavaScript(`window.renderWalkthrough(${JSON.stringify(format)})`);
  const extension=format==='video/mp4'?'mp4':'webm';
  fs.writeFileSync(path.join(output,`walkthrough.${extension}`),Buffer.from(encoded,'base64'));
  fs.writeFileSync(path.join(output,'walkthrough-poster.png'),Buffer.from(await window.webContents.executeJavaScript('window.walkthroughPoster'),'base64'));
  window.destroy();console.log('Created three component previews and walkthrough.'+extension);app.quit();
 }catch(error){console.error(error.name+': '+error.message);app.exit(1);}
});

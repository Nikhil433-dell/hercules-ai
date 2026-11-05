window.renderWalkthrough=async function(mimeType){
 const canvas=document.getElementById('film'),ctx=canvas.getContext('2d'),images={};
 await Promise.all(Object.entries(sources).map(([name,src])=>new Promise(resolve=>{const image=new Image();image.onload=()=>{images[name]=image;resolve();};image.src=src;})));
 const scenes=[
  {image:'popup',title:'A quiet heads-up.',body:['A new story appears at the edge.','Ten seconds to take a glance.'],scale:1.65},
  {image:'article',title:'A little more context.',body:['Open the story, check related stocks,','then head straight to the source.'],scale:1.08},
  {image:'feed',title:'Your news, within reach.',body:['Open H whenever you choose.','Browse headlines. Filter your feed.'],scale:.86},
 ];
 const start=performance.now();
 function draw(elapsed){
  const scene=scenes[Math.min(2,Math.floor(elapsed/6000))],phase=(elapsed%6000)/6000;
  ctx.fillStyle='#161718';ctx.fillRect(0,0,1280,720);
  ctx.strokeStyle='#303133';ctx.beginPath();ctx.moveTo(64,93);ctx.lineTo(1216,93);ctx.stroke();
  ctx.fillStyle='#e5e3dd';ctx.font='700 23px -apple-system, sans-serif';ctx.fillText('Hercules',64,65);
  ctx.font='12px -apple-system, sans-serif';ctx.fillStyle='#92948f';ctx.fillText('INTERFACE WALKTHROUGH',930,65);
  ctx.fillStyle='#a5b9a9';ctx.font='12px -apple-system, sans-serif';ctx.fillText('0'+(Math.min(2,Math.floor(elapsed/6000))+1)+' / THE FLOW',64,240);
  ctx.fillStyle='#e5e3dd';ctx.font='500 42px -apple-system, sans-serif';ctx.fillText(scene.title,64,305);
  ctx.fillStyle='#a2a39e';ctx.font='19px -apple-system, sans-serif';scene.body.forEach((line,index)=>ctx.fillText(line,64,365+index*30));
  const dimensions={feed:[320,680],popup:[250,160],article:[350,530]};
  const image=images[scene.image],scale=scene.scale*(1+Math.min(phase,.8)*.025),w=dimensions[scene.image][0]*scale,h=dimensions[scene.image][1]*scale,x=960-w/2,y=390-h/2;
  ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=35;ctx.drawImage(image,x,y,w,h);ctx.shadowBlur=0;
  ctx.fillStyle='#777a73';ctx.font='12px -apple-system, sans-serif';ctx.fillText('Sample content and prices · current desktop components',64,660);
  ctx.fillStyle='#343631';ctx.fillRect(64,687,1152,2);ctx.fillStyle='#a5b9a9';ctx.fillRect(64,687,1152*Math.min(elapsed/18000,1),2);
 }
 draw(0);window.walkthroughPoster=canvas.toDataURL('image/png').split(',')[1];
 const stream=canvas.captureStream(30),chunks=[];
 const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2500000});
 recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
 const complete=new Promise(resolve=>{recorder.onstop=async()=>{const blob=new Blob(chunks,{type:mimeType});const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);};});
 recorder.start(200);const timer=setInterval(()=>draw(performance.now()-start),33);
 await new Promise(resolve=>setTimeout(resolve,18000));clearInterval(timer);draw(18000);recorder.stop();stream.getTracks().forEach(track=>track.stop());return complete;
};

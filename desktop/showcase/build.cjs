const webpack=require('webpack');
const path=require('node:path');
const fs=require('node:fs');
const output=path.join(__dirname,'.build');
webpack({mode:'production',entry:path.join(__dirname,'entry.tsx'),output:{path:output,filename:'preview.js'},resolve:{extensions:['.tsx','.ts','.js']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:{loader:'ts-loader',options:{transpileOnly:true}}},{test:/\.css$/,use:['style-loader','css-loader']}]},performance:{hints:false}},(error,stats)=>{
 if(error||stats.hasErrors()){console.error(error||stats.toString({all:false,errors:true}));process.exitCode=1;return;}
 fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hercules interface preview — sample content</title></head><body><div id="root"></div><script src="preview.js"></script></body></html>');
 console.log('Built isolated interface previews from the desktop React components.');
});

const webpack = require('webpack');
const path = require('node:path');

webpack({
  mode: 'production',
  context: __dirname,
  entry: path.join(__dirname, 'entry.tsx'),
  output: { path: path.join(__dirname, '.build'), filename: 'preview.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: { rules: [
    { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: 'ts-loader', options: { transpileOnly: true } } },
    { test: /\.css$/, use: ['style-loader', 'css-loader'] },
  ] },
  performance: { hints: false },
}, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error || stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
  }
});

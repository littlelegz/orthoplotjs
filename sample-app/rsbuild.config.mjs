import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  output: {
    assetPrefix: '/orthoplotjs',
  },
  html: {
    template: './public/index.html',
    title: 'OrthoPlot.js',
    favicon: './public/favicon.ico'
  },
});
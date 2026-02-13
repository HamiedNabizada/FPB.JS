const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true
  },
  resolve: {
    alias: {
      // Use UMD build to avoid import.meta.url issues with nested webpack
      fpbjs: path.resolve(__dirname, 'node_modules/fpbjs/dist/fpbjs.js')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html'
    })
  ],
  devServer: {
    port: 3102,
    hot: true
  }
};

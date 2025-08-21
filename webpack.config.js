const CopyWebpackPlugin = require('copy-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const shouldAnalyze = argv.analyze;

  return {
    entry: {
      bundle: ['./app/app.js']
    },
    output: {
      path: path.join(__dirname, 'dist/web'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      chunkFilename: isProduction ? '[name].[contenthash].chunk.js' : '[name].chunk.js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            'css-loader'
          ]
        },
        {
          test: /\.fpbjs$/,
          type: 'asset/source'
        },
        {
          test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/,
          type: 'asset/resource',
          generator: {
            filename: 'static/media/[name].[hash:8][ext]'
          }
        }
      ]
    },
    optimization: {
      moduleIds: 'deterministic',
      runtimeChunk: 'single',
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          diagrams: {
            test: /[\\/]node_modules[\\/](diagram-js|moddle|ids)[\\/]/,
            name: 'diagrams',
            chunks: 'all',
            priority: 10,
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-bootstrap)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 20,
          }
        }
      }
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './app/index.html',
        filename: 'index.html',
        inject: 'body'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: '**/*.css', context: 'app', to: '.' },
          { from: 'favicon.*', context: 'app', to: '.' }
        ]
      }),
      ...(shouldAnalyze ? [new BundleAnalyzerPlugin()] : [])
    ],
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist/web'),
      },
      compress: true,
      port: 3001,
      open: true
    }
  };
};

const path = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return [
    // UMD build for browsers
    {
      entry: './src/index.js',
      output: {
        path: path.join(__dirname, 'dist'),
        filename: 'fpbjs.js',
        library: 'FpbJS',
        libraryTarget: 'umd',
        globalObject: 'this',
        clean: false,
        chunkLoadingGlobal: 'webpackChunkFpbJS',
        publicPath: ''
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', {
                    targets: {
                      browsers: ['> 1%', 'last 2 versions', 'not dead']
                    }
                  }], 
                  '@babel/preset-react'
                ]
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
            type: 'asset/inline'
          },
          {
            test: /\.json$/,
            type: 'asset/source'
          }
        ]
      },
      externals: {
        // Don't bundle peer dependencies
        'react': {
          commonjs: 'react',
          commonjs2: 'react',
          amd: 'react',
          root: 'React'
        },
        'react-dom': {
          commonjs: 'react-dom',
          commonjs2: 'react-dom',
          amd: 'react-dom',
          root: 'ReactDOM'
        }
      },
      plugins: [
        new webpack.BannerPlugin({
          banner: `
// Node.js compatibility polyfills - must run before webpack runtime
if (typeof global !== 'undefined' && typeof document === 'undefined') {
  global.document = { baseURI: '' };
  global.self = { location: { href: '' } };
}`,
          raw: true,
          entryOnly: false
        }),
        new webpack.DefinePlugin({
          'typeof document': JSON.stringify('undefined'),
          'typeof window': JSON.stringify('undefined'), 
          'typeof self': JSON.stringify('undefined'),
          'document.baseURI': '(typeof document !== "undefined" ? document.baseURI : "")',
          'self.location.href': '(typeof self !== "undefined" ? self.location.href : "")',
          'document': '(typeof document !== "undefined" ? document : undefined)',
          'self': '(typeof self !== "undefined" ? self : undefined)'
        })
      ],
      mode: isProduction ? 'production' : 'development',
      devtool: isProduction ? 'source-map' : 'eval-source-map'
    },
    // ES Module build
    {
      entry: './src/index.js',
      experiments: {
        outputModule: true
      },
      output: {
        path: path.join(__dirname, 'dist'),
        filename: 'fpbjs.esm.js',
        library: {
          type: 'module'
        },
        clean: false,
        chunkLoadingGlobal: 'webpackChunkFpbJSESM',
        publicPath: ''
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', {
                    targets: {
                      esmodules: true
                    },
                    modules: false
                  }], 
                  '@babel/preset-react'
                ]
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
            type: 'asset/inline'
          },
          {
            test: /\.json$/,
            type: 'asset/source'
          }
        ]
      },
      externals: {
        'react': 'react',
        'react-dom': 'react-dom'
      },
      plugins: [
        new webpack.BannerPlugin({
          banner: `
// Node.js compatibility polyfills - must run before webpack runtime
if (typeof global !== 'undefined' && typeof document === 'undefined') {
  global.document = { baseURI: '' };
  global.self = { location: { href: '' } };
}`,
          raw: true,
          entryOnly: false
        }),
        new webpack.DefinePlugin({
          'typeof document': JSON.stringify('undefined'),
          'typeof window': JSON.stringify('undefined'), 
          'typeof self': JSON.stringify('undefined'),
          'document.baseURI': '(typeof document !== "undefined" ? document.baseURI : "")',
          'self.location.href': '(typeof self !== "undefined" ? self.location.href : "")',
          'document': '(typeof document !== "undefined" ? document : undefined)',
          'self': '(typeof self !== "undefined" ? self : undefined)'
        })
      ],
      mode: isProduction ? 'production' : 'development',
      devtool: isProduction ? 'source-map' : 'eval-source-map'
    }
  ];
};
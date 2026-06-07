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
        asyncChunks: false
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
          // JSON files handled natively by webpack 5 (parsed as objects)
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
        new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
        new webpack.BannerPlugin({
          banner: `
// Node.js compatibility polyfills - must run before webpack runtime
if (typeof global !== 'undefined' && typeof document === 'undefined') {
  global.document = { baseURI: '', createElement: function() { return {}; } };
  global.self = { location: { href: '' } };
}`,
          raw: true,
          entryOnly: false
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
        asyncChunks: false
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
          // JSON files handled natively by webpack 5 (parsed as objects)
        ]
      },
      externals: {
        'react': 'react',
        'react-dom': 'react-dom'
      },
      plugins: [
        new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
        new webpack.BannerPlugin({
          banner: `
// Node.js compatibility polyfills - must run before webpack runtime
if (typeof global !== 'undefined' && typeof document === 'undefined') {
  global.document = { baseURI: '', createElement: function() { return {}; } };
  global.self = { location: { href: '' } };
}`,
          raw: true,
          entryOnly: false
        })
      ],
      mode: isProduction ? 'production' : 'development',
      devtool: isProduction ? 'source-map' : 'eval-source-map'
    }
  ];
};
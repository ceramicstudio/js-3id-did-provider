const path = require('path')

module.exports = {
  entry: './src/identity-wallet.ts',
  output: {
    filename: 'identity-wallet.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'IdentityWallet',
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
  module: {
    rules: [
      {
        test: /\.(j|t)s$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-typescript'],
            plugins: [
              [
                '@babel/plugin-transform-runtime',
                {
                  regenerator: true,
                },
              ],
              ['@babel/plugin-proposal-object-rest-spread'],
            ],
          },
        },
      },
    ],
  },
  node: {
    console: false,
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
    child_process: 'empty',
  },
}

/** Split heavy vendor libraries into separate cached chunks (CRA webpack via CRACO). */
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.optimization = webpackConfig.optimization || {};
      webpackConfig.optimization.splitChunks = {
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
        cacheGroups: {
          pdf: {
            test: /[\\/]node_modules[\\/](pdfjs-dist|react-pdf)[\\/]/,
            name: 'vendor-pdf',
            priority: 40,
            reuseExistingChunk: true,
          },
          fullcalendar: {
            test: /[\\/]node_modules[\\/]@fullcalendar[\\/]/,
            name: 'vendor-fullcalendar',
            priority: 35,
            reuseExistingChunk: true,
          },
          charts: {
            test: /[\\/]node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
            name: 'vendor-charts',
            priority: 35,
            reuseExistingChunk: true,
          },
          i18n: {
            test: /[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/,
            name: 'vendor-i18n',
            priority: 30,
            reuseExistingChunk: true,
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            name: 'vendor-react',
            priority: 25,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };
      return webpackConfig;
    },
  },
};

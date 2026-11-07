
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@cf-wasm/satori",
    "@cf-wasm/resvg",
  ],

  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },
};

module.exports = nextConfig;

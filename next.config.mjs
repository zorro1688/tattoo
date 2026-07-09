/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/sharp/**/*",
      "./node_modules/sharp/node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/sharp/node_modules/@img/sharp-libvips-linux-x64/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*"
    ]
  }
};

export default nextConfig;

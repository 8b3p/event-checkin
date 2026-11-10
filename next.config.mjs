/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // The shared report link: never indexed, cached or leaked through a Referer header.
        source: "/r/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

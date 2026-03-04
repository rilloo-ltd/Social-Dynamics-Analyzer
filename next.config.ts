import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable Turbopack (default in Next.js 16)
  // Use --webpack flag to opt out if needed
  
  // Path aliases matching tsconfig.json
  // Next.js automatically reads from tsconfig paths
  
  // Experimental features
  experimental: {
    // Enable Turbopack filesystem caching for faster dev startup
    turbopackFileSystemCacheForDev: true,
    
    // Increase server action body size limit for large chat files
    serverActions: {
      bodySizeLimit: '15mb', // Default is 1mb, increase for large ZIP files
    },
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'madaduhcom.wpcomstaging.com',
      },
    ],
  },
};

export default nextConfig;

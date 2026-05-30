const env = import.meta.env

export const config = {
  locateApiUrl: env.VITE_LOCATE_API_URL as string,
  clientName: env.VITE_CLIENT_NAME as string,
  clientVersion: env.VITE_CLIENT_VERSION as string,
  workerBase: env.BASE_URL as string,
  regions: [
    { name: 'US East',   hostname: env.VITE_REGION_US_EAST as string },
    { name: 'US West',   hostname: env.VITE_REGION_US_WEST as string },
    { name: 'EU West',   hostname: env.VITE_REGION_EU_WEST as string },
    { name: 'Asia East', hostname: env.VITE_REGION_ASIA_EAST as string },
    { name: 'Oceania',   hostname: env.VITE_REGION_OCEANIA as string },
  ],
} as const
